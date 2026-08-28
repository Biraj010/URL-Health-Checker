import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAME,
  createRedisConnection,
  type UrlCheckJobData,
} from "@url-checker/shared-config";
import { db } from "./lib/db.js";
import { urlCheckSemaphore } from "./lib/semaphore.js";

// Tag logs with this process's pid so multi-process runs can be told apart
// in interleaved console output.
const WORKER_TAG = `pid=${process.pid}`;

async function processUrlCheck(job: Job<UrlCheckJobData>): Promise<void> {
  const { urlId, url } = job.data;
  console.log(`[worker ${WORKER_TAG}] picked up job ${job.id} — urlId=${urlId} url=${url}`);

  await db.url.update({
    where: { id: urlId },
    data: { status: "processing" },
  });

  // Blocks here until a permit is free — this is the real global gate. Up to
  // 5 permits total exist across ALL worker processes combined (enforced in
  // Redis by lib/semaphore.ts), so this call can queue behind work happening
  // in a completely different process.
  await urlCheckSemaphore.acquire();
  console.log(`[worker ${WORKER_TAG}] acquired semaphore for job ${job.id} — urlId=${urlId}`);

  let workSucceeded = false;
  try {
    // Placeholder for the real HTTP fetch/check logic, coming in a later step.
    // This delay just simulates work so the pipeline can be verified end-to-end.
    await new Promise((resolve) => setTimeout(resolve, 500));
    workSucceeded = true;
  } finally {
    // Always release, even if the placeholder work above throws — otherwise
    // a permit would be leaked for the rest of this lease (up to
    // lockTimeout) instead of freeing up immediately for the next job.
    await urlCheckSemaphore.release();
    console.log(`[worker ${WORKER_TAG}] released semaphore for job ${job.id} — urlId=${urlId}`);
  }

  if (!workSucceeded) {
    // TODO: real failure handling (mark Url "failed", retry/backoff) is a
    // separate upcoming step. For now the placeholder work never actually
    // throws, so this path isn't reachable yet.
    return;
  }

  const updatedUrl = await db.url.update({
    where: { id: urlId },
    data: {
      status: "success",
      httpStatus: 200,
      responseTimeMs: 500,
      title: "Placeholder Title",
    },
  });

  // Atomic increment avoids a race when multiple jobs for the same batch
  // complete concurrently (read-then-write would lose updates under
  // concurrency; { increment: 1 } is done as a single SQL statement).
  const updatedBatch = await db.batch.update({
    where: { id: updatedUrl.batchId },
    data: { completedCount: { increment: 1 } },
  });

  if (updatedBatch.completedCount === updatedBatch.totalUrls) {
    await db.batch.update({
      where: { id: updatedBatch.id },
      data: { status: "completed" },
    });
  }

  console.log(`[worker ${WORKER_TAG}] completed job ${job.id} — urlId=${urlId} url=${url}`);
}

const connection = createRedisConnection();

const worker = new Worker<UrlCheckJobData>(QUEUE_NAME, processUrlCheck, {
  connection,
  // concurrency here just controls how many jobs THIS process can have
  // picked up/pending on the semaphore at once — the actual 5-in-flight
  // global cap is enforced by the semaphore acquire/release around the
  // fetch below, not by this number.
  concurrency: 10,
  // BullMQ enforces this limiter through Redis, not in-process — so this cap
  // is shared across ALL worker processes consuming this queue, not
  // per-process. Combined throughput across every running worker stays at
  // 10 jobs/sec.
  limiter: { max: 10, duration: 1000 },
});

worker.on("ready", () => {
  console.log(
    `[worker ${WORKER_TAG}] started, consuming "${QUEUE_NAME}" (concurrency: 10, rate limit: 10/sec, global semaphore: 5)`,
  );
});

worker.on("failed", (job, err) => {
  console.error(`[worker ${WORKER_TAG}] job ${job?.id} failed:`, err);
});

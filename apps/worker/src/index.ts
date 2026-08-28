import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAME,
  createRedisConnection,
  type UrlCheckJobData,
} from "@url-checker/shared-config";
import { db } from "./lib/db.js";

async function processUrlCheck(job: Job<UrlCheckJobData>): Promise<void> {
  const { urlId, url } = job.data;
  console.log(`[worker] picked up job ${job.id} — urlId=${urlId} url=${url}`);

  await db.url.update({
    where: { id: urlId },
    data: { status: "processing" },
  });

  // Placeholder for the real HTTP fetch/check logic, coming in a later step.
  // This delay just simulates work so the pipeline can be verified end-to-end.
  await new Promise((resolve) => setTimeout(resolve, 500));

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

  console.log(`[worker] completed job ${job.id} — urlId=${urlId} url=${url}`);
}

const connection = createRedisConnection();

const worker = new Worker<UrlCheckJobData>(QUEUE_NAME, processUrlCheck, {
  connection,
  // Worker-level cap only — this limits how many jobs THIS process runs at
  // once, not a global rate limit across all worker processes/URLs. True
  // cross-process rate limiting is a separate upcoming step, not implemented
  // here.
  concurrency: 5,
});

worker.on("ready", () => {
  console.log(`[worker] started, consuming "${QUEUE_NAME}" (concurrency: 5)`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err);
});

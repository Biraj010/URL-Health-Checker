import { Worker, type Job } from "bullmq";
import {
  QUEUE_NAME,
  createRedisConnection,
  PUBSUB_CHANNEL,
  BATCH_LIST_CACHE_KEY,
  type UrlCheckJobData,
  type UrlUpdateEvent,
} from "@url-checker/shared-config";
import { db } from "./lib/db.js";
import { urlCheckSemaphore } from "./lib/semaphore.js";
import { checkUrl } from "./lib/check-url.js";
import { classifyResult } from "./lib/classify-result.js";
import { extractTitle } from "./lib/extract-title.js";

// Tag logs with this process's pid so multi-process runs can be told apart
// in interleaved console output.
const WORKER_TAG = `pid=${process.pid}`;

// Dedicated connection for PUBLISH. BullMQ's own `connection` above is busy
// with its internal blocking/streaming Redis usage — a publisher (or
// subscriber) needs its own separate connection rather than sharing one used
// for other command types.
const publisher = createRedisConnection();

// Atomically increments the parent Batch's completedCount — called for
// EVERY terminal Url write, including "cancelled" ones, since the batch is
// only really done once every url has landed on some final status, whatever
// that status is. Flips Batch.status to "completed" once the count catches
// up to totalUrls, but only if the batch isn't already "cancelled" — a
// cancelled batch's in-flight jobs finishing up afterward must never
// resurrect it back to "completed".
//
// Also publishes a full, current snapshot to PUBSUB_CHANNEL so every
// apps/api instance — regardless of which one (if any) holds an SSE client
// watching this batch — can forward the update. We build the event from the
// values this same update just produced rather than re-querying, so it's
// always an accurate snapshot of the write we just made.
async function markBatchUrlDone(batchId: string, urlId: string, urlStatus: string) {
  const updatedBatch = await db.batch.update({
    where: { id: batchId },
    data: { completedCount: { increment: 1 } },
  });

  const batchIsNowComplete =
    updatedBatch.completedCount === updatedBatch.totalUrls &&
    updatedBatch.status !== "cancelled";

  if (batchIsNowComplete) {
    await db.batch.update({
      where: { id: updatedBatch.id },
      data: { status: "completed" },
    });
  }

  const event: UrlUpdateEvent = {
    batchId,
    urlId,
    status: urlStatus,
    batchStatus: batchIsNowComplete ? "completed" : updatedBatch.status,
    completedCount: updatedBatch.completedCount,
    totalUrls: updatedBatch.totalUrls,
  };
  await publisher.publish(PUBSUB_CHANNEL, JSON.stringify(event));

  // apps/worker is a separate process from apps/api, so it can't call
  // apps/api/src/lib/cache.ts's invalidateBatchListCache() directly — it
  // just deletes the same well-known key itself, via its own Redis client.
  // completedCount changes on every single terminal write (this function
  // runs for success, failure, AND cancelled-in-flight finalization), and
  // that's exactly what GET /batches shows progress via, so every call here
  // is a user-visible batch state change, not just the ones that also flip
  // status to "completed".
  await publisher.del(BATCH_LIST_CACHE_KEY);
}

// A small, targeted read used right before writing any terminal Url status,
// to see whether the parent Batch was cancelled while this check was
// in flight. One round trip: the Url's batchId plus the Batch's current
// status, via a relation select rather than two separate queries.
async function getBatchStatusForUrl(urlId: string) {
  return db.url.findUniqueOrThrow({
    where: { id: urlId },
    select: { batchId: true, batch: { select: { status: true } } },
  });
}

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

  let result: Awaited<ReturnType<typeof checkUrl>>;
  try {
    result = await checkUrl(url);
  } finally {
    // Always release, even if checkUrl somehow throws (it shouldn't — it
    // catches its own errors — but this keeps the guarantee absolute) —
    // otherwise a permit would be leaked for the rest of this lease (up to
    // lockTimeout) instead of freeing up immediately for the next job.
    await urlCheckSemaphore.release();
    console.log(`[worker ${WORKER_TAG}] released semaphore for job ${job.id} — urlId=${urlId}`);
  }

  const classification = classifyResult(result);

  if (classification === "success") {
    // If the batch was cancelled while this check was already in flight, we
    // discard the real result and mark this URL cancelled instead — we
    // can't abort an in-progress fetch, so this is the earliest point we can
    // honor the cancellation.
    const { batchId, batch } = await getBatchStatusForUrl(urlId);
    if (batch.status === "cancelled") {
      await db.url.update({ where: { id: urlId }, data: { status: "cancelled" } });
      // Still counts as "done" toward completedCount — a cancelled url that
      // finished resolving is no less finished than a successful one.
      await markBatchUrlDone(batchId, urlId, "cancelled");
      console.log(
        `[worker ${WORKER_TAG}] discarded success result for job ${job.id} — batch was cancelled — urlId=${urlId}`,
      );
      return;
    }

    const title = extractTitle(result.rawBody, result.contentType);

    await db.url.update({
      where: { id: urlId },
      data: {
        status: "success",
        httpStatus: result.httpStatus,
        responseTimeMs: result.responseTimeMs,
        title,
      },
    });

    // Atomic increment avoids a race when multiple jobs for the same batch
    // complete concurrently (read-then-write would lose updates under
    // concurrency; { increment: 1 } is done as a single SQL statement).
    await markBatchUrlDone(batchId, urlId, "success");

    console.log(`[worker ${WORKER_TAG}] completed job ${job.id} — urlId=${urlId} url=${url} (success)`);
    return;
  }

  if (classification === "permanent_failure") {
    // Same reasoning as the success branch above: cancellation discovered at
    // the last moment discards the real result.
    const { batchId, batch } = await getBatchStatusForUrl(urlId);
    if (batch.status === "cancelled") {
      await db.url.update({ where: { id: urlId }, data: { status: "cancelled" } });
      // Still counts as "done" toward completedCount — see the success
      // branch above for the same reasoning.
      await markBatchUrlDone(batchId, urlId, "cancelled");
      console.log(
        `[worker ${WORKER_TAG}] discarded permanent-failure result for job ${job.id} — batch was cancelled — urlId=${urlId}`,
      );
      return;
    }

    await db.url.update({
      where: { id: urlId },
      data: {
        status: "failed",
        httpStatus: result.httpStatus,
        responseTimeMs: result.responseTimeMs,
        lastError: `Permanent failure: HTTP ${result.httpStatus}`,
        attemptCount: { increment: 1 },
      },
    });

    // Permanent failures still count as "done" — just done-with-failure.
    await markBatchUrlDone(batchId, urlId, "failed");

    // Do NOT throw — returning normally tells BullMQ this job is complete,
    // so it won't be retried. Retrying a permanent failure (404, 403, ...)
    // is pointless: the outcome can't change no matter how many times we ask.
    console.log(`[worker ${WORKER_TAG}] completed job ${job.id} — urlId=${urlId} url=${url} (permanent failure)`);
    return;
  }

  // classification === "transient_failure"
  //
  // Record the attempt, but leave status as "processing" and do NOT touch
  // Batch.completedCount yet — the job isn't actually done. Then throw, which
  // tells BullMQ to retry per the attempts/backoff config set at enqueue time
  // (apps/api/src/routes/batches.ts). We always throw here regardless of
  // whether this is the final allowed attempt — BullMQ itself decides
  // whether to retry again or give up based on job.attemptsMade vs
  // job.opts.attempts; we don't need to duplicate that accounting here. Once
  // attempts are exhausted, BullMQ emits a 'failed' event instead of calling
  // this processor again, which is where final failure — or cancellation —
  // is actually finalized (see the worker.on("failed", ...) listener below).
  const errorMessage = result.errorMessage ?? `HTTP ${result.httpStatus}`;

  await db.url.update({
    where: { id: urlId },
    data: {
      attemptCount: { increment: 1 },
      lastError: errorMessage,
    },
  });

  console.log(
    `[worker ${WORKER_TAG}] transient failure for job ${job.id} — urlId=${urlId} url=${url}: ${errorMessage} (attempt ${job.attemptsMade + 1})`,
  );

  throw new Error(errorMessage);
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

// BullMQ fires 'failed' on EVERY failed attempt, not just the terminal one —
// a transient failure that still has retries left also lands here (BullMQ
// re-queues it with backoff; we don't need to do anything in that case).
// Only once job.attemptsMade has reached the configured `attempts` limit is
// this truly final, and that's the only case where we finalize the Url row
// and (only then) count it toward Batch.completedCount — otherwise a URL
// that exhausts all retries would leave completedCount stuck short of
// totalUrls forever and the batch would never reach "completed".
worker.on("failed", async (job, err) => {
  if (!job) {
    console.error(`[worker ${WORKER_TAG}] a job failed with no job reference:`, err);
    return;
  }

  const attemptsLimit = job.opts.attempts ?? 1;
  const isFinalAttempt = job.attemptsMade >= attemptsLimit;

  console.error(
    `[worker ${WORKER_TAG}] job ${job.id} failed (attempt ${job.attemptsMade}/${attemptsLimit}${isFinalAttempt ? ", exhausted" : ", will retry"}):`,
    err.message,
  );

  if (!isFinalAttempt) {
    return;
  }

  const { urlId } = job.data;

  // If the batch was cancelled while this last retry was in flight, we
  // discard the real (failed) result and mark this URL cancelled instead —
  // we can't abort an in-progress fetch, so this is the earliest point we
  // can honor the cancellation.
  const { batchId, batch } = await getBatchStatusForUrl(urlId);
  const finalStatus = batch.status === "cancelled" ? "cancelled" : "failed";

  // Guard against double-processing: only finalize if this row hasn't
  // already been finalized (e.g. by the permanent-failure path, or by an
  // earlier — theoretically impossible, but defended against anyway —
  // duplicate 'failed' event). updateMany + where on status lets us check
  // and update atomically instead of read-then-write.
  const { count } = await db.url.updateMany({
    where: { id: urlId, status: { notIn: ["success", "failed", "cancelled"] } },
    data:
      finalStatus === "cancelled"
        ? { status: "cancelled" }
        : { status: "failed", lastError: err.message },
  });

  if (count === 0) {
    // Already finalized by something else — don't double-count it on the batch.
    return;
  }

  // Whether this landed as "cancelled" or a real "failed", it's now finished
  // — count it toward completedCount either way. The cancel route itself
  // never touches completedCount, so there's no race to worry about here.
  await markBatchUrlDone(batchId, urlId, finalStatus);

  if (finalStatus === "cancelled") {
    console.log(
      `[worker ${WORKER_TAG}] discarded exhausted-retry failure for job ${job.id} — batch was cancelled — urlId=${urlId}`,
    );
  } else {
    console.log(
      `[worker ${WORKER_TAG}] finalized job ${job.id} as failed after exhausting retries — urlId=${urlId}`,
    );
  }
});

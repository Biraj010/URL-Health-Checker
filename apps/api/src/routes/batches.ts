import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  CreateBatchBody,
  CreateBatchResponse,
  BatchResponse,
  UrlResponse,
  BatchListResponse,
  BatchDetailResponse,
} from "@url-checker/shared-types";
import { normalizeUrls } from "../lib/validate-urls.js";
import { db } from "../lib/db.js";
import { urlChecksQueue } from "../lib/queue.js";
import {
  getCachedBatchList,
  setCachedBatchList,
  invalidateBatchListCache,
} from "../lib/cache.js";

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const errorResponseSchema = z.object({
  message: z.string(),
});

// Registered in index.ts with fastify.register(batchesRoutes, { prefix: "/batches" }).
// Every handler here is a typed 501 placeholder — no business logic yet.
const batchesRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/",
    {
      schema: {
        body: CreateBatchBody,
        // Final response contract: 201 on successful creation.
        response: {
          201: CreateBatchResponse,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const urls = normalizeUrls(request.body.urls);

      // Create the batch and its url rows in one transaction. If anything in
      // here fails, nothing is persisted and we return 500 without touching
      // the queue at all.
      let batch: { id: string; status: string; totalUrls: number; createdAt: Date };
      let createdUrls: { id: string; url: string }[];
      try {
        const result = await db.$transaction(async (tx) => {
          const newBatch = await tx.batch.create({
            data: {
              status: "pending",
              totalUrls: urls.length,
            },
          });

          const urlRows = await Promise.all(
            urls.map((url) =>
              tx.url.create({
                data: {
                  batchId: newBatch.id,
                  url,
                  status: "pending",
                },
              }),
            ),
          );

          return { newBatch, urlRows };
        });

        batch = result.newBatch;
        createdUrls = result.urlRows;
      } catch (err) {
        request.log.error({ err }, "failed to create batch");
        return reply.status(500).send({ message: "failed to create batch" });
      }

      // A new batch appearing in the list is itself a state change — don't
      // let a client that just created a batch see a stale GET /batches
      // response missing it for up to 30 seconds.
      await invalidateBatchListCache();

      // Only enqueue after the transaction has committed. If this throws
      // partway through, the Url rows already exist as "pending" in Postgres
      // — nothing is lost, but some of them won't have a corresponding queue
      // job. Known trade-off (see README): a production version would run a
      // reconciliation job to find "pending" urls with no active queue job
      // and re-enqueue them. For now we just log and still return 201, since
      // failing the request here would leave the client thinking the batch
      // was never created when it actually was.
      try {
        await Promise.all(
          createdUrls.map((url) =>
            urlChecksQueue.add(
              "check-url",
              { urlId: url.id, url: url.url },
              {
                jobId: url.id,
                // attempts: 3 means up to 3 total tries; backoff delay
                // doubles between attempts (BullMQ's exponential strategy:
                // 1s, then 2s, then 4s before the next retry) — satisfies
                // the spec's "up to 3 on transient failure, with exponential
                // backoff." The worker only actually re-throws (triggering a
                // retry) for transient failures; permanent failures return
                // normally so BullMQ never retries them regardless of this
                // config.
                attempts: 3,
                backoff: { type: "exponential", delay: 1000 },
              },
            ),
          ),
        );
      } catch (err) {
        request.log.error(
          { err, batchId: batch.id },
          "failed to enqueue one or more url-check jobs after batch creation",
        );
      }

      return reply.status(201).send({
        id: batch.id,
        status: batch.status as z.infer<typeof CreateBatchResponse>["status"],
        totalUrls: batch.totalUrls,
        createdAt: batch.createdAt.toISOString(),
      });
    },
  );

  fastify.get(
    "/",
    {
      schema: {
        response: {
          200: BatchListResponse,
        },
      },
    },
    async (_request, reply) => {
      // Redis-backed (not in-memory) specifically because this must stay
      // correct and shared across multiple running API instances — an
      // in-memory cache would let each instance serve a different stale
      // view, which is exactly what the spec's "must remain correct when
      // more than one API instance is serving clients" rules out.
      const cached = await getCachedBatchList();
      if (cached !== null) {
        return reply.status(200).send(JSON.parse(cached));
      }

      const batches = await db.batch.findMany({
        orderBy: { createdAt: "desc" },
      });

      const batchList = batches.map((batch) => ({
        id: batch.id,
        status: batch.status as z.infer<typeof BatchResponse>["status"],
        totalUrls: batch.totalUrls,
        completedCount: batch.completedCount,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
      }));

      await setCachedBatchList(JSON.stringify(batchList));

      return reply.status(200).send(batchList);
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: BatchDetailResponse,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      // This is the "ground truth" half of the REST-then-SSE resync
      // contract: a client is expected to call this BEFORE opening
      // GET /batches/:id/events, precisely so it has complete, correct
      // current state before subscribing to incremental updates. That's why
      // this returns the full Url list with everything the UI needs to
      // render a cold-load view, not just the batch's own summary fields —
      // anything missing here would be a gap the SSE stream can never fill,
      // since it only ever reports what happened after a client connects.
      const batch = await db.batch.findUnique({
        where: { id },
        include: { urls: true },
      });

      if (!batch) {
        return reply.status(404).send({ message: "batch not found" });
      }

      return reply.status(200).send({
        id: batch.id,
        status: batch.status as z.infer<typeof BatchResponse>["status"],
        totalUrls: batch.totalUrls,
        completedCount: batch.completedCount,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
        urls: batch.urls.map((url) => ({
          id: url.id,
          url: url.url,
          status: url.status as z.infer<typeof UrlResponse>["status"],
          httpStatus: url.httpStatus,
          responseTimeMs: url.responseTimeMs,
          title: url.title,
          attemptCount: url.attemptCount,
          lastError: url.lastError,
        })),
      });
    },
  );

  fastify.post(
    "/:id/cancel",
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: BatchResponse,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const batch = await db.batch.findUnique({ where: { id } });
      if (!batch) {
        return reply.status(404).send({ message: "batch not found" });
      }

      if (batch.status === "completed" || batch.status === "cancelled") {
        return reply
          .status(409)
          .send({ message: `batch already ${batch.status}` });
      }

      // Queued (still "pending") urls can just be removed from the queue
      // outright — nothing has started, so there's nothing to race with.
      // "processing" (already in-flight) urls are NOT touched here: they're
      // handled by apps/worker, which checks the batch's status right
      // before writing its terminal result and writes "cancelled" instead
      // of "success"/"failed" if it notices this batch was cancelled in the
      // meantime (see apps/worker/src/index.ts).
      const pendingUrls = await db.url.findMany({
        where: { batchId: id, status: "pending" },
      });

      // A pending url counts toward completedCount right here, since nothing
      // else ever will for it — it never enters the worker, so the worker's
      // own cancelled-discard-and-increment logic never runs for it. But the
      // pendingUrls list above can go stale: the worker may pick a row up
      // (flip it to "processing") between that read and this loop. So each
      // cancellation is a conditional updateMany guarded on status still
      // being "pending" — only count it here (and only remove its queue
      // job) if we actually won that race; if we lost it, leave it alone
      // entirely and let the worker's own in-flight handling finalize and
      // count it later. Without this guard, a row could get counted twice
      // (once here, once by the worker) or its active job could get pulled
      // out from under a worker that's mid-fetch.
      let pendingCancelledCount = 0;
      for (const pendingUrl of pendingUrls) {
        const { count } = await db.url.updateMany({
          where: { id: pendingUrl.id, status: "pending" },
          data: { status: "cancelled" },
        });

        if (count === 0) {
          // Lost the race — the worker got to it first. Leave it entirely
          // to the worker's own cancellation handling.
          continue;
        }

        // Safe to remove now: we know we won the race while it was still
        // "pending", so this job should still genuinely be queued/waiting,
        // not active in a worker.
        const job = await urlChecksQueue.getJob(pendingUrl.id);
        if (job) {
          await job.remove();
        }

        pendingCancelledCount++;
      }

      // The batch is considered cancelled from the user's perspective right
      // away, even though a couple of "processing" rows may not have
      // resolved yet — completedCount keeps climbing on its own as those
      // in-flight jobs land (see apps/worker/src/index.ts's markBatchUrlDone,
      // which now increments for a cancelled-discard result too, and is
      // guarded not to flip status back to "completed" once it catches up).
      const updatedBatch = await db.batch.update({
        where: { id },
        data: {
          status: "cancelled",
          completedCount: { increment: pendingCancelledCount },
        },
      });

      await invalidateBatchListCache();

      return reply.status(200).send({
        id: updatedBatch.id,
        status: updatedBatch.status as z.infer<typeof BatchResponse>["status"],
        totalUrls: updatedBatch.totalUrls,
        completedCount: updatedBatch.completedCount,
        createdAt: updatedBatch.createdAt,
        updatedAt: updatedBatch.updatedAt,
      });
    },
  );

  fastify.post(
    "/:id/retry-failed",
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: BatchResponse,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const batch = await db.batch.findUnique({ where: { id } });
      if (!batch) {
        return reply.status(404).send({ message: "batch not found" });
      }

      const failedUrls = await db.url.findMany({
        where: { batchId: id, status: "failed" },
      });

      if (failedUrls.length === 0) {
        // No-op, not an error — nothing to retry.
        return reply.status(200).send({
          id: batch.id,
          status: batch.status as z.infer<typeof BatchResponse>["status"],
          totalUrls: batch.totalUrls,
          completedCount: batch.completedCount,
          createdAt: batch.createdAt,
          updatedAt: batch.updatedAt,
        });
      }

      const updatedBatch = await db.$transaction(async (tx) => {
        await tx.url.updateMany({
          where: { id: { in: failedUrls.map((u) => u.id) } },
          data: { status: "pending", attemptCount: 0, lastError: null },
        });

        // These urls were previously counted as "done" (they failed) — now
        // they're not done again, so they come back out of completedCount.
        // "running" is correct regardless of whether the batch was
        // "completed" or still partway "running" (only some urls failed) —
        // either way there's new work pending now.
        return tx.batch.update({
          where: { id },
          data: {
            completedCount: { decrement: failedUrls.length },
            status: "running",
          },
        });
      });

      await invalidateBatchListCache();

      // Only enqueue after the transaction commits, same reasoning as batch
      // creation: if enqueueing throws partway through here, the Url rows
      // are already reset to "pending" in Postgres — nothing is lost, just
      // some of them won't have a corresponding queue job yet.
      try {
        await Promise.all(
          failedUrls.map((failedUrl) =>
            urlChecksQueue.add(
              "check-url",
              { urlId: failedUrl.id, url: failedUrl.url },
              {
                // A fresh job id is required: the original url.id likely
                // still exists in Redis as a completed/failed job, and
                // BullMQ no-ops an .add() with a jobId it already knows
                // about rather than creating a new job.
                jobId: `${failedUrl.id}:retry:${Date.now()}`,
                attempts: 3,
                backoff: { type: "exponential", delay: 1000 },
              },
            ),
          ),
        );
      } catch (err) {
        request.log.error(
          { err, batchId: id },
          "failed to enqueue one or more retry jobs after resetting failed urls",
        );
      }

      return reply.status(200).send({
        id: updatedBatch.id,
        status: updatedBatch.status as z.infer<typeof BatchResponse>["status"],
        totalUrls: updatedBatch.totalUrls,
        completedCount: updatedBatch.completedCount,
        createdAt: updatedBatch.createdAt,
        updatedAt: updatedBatch.updatedAt,
      });
    },
  );
};

export default batchesRoutes;

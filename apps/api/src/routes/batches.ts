import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  createBatchBodySchema,
  createBatchResponseSchema,
  batchListResponseSchema,
  batchDetailResponseSchema,
} from "../schemas/batch.schema.js";
import { normalizeUrls } from "../lib/validate-urls.js";
import { db } from "../lib/db.js";
import { urlChecksQueue } from "../lib/queue.js";

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
        body: createBatchBodySchema,
        // Final response contract: 201 on successful creation.
        response: {
          201: createBatchResponseSchema,
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
        status: batch.status as z.infer<typeof createBatchResponseSchema>["status"],
        totalUrls: batch.totalUrls,
        createdAt: batch.createdAt.toISOString(),
      });
    },
  );

  fastify.get(
    "/",
    {
      schema: {
        // Intended eventual success response shape: BatchListResponse
        response: {
          200: batchListResponseSchema,
          501: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      return reply.status(501).send({ message: "not implemented yet" });
    },
  );

  fastify.get(
    "/:id",
    {
      schema: {
        params: idParamsSchema,
        // Intended eventual success response shape: BatchDetailResponse
        response: {
          200: batchDetailResponseSchema,
          501: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      return reply.status(501).send({ message: "not implemented yet" });
    },
  );

  fastify.post(
    "/:id/cancel",
    {
      schema: {
        params: idParamsSchema,
        response: {
          200: z.object({ message: z.string(), cancelledCount: z.number().int() }),
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

      // Only "pending" urls are handled here — a queued job can just be
      // removed outright. "processing" (already in-flight) is a separate,
      // later step; this step deliberately leaves those (and "success"/
      // "failed") alone.
      const pendingUrls = await db.url.findMany({
        where: { batchId: id, status: "pending" },
      });

      let cancelledCount = 0;
      for (const pendingUrl of pendingUrls) {
        // The job may have already been picked up (raced into "processing")
        // or completed between our query above and now — getJob returning
        // undefined just means there's nothing left to remove, not an error.
        const job = await urlChecksQueue.getJob(pendingUrl.id);
        if (job) {
          await job.remove();
        }

        await db.url.update({
          where: { id: pendingUrl.id },
          data: { status: "cancelled" },
        });
        cancelledCount++;
      }

      // Batch.status is intentionally NOT updated here — finalized in a
      // later step once "processing" handling is also in place.
      return reply.status(200).send({
        message: "pending urls cancelled",
        cancelledCount,
      });
    },
  );

  fastify.post(
    "/:id/retry-failed",
    {
      schema: {
        params: idParamsSchema,
        response: {
          501: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      return reply.status(501).send({ message: "not implemented yet" });
    },
  );
};

export default batchesRoutes;

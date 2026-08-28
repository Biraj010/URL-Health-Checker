import { z } from "zod";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  createBatchBodySchema,
  createBatchResponseSchema,
  batchListResponseSchema,
  batchDetailResponseSchema,
} from "../schemas/batch.schema.js";

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const notImplementedSchema = z.object({
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
        },
      },
    },
    async (_request, reply) => {
      // TODO: insert Batch + Url rows and enqueue check jobs — next step.
      // Cast needed: only the final 201 shape is declared in `response` above,
      // so this interim 501 body doesn't type-check against it. Goes away
      // once the real handler (which only ever returns 201) replaces this.
      return reply
        .status(501)
        .send({ message: "not implemented yet" } as unknown as z.infer<
          typeof createBatchResponseSchema
        >);
    },
  );

  fastify.get(
    "/",
    {
      schema: {
        // Intended eventual success response shape: BatchListResponse
        response: {
          200: batchListResponseSchema,
          501: notImplementedSchema,
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
          501: notImplementedSchema,
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
          501: notImplementedSchema,
        },
      },
    },
    async (_request, reply) => {
      return reply.status(501).send({ message: "not implemented yet" });
    },
  );

  fastify.post(
    "/:id/retry-failed",
    {
      schema: {
        params: idParamsSchema,
        response: {
          501: notImplementedSchema,
        },
      },
    },
    async (_request, reply) => {
      return reply.status(501).send({ message: "not implemented yet" });
    },
  );
};

export default batchesRoutes;

import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { db } from "../lib/db.js";
import { registerSseClient, unregisterSseClient } from "../lib/pubsub.js";

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const HEARTBEAT_INTERVAL_MS = 15_000;

// Registered in index.ts with fastify.register(batchEventsRoutes, { prefix: "/batches" }).
//
// GET /batches/:id/events — a Server-Sent Events stream of live updates for
// one batch. Connection mechanics (headers, heartbeat, disconnect handling)
// live here; real update events are forwarded via apps/api/src/lib/pubsub.ts,
// which subscribes to the Redis channel apps/worker publishes to.
const batchEventsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/:id/events",
    {
      schema: {
        params: idParamsSchema,
        // No response schema here on purpose: this is a raw, long-lived
        // text/event-stream response, not a single JSON body — Fastify's
        // typed response/serializer helpers are built around request/reply
        // cycles that end with one payload, which doesn't fit SSE's
        // streaming nature. We drop to reply.raw for the whole handler.
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const batch = await db.batch.findUnique({ where: { id } });
      if (!batch) {
        return reply.status(404).send({ message: "batch not found" });
      }

      // Hijack the response so Fastify doesn't try to send its own reply
      // once we start writing to reply.raw ourselves — otherwise Fastify's
      // normal lifecycle would try to end the response for us as soon as
      // this handler returns, which is exactly what we don't want for a
      // stream that's meant to stay open.
      reply.hijack();

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      // flushHeaders() (writeHead already flushes on Node's http server, but
      // this is belt-and-suspenders for any proxy/agent buffering in front
      // of it) — opens the stream immediately rather than waiting for the
      // first body chunk, so the client's connection is confirmed open
      // right away instead of hanging until we have real data to send.
      reply.raw.flushHeaders();

      reply.raw.write(
        `data: ${JSON.stringify({ type: "connected", batchId: id })}\n\n`,
      );

      // From here on, real update events published by apps/worker (via
      // Redis pub/sub — see apps/api/src/lib/pubsub.ts) get forwarded to
      // this connection whenever they concern this batchId.
      registerSseClient(id, reply.raw);

      // Proxies and load balancers (and some HTTP clients) will silently
      // drop a connection that's gone quiet for too long, treating it as
      // dead — a long-lived SSE stream with no real events for a while
      // looks exactly like that from the outside. A periodic comment line
      // (the leading ":" makes it a comment per the SSE spec, so clients
      // ignore it as data) keeps bytes flowing often enough that nothing
      // in between decides the connection is idle and tears it down. This
      // is what actually makes the live-update path resilient over time,
      // not just correct in the first few seconds after connecting.
      const heartbeat = setInterval(() => {
        reply.raw.write(": heartbeat\n\n");
      }, HEARTBEAT_INTERVAL_MS);

      request.raw.on("close", () => {
        clearInterval(heartbeat);
        unregisterSseClient(id, reply.raw);
        request.log.info({ batchId: id }, "SSE connection closed");
      });
    },
  );
};

export default batchEventsRoutes;

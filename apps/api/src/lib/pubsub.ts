import type { ServerResponse } from "node:http";
import {
  createRedisConnection,
  PUBSUB_CHANNEL,
  type UrlUpdateEvent,
} from "@url-checker/shared-config";

// Redis requires a connection put into SUBSCRIBE mode to be dedicated to
// that — it can no longer run regular commands once subscribed — so this is
// a separate connection from anything else in apps/api (e.g. the Prisma
// client's own connection, or any future ad hoc Redis usage).
const subscriber = createRedisConnection();

// This map only knows about SSE clients connected to THIS specific API
// instance — that's expected and correct. Redis pub/sub is what makes
// cross-instance fanout work: every instance subscribes to the same
// channel, so no matter which instance a client's SSE connection landed on,
// an update published by apps/worker reaches all of them, and each instance
// only has to forward it to its own local clients.
const clientsByBatch = new Map<string, Set<ServerResponse>>();

subscriber.subscribe(PUBSUB_CHANNEL, (err) => {
  if (err) {
    console.error(`[pubsub] failed to subscribe to "${PUBSUB_CHANNEL}":`, err);
    return;
  }
  console.log(`[pubsub] subscribed to "${PUBSUB_CHANNEL}"`);
});

subscriber.on("message", (channel, message) => {
  if (channel !== PUBSUB_CHANNEL) {
    return;
  }

  let event: UrlUpdateEvent;
  try {
    event = JSON.parse(message);
  } catch (err) {
    console.error("[pubsub] received unparseable message:", message, err);
    return;
  }

  const clients = clientsByBatch.get(event.batchId);
  if (!clients || clients.size === 0) {
    // No one on this instance is watching this batch — nothing to do.
    return;
  }

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
});

export function registerSseClient(batchId: string, res: ServerResponse): void {
  let clients = clientsByBatch.get(batchId);
  if (!clients) {
    clients = new Set();
    clientsByBatch.set(batchId, clients);
  }
  clients.add(res);
}

export function unregisterSseClient(batchId: string, res: ServerResponse): void {
  const clients = clientsByBatch.get(batchId);
  if (!clients) {
    return;
  }
  clients.delete(res);
  if (clients.size === 0) {
    clientsByBatch.delete(batchId);
  }
}

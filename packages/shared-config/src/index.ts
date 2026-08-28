import IORedis, { type Redis } from "ioredis";

// Single source of truth for the BullMQ queue name shared by apps/api
// (producer) and apps/worker (consumer) — keep both in sync by importing
// this instead of hardcoding the string.
export const QUEUE_NAME = "url-checks";

// Payload shape for every job on the QUEUE_NAME queue.
export interface UrlCheckJobData {
  urlId: string;
  url: string;
}

// Redis pub/sub channel apps/worker publishes to whenever it finalizes a
// Url row's terminal status, and every apps/api instance subscribes to so it
// can forward the update to any SSE clients connected to that instance —
// this is what makes live updates work correctly across multiple running
// API instances, since each instance only knows about its own local SSE
// connections.
export const PUBSUB_CHANNEL = "batch-updates";

// A full, current snapshot of a batch's progress after one Url row was
// finalized — not just a delta — so a subscriber never needs to make a
// follow-up query just to know where the batch stands.
export interface UrlUpdateEvent {
  batchId: string;
  urlId: string;
  status: string;
  batchStatus: string;
  completedCount: number;
  totalUrls: number;
}

/**
 * Creates an ioredis connection configured from REDIS_URL.
 *
 * `maxRetriesPerRequest: null` is required by BullMQ for connections used by
 * a Queue/Worker/QueueEvents instance.
 */
export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set — cannot create a Redis connection for BullMQ.",
    );
  }

  return new IORedis(url, { maxRetriesPerRequest: null });
}

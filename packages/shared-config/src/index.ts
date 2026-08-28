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

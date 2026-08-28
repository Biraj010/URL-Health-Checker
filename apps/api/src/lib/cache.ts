import {
  createRedisConnection,
  BATCH_LIST_CACHE_KEY,
} from "@url-checker/shared-config";

export { BATCH_LIST_CACHE_KEY };

// Separate connection from the pub/sub subscriber in lib/pubsub.ts — that
// one is locked into SUBSCRIBE mode and can't run regular commands like
// GET/SET/DEL. This is a plain client dedicated to cache reads/writes.
const redis = createRedisConnection();

export async function getCachedBatchList(): Promise<string | null> {
  return redis.get(BATCH_LIST_CACHE_KEY);
}

export async function setCachedBatchList(json: string): Promise<void> {
  await redis.set(BATCH_LIST_CACHE_KEY, json, "EX", 30);
}

// Called after every write that creates a Batch or changes its status
// (apps/api/src/routes/batches.ts) so the list never shows visibly stale
// data — the 30s TTL above is just a backstop, not the primary mechanism
// for staying fresh. apps/worker triggers the same invalidation via its own
// direct `redis.del(BATCH_LIST_CACHE_KEY)` for the status changes it makes
// (batch completion, in-flight cancellation finalization) — it doesn't
// import this function since it's a separate process with its own Redis
// client, just the same well-known key from shared config.
export async function invalidateBatchListCache(): Promise<void> {
  await redis.del(BATCH_LIST_CACHE_KEY);
}

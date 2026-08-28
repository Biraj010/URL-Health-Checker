import { Semaphore } from "redis-semaphore";
import { createRedisConnection } from "@url-checker/shared-config";

// Fixed, well-known key so every worker process — regardless of how many are
// running — coordinates through the same Redis-held permit pool. This is
// what makes the cap global rather than per-process: BullMQ's own
// `concurrency` option only limits how many jobs ONE process runs at a time.
const LOCK_KEY = "url-checker:concurrency-lock";
const PERMITS = 5;

// lockTimeout is the lease duration on each acquired permit. redis-semaphore
// auto-refreshes the lease in the background for as long as the holding
// process is alive and still using it, so under normal operation this never
// comes into play. It only matters if a worker process crashes (or is killed)
// while holding a permit: with no process left to refresh the lease, Redis
// expires that permit automatically after lockTimeout, returning it to the
// pool — so a crash can delay throughput by at most ~lockTimeout, but can
// never leak a permit forever.
const LOCK_TIMEOUT_MS = 30_000;

const connection = createRedisConnection();

export const urlCheckSemaphore = new Semaphore(connection, LOCK_KEY, PERMITS, {
  lockTimeout: LOCK_TIMEOUT_MS,
});

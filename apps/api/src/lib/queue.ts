import { Queue } from "bullmq";
import IORedis from "ioredis";

// Shared by the API (enqueues jobs here) and apps/worker (consumes them) —
// this file only sets up the API side for now.
const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const URL_CHECKS_QUEUE_NAME = "url-checks";

export interface UrlCheckJobData {
  urlId: string;
  url: string;
}

export const urlChecksQueue = new Queue<UrlCheckJobData>(URL_CHECKS_QUEUE_NAME, {
  connection,
});

import { Queue } from "bullmq";
import {
  QUEUE_NAME,
  createRedisConnection,
  type UrlCheckJobData,
} from "@url-checker/shared-config";

export type { UrlCheckJobData };

// Shared by the API (enqueues jobs here) and apps/worker (consumes them) —
// this file only sets up the API side for now.
const connection = createRedisConnection();

export const urlChecksQueue = new Queue<UrlCheckJobData>(QUEUE_NAME, {
  connection,
});

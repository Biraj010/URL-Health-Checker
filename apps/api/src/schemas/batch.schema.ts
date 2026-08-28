import { z } from "zod";

// Mirrors the BatchStatus / UrlStatus enums in prisma/schema.prisma
export const batchStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "cancelled",
]);

export const urlStatusSchema = z.enum([
  "pending",
  "processing",
  "success",
  "failed",
  "cancelled",
]);

// Backend only accepts a flat urls[] array. CSV upload is parsed client-side
// in apps/web before being sent here — see README for rationale.
export const createBatchBodySchema = z.object({
  // 500 is a guardrail assumption, not a hard requirement from product — it's
  // meant to keep a single batch from overwhelming the worker/queue; revisit
  // if real usage needs a bigger ceiling.
  urls: z.array(z.string().url()).min(1).max(500),
});
export type CreateBatchBody = z.infer<typeof createBatchBodySchema>;

export const batchResponseSchema = z.object({
  id: z.string(),
  status: batchStatusSchema,
  totalUrls: z.number().int(),
  completedCount: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type BatchResponse = z.infer<typeof batchResponseSchema>;

export const urlResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  status: urlStatusSchema,
  httpStatus: z.number().int().nullable(),
  responseTimeMs: z.number().int().nullable(),
  title: z.string().nullable(),
  attemptCount: z.number().int(),
  lastError: z.string().nullable(),
});
export type UrlResponse = z.infer<typeof urlResponseSchema>;

export const batchListResponseSchema = z.array(batchResponseSchema);
export type BatchListResponse = z.infer<typeof batchListResponseSchema>;

export const batchDetailResponseSchema = batchResponseSchema.extend({
  urls: z.array(urlResponseSchema),
});
export type BatchDetailResponse = z.infer<typeof batchDetailResponseSchema>;

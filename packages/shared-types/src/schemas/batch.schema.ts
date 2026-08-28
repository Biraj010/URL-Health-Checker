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
export const CreateBatchBody = z.object({
  // 500 is a guardrail assumption, not a hard requirement from product — it's
  // meant to keep a single batch from overwhelming the worker/queue; revisit
  // if real usage needs a bigger ceiling.
  urls: z.array(z.string().url()).min(1).max(500),
});
export type CreateBatchBodyType = z.infer<typeof CreateBatchBody>;

// Response for a successful POST /batches (201). Just enough for the client
// to start tracking the new batch — not the full BatchResponse shape.
export const CreateBatchResponse = z.object({
  id: z.string().uuid(),
  status: batchStatusSchema,
  totalUrls: z.number().int(),
  createdAt: z.string().datetime(),
});
export type CreateBatchResponseType = z.infer<typeof CreateBatchResponse>;

export const BatchResponse = z.object({
  id: z.string(),
  status: batchStatusSchema,
  totalUrls: z.number().int(),
  completedCount: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type BatchResponseType = z.infer<typeof BatchResponse>;

export const UrlResponse = z.object({
  id: z.string(),
  url: z.string(),
  status: urlStatusSchema,
  httpStatus: z.number().int().nullable(),
  responseTimeMs: z.number().int().nullable(),
  title: z.string().nullable(),
  attemptCount: z.number().int(),
  lastError: z.string().nullable(),
});
export type UrlResponseType = z.infer<typeof UrlResponse>;

export const BatchListResponse = z.array(BatchResponse);
export type BatchListResponseType = z.infer<typeof BatchListResponse>;

export const BatchDetailResponse = BatchResponse.extend({
  urls: z.array(UrlResponse),
});
export type BatchDetailResponseType = z.infer<typeof BatchDetailResponse>;

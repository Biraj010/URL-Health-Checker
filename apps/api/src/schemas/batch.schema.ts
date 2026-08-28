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

// Request body for creating a batch by pasting a list of URLs directly.
//
// TODO: CSV upload will be supported as an alternative to this JSON body via
// @fastify/multipart in a later step (multipart/form-data with a CSV file
// field) — not implemented yet.
export const createBatchBodySchema = z.object({
  urls: z.array(z.string().url()).nonempty(),
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

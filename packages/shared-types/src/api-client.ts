import {
  BatchListResponse,
  type BatchListResponseType,
  CreateBatchResponse,
  type CreateBatchBodyType,
  type CreateBatchResponseType,
  BatchDetailResponse,
  type BatchDetailResponseType,
} from "./schemas/batch.schema.js";

// Thrown by api-client functions on a non-2xx response, carrying the HTTP
// status so callers can distinguish e.g. 404 (not found) from other
// failures without parsing the error message.
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// NEXT_PUBLIC_API_URL is the only env var this module reads. It's set in
// apps/web/.env.local and must be NEXT_PUBLIC_-prefixed so Next.js exposes it
// wherever this module is imported from (server or client components alike).
function getApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set — check apps/web/.env.local",
    );
  }
  return url;
}

export async function listBatches(): Promise<BatchListResponseType> {
  const res = await fetch(`${getApiBaseUrl()}/batches`, {
    // cache: 'no-store' is intentional — apps/api already serves this
    // endpoint from a 30-second Redis cache with proper invalidation on
    // batch create/state-change. Letting Next.js ALSO cache this fetch would
    // create a second, uncoordinated cache layer that could show data
    // staler than the API's own guarantee. The API's cache is the single
    // source of truth for caching behavior here.
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`GET /batches failed: ${res.status} ${res.statusText}`);
  }

  return BatchListResponse.parse(await res.json());
}

// POST /batches. Throws on any non-2xx response so callers can rely on a
// resolved promise meaning the batch was actually created.
export async function createBatch(
  input: CreateBatchBodyType,
): Promise<CreateBatchResponseType> {
  const res = await fetch(`${getApiBaseUrl()}/batches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(`POST /batches failed: ${res.status} ${res.statusText}`);
  }

  return CreateBatchResponse.parse(await res.json());
}

// GET /batches/:id. cache: 'no-store' for the same reason as listBatches()
// — this must always reflect apps/api's current state at request time. This
// endpoint isn't even Redis-cached on the API side (unlike GET /batches), so
// there's no cache anywhere in the chain to coordinate with; a fresh fetch
// is the only correct option.
export async function getBatch(id: string): Promise<BatchDetailResponseType> {
  const res = await fetch(`${getApiBaseUrl()}/batches/${id}`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new ApiError(
      res.status,
      `GET /batches/${id} failed: ${res.status} ${res.statusText}`,
    );
  }

  return BatchDetailResponse.parse(await res.json());
}

// POST /batches/:id/cancel. Throws (via ApiError) on any non-2xx response —
// including the 404 (not found) and 409 (already finished/cancelled) the API
// can return — so a resolved promise always means the batch was actually
// cancelled. Callers that want the resulting batch state should refetch via
// getBatch() rather than rely on this response, per the wait-and-refetch
// pattern used elsewhere in apps/web.
export async function cancelBatch(id: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/batches/${id}/cancel`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new ApiError(
      res.status,
      `POST /batches/${id}/cancel failed: ${res.status} ${res.statusText}`,
    );
  }
}

// POST /batches/:id/retry-failed. Throws (via ApiError) on any non-2xx
// response. Note the API returns 200 (not an error) even when there's
// nothing to retry — that's a legitimate no-op, not a failure.
export async function retryFailed(id: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/batches/${id}/retry-failed`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new ApiError(
      res.status,
      `POST /batches/${id}/retry-failed failed: ${res.status} ${res.statusText}`,
    );
  }
}

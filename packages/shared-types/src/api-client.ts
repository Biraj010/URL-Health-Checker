import { BatchListResponse, type BatchListResponseType } from "./schemas/batch.schema.js";

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

// GET /batches. cache: "no-store" so every call hits the API fresh — a
// Server Component calling this should reflect the current batch list at
// request time, not a cached snapshot from an earlier build/request.
export async function listBatches(): Promise<BatchListResponseType> {
  const res = await fetch(`${getApiBaseUrl()}/batches`, {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`GET /batches failed: ${res.status} ${res.statusText}`);
  }

  return BatchListResponse.parse(await res.json());
}

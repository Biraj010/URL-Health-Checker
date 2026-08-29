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

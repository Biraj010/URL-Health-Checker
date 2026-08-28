/**
 * Trims whitespace from each URL string in the array.
 *
 * Intentionally does not deduplicate — repeated URLs in one submission are
 * treated as independent checks. See README for rationale.
 */
export function normalizeUrls(urls: string[]): string[] {
  return urls.map((url) => url.trim());
}

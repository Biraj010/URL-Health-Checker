/**
 * Trims whitespace from each URL string in the array.
 *
 * Deliberately does NOT deduplicate — that's a separate decision handled
 * later, not something this utility should decide on its own.
 */
export function normalizeUrls(urls: string[]): string[] {
  return urls.map((url) => url.trim());
}

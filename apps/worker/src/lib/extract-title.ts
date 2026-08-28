// Lightweight regex-based extraction, not a full HTML parser (e.g. cheerio) —
// a deliberate trade-off for scope. See README for rationale.
const TITLE_REGEX = /<title[^>]*>([^<]*)<\/title>/i;

export function extractTitle(
  rawBody: string | null,
  contentType: string | null,
): string | null {
  if (rawBody === null) {
    return null;
  }

  if (contentType === null || !contentType.toLowerCase().includes("text/html")) {
    return null;
  }

  const match = TITLE_REGEX.exec(rawBody);
  if (!match) {
    return null;
  }

  const title = match[1].trim();
  return title === "" ? null : title;
}

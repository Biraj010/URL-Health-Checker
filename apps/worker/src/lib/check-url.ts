export interface CheckResult {
  ok: boolean; // true if we got any HTTP response, false on network-level failure
  httpStatus: number | null;
  responseTimeMs: number;
  rawBody: string | null; // response body text, needed for title extraction in a later step
  contentType: string | null;
  errorMessage: string | null; // populated on network-level failure (DNS, timeout, connection refused)
}

// 10s is a configurable assumption, not a spec'd value — document it in the
// README if it needs tuning later.
const FETCH_TIMEOUT_MS = 10_000;

// Performs the check and reports what happened, neutrally — this file does
// NOT classify transient vs permanent failure; that's a separate concern for
// whatever calls this function.
export async function checkUrl(url: string): Promise<CheckResult> {
  const start = Date.now();

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const rawBody = await response.text();
    const responseTimeMs = Date.now() - start;

    return {
      ok: true,
      httpStatus: response.status,
      responseTimeMs,
      rawBody,
      contentType: response.headers.get("content-type"),
      errorMessage: null,
    };
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    const errorMessage =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? "timeout"
          : err.message
        : String(err);

    return {
      ok: false,
      httpStatus: null,
      responseTimeMs,
      rawBody: null,
      contentType: null,
      errorMessage,
    };
  }
}

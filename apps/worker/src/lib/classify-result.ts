import type { CheckResult } from "./check-url.js";

export type ResultClassification =
  | "success"
  | "permanent_failure"
  | "transient_failure";

// Transient failures represent conditions that might resolve on their own —
// a server hiccup, temporary overload, a network blip — so they're worth
// retrying. Permanent failures (404, 403, etc.) indicate the URL itself
// won't succeed no matter how many times we ask, so retrying just wastes
// time/budget instead of ever changing the outcome.
export function classifyResult(result: CheckResult): ResultClassification {
  if (!result.ok) {
    return "transient_failure";
  }

  const status = result.httpStatus;

  if (status !== null && ((status >= 500 && status <= 599) || status === 429)) {
    return "transient_failure";
  }

  if (status !== null && status >= 200 && status <= 299) {
    return "success";
  }

  // Covers 300–399 (redirect, if not auto-followed) and 400–499 excluding 429.
  return "permanent_failure";
}

"use client";

import type { BatchDetailResponseType } from "@url-checker/shared-types";

interface BatchLiveViewProps {
  batchId: string;
  initialData: BatchDetailResponseType;
}

export default function BatchLiveView({
  batchId,
  initialData,
}: BatchLiveViewProps) {
  // Placeholder only — SSE wiring is a separate upcoming step. batchId and
  // initialData are accepted now so the real implementation can use them
  // without changing this component's call site.
  void batchId;
  void initialData;

  return <div>Live updates will appear here (not yet wired)</div>;
}

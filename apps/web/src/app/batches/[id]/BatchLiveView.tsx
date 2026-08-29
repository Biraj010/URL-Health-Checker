"use client";

import { useEffect, useRef, useState } from "react";
import { getBatch, type BatchDetailResponseType } from "@url-checker/shared-types";

interface BatchLiveViewProps {
  batchId: string;
  initialData: BatchDetailResponseType;
}

function isTerminal(status: string): boolean {
  return status === "completed" || status === "cancelled";
}

export default function BatchLiveView({
  batchId,
  initialData,
}: BatchLiveViewProps) {
  const [batch, setBatch] = useState<BatchDetailResponseType>(initialData);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL}/batches/${batchId}/events`,
    );
    eventSourceRef.current = eventSource;

    async function resync() {
      const fresh = await getBatch(batchId);
      setBatch(fresh);
    }

    // EventSource auto-reconnects the transport on drop, but any events
    // during the gap are lost since this SSE stream doesn't replay history.
    // Refetching full state on every 'open' (including reconnects)
    // guarantees we resync to ground truth rather than silently missing
    // updates — this is what actually satisfies "recovers correctly from a
    // dropped connection", not just relying on the browser's automatic
    // reconnect.
    eventSource.addEventListener("open", () => {
      resync();
    });

    eventSource.addEventListener("message", (event) => {
      let parsed: { type?: string };
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }

      // The initial handshake message ({ type: "connected", batchId }) isn't
      // a real update — the 'open' handler already triggers the initial
      // resync, so there's nothing to do here for it.
      if (parsed.type === "connected") return;

      // The event payload only carries batchId/urlId/status/batchStatus/
      // completedCount/totalUrls — not the full Url record (httpStatus,
      // responseTimeMs, title, lastError). Rather than patch just those
      // fields onto one entry, do a full resync on every event: it's
      // simpler, more robust, and — given batches are capped at 500 urls —
      // not expensive. Batch-level status/completedCount always come from
      // this authoritative snapshot, never derived/incremented client-side.
      resync();
    });

    return () => {
      eventSource.close();
    };
  }, [batchId]);

  useEffect(() => {
    // A finished batch will never receive further updates, so holding the
    // SSE connection open past that point just wastes a server-held
    // connection for nothing. This also covers a cold load of an
    // already-finished batch: the connection opens briefly but is closed
    // right away here, without ever needing a live event to prompt it.
    if (isTerminal(batch.status) && eventSourceRef.current) {
      eventSourceRef.current.close();
    }
  }, [batch.status]);

  return (
    <div>
      <p>Status: {batch.status}</p>
      <p>
        Progress: {batch.completedCount} / {batch.totalUrls}
      </p>

      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b">
            <th className="p-2">URL</th>
            <th className="p-2">Status</th>
            <th className="p-2">HTTP Status</th>
            <th className="p-2">Response Time (ms)</th>
            <th className="p-2">Title</th>
            <th className="p-2">Last Error</th>
          </tr>
        </thead>
        <tbody>
          {batch.urls.map((url) => (
            <tr key={url.id} className="border-b">
              <td className="p-2">{url.url}</td>
              <td className="p-2">{url.status}</td>
              <td className="p-2">{url.httpStatus ?? "—"}</td>
              <td className="p-2">{url.responseTimeMs ?? "—"}</td>
              <td className="p-2">{url.title ?? "—"}</td>
              <td className="p-2">{url.lastError ? url.lastError : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

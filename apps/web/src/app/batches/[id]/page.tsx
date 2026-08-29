import { notFound } from "next/navigation";
import { getBatch, ApiError } from "@url-checker/shared-types";
import BatchLiveView from "./BatchLiveView";

interface BatchPageProps {
  params: Promise<{ id: string }>;
}

export default async function BatchPage({ params }: BatchPageProps) {
  const { id } = await params;

  // Server Component — fetched at request time on the server, same
  // reasoning as the list page. This is what makes a cold-load (new tab,
  // no prior client state) correct regardless of whether the batch is
  // still running or already finished: there's no stale client cache to
  // show instead of the real current state.
  let batch;
  try {
    batch = await getBatch(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-semibold">Batch {batch.id}</h1>

      <div className="mt-4">
        <p>Status: {batch.status}</p>
        <p>
          Progress: {batch.completedCount} / {batch.totalUrls}
        </p>
        <p>Created: {new Date(batch.createdAt).toLocaleString()}</p>
      </div>

      <table className="mt-6 w-full border-collapse text-left">
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

      <div className="mt-6">
        <BatchLiveView batchId={batch.id} initialData={batch} />
      </div>
    </div>
  );
}

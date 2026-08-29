import Link from "next/link";
import { listBatches } from "@url-checker/shared-types";

export default async function Home() {
  // Server Component — fetched at request time on the server. No
  // client-side loading state needed since this data is present before the
  // page reaches the browser. This also means no JS is shipped to the
  // client just to display this list.
  const batches = await listBatches();

  return (
    <div className="min-h-screen p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Batches</h1>
        <Link href="/batches/new" className="underline">
          New batch
        </Link>
      </div>

      {batches.length === 0 ? (
        <p className="mt-6">
          No batches yet. Submit a list of URLs to get started.
        </p>
      ) : (
        <table className="mt-6 w-full border-collapse text-left">
          <thead>
            <tr className="border-b">
              <th className="p-2">ID</th>
              <th className="p-2">Status</th>
              <th className="p-2">Progress</th>
              <th className="p-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <tr key={batch.id} className="border-b">
                <td className="p-2">
                  <Link href={`/batches/${batch.id}`} className="underline">
                    {batch.id}
                  </Link>
                </td>
                <td className="p-2">{batch.status}</td>
                <td className="p-2">
                  {batch.completedCount} / {batch.totalUrls}
                </td>
                <td className="p-2">
                  {new Date(batch.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

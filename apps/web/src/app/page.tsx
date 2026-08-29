import { listBatches } from "@url-checker/shared-types";

export default async function Home() {
  // Server Component — fetched at request time on the server. No
  // client-side loading state needed since this data is present before the
  // page reaches the browser. This also means no JS is shipped to the
  // client just to display this list.
  const batches = await listBatches();

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-semibold">URL Health Checker</h1>

      {/* Placeholder rendering to prove the data flow works — real list
          styling/structure is a later step. */}
      <ul className="mt-6 space-y-1">
        {batches.map((batch) => (
          <li key={batch.id}>
            {batch.id} — {batch.status}
          </li>
        ))}
      </ul>
    </div>
  );
}

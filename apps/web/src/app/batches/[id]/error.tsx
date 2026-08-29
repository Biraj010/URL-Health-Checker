"use client";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorPageProps) {
  return (
    <div className="p-8">
      <p>Something went wrong loading this batch.</p>
      <p className="mt-2 text-red-600">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded border px-3 py-1"
      >
        Try again
      </button>
    </div>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="p-8">
      <p>Page not found.</p>
      <Link href="/" className="mt-4 inline-block underline">
        Back to batch list
      </Link>
    </div>
  );
}

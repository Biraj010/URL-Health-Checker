"use client";

import { useState } from "react";

type Mode = "paste" | "csv";

export default function NewBatchPage() {
  const [mode, setMode] = useState<Mode>("paste");
  const [pastedUrls, setPastedUrls] = useState<string>("");
  const [csvFile, setCsvFile] = useState<File | null>(null);

  function handleSubmit() {
    // Placeholder only — no parsing, validation, or API call yet.
    if (mode === "paste") {
      console.log("mode: paste", "input:", pastedUrls);
    } else {
      console.log("mode: csv", "file:", csvFile?.name ?? null);
    }
  }

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-3xl font-semibold">Submit a new batch</h1>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`rounded border px-3 py-1 ${
            mode === "paste" ? "bg-black text-white" : ""
          }`}
        >
          Paste URLs
        </button>
        <button
          type="button"
          onClick={() => setMode("csv")}
          className={`rounded border px-3 py-1 ${
            mode === "csv" ? "bg-black text-white" : ""
          }`}
        >
          Upload CSV
        </button>
      </div>

      <div className="mt-4">
        {mode === "paste" ? (
          <textarea
            value={pastedUrls}
            onChange={(e) => setPastedUrls(e.target.value)}
            placeholder="One URL per line"
            rows={10}
            className="w-full max-w-xl rounded border p-2"
          />
        ) : (
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
          />
        )}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        className="mt-6 rounded border px-4 py-2"
      >
        Submit
      </button>
    </div>
  );
}

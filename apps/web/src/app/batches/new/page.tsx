"use client";

import { useState } from "react";
import Papa from "papaparse";

type Mode = "paste" | "csv";

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export default function NewBatchPage() {
  const [mode, setMode] = useState<Mode>("paste");
  const [pastedUrls, setPastedUrls] = useState<string>("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvUrls, setCsvUrls] = useState<string[]>([]);

  function handleCsvFileChange(file: File | null) {
    setCsvFile(file);
    setCsvUrls([]);

    if (!file) return;

    // Assumes one URL per row, first column only. Rows that don't parse as
    // valid URLs are silently skipped. This is a deliberate simplification —
    // documented further in the README.
    Papa.parse<string[]>(file, {
      complete: (results) => {
        const urls = results.data
          .map((row) => row[0]?.trim() ?? "")
          .filter((value) => value.length > 0 && isValidUrl(value));
        setCsvUrls(urls);
      },
    });
  }

  function handleSubmit() {
    // Placeholder only — no validation or API call yet.
    if (mode === "paste") {
      console.log("mode: paste", "input:", pastedUrls);
    } else {
      console.log("mode: csv", "file:", csvFile?.name ?? null, "urls:", csvUrls);
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
          <div>
            <input
              type="file"
              accept=".csv"
              onChange={(e) =>
                handleCsvFileChange(e.target.files?.[0] ?? null)
              }
            />
            {csvFile && (
              <p className="mt-2 text-sm">
                {csvUrls.length > 0
                  ? `Parsed ${csvUrls.length} URL${csvUrls.length === 1 ? "" : "s"} from ${csvFile.name}`
                  : `No valid URLs found in ${csvFile.name}`}
              </p>
            )}
          </div>
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

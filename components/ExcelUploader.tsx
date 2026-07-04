"use client";

import { useState, useEffect, useCallback } from "react";
import type { UploadResult } from "@/lib/types";

interface RecentFile {
  file_name: string;
  uploaded_at: string;
  rowCount: number;
}

type Status = "idle" | "uploading" | "processing" | "success" | "error";

export default function ExcelUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

  const loadRecentFiles = useCallback(async () => {
    try {
      const res = await fetch("/api/upload");
      if (res.ok) {
        const json = await res.json();
        setRecentFiles(json.files ?? []);
      }
    } catch {
      // Non-critical — silently skip if this fails
    }
  }, []);

  useEffect(() => {
    loadRecentFiles();
  }, [loadRecentFiles]);

  async function handleUpload() {
    if (!file) {
      setStatus("error");
      setMessage("No file selected. Choose a .xlsx file first.");
      return;
    }
    if (!reportDate) {
      setStatus("error");
      setMessage("Report date is required.");
      return;
    }

    setStatus("uploading");
    setMessage("Uploading…");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("reportDate", reportDate);

      setStatus("processing");
      setMessage("Processing…");

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(json.error || "Upload failed.");
        return;
      }

      setStatus("success");
      setResult(json);
      setMessage(
        `Upload successful: ${json.rowCount} rows, sheets: [${json.sheets.join(", ")}]`
      );
      setFile(null);
      loadRecentFiles();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="text-sm text-mist-400 mb-4">
          Upload your cleaned daily breaksheet Excel file. All configured sheets will be
          processed.
        </p>

        <div className="mb-4">
          <label htmlFor="reportDate" className="label-eyebrow block mb-1.5">
            Report date
          </label>
          <input
            id="reportDate"
            type="date"
            className="input"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
          />
          <p className="text-xs text-mist-500 mt-1">
            Shrinkage and Prod Summary don&apos;t carry their own date column, so this date is
            applied to those two sheets. The other sheets use their own per-row timestamps.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <label className="flex-1">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-mist-400 file:mr-4 file:py-2 file:px-4
                         file:rounded-lg file:border-0 file:bg-ink-700 file:text-mist-100
                         file:text-sm file:font-medium hover:file:bg-ink-600 file:cursor-pointer
                         cursor-pointer"
            />
          </label>
          <button
            onClick={handleUpload}
            disabled={status === "uploading" || status === "processing"}
            className="btn-primary whitespace-nowrap"
          >
            {status === "uploading" || status === "processing" ? "Working…" : "Upload"}
          </button>
        </div>

        {file && status === "idle" && (
          <p className="text-xs text-mist-500 mt-2">Selected: {file.name}</p>
        )}

        {message && (
          <p
            className={`text-sm mt-4 rounded-lg px-3 py-2 border ${
              status === "error"
                ? "text-metric-abandon bg-metric-abandon/10 border-metric-abandon/30"
                : status === "success"
                ? "text-metric-csat bg-metric-csat/10 border-metric-csat/30"
                : "text-mist-400 bg-ink-700/50 border-ink-600"
            }`}
          >
            {message}
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="text-sm font-medium text-mist-200 mb-3">Recently uploaded files</h2>
        {recentFiles.length === 0 ? (
          <p className="text-sm text-mist-500">No files uploaded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-mist-500 border-b border-ink-600">
                <th className="pb-2 font-normal">File name</th>
                <th className="pb-2 font-normal">Uploaded</th>
                <th className="pb-2 font-normal text-right">Rows</th>
              </tr>
            </thead>
            <tbody>
              {recentFiles.map((f, i) => (
                <tr key={i} className="border-b border-ink-700/60 last:border-0">
                  <td className="py-2 text-mist-200">{f.file_name}</td>
                  <td className="py-2 text-mist-400">
                    {new Date(f.uploaded_at).toLocaleString()}
                  </td>
                  <td className="py-2 text-right text-mist-200">{f.rowCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

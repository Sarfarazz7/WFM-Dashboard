"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { UploadHistoryItem, UploadResult } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabaseBrowserClient";

type Status = "idle" | "uploading" | "processing" | "success" | "error";

const UPLOAD_TIMEOUT_MS = 180_000; // 3 minutes
const STORAGE_BUCKET = "excel-files";

function sanitizeFileName(fileName: string): string {
  return fileName
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 160);
}

function generateStoragePath(fileName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 10);
  return `uploads/${timestamp}-${random}/${sanitizeFileName(fileName)}`;
}

async function parseApiResponse(res: Response) {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      `Server returned a non-JSON response (status ${res.status}): ${text.slice(0, 200)}`
    );
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? `Upload failed with status ${res.status}`);
  }
  return json;
}

export default function ExcelUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [reportDate, setReportDate] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [recentFiles, setRecentFiles] = useState<UploadHistoryItem[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setReportDate(new Date().toISOString().slice(0, 10));
  }, []);

  useEffect(() => {
    loadRecentFiles();
  }, [loadRecentFiles]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startTimer() {
    setElapsed(0);
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

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
    setMessage("Uploading file to storage…");
    setResult(null);
    startTimer();

    try {
      const storagePath = generateStoragePath(file.name);

      const { error: uploadError } = await supabaseBrowser.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      setStatus("processing");
      setMessage("Processing workbook…");

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storagePath,
            fileName: file.name,
            reportDate,
            fileSizeBytes: file.size,
          }),
          signal: controller.signal,
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === "AbortError") {
          throw new Error(
            `Processing timed out after ${UPLOAD_TIMEOUT_MS / 1000} seconds. The file may be too large or the server is under heavy load.`
          );
        }
        throw new Error("Network error — could not reach the server.");
      } finally {
        clearTimeout(timeout);
      }

      let json: any;
      try {
        json = await parseApiResponse(res);
      } catch (parseErr) {
        setStatus("error");
        setMessage(
          parseErr instanceof Error ? parseErr.message : "Upload failed."
        );
        return;
      }

      setStatus("success");
      setResult(json);
      setMessage(
        `Upload successful: ${json.rowCount} rows, sheets: [${json.sheets.join(", ")}]${
          json.validationIssueCount ? `, warnings: ${json.validationIssueCount}` : ""
        }`
      );
      setFile(null);
      loadRecentFiles();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      stopTimer();
    }
  }

  function formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
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
          <p className="text-xs text-mist-400 mt-1">
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
          <p className="text-xs text-mist-400 mt-2">Selected: {file.name}</p>
        )}

        {(status === "uploading" || status === "processing") && (
          <div className="mt-4 rounded-lg border border-ink-600 bg-ink-700/50 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-teal-400" />
              <p className="text-sm text-mist-400">
                {status === "uploading" ? "Uploading file…" : "Processing workbook…"}
              </p>
              <span className="ml-auto text-xs text-mist-400 font-mono">
                {formatElapsed(elapsed)}
              </span>
            </div>
            {status === "processing" && elapsed > 10 && (
              <p className="mt-1 text-xs text-mist-400">
                Large files may take a minute. The upload will timeout after 90 seconds.
              </p>
            )}
          </div>
        )}

        {message && (status === "success" || status === "error") && (
          <p
            className={`text-sm mt-4 rounded-lg px-3 py-2 border ${
              status === "error"
                ? "text-metric-abandon bg-metric-abandon/10 border-metric-abandon/30"
                : "text-metric-csat bg-metric-csat/10 border-metric-csat/30"
            }`}
          >
            {message}
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="text-sm font-medium text-mist-200 mb-3">Recently uploaded files</h2>
        {recentFiles.length === 0 ? (
          <p className="text-sm text-mist-400">No files uploaded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-mist-400 border-b border-ink-600">
                <th className="pb-2 font-normal">File name</th>
                <th className="pb-2 font-normal">Uploaded</th>
                <th className="pb-2 font-normal">Status</th>
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
                  <td className="py-2 text-mist-400">{f.status ?? "completed"}</td>
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

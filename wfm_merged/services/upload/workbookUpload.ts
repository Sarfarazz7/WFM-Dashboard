import { createHash } from "crypto";

const VALID_EXTENSIONS = [".xlsx", ".xls"];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export function validateWorkbookFile(file: File): string | null {
  const lowerName = file.name.toLowerCase();
  const hasValidExtension = VALID_EXTENSIONS.some((ext) => lowerName.endsWith(ext));

  if (!hasValidExtension) {
    return "Please upload a .xlsx or .xls file.";
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "File is too large. Please upload an Excel file under 25 MB.";
  }

  return null;
}

export function createWorkbookHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sanitizeFileName(fileName: string): string {
  return fileName
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 160);
}

export function createStoragePath(uploadId: string, fileName: string): string {
  return `uploads/${uploadId}/${sanitizeFileName(fileName)}`;
}

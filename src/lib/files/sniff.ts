import { fileTypeFromBuffer } from "file-type";
import { ALLOWED, extOf } from "./types";

/**
 * Determine the real MIME type. Binary formats must be confirmed by magic bytes; text formats
 * (txt/csv) have no signature so we require valid UTF-8 without NUL bytes.
 */
export async function sniffMime(bytes: Uint8Array, filename: string): Promise<string | null> {
  const ext = extOf(filename);
  const ft = await fileTypeFromBuffer(bytes);
  if (ft) {
    // DOCX/XLSX are zip containers; file-type distinguishes them by internal paths.
    if (ALLOWED[ft.mime] && ALLOWED[ft.mime]!.ext.includes(ext === "jpeg" ? "jpg" : ext)) return ft.mime;
    if (ALLOWED[ft.mime]?.kind === "image" && (ext === "jpg" || ext === "jpeg" || ext === "png")) return ft.mime;
    return null;
  }
  if (ext === "txt" || ext === "md" || ext === "csv") {
    if (bytes.includes(0)) return null;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
    return ext === "csv" ? "text/csv" : "text/plain";
  }
  return null;
}

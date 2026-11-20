/**
 * Allowed upload types. The declared MIME type is NOT trusted: the server sniffs magic bytes
 * (file-type) and requires the sniffed type to match the allow-list.
 */
export const ALLOWED: Record<string, { ext: string[]; kind: "pdf" | "docx" | "text" | "csv" | "xlsx" | "image" }> = {
  "application/pdf": { ext: ["pdf"], kind: "pdf" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: ["docx"], kind: "docx" },
  "text/plain": { ext: ["txt", "md"], kind: "text" },
  "text/csv": { ext: ["csv"], kind: "csv" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: ["xlsx"], kind: "xlsx" },
  "image/png": { ext: ["png"], kind: "image" },
  "image/jpeg": { ext: ["jpg", "jpeg"], kind: "image" },
};

export const ACCEPT_ATTR = ".pdf,.docx,.txt,.md,.csv,.xlsx,.png,.jpg,.jpeg";

export function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** Sanitize a user-supplied filename for storage/display. */
export function safeName(name: string) {
  return name.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "_").replace(/^\.+/, "").slice(0, 180) || "file";
}

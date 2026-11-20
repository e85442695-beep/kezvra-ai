import { ALLOWED } from "./types";

export const MAX_EXTRACT_CHARS = 2_000_000;

export interface Extracted {
  text: string;
  pageCount?: number;
}

/** Extract plain text from a validated file. Runs in the worker, never on the request path. */
export async function extractText(bytes: Uint8Array, mime: string): Promise<Extracted> {
  const kind = ALLOWED[mime]?.kind;
  switch (kind) {
    case "pdf": {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const r = await pdfText(pdf, { mergePages: false });
      const pages = Array.isArray(r.text) ? r.text : [r.text];
      return { text: pages.map((t, i) => `[page ${i + 1}]\n${t}`).join("\n\n").slice(0, MAX_EXTRACT_CHARS), pageCount: r.totalPages };
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      return { text: r.value.slice(0, MAX_EXTRACT_CHARS) };
    }
    case "text":
      return { text: new TextDecoder().decode(bytes).slice(0, MAX_EXTRACT_CHARS) };
    case "csv": {
      const Papa = (await import("papaparse")).default;
      const parsed = Papa.parse<string[]>(new TextDecoder().decode(bytes), { skipEmptyLines: true });
      return { text: parsed.data.slice(0, 50_000).map((row) => row.join(" | ")).join("\n").slice(0, MAX_EXTRACT_CHARS) };
    }
    case "xlsx": {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
      const parts: string[] = [];
      wb.eachSheet((ws) => {
        parts.push(`[sheet ${ws.name}]`);
        ws.eachRow({ includeEmpty: false }, (row) => {
          const vals = (row.values as unknown[]).slice(1).map((v) => cellText(v));
          parts.push(vals.join(" | "));
        });
      });
      return { text: parts.join("\n").slice(0, MAX_EXTRACT_CHARS) };
    }
    case "image":
      return { text: "" }; // images are passed to vision models directly
    default:
      throw new Error("UNSUPPORTED_TYPE");
  }
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text) return o.text;
    if (o.result != null) return String(o.result);
    if (v instanceof Date) return v.toISOString();
    return "";
  }
  return String(v);
}

/** Split text into overlapping chunks on paragraph boundaries. */
export function chunkText(text: string, target = 2400, overlap = 300): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  const paras = clean.split(/\n\n/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (p.length > target) {
      if (cur) chunks.push(cur), (cur = "");
      for (let i = 0; i < p.length; i += target - overlap) chunks.push(p.slice(i, i + target));
      continue;
    }
    if (cur.length + p.length + 2 > target) {
      chunks.push(cur);
      cur = cur.slice(Math.max(0, cur.length - overlap)) + "\n\n" + p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

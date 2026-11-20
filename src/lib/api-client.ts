"use client";

export class ApiError extends Error {
  constructor(public status: number, public code: string, public data?: unknown) {
    super(code);
  }
}

/** fetch wrapper for same-origin JSON APIs. Throws ApiError carrying the server's error code. */
export async function api<T = unknown>(url: string, init: Omit<RequestInit, "body"> & { body?: unknown } = {}): Promise<T> {
  const { body, ...rest } = init;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const res = await fetch(url, {
    ...rest,
    headers: { ...(body !== undefined && !isForm ? { "content-type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    credentials: "same-origin",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? "INTERNAL_ERROR", data);
  return data as T;
}

/** Parse an SSE response body into (event, data) callbacks. */
export async function readSSE(res: Response, on: (event: string, data: unknown) => void) {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) {
        try {
          on(event, JSON.parse(data));
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  }
}

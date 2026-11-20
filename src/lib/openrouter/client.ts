import { env } from "@/lib/env";

/**
 * Thin, typed OpenRouter client (official REST API, https://openrouter.ai/docs).
 *  - GET  /models, /images/models          → catalog sync
 *  - POST /chat/completions (SSE)           → chat, compare, files, developer API
 *  - POST /images                           → image generation
 *  - POST /embeddings                       → retrieval
 *  - GET  /generation?id=                   → cost reconciliation
 * Usage (incl. `cost` in USD) is returned automatically on every response.
 */

export class OpenRouterError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = "OpenRouterError";
  }
}

export class OpenRouterNotConfiguredError extends Error {
  constructor() {
    super("OPENROUTER_NOT_CONFIGURED");
  }
}

function headers(auth = true): Record<string, string> {
  if (auth && !env.OPENROUTER_API_KEY) throw new OpenRouterNotConfiguredError();
  return {
    ...(env.OPENROUTER_API_KEY ? { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } : {}),
    "Content-Type": "application/json",
    "HTTP-Referer": env.APP_URL,
    "X-Title": "Kezvra AI",
  };
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number; public?: boolean } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 120_000);
  const signal = init.signal ? AbortSignal.any([init.signal, ctrl.signal]) : ctrl.signal;
  try {
    const res = await fetch(`${env.OPENROUTER_BASE_URL}${path}`, { ...init, headers: { ...headers(!init.public), ...(init.headers ?? {}) }, signal });
    if (!res.ok) throw await toError(res);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function toError(res: Response) {
  let msg = res.statusText;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string | number } };
    msg = body.error?.message ?? msg;
    code = body.error?.code != null ? String(body.error.code) : undefined;
  } catch {
    /* non-JSON */
  }
  return new OpenRouterError(res.status, msg, code);
}

// ───────────── Models ─────────────

export interface ORModel {
  id: string;
  canonical_slug?: string;
  name: string;
  description?: string;
  context_length?: number | null;
  pricing?: Record<string, string | undefined>;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  top_provider?: { max_completion_tokens?: number | null };
  /** text models: string[]; image models (/images/models): object keyed by parameter */
  supported_parameters?: string[] | Record<string, { type: string; values?: string[]; min?: number; max?: number }>;
}

export async function listModels(): Promise<ORModel[]> {
  const r = await request<{ data: ORModel[] }>("/models", { public: true });
  return r.data;
}

export async function listImageModels(): Promise<ORModel[]> {
  const r = await request<{ data: ORModel[] }>("/images/models", { public: true });
  return r.data;
}

// ───────────── Chat ─────────────

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export interface ORMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatParams {
  model: string;
  messages: ORMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  user?: string;
}

export interface ORUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number | string;
}

export interface StreamEvent {
  type: "delta" | "done";
  text?: string;
  id?: string;
  usage?: ORUsage;
  finishReason?: string | null;
}

/** Streams a chat completion, yielding text deltas and a final event with usage. */
export async function* streamChat(params: ChatParams, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ...params, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) throw await toError(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let id: string | undefined;
  let usage: ORUsage | undefined;
  let finishReason: string | null = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue; // SSE comments like ": OPENROUTER PROCESSING"
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk: {
          id?: string;
          error?: { message?: string; code?: number };
          usage?: ORUsage;
          choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
        };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.error) throw new OpenRouterError(chunk.error.code ?? 502, chunk.error.message ?? "Upstream error");
        id ??= chunk.id;
        if (chunk.usage) usage = chunk.usage;
        const c = chunk.choices?.[0];
        if (c?.finish_reason) finishReason = c.finish_reason;
        const text = c?.delta?.content;
        if (text) yield { type: "delta", text, id };
      }
    }
  } finally {
    reader.releaseLock();
  }
  yield { type: "done", id, usage, finishReason };
}

/** Non-streaming completion (used for titles, summaries, file Q&A in the worker). */
export async function completeChat(params: ChatParams, signal?: AbortSignal) {
  const r = await request<{
    id: string;
    choices: { message: { content: string | null }; finish_reason: string | null }[];
    usage?: ORUsage;
  }>("/chat/completions", { method: "POST", body: JSON.stringify(params), signal });
  return { id: r.id, text: r.choices[0]?.message.content ?? "", usage: r.usage };
}

// ───────────── Images ─────────────

export interface ImageParams {
  model: string;
  prompt: string;
  aspect_ratio?: string;
  n?: number;
  input_references?: { type: "image_url"; image_url: { url: string } }[];
}

export async function generateImages(p: ImageParams, signal?: AbortSignal) {
  return request<{ created: number; data: { b64_json?: string; url?: string; media_type?: string }[]; usage?: ORUsage }>(
    "/images",
    { method: "POST", body: JSON.stringify({ ...p, response_format: "b64_json" }), signal, timeoutMs: 300_000 },
  );
}

// ───────────── Embeddings ─────────────

export async function embed(input: string[], model = env.EMBEDDING_MODEL) {
  return request<{ data: { embedding: number[]; index: number }[]; usage?: ORUsage }>("/embeddings", {
    method: "POST",
    body: JSON.stringify({ model, input }),
  });
}

// ───────────── Generation lookup ─────────────

export async function getGeneration(id: string) {
  return request<{ data: { id: string; total_cost?: number; tokens_prompt?: number; tokens_completion?: number } }>(
    `/generation?id=${encodeURIComponent(id)}`,
  );
}

import { db, type AIModel, type ChatMessage } from "@/lib/db";
import { HttpError } from "@/lib/http/route";
import type { ContentPart, ORMessage } from "@/lib/openrouter/client";
import { retrieve, wrapUntrusted } from "@/lib/files/retrieval";
import { getObjectBytes } from "@/lib/storage";
import { randomToken } from "@/lib/security/tokens";
import { estimateTokens } from "@/lib/pricing";

export interface Attachment {
  fileId: string;
  name: string;
  mime: string;
}

/** Load a chat owned by `userId` or throw 404 (never reveal other users' chats). */
export async function ownedChat(userId: string, chatId: string) {
  const chat = await db.chat.findFirst({ where: { id: chatId, userId } });
  if (!chat) throw new HttpError(404, "NOT_FOUND");
  return chat;
}

/** Validate that every attached file belongs to the user. */
export async function ownedAttachments(userId: string, fileIds: string[]): Promise<Attachment[]> {
  if (fileIds.length === 0) return [];
  const files = await db.storedFile.findMany({ where: { id: { in: fileIds }, userId }, select: { id: true, name: true, mime: true, status: true } });
  if (files.length !== new Set(fileIds).size) throw new HttpError(404, "FILE_NOT_FOUND");
  const notReady = files.find((f) => f.status !== "READY");
  if (notReady) throw new HttpError(409, "FILE_NOT_READY");
  return files.map((f) => ({ fileId: f.id, name: f.name, mime: f.mime }));
}

const BASE_SYSTEM = [
  "You are Kezvra, a helpful AI assistant. Answer in the user's language unless asked otherwise.",
  "Use Markdown. Use LaTeX ($…$ / $$…$$) for math. Put code in fenced blocks with a language tag.",
].join(" ");

/**
 * Build the provider message list:
 *   system (base + chat/assistant prompt) → untrusted document context → history (trimmed to fit)
 * Images attached to user messages are sent as data URLs to vision-capable models only.
 */
export async function buildContext(opts: {
  userId: string;
  model: AIModel;
  systemPrompt?: string | null;
  history: Pick<ChatMessage, "role" | "content" | "attachments">[];
  query: string;
  maxCompletion: number;
}): Promise<ORMessage[]> {
  const system: ORMessage[] = [{ role: "system", content: opts.systemPrompt ? `${BASE_SYSTEM}\n\n${opts.systemPrompt}` : BASE_SYSTEM }];

  // Documents referenced anywhere in the visible history
  const docIds = new Set<string>();
  const imageIds = new Set<string>();
  for (const m of opts.history) {
    for (const a of (m.attachments as Attachment[] | null) ?? []) (a.mime.startsWith("image/") ? imageIds : docIds).add(a.fileId);
  }
  if (docIds.size > 0) {
    const ctx = await retrieve(opts.userId, [...docIds], opts.query);
    const wrapped = wrapUntrusted(ctx, randomToken(9));
    if (wrapped) system.push({ role: "system", content: wrapped });
  }

  const vision = opts.model.inputModalities.includes("image");
  const budget = Math.max(2000, (opts.model.contextLength ?? 16_000) - opts.maxCompletion - system.reduce((n, m) => n + estimateTokens(String(m.content)), 0));

  // Walk history newest→oldest until the token budget is used
  const kept: ORMessage[] = [];
  let used = 0;
  for (let i = opts.history.length - 1; i >= 0; i--) {
    const m = opts.history[i]!;
    const t = estimateTokens(m.content);
    if (used + t > budget && kept.length > 0) break;
    used += t;
    const atts = ((m.attachments as Attachment[] | null) ?? []).filter((a) => a.mime.startsWith("image/"));
    if (m.role === "user" && vision && atts.length > 0 && i >= opts.history.length - 6) {
      const parts: ContentPart[] = [{ type: "text", text: m.content }];
      for (const a of atts.slice(0, 4)) {
        const f = await db.storedFile.findFirst({ where: { id: a.fileId, userId: opts.userId }, select: { storageKey: true, mime: true } });
        if (!f) continue;
        const bytes = await getObjectBytes(f.storageKey);
        parts.push({ type: "image_url", image_url: { url: `data:${f.mime};base64,${Buffer.from(bytes).toString("base64")}` } });
      }
      kept.push({ role: "user", content: parts });
    } else {
      kept.push({ role: m.role, content: m.content });
    }
  }
  kept.reverse();
  return [...system, ...kept];
}

/** Visible history (non-superseded, completed or stopped). */
export async function visibleHistory(chatId: string) {
  return db.chatMessage.findMany({
    where: { chatId, superseded: false, status: { in: ["COMPLETE", "STOPPED"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, attachments: true, createdAt: true },
  });
}

export function titleFrom(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t || "New chat";
}

/** Group chat list by recency for the sidebar. */
export function dateGroup(d: Date, now = new Date()): "today" | "yesterday" | "week" | "month" | "older" {
  const day = 86_400_000;
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const t = d.getTime();
  if (t >= startToday.getTime()) return "today";
  if (t >= startToday.getTime() - day) return "yesterday";
  if (t >= startToday.getTime() - 7 * day) return "week";
  if (t >= startToday.getTime() - 30 * day) return "month";
  return "older";
}

export function toMarkdown(chat: { title: string; modelId: string; createdAt: Date }, messages: { role: string; content: string; createdAt: Date; modelId: string | null }[]) {
  const lines = [`# ${chat.title}`, "", `_Model: ${chat.modelId} · Created: ${chat.createdAt.toISOString()}_`, ""];
  for (const m of messages) {
    lines.push(`## ${m.role === "user" ? "User" : m.role === "assistant" ? `Assistant${m.modelId ? ` (${m.modelId})` : ""}` : "System"}`, "", m.content, "");
  }
  return lines.join("\n");
}

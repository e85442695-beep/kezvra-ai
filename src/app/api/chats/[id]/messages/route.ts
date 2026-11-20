import { z } from "zod";
import { db, type Prisma } from "@/lib/db";
import { body, errorResponse, HttpError, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { buildContext, ownedAttachments, ownedChat, titleFrom, visibleHistory } from "@/lib/chat/service";
import { getUsableModel } from "@/lib/openrouter/models";
import { runChat } from "@/lib/ai/executor";
import { getSettings } from "@/lib/settings";
import { sseStream } from "@/lib/http/sse";
import { rateLimit } from "@/lib/rate-limit";
import { randomToken } from "@/lib/security/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  content: z.string().max(100_000).default(""),
  attachments: z.array(z.string()).max(10).default([]),
  /** regenerate the given assistant message */
  regenerateId: z.string().optional(),
  /** edit the given user message (replaces it and everything after it) */
  editId: z.string().optional(),
  modelId: z.string().max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(16).max(200_000).optional(),
  /** client-generated key so retries of the same send don't double-charge */
  clientRequestId: z.string().max(64).optional(),
});

/**
 * Send a message and stream the assistant's reply via SSE.
 * Events: `start` {userMessageId, assistantMessageId} · `delta` {t} · `done` {…usage} · `error` {error}
 * Closing the connection (Stop button) aborts the upstream request; tokens generated so far are billed.
 */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const chat = await ownedChat(me.id, id);
  const input = await body(req, schema);
  const rl = await rateLimit(`chat:${me.id}`, 30, 60);
  if (!rl.ok) throw new HttpError(429, "TOO_MANY_REQUESTS");
  const s = await getSettings();
  if (s.maintenanceMode) throw new HttpError(503, "MAINTENANCE");

  const modelId = input.modelId ?? chat.modelId;
  const model = await getUsableModel(modelId);
  if (!model) throw new HttpError(400, "MODEL_UNAVAILABLE");

  // ── Mutate history according to the action ──
  let userMessageId: string;
  if (input.regenerateId) {
    const target = await db.chatMessage.findFirst({ where: { id: input.regenerateId, chatId: chat.id, role: "assistant" } });
    if (!target) throw new HttpError(404, "MESSAGE_NOT_FOUND");
    await db.chatMessage.updateMany({ where: { chatId: chat.id, createdAt: { gte: target.createdAt } }, data: { superseded: true } });
    const lastUser = await db.chatMessage.findFirst({ where: { chatId: chat.id, role: "user", superseded: false }, orderBy: { createdAt: "desc" } });
    if (!lastUser) throw new HttpError(400, "NOTHING_TO_REGENERATE");
    userMessageId = lastUser.id;
  } else {
    if (!input.content.trim() && input.attachments.length === 0) throw new HttpError(400, "EMPTY_MESSAGE");
    const attachments = await ownedAttachments(me.id, input.attachments);
    if (attachments.some((a) => a.mime.startsWith("image/")) && !model.inputModalities.includes("image")) throw new HttpError(400, "MODEL_NO_VISION");
    if (input.editId) {
      const target = await db.chatMessage.findFirst({ where: { id: input.editId, chatId: chat.id, role: "user" } });
      if (!target) throw new HttpError(404, "MESSAGE_NOT_FOUND");
      await db.chatMessage.updateMany({ where: { chatId: chat.id, createdAt: { gte: target.createdAt } }, data: { superseded: true } });
    }
    const um = await db.chatMessage.create({
      data: { chatId: chat.id, role: "user", content: input.content, attachments: attachments.length ? (attachments as unknown as Prisma.InputJsonValue) : undefined },
    });
    userMessageId = um.id;
    if (attachments.length) {
      await db.chatFile.createMany({ data: attachments.map((a) => ({ chatId: chat.id, fileId: a.fileId })), skipDuplicates: true });
    }
  }

  const history = await visibleHistory(chat.id);
  const isFirst = history.filter((m) => m.role === "user").length === 1 && chat.title === "New chat";
  const query = history.filter((m) => m.role === "user").at(-1)?.content ?? "";
  const maxTokens = input.maxTokens ?? chat.maxTokens ?? undefined;
  const messages = await buildContext({ userId: me.id, model, systemPrompt: chat.systemPrompt, history, query, maxCompletion: maxTokens ?? s.maxCompletionTokens });

  const assistant = await db.chatMessage.create({ data: { chatId: chat.id, role: "assistant", content: "", modelId: model.id, status: "STREAMING", parentId: userMessageId } });
  await db.chat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date(), ...(isFirst ? { title: titleFrom(query) } : {}), ...(input.modelId ? { modelId: input.modelId } : {}) } });

  const temperature = input.temperature ?? (chat.temperature != null ? Number(chat.temperature) : undefined);

  return sseStream(async (send) => {
    send("start", { userMessageId, assistantMessageId: assistant.id, title: isFirst ? titleFrom(query) : undefined });
    try {
      const r = await runChat({
        userId: me.id, model, messages, kind: "CHAT", temperature, maxTokens,
        idempotencyKey: `chat:${assistant.id}:${input.clientRequestId ?? randomToken(6)}`,
        signal: req.signal,
        onDelta: (t) => send("delta", { t }),
      });
      await db.chatMessage.update({
        where: { id: assistant.id },
        data: { content: r.text, status: r.stopped ? "STOPPED" : "COMPLETE", aiRequestId: r.aiRequestId, latencyMs: r.latencyMs },
      });
      send("done", { assistantMessageId: assistant.id, chargedMicro: r.chargedMicro, promptTokens: r.promptTokens, completionTokens: r.completionTokens, latencyMs: r.latencyMs, finishReason: r.finishReason, stopped: r.stopped });
    } catch (err) {
      const res = errorResponse(err);
      const payload = (await res.json()) as { error: string };
      await db.chatMessage.update({ where: { id: assistant.id }, data: { status: "ERROR", error: payload.error } });
      send("error", { ...payload, status: res.status });
    }
  });
});

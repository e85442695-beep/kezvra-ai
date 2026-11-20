import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { ownedChat } from "@/lib/chat/service";
import { getUsableModel } from "@/lib/openrouter/models";

type P = { id: string };

export const GET = route<P>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const chat = await ownedChat(me.id, id);
  const messages = await db.chatMessage.findMany({
    where: { chatId: chat.id, superseded: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, modelId: true, status: true, error: true, attachments: true, createdAt: true, latencyMs: true, aiRequest: { select: { chargedMicro: true, promptTokens: true, completionTokens: true } } },
  });
  return json({ chat, messages });
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  folderId: z.string().nullable().optional(),
  modelId: z.string().max(200).optional(),
  systemPrompt: z.string().max(20_000).nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokens: z.number().int().min(16).max(200_000).nullable().optional(),
});

export const PATCH = route<P>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  await ownedChat(me.id, id);
  const input = await body(req, patchSchema);
  if (input.modelId && !(await getUsableModel(input.modelId))) throw new HttpError(400, "MODEL_UNAVAILABLE");
  if (input.folderId && !(await db.chatFolder.findFirst({ where: { id: input.folderId, userId: me.id } }))) throw new HttpError(404, "FOLDER_NOT_FOUND");
  const chat = await db.chat.update({ where: { id }, data: input });
  return json({ chat });
});

export const DELETE = route<P>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const r = await db.chat.deleteMany({ where: { id, userId: me.id } });
  if (r.count === 0) throw new HttpError(404, "NOT_FOUND");
  return json({ ok: true });
});

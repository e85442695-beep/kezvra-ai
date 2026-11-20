import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { dateGroup } from "@/lib/chat/service";
import { getSettings } from "@/lib/settings";
import { getUsableModel } from "@/lib/openrouter/models";

/** List the user's chats (sidebar). ?archived=1, ?folder=<id>, ?q=<title search> */
export const GET = route(async (req) => {
  const me = await requireUser();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const chats = await db.chat.findMany({
    where: {
      userId: me.id,
      archived: sp.get("archived") === "1",
      ...(sp.get("folder") ? { folderId: sp.get("folder") } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: [{ pinned: "desc" }, { lastMessageAt: "desc" }],
    take: 300,
    select: { id: true, title: true, modelId: true, pinned: true, archived: true, folderId: true, lastMessageAt: true, shareEnabled: true },
  });
  const folders = await db.chatFolder.findMany({ where: { userId: me.id }, orderBy: { sortOrder: "asc" } });
  return json({ chats: chats.map((c) => ({ ...c, group: c.pinned ? "pinned" : dateGroup(c.lastMessageAt) })), folders });
});

const createSchema = z.object({
  modelId: z.string().max(200).optional(),
  title: z.string().trim().max(200).optional(),
  systemPrompt: z.string().max(20_000).optional(),
  assistantId: z.string().optional(),
  folderId: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(16).max(200_000).optional(),
});

export const POST = route(async (req) => {
  const me = await requireUser();
  const input = await body(req, createSchema);
  const s = await getSettings();
  let systemPrompt = input.systemPrompt;
  let modelId = input.modelId ?? me.defaultModelId ?? s.defaultModelId;
  if (input.assistantId) {
    const a = await db.assistant.findFirst({ where: { id: input.assistantId, OR: [{ userId: me.id }, { isPublic: true }] } });
    if (!a) throw new HttpError(404, "ASSISTANT_NOT_FOUND");
    systemPrompt = a.systemPrompt;
    modelId = input.modelId ?? a.modelId;
  }
  if (!(await getUsableModel(modelId))) throw new HttpError(400, "MODEL_UNAVAILABLE");
  if (input.folderId && !(await db.chatFolder.findFirst({ where: { id: input.folderId, userId: me.id } }))) throw new HttpError(404, "FOLDER_NOT_FOUND");
  const chat = await db.chat.create({
    data: {
      userId: me.id, modelId, title: input.title ?? "New chat", systemPrompt, assistantId: input.assistantId, folderId: input.folderId,
      temperature: input.temperature, maxTokens: input.maxTokens,
    },
  });
  return json({ chat }, { status: 201 });
});

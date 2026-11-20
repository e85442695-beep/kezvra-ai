import { db } from "@/lib/db";
import { json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { ownedChat } from "@/lib/chat/service";

/** Duplicate a conversation (visible messages only) into a new chat owned by the same user. */
export const POST = route<{ id: string }>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const src = await ownedChat(me.id, id);
  const msgs = await db.chatMessage.findMany({ where: { chatId: src.id, superseded: false, status: { in: ["COMPLETE", "STOPPED"] } }, orderBy: { createdAt: "asc" } });
  const chat = await db.$transaction(async (tx) => {
    const c = await tx.chat.create({
      data: { userId: me.id, title: `${src.title} (copy)`.slice(0, 200), modelId: src.modelId, systemPrompt: src.systemPrompt, temperature: src.temperature, maxTokens: src.maxTokens, folderId: src.folderId, clonedFromId: src.id },
    });
    const base = Date.now() - msgs.length;
    await tx.chatMessage.createMany({
      data: msgs.map((m, i) => ({ chatId: c.id, role: m.role, content: m.content, modelId: m.modelId, attachments: m.attachments ?? undefined, status: m.status, createdAt: new Date(base + i) })),
    });
    return c;
  });
  return json({ chat }, { status: 201 });
});

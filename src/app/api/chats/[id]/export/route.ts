import { db } from "@/lib/db";
import { json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { ownedChat, toMarkdown } from "@/lib/chat/service";

/** GET ?format=md|json → downloadable export of one chat. */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const chat = await ownedChat(me.id, id);
  const messages = await db.chatMessage.findMany({
    where: { chatId: chat.id, superseded: false },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true, modelId: true, createdAt: true },
  });
  const safe = chat.title.replace(/[^\p{L}\p{N}\- ]+/gu, "").slice(0, 60).trim() || "chat";
  if (req.nextUrl.searchParams.get("format") === "json") {
    return json(
      { version: 1, chat: { id: chat.id, title: chat.title, modelId: chat.modelId, systemPrompt: chat.systemPrompt, createdAt: chat.createdAt }, messages },
      { headers: { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.json` } },
    );
  }
  return new Response(toMarkdown(chat, messages), {
    headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safe)}.md` },
  });
});

import { db } from "@/lib/db";
import { json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";

/** Global search: chat titles + message full-text (own data only) + models + saved prompts. */
export const GET = route(async (req) => {
  const me = await requireUser();
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
  if (q.length < 2) return json({ chats: [], messages: [], models: [], prompts: [] });
  const [chats, messages, models, prompts] = await Promise.all([
    db.chat.findMany({ where: { userId: me.id, title: { contains: q, mode: "insensitive" } }, take: 8, orderBy: { lastMessageAt: "desc" }, select: { id: true, title: true } }),
    db.$queryRaw<{ id: string; chatId: string; title: string; snippet: string }[]>`
      SELECT m."id", m."chatId", c."title",
             ts_headline('simple', m."content", plainto_tsquery('simple', ${q}), 'MaxWords=18, MinWords=6') AS snippet
      FROM "ChatMessage" m JOIN "Chat" c ON c."id" = m."chatId"
      WHERE c."userId" = ${me.id} AND m."superseded" = false
        AND to_tsvector('simple', m."content") @@ plainto_tsquery('simple', ${q})
      ORDER BY m."createdAt" DESC LIMIT 10`,
    db.aIModel.findMany({ where: { enabled: true, available: true, OR: [{ name: { contains: q, mode: "insensitive" } }, { id: { contains: q, mode: "insensitive" } }] }, take: 6, select: { id: true, name: true } }),
    db.savedPrompt.findMany({ where: { OR: [{ userId: me.id }, { isTemplate: true }], title: { contains: q, mode: "insensitive" } }, take: 6, select: { id: true, title: true } }),
  ]);
  return json({ chats, messages, models, prompts });
});

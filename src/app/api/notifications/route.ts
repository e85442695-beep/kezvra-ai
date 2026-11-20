import { z } from "zod";
import { db } from "@/lib/db";
import { body, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";

/** Personal notifications + active broadcast announcements. */
export const GET = route(async () => {
  const me = await requireUser();
  const now = new Date();
  const items = await db.notification.findMany({
    where: { OR: [{ userId: me.id }, { userId: null }], AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return json({ items, unread: items.filter((n) => n.userId === me.id && !n.readAt).length });
});

export const POST = route(async (req) => {
  const me = await requireUser();
  const { ids } = await body(req, z.object({ ids: z.array(z.string()).max(100) }));
  await db.notification.updateMany({ where: { id: { in: ids }, userId: me.id, readAt: null }, data: { readAt: new Date() } });
  return json({ ok: true });
});

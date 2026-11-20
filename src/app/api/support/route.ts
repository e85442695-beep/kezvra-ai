import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { hasRole, requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

/** Support tickets: users see their own; MODERATOR+ see all (?all=1). */
export const GET = route(async (req) => {
  const me = await requireUser();
  const all = req.nextUrl.searchParams.get("all") === "1" && hasRole(me.role, "MODERATOR");
  const tickets = await db.supportTicket.findMany({
    where: all ? {} : { userId: me.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { messages: { orderBy: { createdAt: "asc" }, select: { id: true, body: true, isStaff: true, createdAt: true } }, user: all ? { select: { email: true } } : false },
  });
  return json({ tickets });
});

const schema = z.object({ ticketId: z.string().optional(), subject: z.string().trim().min(3).max(150).optional(), body: z.string().trim().min(1).max(10_000), status: z.enum(["OPEN", "PENDING", "RESOLVED", "CLOSED"]).optional() });

/** Create a ticket ({subject, body}) or reply ({ticketId, body}). */
export const POST = route(async (req) => {
  const me = await requireUser();
  const rl = await rateLimit(`support:${me.id}`, 20, 3600);
  if (!rl.ok) throw new HttpError(429, "TOO_MANY_REQUESTS");
  const input = await body(req, schema);
  const staff = hasRole(me.role, "MODERATOR");
  if (input.ticketId) {
    const t = await db.supportTicket.findFirst({ where: { id: input.ticketId, ...(staff ? {} : { userId: me.id }) } });
    if (!t) throw new HttpError(404, "NOT_FOUND");
    await db.supportMessage.create({ data: { ticketId: t.id, authorId: me.id, body: input.body, isStaff: staff && t.userId !== me.id } });
    await db.supportTicket.update({ where: { id: t.id }, data: { status: input.status && staff ? input.status : staff ? "PENDING" : "OPEN" } });
    if (staff && t.userId !== me.id) await db.notification.create({ data: { userId: t.userId, title: "Support reply", body: t.subject, link: "/support" } });
    return json({ ok: true });
  }
  if (!input.subject) throw new HttpError(400, "SUBJECT_REQUIRED");
  const t = await db.supportTicket.create({ data: { userId: me.id, subject: input.subject, messages: { create: { authorId: me.id, body: input.body } } } });
  return json({ ticket: t }, { status: 201 });
});

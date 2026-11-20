import { z } from "zod";
import { db } from "@/lib/db";
import { body, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { currentSessionToken } from "@/lib/auth/password-session";
import { audit } from "@/lib/audit";

export const GET = route(async () => {
  const me = await requireUser();
  const token = await currentSessionToken();
  const sessions = await db.session.findMany({ where: { userId: me.id, expires: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } });
  return json({
    sessions: sessions.map((s) => ({
      id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.sessionToken === token,
    })),
  });
});

/** DELETE { id } revokes one session; { all: true } signs out every other device ({ includeCurrent } too). */
export const DELETE = route(async (req) => {
  const me = await requireUser();
  const input = await body(req, z.object({ id: z.string().optional(), all: z.boolean().optional(), includeCurrent: z.boolean().optional() }));
  const token = await currentSessionToken();
  let count = 0;
  if (input.all) {
    const keepCurrent = !input.includeCurrent && token;
    const r = await db.session.deleteMany({ where: { userId: me.id, ...(keepCurrent ? { NOT: { sessionToken: token } } : {}) } });
    count = r.count;
  } else if (input.id) {
    const r = await db.session.deleteMany({ where: { id: input.id, userId: me.id } }); // scoped to owner
    count = r.count;
  }
  await audit("auth.sessions_revoked", { actorId: me.id, metadata: { count, all: Boolean(input.all) } });
  return json({ ok: true, revoked: count });
});

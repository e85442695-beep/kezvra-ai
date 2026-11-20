import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { hashPassword, passwordPolicy, verifyPassword } from "@/lib/auth/password";
import { currentSessionToken } from "@/lib/auth/password-session";
import { audit } from "@/lib/audit";

/** Change (or set, for OAuth-only accounts) the password. Signs out all other devices. */
export const POST = route(async (req) => {
  const me = await requireUser();
  const { current, next } = await body(req, z.object({ current: z.string().max(256).optional(), next: z.string().max(256) }));
  const policy = passwordPolicy(next);
  if (policy) throw new HttpError(400, policy);
  const u = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (u.passwordHash && !(current && (await verifyPassword(u.passwordHash, current)))) {
    throw new HttpError(400, "INVALID_CURRENT_PASSWORD");
  }
  await db.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(next) } });
  const token = await currentSessionToken();
  await db.session.deleteMany({ where: { userId: me.id, ...(token ? { NOT: { sessionToken: token } } : {}) } });
  await audit("auth.password_changed", { actorId: me.id });
  return json({ ok: true });
});

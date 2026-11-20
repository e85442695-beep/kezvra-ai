import { z } from "zod";
import { db } from "@/lib/db";
import { body, clientIp, HttpError, json, route } from "@/lib/http/route";
import { dummyVerify, verifyPassword } from "@/lib/auth/password";
import { createDbSession } from "@/lib/auth/password-session";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const schema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) });
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

/**
 * Brute-force protection (layered):
 *  1. per-IP rate limit (20 / 10 min)
 *  2. per-account rate limit (10 / 10 min)
 *  3. account lockout after 5 consecutive failures for 15 min
 *  4. uniform error + dummy hash for unknown users (no enumeration, similar timing)
 */
export const POST = route(async (req) => {
  const ip = clientIp(req);
  const input = await body(req, schema);
  const email = input.email.toLowerCase().trim();
  const [a, b] = await Promise.all([rateLimit(`login:ip:${ip}`, 20, 600), rateLimit(`login:acct:${email}`, 10, 600)]);
  if (!a.ok || !b.ok) throw new HttpError(429, "TOO_MANY_ATTEMPTS");

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    await dummyVerify(input.password);
    throw new HttpError(401, "INVALID_CREDENTIALS");
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new HttpError(423, "ACCOUNT_LOCKED");
  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    const fails = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: fails >= MAX_FAILS ? 0 : fails,
        lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null,
      },
    });
    await audit("auth.login_failed", { actorId: user.id, ip, userAgent: req.headers.get("user-agent") });
    throw new HttpError(401, "INVALID_CREDENTIALS");
  }
  if (user.status !== "ACTIVE") throw new HttpError(403, "ACCOUNT_DISABLED");
  if (!user.emailVerified) throw new HttpError(403, "EMAIL_NOT_VERIFIED");

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
  await createDbSession(user.id, { ip, userAgent: req.headers.get("user-agent") });
  await audit("auth.login", { actorId: user.id, ip, userAgent: req.headers.get("user-agent"), metadata: { provider: "password" } });
  return json({ ok: true });
});

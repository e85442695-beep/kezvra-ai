import { z } from "zod";
import { db } from "@/lib/db";
import { body, clientIp, HttpError, json, route } from "@/lib/http/route";
import { hashPassword, passwordPolicy } from "@/lib/auth/password";
import { consumeToken } from "@/lib/auth/verification";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

export const POST = route(async (req) => {
  const rl = await rateLimit(`reset:${clientIp(req)}`, 10, 3600);
  if (!rl.ok) throw new HttpError(429, "TOO_MANY_REQUESTS");
  const { token, password } = await body(req, z.object({ token: z.string().min(10).max(200), password: z.string().max(256) }));
  const policy = passwordPolicy(password);
  if (policy) throw new HttpError(400, policy);
  const email = await consumeToken(token, "reset-password");
  if (!email) throw new HttpError(400, "INVALID_OR_EXPIRED_TOKEN");
  const user = await db.user.update({
    where: { email },
    // Receiving the reset email proves mailbox ownership.
    data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null, emailVerified: new Date() },
  });
  // A reset invalidates every existing session.
  await db.session.deleteMany({ where: { userId: user.id } });
  await audit("auth.password_reset", { actorId: user.id, ip: clientIp(req) });
  return json({ ok: true });
});

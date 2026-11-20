import { z } from "zod";
import { db } from "@/lib/db";
import { body, clientIp, HttpError, json, route } from "@/lib/http/route";
import { hashPassword, passwordPolicy } from "@/lib/auth/password";
import { onUserCreated } from "@/lib/auth/onboarding";
import { sendVerification } from "@/lib/auth/verification";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(80).optional(),
  locale: z.enum(["uk", "en"]).default("uk"),
  referral: z.string().trim().max(32).optional(),
  acceptTerms: z.literal(true),
});

export const POST = route(async (req) => {
  const ip = clientIp(req);
  const rl = await rateLimit(`register:${ip}`, 5, 3600);
  if (!rl.ok) throw new HttpError(429, "TOO_MANY_REQUESTS");
  const s = await getSettings();
  if (!s.registrationOpen) throw new HttpError(403, "REGISTRATION_CLOSED");

  const input = await body(req, schema);
  const policy = passwordPolicy(input.password);
  if (policy) throw new HttpError(400, policy);
  const email = input.email.toLowerCase().trim();

  const exists = await db.user.findUnique({ where: { email }, select: { id: true } });
  // Same response whether or not the email exists, so accounts can't be enumerated.
  if (!exists) {
    const user = await onUserCreated({
      email,
      name: input.name ?? null,
      passwordHash: await hashPassword(input.password),
      locale: input.locale,
      signupIp: ip,
      referral: input.referral,
    });
    await audit("auth.register", { actorId: user.id, ip, userAgent: req.headers.get("user-agent") });
    await sendVerification(email, input.locale);
  }
  return json({ ok: true, verifyEmailSent: true }, { status: 201 });
});

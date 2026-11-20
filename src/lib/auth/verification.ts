import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/security/tokens";
import { resetEmail, sendMail, verificationEmail } from "@/lib/email";

export async function issueToken(email: string, purpose: "verify-email" | "reset-password", ttlMs: number) {
  const raw = randomToken(32);
  await db.verificationToken.deleteMany({ where: { identifier: email, purpose } });
  await db.verificationToken.create({ data: { identifier: email, token: sha256(raw), purpose, expires: new Date(Date.now() + ttlMs) } });
  return raw;
}

/** Consume a token exactly once (only the first concurrent caller's delete succeeds). */
export async function consumeToken(raw: string, purpose: string) {
  const hashed = sha256(raw);
  const row = await db.verificationToken.findUnique({ where: { token: hashed } });
  if (!row || row.purpose !== purpose) return null;
  const del = await db.verificationToken.deleteMany({ where: { token: hashed } });
  if (del.count !== 1 || row.expires < new Date()) return null;
  return row.identifier;
}

export async function sendVerification(email: string, locale: string) {
  const raw = await issueToken(email, "verify-email", 24 * 3600_000);
  const link = `${env.APP_URL}/api/account/verify?token=${raw}`;
  const m = verificationEmail(link, locale);
  return sendMail(email, m.subject, m.text);
}

export async function sendReset(email: string, locale: string) {
  const raw = await issueToken(email, "reset-password", 3600_000);
  const link = `${env.APP_URL}/reset-password?token=${raw}`;
  const m = resetEmail(link, locale);
  return sendMail(email, m.subject, m.text);
}

import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/security/tokens";
import { HttpError } from "@/lib/http/route";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Developer API keys. Format: `kz_live_<43 chars base64url>` (256-bit). Only the SHA-256 hash is
 * stored (high-entropy secrets don't need a slow KDF); the plaintext is shown exactly once.
 */
export const SCOPES = ["chat", "models", "usage"] as const;
export type Scope = (typeof SCOPES)[number];

export function generateApiKey() {
  const key = `kz_live_${randomToken(32)}`;
  return { key, hash: sha256(key), prefix: key.slice(0, 12) };
}

export async function authenticateApiKey(authorization: string | null, scope: Scope) {
  const m = /^Bearer\s+(kz_live_[A-Za-z0-9_-]{20,})$/.exec(authorization ?? "");
  if (!m) throw new HttpError(401, "INVALID_API_KEY");
  const k = await db.apiKey.findUnique({ where: { hash: sha256(m[1]!) }, include: { user: { select: { id: true, status: true } } } });
  if (!k || k.revokedAt || (k.expiresAt && k.expiresAt < new Date()) || k.user.status !== "ACTIVE") throw new HttpError(401, "INVALID_API_KEY");
  if (!k.scopes.includes(scope)) throw new HttpError(403, "INSUFFICIENT_SCOPE");
  const rl = await rateLimit(`apikey:${k.id}`, k.rateLimitRpm, 60);
  if (!rl.ok) throw new HttpError(429, "RATE_LIMITED");
  // Fire-and-forget last-used marker (coarse, at most once a minute)
  if (!k.lastUsedAt || Date.now() - k.lastUsedAt.getTime() > 60_000) void db.apiKey.update({ where: { id: k.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { key: k, rateRemaining: rl.remaining };
}

/**
 * Atomically hold `amount` of the key's spend limit. Returns false when the limit would be exceeded.
 * Single conditional UPDATE → safe under concurrency.
 */
export async function holdKeyBudget(keyId: string, amount: bigint) {
  const n = await db.$executeRaw`
    UPDATE "ApiKey" SET "spent" = "spent" + ${amount}
    WHERE "id" = ${keyId} AND ("spendLimit" IS NULL OR "spent" + ${amount} <= "spendLimit")`;
  return n === 1;
}

export async function adjustKeyBudget(keyId: string, delta: bigint) {
  if (delta === 0n) return;
  await db.$executeRaw`UPDATE "ApiKey" SET "spent" = GREATEST(0, "spent" + ${delta}) WHERE "id" = ${keyId}`;
}

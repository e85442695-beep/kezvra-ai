import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { generateApiKey, SCOPES } from "@/lib/apikeys";
import { creditsToMicro } from "@/lib/money";
import { audit } from "@/lib/audit";

const select = { id: true, name: true, prefix: true, scopes: true, allowedModels: true, spendLimit: true, spent: true, rateLimitRpm: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true } as const;

export const GET = route(async () => {
  const me = await requireUser();
  const keys = await db.apiKey.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, select });
  const since = new Date(Date.now() - 30 * 86_400_000);
  const usage = await db.apiUsage.groupBy({
    by: ["apiKeyId"],
    where: { apiKeyId: { in: keys.map((k) => k.id) }, createdAt: { gte: since } },
    _sum: { promptTokens: true, completionTokens: true, chargedMicro: true },
    _count: true,
  });
  return json({ keys: keys.map((k) => ({ ...k, usage30d: usage.find((u) => u.apiKeyId === k.id) ?? null })) });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(SCOPES)).min(1).default(["chat", "models"]),
  allowedModels: z.array(z.string().max(200)).max(50).default([]),
  /** whole credits, decimal string */
  spendLimit: z.string().regex(/^\d+(\.\d{1,6})?$/).nullable().optional(),
  rateLimitRpm: z.number().int().min(1).max(600).default(60),
  expiresInDays: z.number().int().min(1).max(730).nullable().optional(),
});

export const POST = route(async (req) => {
  const me = await requireUser();
  if (!me.emailVerified) throw new HttpError(403, "EMAIL_NOT_VERIFIED");
  const input = await body(req, createSchema);
  if ((await db.apiKey.count({ where: { userId: me.id, revokedAt: null } })) >= 25) throw new HttpError(400, "TOO_MANY_KEYS");
  const { key, hash, prefix } = generateApiKey();
  const k = await db.apiKey.create({
    data: {
      userId: me.id, name: input.name, hash, prefix, scopes: input.scopes, allowedModels: input.allowedModels,
      spendLimit: input.spendLimit ? creditsToMicro(input.spendLimit) : null, rateLimitRpm: input.rateLimitRpm,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    },
    select,
  });
  await audit("apikey.created", { actorId: me.id, target: k.id });
  return json({ key: k, secret: key }, { status: 201 }); // secret shown once
});

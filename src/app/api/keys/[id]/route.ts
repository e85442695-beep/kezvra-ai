import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { generateApiKey } from "@/lib/apikeys";
import { creditsToMicro } from "@/lib/money";
import { audit } from "@/lib/audit";

type P = { id: string };

async function owned(userId: string, id: string) {
  const k = await db.apiKey.findFirst({ where: { id, userId, revokedAt: null } });
  if (!k) throw new HttpError(404, "NOT_FOUND");
  return k;
}

/** Update limits / name. */
export const PATCH = route<P>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  await owned(me.id, id);
  const input = await body(req, z.object({
    name: z.string().trim().min(1).max(60).optional(),
    spendLimit: z.string().regex(/^\d+(\.\d{1,6})?$/).nullable().optional(),
    rateLimitRpm: z.number().int().min(1).max(600).optional(),
    allowedModels: z.array(z.string().max(200)).max(50).optional(),
  }));
  await db.apiKey.update({
    where: { id },
    data: { ...input, spendLimit: input.spendLimit === undefined ? undefined : input.spendLimit === null ? null : creditsToMicro(input.spendLimit) },
  });
  return json({ ok: true });
});

/** Rotate: revoke this key and issue a new one with the same settings. */
export const POST = route<P>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const old = await owned(me.id, id);
  const { key, hash, prefix } = generateApiKey();
  const next = await db.$transaction(async (tx) => {
    await tx.apiKey.update({ where: { id: old.id }, data: { revokedAt: new Date() } });
    return tx.apiKey.create({
      data: { userId: me.id, name: old.name, hash, prefix, scopes: old.scopes, allowedModels: old.allowedModels, spendLimit: old.spendLimit, rateLimitRpm: old.rateLimitRpm, expiresAt: old.expiresAt },
      select: { id: true, name: true, prefix: true },
    });
  });
  await audit("apikey.rotated", { actorId: me.id, target: old.id, metadata: { newId: next.id } });
  return json({ key: next, secret: key });
});

export const DELETE = route<P>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  await owned(me.id, id);
  await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await audit("apikey.revoked", { actorId: me.id, target: id });
  return json({ ok: true });
});

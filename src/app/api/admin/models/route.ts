import { z } from "zod";
import { db } from "@/lib/db";
import { body, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { adminAction } from "@/lib/audit";
import { syncModels } from "@/lib/openrouter/models";
import { toPublicModels } from "@/lib/models-query";

export const GET = route(async (req) => {
  await requireUser("ADMIN");
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const models = await db.aIModel.findMany({
    where: q ? { OR: [{ id: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {},
    orderBy: [{ enabled: "desc" }, { id: "asc" }],
    take: 1000,
  });
  const pub = await toPublicModels(models);
  return json({ models: models.map((m, i) => ({ ...pub[i], enabled: m.enabled, markupBps: m.markupBps, upstreamAvailable: m.available })) });
});

const patchSchema = z.object({
  ids: z.array(z.string()).min(1).max(1000),
  enabled: z.boolean().optional(),
  featured: z.boolean().optional(),
  markupBps: z.number().int().min(0).max(100_000).nullable().optional(),
  reason: z.string().min(3).max(500),
});

export const PATCH = route(async (req) => {
  const admin = await requireUser("ADMIN");
  const { ids, reason, ...data } = await body(req, patchSchema);
  await db.$transaction(async (tx) => {
    const before = await tx.aIModel.findMany({ where: { id: { in: ids } }, select: { id: true, enabled: true, featured: true, markupBps: true } });
    await tx.aIModel.updateMany({ where: { id: { in: ids } }, data });
    await adminAction(tx, { adminId: admin.id, action: "models.update", reason, before, after: { ids, ...data } });
  });
  return json({ ok: true });
});

/** Trigger a catalog sync from OpenRouter now. */
export const POST = route(async () => {
  const admin = await requireUser("ADMIN");
  const result = await syncModels();
  await db.$transaction((tx) => adminAction(tx, { adminId: admin.id, action: "models.sync", reason: "manual sync", after: result }));
  return json(result);
});

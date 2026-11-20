import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";

/** Saved prompts (own) + global templates (managed by admins). */
export const GET = route(async () => {
  const me = await requireUser();
  const [mine, templates] = await Promise.all([
    db.savedPrompt.findMany({ where: { userId: me.id }, orderBy: { updatedAt: "desc" } }),
    db.savedPrompt.findMany({ where: { isTemplate: true, userId: null }, orderBy: [{ category: "asc" }, { title: "asc" }] }),
  ]);
  return json({ mine, templates });
});

const schema = z.object({ id: z.string().optional(), title: z.string().trim().min(1).max(120), content: z.string().min(1).max(20_000), category: z.string().max(40).optional() });

export const POST = route(async (req) => {
  const me = await requireUser();
  const { id, ...data } = await body(req, schema);
  if (id) {
    const r = await db.savedPrompt.updateMany({ where: { id, userId: me.id }, data });
    if (!r.count) throw new HttpError(404, "NOT_FOUND");
    return json({ ok: true });
  }
  if ((await db.savedPrompt.count({ where: { userId: me.id } })) >= 500) throw new HttpError(400, "TOO_MANY_PROMPTS");
  return json({ prompt: await db.savedPrompt.create({ data: { ...data, userId: me.id } }) }, { status: 201 });
});

export const DELETE = route(async (req) => {
  const me = await requireUser();
  const { id } = await body(req, z.object({ id: z.string() }));
  const r = await db.savedPrompt.deleteMany({ where: { id, userId: me.id } });
  if (!r.count) throw new HttpError(404, "NOT_FOUND");
  return json({ ok: true });
});

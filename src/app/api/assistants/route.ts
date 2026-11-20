import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { getUsableModel } from "@/lib/openrouter/models";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(1).max(20_000),
  modelId: z.string().max(200),
  temperature: z.number().min(0).max(2).nullable().optional(),
});

export const GET = route(async () => {
  const me = await requireUser();
  return json({ assistants: await db.assistant.findMany({ where: { userId: me.id }, orderBy: { updatedAt: "desc" } }) });
});

/** Create or update (when id given, owner only). */
export const POST = route(async (req) => {
  const me = await requireUser();
  const input = await body(req, schema);
  if (!(await getUsableModel(input.modelId))) throw new HttpError(400, "MODEL_UNAVAILABLE");
  const { id, ...data } = input;
  if (id) {
    const r = await db.assistant.updateMany({ where: { id, userId: me.id }, data });
    if (!r.count) throw new HttpError(404, "NOT_FOUND");
    return json({ ok: true });
  }
  if ((await db.assistant.count({ where: { userId: me.id } })) >= 100) throw new HttpError(400, "TOO_MANY_ASSISTANTS");
  return json({ assistant: await db.assistant.create({ data: { ...data, userId: me.id } }) }, { status: 201 });
});

export const DELETE = route(async (req) => {
  const me = await requireUser();
  const { id } = await body(req, z.object({ id: z.string() }));
  const r = await db.assistant.deleteMany({ where: { id, userId: me.id } });
  if (!r.count) throw new HttpError(404, "NOT_FOUND");
  return json({ ok: true });
});

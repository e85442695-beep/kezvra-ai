import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";

export const POST = route(async (req) => {
  const me = await requireUser();
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(80) }));
  const count = await db.chatFolder.count({ where: { userId: me.id } });
  if (count >= 200) throw new HttpError(400, "TOO_MANY_FOLDERS");
  const folder = await db.chatFolder.create({ data: { userId: me.id, name, sortOrder: count } });
  return json({ folder }, { status: 201 });
});

export const PATCH = route(async (req) => {
  const me = await requireUser();
  const { id, name } = await body(req, z.object({ id: z.string(), name: z.string().trim().min(1).max(80) }));
  const r = await db.chatFolder.updateMany({ where: { id, userId: me.id }, data: { name } });
  if (!r.count) throw new HttpError(404, "NOT_FOUND");
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const me = await requireUser();
  const { id } = await body(req, z.object({ id: z.string() }));
  const r = await db.chatFolder.deleteMany({ where: { id, userId: me.id } }); // chats keep existing (folderId → null)
  if (!r.count) throw new HttpError(404, "NOT_FOUND");
  return json({ ok: true });
});

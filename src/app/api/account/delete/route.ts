import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { sessionCookieName } from "@/lib/auth/password-session";
import { deleteObject } from "@/lib/storage";
import { audit } from "@/lib/audit";

/**
 * Account deletion (retention policy, see docs/SECURITY.md):
 *  - immediately: content (chats, files + objects, images, assistants, prompts, API keys, sessions) is deleted
 *  - user row is marked DELETED; financial records (payments, ledger) are retained for legal/accounting
 *    obligations and the personal fields are anonymized by the worker after 30 days
 */
export const POST = route(async (req) => {
  const me = await requireUser();
  const { password, confirm } = await body(req, z.object({ password: z.string().max(256).optional(), confirm: z.literal("DELETE") }));
  void confirm;
  const u = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (u.passwordHash && !(password && (await verifyPassword(u.passwordHash, password)))) throw new HttpError(400, "INVALID_PASSWORD");
  if (u.role === "SUPER_ADMIN") throw new HttpError(400, "SUPER_ADMIN_CANNOT_SELF_DELETE");

  const [files, images] = await Promise.all([
    db.storedFile.findMany({ where: { userId: me.id }, select: { storageKey: true } }),
    db.imageGeneration.findMany({ where: { userId: me.id }, select: { resultKeys: true } }),
  ]);
  await Promise.allSettled([...files.map((f) => deleteObject(f.storageKey)), ...images.flatMap((i) => i.resultKeys.map((k) => deleteObject(k)))]);
  await db.$transaction([
    db.chat.deleteMany({ where: { userId: me.id } }),
    db.storedFile.deleteMany({ where: { userId: me.id } }),
    db.imageGeneration.deleteMany({ where: { userId: me.id } }),
    db.assistant.deleteMany({ where: { userId: me.id } }),
    db.savedPrompt.deleteMany({ where: { userId: me.id } }),
    db.apiKey.updateMany({ where: { userId: me.id }, data: { revokedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: me.id } }),
    db.account.deleteMany({ where: { userId: me.id } }),
    db.user.update({ where: { id: me.id }, data: { status: "DELETED", deletedAt: new Date(), passwordHash: null, name: null, image: null } }),
  ]);
  await audit("account.deleted", { actorId: me.id });
  (await cookies()).delete(sessionCookieName());
  return json({ ok: true });
});

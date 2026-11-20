import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { adminAction } from "@/lib/audit";
import { deleteObject } from "@/lib/storage";

/**
 * Read-only admin listings: ?view=audit|admin-actions|errors|keys|files|referrals|tickets
 */
export const GET = route(async (req) => {
  await requireUser("ADMIN");
  const view = req.nextUrl.searchParams.get("view");
  const take = 200;
  switch (view) {
    case "audit":
      return json({ items: await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take, include: { actor: { select: { email: true } } } }) });
    case "admin-actions":
      return json({ items: await db.adminAction.findMany({ orderBy: { createdAt: "desc" }, take, include: { admin: { select: { email: true } }, targetUser: { select: { email: true } } } }) });
    case "errors":
      return json({ items: await db.errorLog.findMany({ orderBy: { createdAt: "desc" }, take }) });
    case "keys":
      return json({ items: await db.apiKey.findMany({ orderBy: { createdAt: "desc" }, take, select: { id: true, name: true, prefix: true, spent: true, spendLimit: true, rateLimitRpm: true, lastUsedAt: true, revokedAt: true, createdAt: true, user: { select: { email: true } } } }) });
    case "files": {
      const [items, agg] = await Promise.all([
        db.storedFile.findMany({ orderBy: { createdAt: "desc" }, take, select: { id: true, name: true, mime: true, sizeBytes: true, status: true, createdAt: true, user: { select: { email: true } } } }),
        db.storedFile.aggregate({ _sum: { sizeBytes: true }, _count: true }),
      ]);
      return json({ items, totalBytes: agg._sum.sizeBytes ?? 0, totalFiles: agg._count });
    }
    case "referrals":
      return json({ items: await db.referral.findMany({ orderBy: { createdAt: "desc" }, take, include: { referrer: { select: { email: true } }, referred: { select: { email: true } }, rewards: true } }) });
    default:
      throw new HttpError(400, "UNKNOWN_VIEW");
  }
});

const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("revoke-key"), id: z.string(), reason: z.string().min(3) }),
  z.object({ op: z.literal("delete-file"), id: z.string(), reason: z.string().min(3) }),
  z.object({ op: z.literal("reject-referral"), id: z.string(), reason: z.string().min(3) }),
  z.object({ op: z.literal("announce"), title: z.string().min(1).max(120), body: z.string().min(1).max(4000), link: z.string().max(300).optional(), expiresInDays: z.number().int().min(1).max(365).optional(), reason: z.string().min(3) }),
]);

export const POST = route(async (req) => {
  const admin = await requireUser("ADMIN");
  const input = await body(req, opSchema);
  if (input.op === "delete-file") {
    const f = await db.storedFile.findUnique({ where: { id: input.id } });
    if (!f) throw new HttpError(404, "NOT_FOUND");
    await deleteObject(f.storageKey).catch(() => {});
  }
  await db.$transaction(async (tx) => {
    switch (input.op) {
      case "revoke-key": {
        const k = await tx.apiKey.update({ where: { id: input.id }, data: { revokedAt: new Date() } });
        await adminAction(tx, { adminId: admin.id, targetUserId: k.userId, action: "apikey.revoke", reason: input.reason, after: { keyId: k.id } });
        break;
      }
      case "delete-file": {
        const f = await tx.storedFile.delete({ where: { id: input.id } });
        await adminAction(tx, { adminId: admin.id, targetUserId: f.userId, action: "file.delete", reason: input.reason, before: { fileId: f.id, name: f.name } });
        break;
      }
      case "reject-referral": {
        const r = await tx.referral.update({ where: { id: input.id, status: { in: ["PENDING", "QUALIFIED"] } }, data: { status: "REJECTED", rejectReason: `admin: ${input.reason}` } });
        await adminAction(tx, { adminId: admin.id, targetUserId: r.referredId, action: "referral.reject", reason: input.reason, after: { referralId: r.id } });
        break;
      }
      case "announce": {
        const n = await tx.notification.create({ data: { userId: null, title: input.title, body: input.body, link: input.link, kind: "announcement", expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null } });
        await adminAction(tx, { adminId: admin.id, action: "announcement.create", reason: input.reason, after: { id: n.id, title: n.title } });
        break;
      }
    }
  });
  return json({ ok: true });
});

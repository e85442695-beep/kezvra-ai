import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { hasRole, requireUser } from "@/lib/auth/session";
import { adminAction } from "@/lib/audit";
import { adminAdjustInTx } from "@/lib/credits/ledger";
import { creditsToMicro } from "@/lib/money";
import { randomToken } from "@/lib/security/tokens";

/** Search users. MODERATOR can view; ADMIN+ can mutate. */
export const GET = route(async (req) => {
  await requireUser("MODERATOR");
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const users = await db.user.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { id: q }] } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, email: true, name: true, role: true, status: true, emailVerified: true, createdAt: true, wallet: { select: { bonusBalance: true, purchasedBalance: true, reservedBalance: true } }, _count: { select: { aiRequests: true, payments: true } } },
  });
  return json({ users });
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), userId: z.string(), status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]), reason: z.string().min(3).max(500) }),
  z.object({ action: z.literal("role"), userId: z.string(), role: z.enum(["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"]), reason: z.string().min(3).max(500) }),
  z.object({
    action: z.literal("credits"),
    userId: z.string(),
    /** signed decimal credits, e.g. "100" or "-25.5" */
    amount: z.string().regex(/^-?\d+(\.\d{1,6})?$/),
    bucket: z.enum(["BONUS", "PURCHASED"]).default("BONUS"),
    reason: z.string().min(3).max(500),
    idempotencyKey: z.string().min(8).max(64).optional(),
  }),
]);

export const POST = route(async (req) => {
  const admin = await requireUser("ADMIN");
  const input = await body(req, actionSchema);
  const target = await db.user.findUnique({ where: { id: input.userId } });
  if (!target) throw new HttpError(404, "NOT_FOUND");
  // Nobody may act on an equal-or-higher role except SUPER_ADMIN.
  if (admin.id !== target.id && hasRole(target.role, admin.role) && admin.role !== "SUPER_ADMIN") throw new HttpError(403, "FORBIDDEN");

  await db.$transaction(async (tx) => {
    if (input.action === "status") {
      if (target.id === admin.id) throw new HttpError(400, "CANNOT_CHANGE_OWN_STATUS");
      await tx.user.update({ where: { id: target.id }, data: { status: input.status } });
      if (input.status !== "ACTIVE") {
        await tx.session.deleteMany({ where: { userId: target.id } });
        await tx.apiKey.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await adminAction(tx, { adminId: admin.id, targetUserId: target.id, action: "user.status", reason: input.reason, before: { status: target.status }, after: { status: input.status } });
    } else if (input.action === "role") {
      if (admin.role !== "SUPER_ADMIN") throw new HttpError(403, "SUPER_ADMIN_ONLY");
      if (target.id === admin.id) throw new HttpError(400, "CANNOT_CHANGE_OWN_ROLE");
      await tx.user.update({ where: { id: target.id }, data: { role: input.role } });
      await adminAction(tx, { adminId: admin.id, targetUserId: target.id, action: "user.role", reason: input.reason, before: { role: target.role }, after: { role: input.role } });
    } else {
      const amount = creditsToMicro(input.amount);
      if (amount === 0n) throw new HttpError(400, "ZERO_AMOUNT");
      const before = await tx.wallet.findUnique({ where: { userId: target.id }, select: { bonusBalance: true, purchasedBalance: true } });
      const ok = await adminAdjustInTx(tx, {
        userId: target.id, amount, bucket: input.bucket, actorId: admin.id, note: input.reason,
        idempotencyKey: `admin:${input.idempotencyKey ?? randomToken(12)}`,
      });
      if (!ok) return; // replay
      await adminAction(tx, {
        adminId: admin.id, targetUserId: target.id, action: "credits.adjust", reason: input.reason,
        before: { bonus: before?.bonusBalance.toString() ?? "0", purchased: before?.purchasedBalance.toString() ?? "0" },
        after: { delta: amount.toString(), bucket: input.bucket },
      });
    }
  }).catch((e) => {
    if (e instanceof Error && e.message.startsWith("Ledger would go negative")) throw new HttpError(400, "BALANCE_WOULD_BE_NEGATIVE");
    throw e;
  });
  return json({ ok: true });
});

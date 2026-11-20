import { db, type Prisma, type Tx } from "./db";

export async function audit(
  action: string,
  opts: { actorId?: string | null; target?: string; ip?: string | null; userAgent?: string | null; metadata?: Prisma.InputJsonValue } = {},
  tx: Tx | typeof db = db,
) {
  await tx.auditLog.create({
    data: {
      action,
      actorId: opts.actorId ?? null,
      target: opts.target,
      ip: opts.ip ?? null,
      userAgent: opts.userAgent?.slice(0, 300) ?? null,
      metadata: opts.metadata,
    },
  });
}

/** Privileged admin mutation record. Must be called inside the same transaction as the change. */
export async function adminAction(
  tx: Tx,
  a: { adminId: string; action: string; reason: string; targetUserId?: string | null; before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue },
) {
  if (!a.reason || a.reason.trim().length < 3) throw new Error("ADMIN_REASON_REQUIRED");
  await tx.adminAction.create({ data: { ...a, targetUserId: a.targetUserId ?? null } });
}

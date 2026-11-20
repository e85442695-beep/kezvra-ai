import { db, Prisma, type Tx } from "@/lib/db";
import { grantInTx } from "@/lib/credits/ledger";
import { getSettings } from "@/lib/settings";
import { audit } from "@/lib/audit";

/**
 * Referral program.
 *  - Attach at signup only (one referrer per user, unique referredId).
 *  - Self-referral and same-IP-as-referrer signups are rejected.
 *  - IP velocity: more than N signups/day from one IP marks the referral REJECTED (suspicious).
 *  - Rewards are paid only after the referred user's first qualifying purchase, exactly once
 *    (unique [referralId, kind] + ledger idempotency keys).
 */
export async function attachReferral(referredId: string, code: string, signupIp: string | null) {
  const s = await getSettings();
  if (!s.referral.enabled) return null;
  const referrer = await db.user.findUnique({ where: { referralCode: code.trim().toUpperCase() }, select: { id: true, signupIp: true, status: true } });
  if (!referrer || referrer.status !== "ACTIVE") return null;

  let status: "PENDING" | "REJECTED" = "PENDING";
  let rejectReason: string | null = null;
  if (referrer.id === referredId) {
    status = "REJECTED";
    rejectReason = "self_referral";
  } else if (signupIp && referrer.signupIp && signupIp === referrer.signupIp) {
    status = "REJECTED";
    rejectReason = "same_ip_as_referrer";
  } else if (signupIp) {
    const since = new Date(Date.now() - 24 * 3600_000);
    const n = await db.user.count({ where: { signupIp, createdAt: { gte: since } } });
    if (n > s.referral.maxSignupsPerIpPerDay) {
      status = "REJECTED";
      rejectReason = "ip_velocity";
    }
  }
  try {
    return await db.referral.create({ data: { referrerId: referrer.id, referredId, status, rejectReason, signupIp } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

/** Called inside the payment-fulfillment transaction. */
export async function qualifyReferralInTx(tx: Tx, referredId: string, purchaseMinor: number, settings?: Awaited<ReturnType<typeof getSettings>>) {
  // Settings are passed in by callers that hold a transaction, so no second connection is needed.
  const s = settings ?? (await getSettings());
  if (!s.referral.enabled) return;
  const ref = await tx.referral.findUnique({ where: { referredId } });
  if (!ref || ref.status !== "PENDING") return;
  if (purchaseMinor < s.referral.qualifyMinPurchase) return;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const rewardedThisMonth = await tx.referral.count({ where: { referrerId: ref.referrerId, status: "REWARDED", qualifiedAt: { gte: monthStart } } });
  if (rewardedThisMonth >= s.referral.maxRewardsPerReferrerPerMonth) {
    await tx.referral.update({ where: { id: ref.id }, data: { status: "QUALIFIED", qualifiedAt: new Date() } });
    return;
  }
  const referrerAmt = BigInt(s.referral.referrerRewardMicro);
  const referredAmt = BigInt(s.referral.referredRewardMicro);
  if (referrerAmt > 0n) {
    await tx.referralReward.create({ data: { referralId: ref.id, userId: ref.referrerId, amount: referrerAmt, kind: "referrer" } });
    await grantInTx(tx, { userId: ref.referrerId, amount: referrerAmt, bucket: "BONUS", type: "REFERRAL_BONUS", idempotencyKey: `ref:${ref.id}:referrer` });
  }
  if (referredAmt > 0n) {
    await tx.referralReward.create({ data: { referralId: ref.id, userId: referredId, amount: referredAmt, kind: "referred" } });
    await grantInTx(tx, { userId: referredId, amount: referredAmt, bucket: "BONUS", type: "REFERRAL_BONUS", idempotencyKey: `ref:${ref.id}:referred` });
  }
  await tx.referral.update({ where: { id: ref.id }, data: { status: "REWARDED", qualifiedAt: new Date() } });
  await audit("referral.rewarded", { target: ref.id, metadata: { referrerId: ref.referrerId, referredId } }, tx);
}

export async function referralStats(userId: string) {
  const [byStatus, rewards] = await Promise.all([
    db.referral.groupBy({ by: ["status"], where: { referrerId: userId }, _count: true }),
    db.referralReward.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const count = (st: string) => byStatus.find((b) => b.status === st)?._count ?? 0;
  const invited = byStatus.reduce((a, b) => a + b._count, 0);
  const converted = count("REWARDED") + count("QUALIFIED");
  return {
    invited,
    pending: count("PENDING"),
    converted,
    rejected: count("REJECTED"),
    conversionRate: invited ? converted / invited : 0,
    totalEarnedMicro: rewards.reduce((a, r) => a + r.amount, 0n),
    rewards,
  };
}

import { db } from "@/lib/db";
import { referralCode, randomToken } from "@/lib/security/tokens";
import { grant } from "@/lib/credits/ledger";

export const C = (n: number | string) => BigInt(Math.round(Number(n) * 1_000_000)); // credits → micro (test helper only)

export async function makeUser(opts: { bonus?: bigint; purchased?: bigint; signupIp?: string } = {}) {
  const u = await db.user.create({
    data: { email: `t-${randomToken(8)}@test.local`.toLowerCase(), referralCode: referralCode(10), emailVerified: new Date(), signupIp: opts.signupIp },
  });
  await db.wallet.create({ data: { userId: u.id } });
  if (opts.bonus) await grant({ userId: u.id, amount: opts.bonus, bucket: "BONUS", type: "PROMO_BONUS", idempotencyKey: `t-bonus:${u.id}` });
  if (opts.purchased) await grant({ userId: u.id, amount: opts.purchased, bucket: "PURCHASED", type: "PURCHASE", idempotencyKey: `t-buy:${u.id}` });
  return u;
}

export async function wallet(userId: string) {
  return db.wallet.findUniqueOrThrow({ where: { userId } });
}

/** Sum of ledger rows per bucket must equal the wallet's stored balances. */
export async function ledgerMatchesWallet(userId: string) {
  const w = await wallet(userId);
  const rows = await db.walletTransaction.groupBy({ by: ["bucket"], where: { walletId: w.id }, _sum: { amount: true } });
  const sum = (b: string) => rows.find((r) => r.bucket === b)?._sum.amount ?? 0n;
  return sum("BONUS") === w.bonusBalance && sum("PURCHASED") === w.purchasedBalance && sum("RESERVED") === w.reservedBalance;
}

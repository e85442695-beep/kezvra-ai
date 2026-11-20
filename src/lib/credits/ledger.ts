import { db, Prisma, type Tx, type CreditBucket, type TxType } from "@/lib/db";
import { minBig } from "@/lib/money";

/**
 * Kezvra Credits ledger.
 *
 * Invariants (enforced in code AND by DB CHECK constraints / triggers):
 *   1. Every balance change writes WalletTransaction rows (append-only) in the same DB transaction.
 *   2. Each business operation carries an idempotency key; replays are no-ops (unique constraint).
 *   3. Wallet rows are locked with SELECT … FOR UPDATE, so concurrent reserves can't overspend.
 *   4. Balances are bigint microcredits and can never go negative.
 *   5. Reserved credits are removed from spendable buckets; settlement charges ≤ reserve + available.
 */

export class InsufficientCreditsError extends Error {
  constructor(public readonly required: bigint, public readonly available: bigint) {
    super("INSUFFICIENT_CREDITS");
    this.name = "InsufficientCreditsError";
  }
}
export class SpendLimitError extends Error {
  constructor(message = "SPEND_LIMIT_EXCEEDED") {
    super(message);
    this.name = "SpendLimitError";
  }
}

interface LockedWallet {
  id: string;
  userId: string;
  bonusBalance: bigint;
  purchasedBalance: bigint;
  reservedBalance: bigint;
  dailySpendLimit: bigint | null;
}

export async function ensureWallet(userId: string, tx: Tx | typeof db = db) {
  return tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
}

async function lockWalletByUser(tx: Tx, userId: string): Promise<LockedWallet> {
  await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
  const rows = await tx.$queryRaw<LockedWallet[]>`
    SELECT "id","userId","bonusBalance","purchasedBalance","reservedBalance","dailySpendLimit"
    FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
  return rows[0]!;
}

async function lockWalletById(tx: Tx, walletId: string): Promise<LockedWallet> {
  const rows = await tx.$queryRaw<LockedWallet[]>`
    SELECT "id","userId","bonusBalance","purchasedBalance","reservedBalance","dailySpendLimit"
    FROM "Wallet" WHERE "id" = ${walletId} FOR UPDATE`;
  if (!rows[0]) throw new Error("Wallet not found");
  return rows[0];
}

type Entry = {
  type: TxType;
  bucket: CreditBucket;
  amount: bigint;
  key: string;
  reservationId?: string;
  paymentId?: string;
  aiRequestId?: string;
  actorId?: string;
  note?: string;
};

/** Apply bucket deltas + ledger rows. Caller must hold the wallet lock. */
async function apply(tx: Tx, w: LockedWallet, entries: Entry[]) {
  const bal = { BONUS: w.bonusBalance, PURCHASED: w.purchasedBalance, RESERVED: w.reservedBalance };
  const rows: Prisma.WalletTransactionCreateManyInput[] = [];
  for (const e of entries) {
    if (e.amount === 0n) continue;
    bal[e.bucket] += e.amount;
    if (bal[e.bucket] < 0n) throw new Error(`Ledger would go negative on ${e.bucket}`);
    rows.push({
      walletId: w.id,
      type: e.type,
      bucket: e.bucket,
      amount: e.amount,
      balanceAfter: bal[e.bucket],
      idempotencyKey: e.key,
      reservationId: e.reservationId,
      paymentId: e.paymentId,
      aiRequestId: e.aiRequestId,
      actorId: e.actorId,
      note: e.note,
    });
  }
  if (rows.length === 0) return bal;
  await tx.walletTransaction.createMany({ data: rows });
  await tx.wallet.update({
    where: { id: w.id },
    data: {
      bonusBalance: bal.BONUS,
      purchasedBalance: bal.PURCHASED,
      reservedBalance: bal.RESERVED,
      version: { increment: 1 },
    },
  });
  Object.assign(w, { bonusBalance: bal.BONUS, purchasedBalance: bal.PURCHASED, reservedBalance: bal.RESERVED });
  return bal;
}

async function alreadyApplied(tx: Tx, key: string) {
  const n = await tx.walletTransaction.count({
    where: { OR: [{ idempotencyKey: key }, { idempotencyKey: { startsWith: `${key}:` } }] },
  });
  return n > 0;
}

/** Run fn in a transaction; a unique-violation on idempotency means "already done" → returns null. */
async function idempotent<T>(fn: (tx: Tx) => Promise<T>): Promise<T | null> {
  try {
    return await db.$transaction(fn, { isolationLevel: "ReadCommitted", timeout: 15_000, maxWait: 10_000 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }
}

export async function getBalance(userId: string) {
  const w = await ensureWallet(userId);
  return {
    bonus: w.bonusBalance,
    purchased: w.purchasedBalance,
    reserved: w.reservedBalance,
    available: w.bonusBalance + w.purchasedBalance,
  };
}

// ───────────── Grants ─────────────

export interface GrantInput {
  userId: string;
  amount: bigint;
  bucket: "BONUS" | "PURCHASED";
  type: TxType;
  idempotencyKey: string;
  paymentId?: string;
  actorId?: string;
  note?: string;
}

/** Credit a wallet. Returns false if this idempotency key was already applied. */
export async function grantInTx(tx: Tx, g: GrantInput): Promise<boolean> {
  if (g.amount <= 0n) throw new Error("Grant amount must be positive");
  const w = await lockWalletByUser(tx, g.userId);
  if (await alreadyApplied(tx, g.idempotencyKey)) return false;
  await apply(tx, w, [{ ...g, key: g.idempotencyKey }]);
  return true;
}

export async function grant(g: GrantInput): Promise<boolean> {
  return (await idempotent((tx) => grantInTx(tx, g))) ?? false;
}

// ───────────── Reservations ─────────────

export interface ReserveInput {
  userId: string;
  amount: bigint;
  reason: string;
  idempotencyKey: string;
  ttlMs?: number;
}

async function spentToday(tx: Tx, walletId: string): Promise<bigint> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const agg = await tx.walletTransaction.aggregate({
    where: { walletId, type: "CHARGE", createdAt: { gte: since } },
    _sum: { amount: true },
  });
  return -(agg._sum.amount ?? 0n);
}

export async function reserve(input: ReserveInput) {
  if (input.amount <= 0n) throw new Error("Reservation must be positive");
  const res = await idempotent(async (tx) => {
    const existing = await tx.creditReservation.findFirst({
      where: { transactions: { some: { idempotencyKey: `${input.idempotencyKey}:RESERVED` } } },
    });
    if (existing) return existing;

    const w = await lockWalletByUser(tx, input.userId);
    const available = w.bonusBalance + w.purchasedBalance;
    if (available < input.amount) throw new InsufficientCreditsError(input.amount, available);
    if (w.dailySpendLimit != null) {
      const spent = await spentToday(tx, w.id);
      if (spent + w.reservedBalance + input.amount > w.dailySpendLimit) throw new SpendLimitError("DAILY_SPEND_LIMIT");
    }
    // Bonus credits are consumed first.
    const fromBonus = minBig(w.bonusBalance, input.amount);
    const fromPurchased = input.amount - fromBonus;
    const r = await tx.creditReservation.create({
      data: {
        walletId: w.id,
        amount: input.amount,
        fromBonus,
        fromPurchased,
        reason: input.reason,
        expiresAt: new Date(Date.now() + (input.ttlMs ?? 15 * 60_000)),
      },
    });
    const k = input.idempotencyKey;
    await apply(tx, w, [
      { type: "RESERVE", bucket: "BONUS", amount: -fromBonus, key: `${k}:BONUS`, reservationId: r.id },
      { type: "RESERVE", bucket: "PURCHASED", amount: -fromPurchased, key: `${k}:PURCHASED`, reservationId: r.id },
      { type: "RESERVE", bucket: "RESERVED", amount: input.amount, key: `${k}:RESERVED`, reservationId: r.id },
    ]);
    return r;
  });
  if (!res) {
    // concurrent duplicate — fetch the winner
    const tx = await db.walletTransaction.findUnique({ where: { idempotencyKey: `${input.idempotencyKey}:RESERVED` } });
    if (!tx?.reservationId) throw new Error("Reservation race could not be resolved");
    return db.creditReservation.findUniqueOrThrow({ where: { id: tx.reservationId } });
  }
  return res;
}

export interface SettleResult {
  charged: bigint;
  released: bigint;
  shortfall: bigint;
  alreadySettled: boolean;
}

/**
 * Settle a reservation with the actual charge. Charges bonus-first (mirroring how it was reserved),
 * returns the unused remainder to its original buckets. If the actual charge exceeds the reservation
 * (provider counted more tokens), the extra is taken from available balance; any uncollectable
 * shortfall is recorded (platform loss) rather than driving the balance negative.
 */
export async function settle(reservationId: string, actualCharge: bigint, aiRequestId?: string): Promise<SettleResult> {
  if (actualCharge < 0n) throw new Error("Charge cannot be negative");
  const out = await idempotent(async (tx) => {
    const r0 = await tx.creditReservation.findUniqueOrThrow({ where: { id: reservationId } });
    const w = await lockWalletById(tx, r0.walletId);
    const r = await tx.creditReservation.findUniqueOrThrow({ where: { id: reservationId } }); // re-read under lock
    if (r.status !== "HELD") return { charged: r.chargedAmount, released: 0n, shortfall: 0n, alreadySettled: true };

    const fromReserve = minBig(actualCharge, r.amount);
    const chargedBonus = minBig(fromReserve, r.fromBonus);
    const chargedPurchased = fromReserve - chargedBonus;
    const returnBonus = r.fromBonus - chargedBonus;
    const returnPurchased = r.fromPurchased - chargedPurchased;

    const k = `settle:${r.id}`;
    const entries: Entry[] = [
      { type: "CHARGE", bucket: "RESERVED", amount: -fromReserve, key: `${k}:charge`, reservationId: r.id, aiRequestId },
      { type: "RELEASE", bucket: "RESERVED", amount: -(returnBonus + returnPurchased), key: `${k}:release`, reservationId: r.id },
      { type: "RELEASE", bucket: "BONUS", amount: returnBonus, key: `${k}:rb`, reservationId: r.id },
      { type: "RELEASE", bucket: "PURCHASED", amount: returnPurchased, key: `${k}:rp`, reservationId: r.id },
    ];
    // Overage beyond the reservation
    let extra = actualCharge - fromReserve;
    let shortfall = 0n;
    if (extra > 0n) {
      const bonusAfter = w.bonusBalance + returnBonus;
      const purchasedAfter = w.purchasedBalance + returnPurchased;
      const xb = minBig(extra, bonusAfter);
      const xp = minBig(extra - xb, purchasedAfter);
      shortfall = extra - xb - xp;
      extra = xb + xp;
      entries.push(
        { type: "CHARGE", bucket: "BONUS", amount: -xb, key: `${k}:xb`, reservationId: r.id, aiRequestId },
        { type: "CHARGE", bucket: "PURCHASED", amount: -xp, key: `${k}:xp`, reservationId: r.id, aiRequestId, note: shortfall > 0n ? `shortfall ${shortfall}` : undefined },
      );
    }
    await apply(tx, w, entries);
    const charged = fromReserve + extra;
    await tx.creditReservation.update({
      where: { id: r.id },
      data: { status: "SETTLED", chargedAmount: charged, settledAt: new Date() },
    });
    return { charged, released: returnBonus + returnPurchased, shortfall, alreadySettled: false };
  });
  if (!out) {
    const r = await db.creditReservation.findUniqueOrThrow({ where: { id: reservationId } });
    return { charged: r.chargedAmount, released: 0n, shortfall: 0n, alreadySettled: true };
  }
  return out;
}

/** Return a held reservation in full (request failed before any upstream cost). */
export async function release(reservationId: string): Promise<boolean> {
  const r = await settle(reservationId, 0n);
  return !r.alreadySettled;
}

// ───────────── Admin & refunds ─────────────

/** Signed manual adjustment by an admin. Never allows a negative bucket. */
export async function adminAdjustInTx(
  tx: Tx,
  a: { userId: string; amount: bigint; bucket: "BONUS" | "PURCHASED"; actorId: string; note: string; idempotencyKey: string },
) {
  if (a.amount === 0n) throw new Error("Adjustment cannot be zero");
  const w = await lockWalletByUser(tx, a.userId);
  if (await alreadyApplied(tx, a.idempotencyKey)) return false;
  await apply(tx, w, [{ type: "ADMIN_ADJUSTMENT", bucket: a.bucket, amount: a.amount, key: a.idempotencyKey, actorId: a.actorId, note: a.note }]);
  return true;
}

/**
 * Claw back purchased credits after a refund/chargeback. Removes up to `amount` from the purchased
 * bucket (then bonus); credits already spent can't be recovered — the uncollected remainder is returned.
 */
export async function revokeInTx(
  tx: Tx,
  a: { userId: string; amount: bigint; type: "REFUND" | "CHARGEBACK"; paymentId: string; idempotencyKey: string },
): Promise<{ revoked: bigint; uncollected: bigint } | null> {
  const w = await lockWalletByUser(tx, a.userId);
  if (await alreadyApplied(tx, a.idempotencyKey)) return null;
  const fromP = minBig(a.amount, w.purchasedBalance);
  const fromB = minBig(a.amount - fromP, w.bonusBalance);
  const uncollected = a.amount - fromP - fromB;
  await apply(tx, w, [
    { type: a.type, bucket: "PURCHASED", amount: -fromP, key: `${a.idempotencyKey}:p`, paymentId: a.paymentId },
    { type: a.type, bucket: "BONUS", amount: -fromB, key: `${a.idempotencyKey}:b`, paymentId: a.paymentId, note: uncollected > 0n ? `uncollected ${uncollected}` : undefined },
  ]);
  if (fromP === 0n && fromB === 0n) {
    // record a zero-impact marker so the operation is still idempotent
    await tx.auditLog.create({ data: { action: "credits.revoke.nothing_to_collect", target: a.paymentId, metadata: { key: a.idempotencyKey } } });
  }
  return { revoked: fromP + fromB, uncollected };
}

/** Release reservations whose request process died (crash / timeout). Called by the worker. */
export async function expireStaleReservations(limit = 200) {
  const stale = await db.creditReservation.findMany({
    where: { status: "HELD", expiresAt: { lt: new Date() } },
    select: { id: true, aiRequest: { select: { id: true, status: true, chargedMicro: true } } },
    take: limit,
  });
  let n = 0;
  for (const r of stale) {
    // If the AI request recorded a final charge, settle with it; otherwise refund fully.
    const charge = r.aiRequest?.status === "SUCCEEDED" ? r.aiRequest.chargedMicro : 0n;
    const res = await settle(r.id, charge, r.aiRequest?.id);
    if (!res.alreadySettled) n++;
  }
  return n;
}

import { db, Prisma, type PaymentProvider, type Tx } from "@/lib/db";
import { grantInTx, revokeInTx } from "@/lib/credits/ledger";
import { qualifyReferralInTx } from "@/lib/referrals";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";

/**
 * Provider-agnostic payment state machine. Webhooks from Stripe / Telegram call these functions.
 * Double-crediting is prevented on three independent levels:
 *   1. PaymentEvent unique (provider, providerEventId) — the same webhook is processed once.
 *   2. Payment row locked FOR UPDATE + status check — concurrent different events serialize.
 *   3. Ledger idempotency key `purchase:<paymentId>` — the grant itself can only apply once.
 */

export class PaymentMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentMismatchError";
  }
}

async function lockPayment(tx: Tx, paymentId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
  if (!rows[0]) throw new PaymentMismatchError("PAYMENT_NOT_FOUND");
  return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
}

/** Strip anything sensitive from a provider payload before persisting it. */
export function sanitizePayload(obj: unknown, depth = 0): Prisma.InputJsonValue {
  if (depth > 6 || obj == null) return null as unknown as Prisma.InputJsonValue;
  if (Array.isArray(obj)) return obj.slice(0, 50).map((v) => sanitizePayload(v, depth + 1)) as Prisma.InputJsonValue;
  if (typeof obj === "object") {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/(card|secret|token|client_secret|payment_method_details|billing_details|email|phone|address|name)/i.test(k)) continue;
      out[k] = sanitizePayload(v, depth + 1);
    }
    return out;
  }
  return obj as Prisma.InputJsonValue;
}

/**
 * Record a webhook event. Returns false if it was already processed (duplicate delivery).
 * Events that previously failed are retried.
 */
export async function recordEvent(provider: PaymentProvider, providerEventId: string, type: string, payload: unknown) {
  try {
    await db.paymentEvent.create({ data: { provider, providerEventId, type, payload: sanitizePayload(payload) } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const ev = await db.paymentEvent.findUnique({ where: { provider_providerEventId: { provider, providerEventId } } });
      return !ev?.processedAt; // retry if never completed
    }
    throw e;
  }
}

export async function markEvent(provider: PaymentProvider, providerEventId: string, result: { paymentId?: string; error?: string }) {
  await db.paymentEvent.update({
    where: { provider_providerEventId: { provider, providerEventId } },
    data: { processedAt: result.error ? null : new Date(), error: result.error?.slice(0, 500) ?? null, paymentId: result.paymentId },
  });
}

/** Mark a payment as paid and grant credits exactly once. Verifies amount and currency. */
export async function fulfillPayment(paymentId: string, paid: { amount: number; currency: string; providerPaymentId?: string | null; receiptUrl?: string | null }) {
  const settings = await getSettings();
  return db.$transaction(
    async (tx) => {
      const p = await lockPayment(tx, paymentId);
      if (p.status === "SUCCEEDED" || p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED" || p.status === "DISPUTED") {
        return { alreadyFulfilled: true, payment: p };
      }
      if (paid.amount !== p.amount || paid.currency.toLowerCase() !== p.currency.toLowerCase()) {
        await audit("payment.amount_mismatch", { target: p.id, metadata: { expected: p.amount, got: paid.amount, currency: paid.currency } }, tx);
        throw new PaymentMismatchError("AMOUNT_OR_CURRENCY_MISMATCH");
      }
      const snap = p.packageSnapshot as { credits: string; bonusCredits: string };
      const credits = BigInt(snap.credits);
      const bonus = BigInt(snap.bonusCredits ?? "0");
      await grantInTx(tx, { userId: p.userId, amount: credits, bucket: "PURCHASED", type: "PURCHASE", idempotencyKey: `purchase:${p.id}`, paymentId: p.id });
      if (bonus > 0n) {
        await grantInTx(tx, { userId: p.userId, amount: bonus, bucket: "BONUS", type: "PROMO_BONUS", idempotencyKey: `purchase-bonus:${p.id}`, paymentId: p.id });
      }
      const updated = await tx.payment.update({
        where: { id: p.id },
        data: {
          status: "SUCCEEDED",
          creditsGranted: credits,
          bonusGranted: bonus,
          completedAt: new Date(),
          providerPaymentId: paid.providerPaymentId ?? p.providerPaymentId,
          receiptUrl: paid.receiptUrl ?? p.receiptUrl,
        },
      });
      await qualifyReferralInTx(tx, p.userId, p.provider === "TELEGRAM_STARS" ? Number.MAX_SAFE_INTEGER : p.amount, settings);
      await audit("payment.succeeded", { actorId: p.userId, target: p.id, metadata: { provider: p.provider, amount: p.amount, currency: p.currency } }, tx);
      return { alreadyFulfilled: false, payment: updated };
    },
    { timeout: 20_000, maxWait: 10_000 },
  );
}

export async function failPayment(paymentId: string, status: "FAILED" | "CANCELED") {
  await db.payment.updateMany({ where: { id: paymentId, status: { in: ["CREATED", "PENDING"] } }, data: { status } });
}

/**
 * Apply a (cumulative) refund total reported by the provider. Credits are clawed back
 * proportionally: creditsGranted × (newRefund − previousRefund) / amount, rounded down.
 * Bonus credits granted with the purchase are revoked proportionally as well.
 * Idempotent on the cumulative refunded amount.
 */
export async function applyRefund(paymentId: string, cumulativeRefunded: number, kind: "REFUND" | "CHARGEBACK" = "REFUND") {
  return db.$transaction(async (tx) => {
    const p = await lockPayment(tx, paymentId);
    if (cumulativeRefunded <= p.refundedAmount) return { changed: false };
    if (p.status !== "SUCCEEDED" && p.status !== "PARTIALLY_REFUNDED" && p.status !== "DISPUTED") return { changed: false };
    const delta = BigInt(Math.min(cumulativeRefunded, p.amount) - p.refundedAmount);
    const total = BigInt(p.amount);
    const claw = ((p.creditsGranted + p.bonusGranted) * delta) / total;
    const res = claw > 0n
      ? await revokeInTx(tx, { userId: p.userId, amount: claw, type: kind, paymentId: p.id, idempotencyKey: `${kind.toLowerCase()}:${p.id}:${cumulativeRefunded}` })
      : null;
    const full = cumulativeRefunded >= p.amount;
    await tx.payment.update({
      where: { id: p.id },
      data: { refundedAmount: Math.min(cumulativeRefunded, p.amount), status: kind === "CHARGEBACK" ? "DISPUTED" : full ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });
    await audit(`payment.${kind.toLowerCase()}`, {
      target: p.id,
      metadata: { cumulativeRefunded, clawed: (res?.revoked ?? 0n).toString(), uncollected: (res?.uncollected ?? 0n).toString() },
    }, tx);
    // Uncollectable credits (already spent) on a chargeback → suspend pending review.
    if (kind === "CHARGEBACK" && res && res.uncollected > 0n) {
      await tx.user.update({ where: { id: p.userId }, data: { status: "SUSPENDED" } });
    }
    return { changed: true, revoked: res?.revoked ?? 0n, uncollected: res?.uncollected ?? 0n };
  }, { timeout: 20_000, maxWait: 10_000 });
}

/** Create the local Payment row for a package (before redirecting to the provider). */
export async function createPendingPayment(userId: string, packageId: string, provider: PaymentProvider) {
  const pkg = await db.creditPackage.findFirst({ where: { id: packageId, active: true, provider } });
  if (!pkg) return null;
  return db.payment.create({
    data: {
      userId,
      packageId: pkg.id,
      provider,
      status: "CREATED",
      amount: pkg.priceAmount,
      currency: pkg.currency,
      packageSnapshot: { slug: pkg.slug, name: pkg.name, credits: pkg.credits.toString(), bonusCredits: pkg.bonusCredits.toString(), priceAmount: pkg.priceAmount, currency: pkg.currency },
    },
  });
}

import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyRefund, createPendingPayment, fulfillPayment, PaymentMismatchError, recordEvent, markEvent, sanitizePayload } from "@/lib/billing/fulfill";
import { randomToken } from "@/lib/security/tokens";
import { C, ledgerMatchesWallet, makeUser, wallet } from "./helpers";

afterAll(() => db.$disconnect());

async function pkg(price = 1000, credits = C(1000), bonus = 0n) {
  return db.creditPackage.create({ data: { slug: `t-${randomToken(6).toLowerCase()}`.replace(/[^a-z0-9-]/g, "a"), name: "Test", provider: "STRIPE", priceAmount: price, currency: "usd", credits, bonusCredits: bonus } });
}

describe("payments", () => {
  it("concurrent webhook deliveries credit the purchase exactly once", async () => {
    const u = await makeUser();
    const p = await pkg();
    const pay = (await createPendingPayment(u.id, p.id, "STRIPE"))!;
    const results = await Promise.all(Array.from({ length: 5 }, () => fulfillPayment(pay.id, { amount: 1000, currency: "usd" })));
    expect(results.filter((r) => !r.alreadyFulfilled)).toHaveLength(1);
    expect((await wallet(u.id)).purchasedBalance).toBe(C(1000));
    expect(await ledgerMatchesWallet(u.id)).toBe(true);
  });

  it("rejects a paid amount or currency that doesn't match the order", async () => {
    const u = await makeUser();
    const p = await pkg();
    const pay = (await createPendingPayment(u.id, p.id, "STRIPE"))!;
    await expect(fulfillPayment(pay.id, { amount: 1, currency: "usd" })).rejects.toBeInstanceOf(PaymentMismatchError);
    await expect(fulfillPayment(pay.id, { amount: 1000, currency: "eur" })).rejects.toBeInstanceOf(PaymentMismatchError);
    expect((await wallet(u.id)).purchasedBalance).toBe(0n);
    expect((await db.payment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe("CREATED");
  });

  it("grants the package bonus into the bonus bucket", async () => {
    const u = await makeUser();
    const p = await pkg(2000, C(2000), C(100));
    const pay = (await createPendingPayment(u.id, p.id, "STRIPE"))!;
    await fulfillPayment(pay.id, { amount: 2000, currency: "usd" });
    const w = await wallet(u.id);
    expect(w.purchasedBalance).toBe(C(2000));
    expect(w.bonusBalance).toBe(C(100));
  });

  it("package edits after purchase do not change what the buyer receives", async () => {
    const u = await makeUser();
    const p = await pkg();
    const pay = (await createPendingPayment(u.id, p.id, "STRIPE"))!;
    await db.creditPackage.update({ where: { id: p.id }, data: { credits: C(999999) } });
    await fulfillPayment(pay.id, { amount: 1000, currency: "usd" });
    expect((await wallet(u.id)).purchasedBalance).toBe(C(1000));
  });

  it("partial then full refund revokes credits proportionally and is idempotent", async () => {
    const u = await makeUser();
    const p = await pkg();
    const pay = (await createPendingPayment(u.id, p.id, "STRIPE"))!;
    await fulfillPayment(pay.id, { amount: 1000, currency: "usd" });
    await applyRefund(pay.id, 250); // 25%
    await applyRefund(pay.id, 250); // replay → no-op
    expect((await wallet(u.id)).purchasedBalance).toBe(C(750));
    expect((await db.payment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe("PARTIALLY_REFUNDED");
    await applyRefund(pay.id, 1000);
    expect((await wallet(u.id)).purchasedBalance).toBe(0n);
    expect((await db.payment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe("REFUNDED");
    expect(await ledgerMatchesWallet(u.id)).toBe(true);
  });

  it("refund of already-spent credits never makes the balance negative", async () => {
    const u = await makeUser();
    const p = await pkg();
    const pay = (await createPendingPayment(u.id, p.id, "STRIPE"))!;
    await fulfillPayment(pay.id, { amount: 1000, currency: "usd" });
    await db.$transaction(async (tx) => {
      const { adminAdjustInTx } = await import("@/lib/credits/ledger");
      await adminAdjustInTx(tx, { userId: u.id, amount: -C(900), bucket: "PURCHASED", actorId: u.id, note: "simulate spend", idempotencyKey: `spend:${u.id}` });
    });
    const r = await applyRefund(pay.id, 1000);
    expect(r.uncollected).toBe(C(900));
    expect((await wallet(u.id)).purchasedBalance).toBe(0n);
  });

  it("chargeback with uncollectable credits suspends the account", async () => {
    const u = await makeUser();
    const p = await pkg();
    const pay = (await createPendingPayment(u.id, p.id, "STRIPE"))!;
    await fulfillPayment(pay.id, { amount: 1000, currency: "usd" });
    await db.$transaction(async (tx) => {
      const { adminAdjustInTx } = await import("@/lib/credits/ledger");
      await adminAdjustInTx(tx, { userId: u.id, amount: -C(500), bucket: "PURCHASED", actorId: u.id, note: "simulate spend", idempotencyKey: `spend2:${u.id}` });
    });
    await applyRefund(pay.id, 1000, "CHARGEBACK");
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).status).toBe("SUSPENDED");
  });

  it("webhook events are deduplicated by provider event id; failed ones may retry", async () => {
    const id = `evt_${randomToken(8)}`;
    expect(await recordEvent("STRIPE", id, "checkout.session.completed", {})).toBe(true);
    expect(await recordEvent("STRIPE", id, "checkout.session.completed", {})).toBe(true); // not processed yet → retry allowed
    await markEvent("STRIPE", id, {});
    expect(await recordEvent("STRIPE", id, "checkout.session.completed", {})).toBe(false);
  });

  it("strips card and personal data before storing webhook payloads", () => {
    const out = sanitizePayload({ id: "x", amount_total: 1, customer_details: { email: "a@b.c", name: "N" }, payment_method_details: { card: { last4: "4242" } }, metadata: { paymentId: "p" } }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toMatch(/4242|a@b\.c/);
    expect(out.amount_total).toBe(1);
  });
});

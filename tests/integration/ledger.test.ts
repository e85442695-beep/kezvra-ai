import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { InsufficientCreditsError, SpendLimitError, adminAdjustInTx, expireStaleReservations, grant, release, reserve, settle } from "@/lib/credits/ledger";
import { C, ledgerMatchesWallet, makeUser, wallet } from "./helpers";

afterAll(() => db.$disconnect());

describe("credits ledger", () => {
  it("concurrent reservations never overspend (race condition)", async () => {
    const u = await makeUser({ purchased: C(6) });
    const attempts = Array.from({ length: 14 }, (_, i) => reserve({ userId: u.id, amount: C(1), reason: "race", idempotencyKey: `race:${u.id}:${i}` }));
    const results = await Promise.allSettled(attempts);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const insufficient = results.filter((r) => r.status === "rejected" && r.reason instanceof InsufficientCreditsError).length;
    expect(ok).toBe(6);
    expect(insufficient).toBe(8);
    const w = await wallet(u.id);
    expect(w.purchasedBalance).toBe(0n);
    expect(w.reservedBalance).toBe(C(6));
    expect(await ledgerMatchesWallet(u.id)).toBe(true);
  });

  it("refuses a reservation larger than the balance", async () => {
    const u = await makeUser({ bonus: C(1) });
    await expect(reserve({ userId: u.id, amount: C(2), reason: "x", idempotencyKey: `big:${u.id}` })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect((await wallet(u.id)).bonusBalance).toBe(C(1));
  });

  it("reservation is idempotent per key", async () => {
    const u = await makeUser({ purchased: C(5) });
    const [a, b] = await Promise.all([
      reserve({ userId: u.id, amount: C(2), reason: "x", idempotencyKey: `idem:${u.id}` }),
      reserve({ userId: u.id, amount: C(2), reason: "x", idempotencyKey: `idem:${u.id}` }),
    ]);
    expect(a.id).toBe(b.id);
    expect((await wallet(u.id)).purchasedBalance).toBe(C(3));
  });

  it("settles actual cost, returns the unused reserve to the original buckets, bonus first", async () => {
    const u = await makeUser({ bonus: C(1), purchased: C(9) });
    const r = await reserve({ userId: u.id, amount: C(4), reason: "chat", idempotencyKey: `s:${u.id}` });
    expect(r.fromBonus).toBe(C(1));
    expect(r.fromPurchased).toBe(C(3));
    const res = await settle(r.id, C(1.5));
    expect(res.charged).toBe(C(1.5));
    expect(res.released).toBe(C(2.5));
    const w = await wallet(u.id);
    expect(w.bonusBalance).toBe(0n); // bonus consumed first
    expect(w.purchasedBalance).toBe(C(9) - C(0.5));
    expect(w.reservedBalance).toBe(0n);
    expect(await ledgerMatchesWallet(u.id)).toBe(true);
  });

  it("settling twice (concurrently) charges once", async () => {
    const u = await makeUser({ purchased: C(10) });
    const r = await reserve({ userId: u.id, amount: C(3), reason: "x", idempotencyKey: `twice:${u.id}` });
    const [a, b] = await Promise.all([settle(r.id, C(2)), settle(r.id, C(2))]);
    expect([a.alreadySettled, b.alreadySettled].filter(Boolean)).toHaveLength(1);
    expect((await wallet(u.id)).purchasedBalance).toBe(C(8));
    expect(await ledgerMatchesWallet(u.id)).toBe(true);
  });

  it("overage above the reserve is taken from balance; uncollectable remainder is a shortfall, never negative", async () => {
    const u = await makeUser({ purchased: C(3) });
    const r = await reserve({ userId: u.id, amount: C(2), reason: "x", idempotencyKey: `over:${u.id}` });
    const res = await settle(r.id, C(5)); // only 3 exist in total
    expect(res.charged).toBe(C(3));
    expect(res.shortfall).toBe(C(2));
    const w = await wallet(u.id);
    expect(w.purchasedBalance).toBe(0n);
    expect(w.reservedBalance).toBe(0n);
    expect(await ledgerMatchesWallet(u.id)).toBe(true);
  });

  it("release returns the full reserve", async () => {
    const u = await makeUser({ purchased: C(4) });
    const r = await reserve({ userId: u.id, amount: C(4), reason: "x", idempotencyKey: `rel:${u.id}` });
    expect(await release(r.id)).toBe(true);
    expect(await release(r.id)).toBe(false);
    expect((await wallet(u.id)).purchasedBalance).toBe(C(4));
  });

  it("stale reservations are released by the sweeper (crash recovery)", async () => {
    const u = await makeUser({ purchased: C(4) });
    const r = await reserve({ userId: u.id, amount: C(4), reason: "x", idempotencyKey: `stale:${u.id}`, ttlMs: -1000 });
    await expireStaleReservations();
    expect((await db.creditReservation.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("SETTLED");
    expect((await wallet(u.id)).purchasedBalance).toBe(C(4));
  });

  it("enforces the daily spend limit", async () => {
    const u = await makeUser({ purchased: C(100) });
    await db.wallet.update({ where: { userId: u.id }, data: { dailySpendLimit: C(5) } });
    const r = await reserve({ userId: u.id, amount: C(4), reason: "x", idempotencyKey: `lim1:${u.id}` });
    await settle(r.id, C(4));
    await expect(reserve({ userId: u.id, amount: C(2), reason: "x", idempotencyKey: `lim2:${u.id}` })).rejects.toBeInstanceOf(SpendLimitError);
  });

  it("grants are idempotent", async () => {
    const u = await makeUser();
    const results = await Promise.all(Array.from({ length: 5 }, () => grant({ userId: u.id, amount: C(7), bucket: "BONUS", type: "PROMO_BONUS", idempotencyKey: `g:${u.id}` })));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await wallet(u.id)).bonusBalance).toBe(C(7));
  });

  it("admin adjustment cannot drive a balance negative", async () => {
    const u = await makeUser({ bonus: C(1) });
    const admin = await makeUser();
    await expect(db.$transaction((tx) => adminAdjustInTx(tx, { userId: u.id, amount: -C(5), bucket: "BONUS", actorId: admin.id, note: "test", idempotencyKey: `adj:${u.id}` }))).rejects.toThrow();
    expect((await wallet(u.id)).bonusBalance).toBe(C(1));
  });

  it("database rejects negative balances even if application code is bypassed", async () => {
    const u = await makeUser();
    await expect(db.wallet.update({ where: { userId: u.id }, data: { bonusBalance: -1n } })).rejects.toThrow();
  });

  it("ledger rows are append-only", async () => {
    const u = await makeUser({ bonus: C(1) });
    const w = await wallet(u.id);
    const tx = await db.walletTransaction.findFirstOrThrow({ where: { walletId: w.id } });
    await expect(db.walletTransaction.update({ where: { id: tx.id }, data: { amount: 999n } })).rejects.toThrow();
    await expect(db.walletTransaction.delete({ where: { id: tx.id } })).rejects.toThrow();
  });
});

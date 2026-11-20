import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ownedAttachments, ownedChat } from "@/lib/chat/service";
import { retrieve } from "@/lib/files/retrieval";
import { attachReferral, qualifyReferralInTx } from "@/lib/referrals";
import { hasRole } from "@/lib/auth/roles";
import { generateApiKey, holdKeyBudget } from "@/lib/apikeys";
import { randomToken } from "@/lib/security/tokens";
import { C, makeUser, wallet } from "./helpers";

afterAll(() => db.$disconnect());

describe("data isolation", () => {
  it("a user cannot read another user's chat", async () => {
    const [a, b] = await Promise.all([makeUser(), makeUser()]);
    const chat = await db.chat.create({ data: { userId: a.id, modelId: "test/model" } });
    await expect(ownedChat(a.id, chat.id)).resolves.toMatchObject({ id: chat.id });
    await expect(ownedChat(b.id, chat.id)).rejects.toMatchObject({ status: 404 });
  });

  it("a user cannot attach or retrieve another user's file", async () => {
    const [a, b] = await Promise.all([makeUser(), makeUser()]);
    const f = await db.storedFile.create({ data: { userId: a.id, name: "secret.txt", mime: "text/plain", sizeBytes: 5, storageKey: `k-${randomToken(6)}`, sha256: "x", status: "READY", textLength: 12 } });
    await db.fileChunk.create({ data: { fileId: f.id, index: 0, content: "top secret", tokens: 3 } });
    await expect(ownedAttachments(b.id, [f.id])).rejects.toMatchObject({ status: 404 });
    expect(await retrieve(b.id, [f.id], "secret")).toEqual([]);
    expect((await retrieve(a.id, [f.id], "secret"))[0]?.text).toContain("top secret");
  });
});

describe("roles", () => {
  it("role hierarchy", () => {
    expect(hasRole("SUPER_ADMIN", "ADMIN")).toBe(true);
    expect(hasRole("ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(hasRole("MODERATOR", "ADMIN")).toBe(false);
    expect(hasRole("USER", "MODERATOR")).toBe(false);
  });
});

describe("referrals", () => {
  it("rejects self-referral and rewards a real referral exactly once", async () => {
    const referrer = await makeUser({ signupIp: "10.0.0.1" });
    const self = await attachReferral(referrer.id, referrer.referralCode, "10.0.0.9");
    expect(self?.status).toBe("REJECTED");

    const friend = await makeUser({ signupIp: "10.0.0.2" });
    const ref = await attachReferral(friend.id, referrer.referralCode, "10.0.0.2");
    expect(ref?.status).toBe("PENDING");
    expect(await attachReferral(friend.id, referrer.referralCode, "10.0.0.2")).toBeNull(); // second attach ignored

    await db.$transaction((tx) => qualifyReferralInTx(tx, friend.id, 1000));
    await db.$transaction((tx) => qualifyReferralInTx(tx, friend.id, 1000));
    const rewards = await db.referralReward.count({ where: { referralId: ref!.id } });
    expect(rewards).toBe(2); // one for each side, not duplicated
    expect((await wallet(referrer.id)).bonusBalance).toBeGreaterThan(0n);
  });

  it("rejects a referral from the referrer's own IP", async () => {
    const referrer = await makeUser({ signupIp: "10.9.9.9" });
    const friend = await makeUser();
    expect((await attachReferral(friend.id, referrer.referralCode, "10.9.9.9"))?.status).toBe("REJECTED");
  });
});

describe("API keys", () => {
  it("stores only a hash and enforces the spend limit atomically", async () => {
    const u = await makeUser();
    const { key, hash, prefix } = generateApiKey();
    expect(hash).not.toContain(key);
    const k = await db.apiKey.create({ data: { userId: u.id, name: "t", hash, prefix, spendLimit: C(10) } });
    const holds = await Promise.all(Array.from({ length: 20 }, () => holdKeyBudget(k.id, C(1))));
    expect(holds.filter(Boolean)).toHaveLength(10);
    expect((await db.apiKey.findUniqueOrThrow({ where: { id: k.id } })).spent).toBe(C(10));
  });
});

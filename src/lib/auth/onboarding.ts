import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { grantInTx } from "@/lib/credits/ledger";
import { getSettings } from "@/lib/settings";
import { referralCode } from "@/lib/security/tokens";
import { attachReferral } from "@/lib/referrals";

/** Create a user with wallet + signup bonus (idempotent per user). */
export async function onUserCreated(input: {
  email: string;
  name: string | null;
  image?: string | null;
  passwordHash?: string;
  emailVerified?: Date | null;
  locale?: string;
  signupIp?: string | null;
  referral?: string | null;
}) {
  const s = await getSettings();
  const email = input.email.toLowerCase().trim();
  const superAdmins = env.SUPER_ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const user = await db.$transaction(async (tx) => {
    let code = referralCode();
    while (await tx.user.findUnique({ where: { referralCode: code }, select: { id: true } })) code = referralCode();
    const u = await tx.user.create({
      data: {
        email,
        name: input.name,
        image: input.image ?? null,
        passwordHash: input.passwordHash,
        emailVerified: input.emailVerified ?? null,
        locale: input.locale ?? "uk",
        referralCode: code,
        signupIp: input.signupIp ?? null,
        role: superAdmins.includes(email) ? "SUPER_ADMIN" : "USER",
      },
    });
    await tx.wallet.create({ data: { userId: u.id } });
    const bonus = BigInt(s.signupBonusMicro);
    if (bonus > 0n) {
      await grantInTx(tx, { userId: u.id, amount: bonus, bucket: "BONUS", type: "SIGNUP_BONUS", idempotencyKey: `signup:${u.id}` });
    }
    return u;
  });
  if (input.referral) await attachReferral(user.id, input.referral, input.signupIp ?? null).catch(() => {});
  return user;
}

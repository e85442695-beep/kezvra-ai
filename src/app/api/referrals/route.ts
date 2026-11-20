import { env } from "@/lib/env";
import { json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { referralStats } from "@/lib/referrals";
import { getSettings } from "@/lib/settings";

export const GET = route(async () => {
  const me = await requireUser();
  const [stats, s] = await Promise.all([referralStats(me.id), getSettings()]);
  return json({
    code: me.referralCode,
    link: `${env.APP_URL}/register?ref=${me.referralCode}`,
    program: { enabled: s.referral.enabled, referrerRewardMicro: s.referral.referrerRewardMicro, referredRewardMicro: s.referral.referredRewardMicro, qualifyMinPurchase: s.referral.qualifyMinPurchase },
    stats,
  });
});

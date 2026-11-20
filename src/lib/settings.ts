import { z } from "zod";
import { db } from "./db";
import type { PricingConfig } from "./pricing";

/**
 * Admin-editable platform settings. Stored in SystemSetting as JSON; bigint values as strings.
 * Defaults are conservative and must be reviewed by the operator before launch.
 */
const bigintStr = z.string().regex(/^\d+$/);

export const settingsSchema = z.object({
  /** whole credits per 1 USD of upstream cost */
  creditsPerUsd: bigintStr.default("1000"),
  /** default markup on upstream cost, basis points */
  globalMarkupBps: z.number().int().min(0).max(100_000).default(2500),
  /** microcredits */
  minChargeMicro: bigintStr.default("10000"),
  maxChargeMicro: bigintStr.default("5000000000"),
  signupBonusMicro: bigintStr.default("50000000"),
  /** Free-tier: models with isFree=true still cost 0 upstream; cap their daily request count */
  freeModelDailyRequests: z.number().int().min(0).default(50),
  defaultModelId: z.string().default("openrouter/auto"),
  maxCompletionTokens: z.number().int().positive().default(8192),
  referral: z
    .object({
      enabled: z.boolean().default(true),
      referrerRewardMicro: bigintStr.default("200000000"),
      referredRewardMicro: bigintStr.default("100000000"),
      /** referred user must make a purchase of at least this many minor units to qualify */
      qualifyMinPurchase: z.number().int().min(0).default(100),
      maxRewardsPerReferrerPerMonth: z.number().int().min(0).default(50),
      maxSignupsPerIpPerDay: z.number().int().min(1).default(3),
    })
    .default({
      enabled: true,
      referrerRewardMicro: "200000000",
      referredRewardMicro: "100000000",
      qualifyMinPurchase: 100,
      maxRewardsPerReferrerPerMonth: 50,
      maxSignupsPerIpPerDay: 3,
    }),
  registrationOpen: z.boolean().default(true),
  maintenanceMode: z.boolean().default(false),
  imageGenerationEnabled: z.boolean().default(true),
  /** worst-case USD reserved per image request (settled at the provider-reported cost) */
  imageReserveUsd: z.string().regex(/^\d+(\.\d+)?$/).default("0.25"),
});

export type PlatformSettings = z.infer<typeof settingsSchema>;
const KEY = "platform";

let cache: { at: number; value: PlatformSettings } | null = null;
const TTL_MS = 15_000;

export async function getSettings(): Promise<PlatformSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const row = await db.systemSetting.findUnique({ where: { key: KEY } });
  const value = settingsSchema.parse(row?.value ?? {});
  cache = { at: Date.now(), value };
  return value;
}

export async function updateSettings(patch: Partial<PlatformSettings>, actorId: string) {
  const current = await getSettings();
  const next = settingsSchema.parse({ ...current, ...patch });
  await db.systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next, updatedBy: actorId },
    update: { value: next, updatedBy: actorId },
  });
  cache = null;
  return { before: current, after: next };
}

export function invalidateSettingsCache() {
  cache = null;
}

export function pricingConfig(s: PlatformSettings, modelMarkupBps?: number | null): PricingConfig {
  return {
    creditsPerUsd: BigInt(s.creditsPerUsd),
    markupBps: BigInt(modelMarkupBps ?? s.globalMarkupBps),
    minChargeMicro: BigInt(s.minChargeMicro),
    maxChargeMicro: BigInt(s.maxChargeMicro),
  };
}

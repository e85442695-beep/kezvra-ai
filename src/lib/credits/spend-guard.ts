import { env } from "@/lib/env";
import { usdToPico } from "@/lib/money";
import { getRedis } from "@/lib/redis";

/**
 * Platform-wide upstream spend control. Tracks estimated + actual OpenRouter spend per UTC day in
 * Redis (picoUSD integers) and refuses new work once the configured ceiling would be crossed.
 * Fails CLOSED if Redis is unreachable in production.
 */
const dayKey = () => `kz:spend:${new Date().toISOString().slice(0, 10)}`;

export class PlatformBudgetError extends Error {
  constructor() {
    super("PLATFORM_BUDGET_EXHAUSTED");
  }
}

export async function holdPlatformBudget(estimatePico: bigint): Promise<BudgetRelease> {
  const limit = usdToPico(env.OPENROUTER_DAILY_BUDGET_USD);
  const r = getRedis();
  const key = dayKey();
  try {
    // INCRBY is atomic; values fit comfortably in int64 picoUSD (~9.2M USD).
    const after = BigInt(await r.incrby(key, estimatePico.toString()));
    await r.expire(key, 60 * 60 * 48);
    if (after > limit) {
      await r.decrby(key, estimatePico.toString());
      throw new PlatformBudgetError();
    }
  } catch (err) {
    if (err instanceof PlatformBudgetError) throw err;
    if (env.NODE_ENV === "production") throw new PlatformBudgetError();
    return async (_actual?: bigint) => {};
  }
  let settled = false;
  return async (actualPico?: bigint) => {
    if (settled) return;
    settled = true;
    const diff = (actualPico ?? 0n) - estimatePico;
    if (diff !== 0n) await r.incrby(key, diff.toString()).catch(() => {});
  };
}

export async function platformSpendToday(): Promise<bigint> {
  try {
    const v = await getRedis().get(dayKey());
    return v ? BigInt(v) : 0n;
  } catch {
    return 0n;
  }
}

export type BudgetRelease = (actualPico?: bigint) => Promise<void>;

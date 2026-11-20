import { getRedis } from "./redis";

export interface RateResult {
  ok: boolean;
  remaining: number;
  resetSec: number;
}

const memory = new Map<string, { n: number; reset: number }>();

/**
 * Fixed-window rate limiter on Redis (atomic INCR + EXPIRE). Falls back to an in-process
 * window if Redis is unavailable (single-instance protection only).
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateResult> {
  const k = `kz:rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  try {
    const r = getRedis();
    const [[, n]] = (await r.multi().incr(k).expire(k, windowSec + 1).exec()) as [[unknown, number]];
    return { ok: n <= limit, remaining: Math.max(0, limit - n), resetSec: windowSec };
  } catch {
    const now = Date.now();
    const e = memory.get(k);
    if (!e || e.reset < now) {
      memory.set(k, { n: 1, reset: now + windowSec * 1000 });
      return { ok: true, remaining: limit - 1, resetSec: windowSec };
    }
    e.n++;
    return { ok: e.n <= limit, remaining: Math.max(0, limit - e.n), resetSec: Math.ceil((e.reset - now) / 1000) };
  }
}

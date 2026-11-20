import { Redis } from "ioredis";
import { env } from "./env";

const g = globalThis as unknown as { redis?: Redis };

export function getRedis(): Redis {
  if (!g.redis) {
    // Fail fast when Redis is down (callers have fallbacks) instead of queueing commands forever.
    g.redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, enableReadyCheck: true, connectTimeout: 2000 });
    g.redis.on("error", () => {
      /* surfaced through health checks; avoid log floods */
    });
  }
  return g.redis;
}

/** BullMQ needs its own connection options object. */
export const bullConnection = () => ({ url: env.REDIS_URL, maxRetriesPerRequest: null as null });

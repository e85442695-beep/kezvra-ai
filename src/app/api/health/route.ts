import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { integrations } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * Liveness: GET /api/health → 200 if the process is up.
 * Readiness: GET /api/health?ready=1 → checks Postgres and Redis (503 on failure).
 * Integration flags show which external services are configured (never their secrets).
 */
export async function GET(req: Request) {
  const ready = new URL(req.url).searchParams.get("ready") === "1";
  if (!ready) return Response.json({ status: "ok" });
  const checks: Record<string, "ok" | "fail"> = {};
  await Promise.all([
    db.$queryRaw`SELECT 1`.then(() => (checks.database = "ok")).catch(() => (checks.database = "fail")),
    Promise.race([getRedis().ping(), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), 2000))])
      .then(() => (checks.redis = "ok"))
      .catch(() => (checks.redis = "fail")),
  ]);
  const ok = Object.values(checks).every((v) => v === "ok");
  return Response.json({ status: ok ? "ok" : "degraded", checks, integrations }, { status: ok ? 200 : 503 });
}

import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";


/**
 * Admin dashboard metrics. Definitions (also shown in the UI):
 *  - Gross revenue: sum of SUCCEEDED/REFUNDED/PARTIALLY_REFUNDED payment amounts, per currency (fiat minor units; Stars separately).
 *  - Refunds: refunded amounts per currency.
 *  - Upstream cost: sum of actual OpenRouter cost (AIRequest.costPico), USD.
 *  - Consumed credit value: credits charged ÷ creditsPerUsd → USD at the current tariff.
 *  - Gross margin (usage): (consumed value − upstream cost) ÷ consumed value.
 */
export async function dashboardStats(days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const s = await getSettings();
  // One read-only batch on a single connection (consistent snapshot, light on the pool).
  const [usersTotal, newUsers, activeRows, requests, cost, payments, byModel, daily] = await db.$transaction([
    db.user.count({ where: { status: { not: "DELETED" } } }),
    db.user.count({ where: { createdAt: { gte: since } } }),
    db.aIRequest.groupBy({ by: ["userId"], where: { createdAt: { gte: since } } }),
    db.aIRequest.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true }),
    db.aIRequest.aggregate({ where: { createdAt: { gte: since }, status: "SUCCEEDED" }, _sum: { costPico: true, chargedMicro: true, promptTokens: true, completionTokens: true } }),
    db.payment.groupBy({ by: ["currency", "provider"], where: { createdAt: { gte: since }, status: { in: ["SUCCEEDED", "REFUNDED", "PARTIALLY_REFUNDED", "DISPUTED"] } }, _sum: { amount: true, refundedAmount: true }, _count: true }),
    db.aIRequest.groupBy({ by: ["modelId"], where: { createdAt: { gte: since }, status: "SUCCEEDED" }, _count: true, _sum: { costPico: true, chargedMicro: true }, orderBy: { _count: { modelId: "desc" } }, take: 15 }),
    db.$queryRaw<{ day: Date; requests: bigint; cost: bigint | null; charged: bigint | null; signups: bigint }[]>`
      WITH d AS (SELECT generate_series(date_trunc('day', ${since}::timestamptz), date_trunc('day', now()), interval '1 day') AS day)
      SELECT d.day,
        (SELECT count(*) FROM "AIRequest" r WHERE date_trunc('day', r."createdAt") = d.day)::bigint AS requests,
        (SELECT sum(r."costPico") FROM "AIRequest" r WHERE date_trunc('day', r."createdAt") = d.day AND r.status = 'SUCCEEDED')::bigint AS cost,
        (SELECT sum(r."chargedMicro") FROM "AIRequest" r WHERE date_trunc('day', r."createdAt") = d.day AND r.status = 'SUCCEEDED')::bigint AS charged,
        (SELECT count(*) FROM "User" u WHERE date_trunc('day', u."createdAt") = d.day)::bigint AS signups
      FROM d ORDER BY d.day`,
  ]);
  const activeUsers = activeRows.length;
  const creditsPerUsd = BigInt(s.creditsPerUsd);
  const costPico = cost._sum.costPico ?? 0n;
  const chargedMicro = cost._sum.chargedMicro ?? 0n;
  // consumed value in picoUSD = micro × 10^6 / creditsPerUsd
  const consumedPico = creditsPerUsd > 0n ? (chargedMicro * 1_000_000n) / creditsPerUsd : 0n;
  const marginBps = consumedPico > 0n ? Number(((consumedPico - costPico) * 10_000n) / consumedPico) : null;
  const toUsd = (pico: bigint) => Number(pico / 1_000_000n) / 1e6; // display only

  return {
    range: { days, since },
    users: { total: usersTotal, new: newUsers, active: activeUsers },
    requests: Object.fromEntries(requests.map((r) => [r.status, r._count])),
    tokens: { prompt: cost._sum.promptTokens ?? 0, completion: cost._sum.completionTokens ?? 0 },
    upstreamCostUsd: toUsd(costPico),
    consumedValueUsd: toUsd(consumedPico),
    usageMarginPct: marginBps == null ? null : marginBps / 100,
    revenue: payments.map((p) => ({ provider: p.provider, currency: p.currency, count: p._count, gross: p._sum.amount ?? 0, refunded: p._sum.refundedAmount ?? 0, net: (p._sum.amount ?? 0) - (p._sum.refundedAmount ?? 0) })),
    byModel: byModel.map((m) => ({ modelId: m.modelId, requests: m._count, costUsd: toUsd(m._sum.costPico ?? 0n), creditsCharged: Number((m._sum.chargedMicro ?? 0n) / 10_000n) / 100 })),
    daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), requests: Number(d.requests), costUsd: toUsd(d.cost ?? 0n), credits: Number((d.charged ?? 0n) / 10_000n) / 100, signups: Number(d.signups) })),
  };
}

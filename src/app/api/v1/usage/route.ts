import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, json } from "@/lib/http/route";
import { authenticateApiKey } from "@/lib/apikeys";
import { getBalance } from "@/lib/credits/ledger";
import { formatCredits } from "@/lib/money";

export const dynamic = "force-dynamic";

/** GET /api/v1/usage — balance and this key's usage over the last 30 days. */
export async function GET(req: NextRequest) {
  try {
    const { key } = await authenticateApiKey(req.headers.get("authorization"), "usage");
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [bal, agg] = await Promise.all([
      getBalance(key.userId),
      db.apiUsage.aggregate({ where: { apiKeyId: key.id, createdAt: { gte: since } }, _sum: { promptTokens: true, completionTokens: true, chargedMicro: true }, _count: true }),
    ]);
    return json({
      balance_credits: formatCredits(bal.available, 6),
      key: {
        id: key.id,
        spent_credits: formatCredits(key.spent, 6),
        spend_limit_credits: key.spendLimit != null ? formatCredits(key.spendLimit, 6) : null,
        rate_limit_rpm: key.rateLimitRpm,
      },
      last_30_days: {
        requests: agg._count,
        prompt_tokens: agg._sum.promptTokens ?? 0,
        completion_tokens: agg._sum.completionTokens ?? 0,
        credits: formatCredits(agg._sum.chargedMicro ?? 0n, 6),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

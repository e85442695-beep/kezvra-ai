import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { getUsableModel } from "@/lib/openrouter/models";
import { getBalance } from "@/lib/credits/ledger";

export const GET = route(async () => {
  const me = await requireUser();
  const [balance, stats] = await Promise.all([
    getBalance(me.id),
    db.aIRequest.aggregate({ where: { userId: me.id, status: "SUCCEEDED" }, _count: true, _sum: { promptTokens: true, completionTokens: true, chargedMicro: true } }),
  ]);
  const byModel = await db.aIRequest.groupBy({ by: ["modelId"], where: { userId: me.id, status: "SUCCEEDED" }, _count: true, _sum: { chargedMicro: true }, orderBy: { _count: { modelId: "desc" } }, take: 10 });
  return json({ user: me, balance, stats: { requests: stats._count, promptTokens: stats._sum.promptTokens ?? 0, completionTokens: stats._sum.completionTokens ?? 0, spentMicro: stats._sum.chargedMicro ?? 0n, byModel } });
});

const schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  image: z.string().url().max(500).startsWith("https://").nullable().optional(),
  locale: z.enum(["uk", "en"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  defaultModelId: z.string().max(200).nullable().optional(),
  favoriteModelIds: z.array(z.string().max(200)).max(50).optional(),
});

export const PATCH = route(async (req) => {
  const me = await requireUser();
  const input = await body(req, schema);
  if (input.defaultModelId && !(await getUsableModel(input.defaultModelId))) throw new HttpError(400, "MODEL_UNAVAILABLE");
  const user = await db.user.update({ where: { id: me.id }, data: input, select: { id: true, name: true, image: true, locale: true, theme: true, defaultModelId: true, favoriteModelIds: true } });
  return json({ user });
});

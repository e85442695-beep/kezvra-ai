import { db, type AIModel } from "@/lib/db";
import { getSettings, pricingConfig } from "@/lib/settings";
import { picoToMicroCredits } from "@/lib/pricing";
import { effectivePrices } from "@/lib/ai/executor";
import { formatCredits, formatUsd } from "@/lib/money";

/** Public-safe model DTO: upstream USD prices + credits per 1M tokens at the current tariff. */
export async function toPublicModels(models: AIModel[]) {
  const s = await getSettings();
  return models.map((m) => {
    const cfg = pricingConfig(s, m.markupBps);
    const p = effectivePrices(m);
    const variable = p !== null && !m.isFree && m.promptPricePico === 0n && m.completionPricePico === 0n;
    return {
      id: m.id,
      name: m.name,
      provider: m.provider,
      description: m.description,
      contextLength: m.contextLength,
      maxCompletion: m.maxCompletion,
      inputModalities: m.inputModalities,
      outputModalities: m.outputModalities,
      supportedParams: m.supportedParams,
      imageOptions: (m.imageOptions ?? null) as { aspectRatios: string[]; maxInputImages: number } | null,
      categories: m.categories,
      isFree: m.isFree,
      featured: m.featured,
      available: m.available && m.enabled,
      variablePricing: variable,
      usdPerMInput: formatUsd(m.promptPricePico * 1_000_000n, 4),
      usdPerMOutput: formatUsd(m.completionPricePico * 1_000_000n, 4),
      creditsPerMInput: formatCredits(picoToMicroCredits(p.promptPricePico * 1_000_000n, cfg), 2),
      creditsPerMOutput: formatCredits(picoToMicroCredits(p.completionPricePico * 1_000_000n, cfg), 2),
      lastSyncedAt: m.lastSyncedAt,
    };
  });
}

export type PublicModel = Awaited<ReturnType<typeof toPublicModels>>[number];

export async function listPublicModels(opts: { category?: string; q?: string; includeUnavailable?: boolean } = {}) {
  const models = await db.aIModel.findMany({
    where: {
      enabled: true,
      ...(opts.includeUnavailable ? {} : { available: true }),
      ...(opts.category ? { categories: { has: opts.category } } : {}),
      ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { id: { contains: opts.q, mode: "insensitive" } }, { provider: { contains: opts.q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ featured: "desc" }, { name: "asc" }],
    take: 1000,
  });
  return toPublicModels(models);
}

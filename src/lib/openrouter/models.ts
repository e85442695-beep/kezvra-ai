import { db } from "@/lib/db";
import { usdToPico } from "@/lib/money";
import { listImageModels, listModels, type ORModel } from "./client";

export const CATEGORIES = ["general", "coding", "reasoning", "free", "fast", "premium", "vision", "documents", "image"] as const;
export type Category = (typeof CATEGORIES)[number];

const PREMIUM_COMPLETION_PICO = usdToPico("0.00001"); // ≥ $10 per 1M output tokens

function price(p: Record<string, string | undefined> | undefined, k: string): bigint {
  const v = p?.[k];
  if (v == null || v === "") return 0n;
  try {
    const n = usdToPico(v);
    return n < 0n ? 0n : n; // OpenRouter uses "-1" for variable pricing (e.g. openrouter/auto) → treat as unknown
  } catch {
    return 0n;
  }
}

/**
 * Category labels derived only from data returned by the OpenRouter Models API:
 * pricing, architecture modalities and supported_parameters. Name-based hints
 * ("coder", "flash", …) are heuristics and documented as such in the UI.
 */
export function categorize(m: ORModel): Category[] {
  const cats = new Set<Category>();
  const inMods = m.architecture?.input_modalities ?? [];
  const outMods = m.architecture?.output_modalities ?? [];
  const params = paramNames(m);
  const id = m.id.toLowerCase();
  const prompt = price(m.pricing, "prompt");
  const completion = price(m.pricing, "completion");

  if (id.endsWith(":free") || (prompt === 0n && completion === 0n && m.pricing?.prompt === "0")) cats.add("free");
  if (inMods.includes("image")) cats.add("vision");
  if (inMods.includes("file")) cats.add("documents");
  if (outMods.includes("image")) cats.add("image");
  if (params.includes("reasoning") || params.includes("include_reasoning")) cats.add("reasoning");
  if (/(coder|codestral|devstral|code)/.test(id)) cats.add("coding");
  if (/(flash|mini|nano|haiku|lite|instant|turbo|small)/.test(id)) cats.add("fast");
  if (completion >= PREMIUM_COMPLETION_PICO) cats.add("premium");
  if (outMods.includes("text") && !cats.has("image") && inMods.includes("text")) cats.add("general");
  return [...cats];
}

export function paramNames(m: ORModel): string[] {
  const sp = m.supported_parameters;
  if (!sp) return [];
  return Array.isArray(sp) ? sp : Object.keys(sp);
}

/** Real image options from /images/models (aspect ratios, max reference images). */
export function imageOptionsOf(m: ORModel) {
  const sp = m.supported_parameters;
  if (!sp || Array.isArray(sp)) return null;
  return {
    aspectRatios: sp.aspect_ratio?.values?.filter((v) => v !== "auto") ?? [],
    maxInputImages: sp.input_references?.max ?? 0,
  };
}

export function providerOf(id: string) {
  return id.split("/")[0] ?? "unknown";
}

export function mapModel(m: ORModel) {
  const cats = categorize(m);
  return {
    id: m.id,
    canonicalSlug: m.canonical_slug ?? null,
    name: m.name,
    provider: providerOf(m.id),
    description: m.description ?? null,
    contextLength: m.context_length ?? null,
    maxCompletion: m.top_provider?.max_completion_tokens ?? null,
    promptPricePico: price(m.pricing, "prompt"),
    completionPricePico: price(m.pricing, "completion"),
    imagePricePico: price(m.pricing, "image"),
    requestPricePico: price(m.pricing, "request"),
    inputModalities: m.architecture?.input_modalities ?? ["text"],
    outputModalities: m.architecture?.output_modalities ?? ["text"],
    supportedParams: paramNames(m),
    imageOptions: imageOptionsOf(m) ?? undefined,
    categories: cats,
    isFree: cats.includes("free"),
  };
}

/**
 * Upsert the upstream catalog. Admin flags (enabled, featured, markupBps) are preserved.
 * Models that disappeared upstream are marked unavailable (never deleted — requests reference them).
 */
export async function syncModels() {
  const [text, images] = await Promise.all([listModels(), listImageModels().catch(() => [] as ORModel[])]);
  const byId = new Map<string, ORModel>();
  for (const m of [...text, ...images]) byId.set(m.id, { ...byId.get(m.id), ...m });

  const now = new Date();
  let upserted = 0;
  for (const m of byId.values()) {
    const data = mapModel(m);
    await db.aIModel.upsert({
      where: { id: data.id },
      create: { ...data, available: true, lastSyncedAt: now },
      update: { ...data, available: true, lastSyncedAt: now },
    });
    upserted++;
  }
  const gone = await db.aIModel.updateMany({
    where: { lastSyncedAt: { lt: now }, available: true },
    data: { available: false },
  });
  return { upserted, markedUnavailable: gone.count };
}

export async function getUsableModel(id: string) {
  const m = await db.aIModel.findUnique({ where: { id } });
  if (!m || !m.enabled || !m.available) return null;
  return m;
}

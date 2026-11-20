import { BPS, ceilDiv, maxBig, minBig, PICO_PER_USD } from "./money";

/**
 * Pricing rules (all integers):
 *   creditsMicro = ceil( costPico × creditsPerUsd × (10000 + markupBps) / 10000 / 10^6 )
 * where creditsPerUsd is "how many whole credits one USD of upstream cost becomes".
 * picoUSD × credits/USD = picoCredits; / 10^6 → microcredits.
 */
export interface PricingConfig {
  /** whole credits per 1 USD of upstream cost (admin setting) */
  creditsPerUsd: bigint;
  /** markup in basis points applied on top of upstream cost (model override or global) */
  markupBps: bigint;
  /** minimum charge per request, microcredits (0 = none) */
  minChargeMicro: bigint;
  /** maximum charge per request, microcredits (0 = no cap) */
  maxChargeMicro: bigint;
}

export interface ModelPrices {
  promptPricePico: bigint; // per token
  completionPricePico: bigint; // per token
  requestPricePico: bigint; // per request
  imagePricePico: bigint; // per input image
}

/** Serializable snapshot stored on each AIRequest so the tariff is fixed per transaction. */
export interface PricingSnapshot {
  creditsPerUsd: string;
  markupBps: string;
  minChargeMicro: string;
  maxChargeMicro: string;
  promptPricePico: string;
  completionPricePico: string;
  requestPricePico: string;
  imagePricePico: string;
}

export function snapshot(cfg: PricingConfig, prices: ModelPrices): PricingSnapshot {
  return {
    creditsPerUsd: cfg.creditsPerUsd.toString(),
    markupBps: cfg.markupBps.toString(),
    minChargeMicro: cfg.minChargeMicro.toString(),
    maxChargeMicro: cfg.maxChargeMicro.toString(),
    promptPricePico: prices.promptPricePico.toString(),
    completionPricePico: prices.completionPricePico.toString(),
    requestPricePico: prices.requestPricePico.toString(),
    imagePricePico: prices.imagePricePico.toString(),
  };
}

export function fromSnapshot(s: PricingSnapshot): { cfg: PricingConfig; prices: ModelPrices } {
  return {
    cfg: {
      creditsPerUsd: BigInt(s.creditsPerUsd),
      markupBps: BigInt(s.markupBps),
      minChargeMicro: BigInt(s.minChargeMicro),
      maxChargeMicro: BigInt(s.maxChargeMicro),
    },
    prices: {
      promptPricePico: BigInt(s.promptPricePico),
      completionPricePico: BigInt(s.completionPricePico),
      requestPricePico: BigInt(s.requestPricePico),
      imagePricePico: BigInt(s.imagePricePico),
    },
  };
}

/** Upstream USD cost (picoUSD) → credits (micro), with markup; NOT yet min/max-clamped. */
export function picoToMicroCredits(costPico: bigint, cfg: PricingConfig): bigint {
  if (costPico <= 0n) return 0n;
  const numerator = costPico * cfg.creditsPerUsd * (BPS + cfg.markupBps);
  return ceilDiv(numerator, BPS * 1_000_000n);
}

/** Apply minimum / maximum request charge. */
export function clampCharge(micro: bigint, cfg: PricingConfig): bigint {
  let v = micro;
  if (cfg.minChargeMicro > 0n) v = maxBig(v, cfg.minChargeMicro);
  if (cfg.maxChargeMicro > 0n) v = minBig(v, cfg.maxChargeMicro);
  return v;
}

export function tokenCostPico(prices: ModelPrices, promptTokens: number, completionTokens: number, images = 0): bigint {
  return (
    prices.promptPricePico * BigInt(promptTokens) +
    prices.completionPricePico * BigInt(completionTokens) +
    prices.imagePricePico * BigInt(images) +
    prices.requestPricePico
  );
}

/**
 * Worst-case estimate used for the reservation: full prompt + max completion tokens.
 * A safety factor (bps) covers tokenizer drift between our estimate and the provider's count.
 */
export function estimateReservation(
  prices: ModelPrices,
  cfg: PricingConfig,
  estPromptTokens: number,
  maxCompletionTokens: number,
  images = 0,
  safetyBps = 1500n,
): bigint {
  const promptWithSafety = Number(ceilDiv(BigInt(estPromptTokens) * (BPS + safetyBps), BPS));
  const pico = tokenCostPico(prices, promptWithSafety, maxCompletionTokens, images);
  return clampCharge(picoToMicroCredits(pico, cfg), cfg);
}

/**
 * Final charge. Prefers the provider-reported cost (OpenRouter `usage.cost`, USD) when present —
 * it reflects caching discounts and provider routing — else computes from token counts.
 */
export function computeCharge(
  prices: ModelPrices,
  cfg: PricingConfig,
  usage: { promptTokens: number; completionTokens: number; images?: number; upstreamCostPico?: bigint | null },
): { costPico: bigint; chargeMicro: bigint } {
  const costPico =
    usage.upstreamCostPico != null && usage.upstreamCostPico >= 0n
      ? usage.upstreamCostPico
      : tokenCostPico(prices, usage.promptTokens, usage.completionTokens, usage.images ?? 0);
  return { costPico, chargeMicro: clampCharge(picoToMicroCredits(costPico, cfg), cfg) };
}

/**
 * Largest completion budget that keeps the worst-case charge within `availableMicro`.
 * Used to cap `max_tokens` so a request can never exceed the user's balance.
 */
export function maxAffordableCompletionTokens(
  prices: ModelPrices,
  cfg: PricingConfig,
  estPromptTokens: number,
  availableMicro: bigint,
  hardCap: number,
): number {
  if (prices.completionPricePico === 0n) return hardCap;
  // available credits → pico USD budget (floor): micro × 10^6 × BPS / (creditsPerUsd × (BPS+markup))
  const denom = cfg.creditsPerUsd * (BPS + cfg.markupBps);
  if (denom === 0n) return 0;
  const budgetPico = (availableMicro * 1_000_000n * BPS) / denom;
  const fixed = prices.promptPricePico * BigInt(Math.ceil(estPromptTokens * 1.15)) + prices.requestPricePico;
  if (budgetPico <= fixed) return 0;
  const tokens = (budgetPico - fixed) / prices.completionPricePico;
  return Number(minBig(tokens, BigInt(hardCap)));
}

/** Crude but conservative token estimator (≈ 3 chars/token, errs on the high side for Cyrillic/code). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3) + 4;
}

export const usdPerCreditDisplay = (cfg: PricingConfig) =>
  cfg.creditsPerUsd > 0n ? Number(PICO_PER_USD / cfg.creditsPerUsd) / 1e12 : 0; // display only

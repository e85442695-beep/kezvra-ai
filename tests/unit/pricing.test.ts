import { describe, expect, it } from "vitest";
import {
  clampCharge, computeCharge, estimateReservation, fromSnapshot, maxAffordableCompletionTokens,
  picoToMicroCredits, snapshot, tokenCostPico, type ModelPrices, type PricingConfig,
} from "@/lib/pricing";
import { usdToPico } from "@/lib/money";

const cfg: PricingConfig = { creditsPerUsd: 1000n, markupBps: 2500n, minChargeMicro: 0n, maxChargeMicro: 0n };
const prices: ModelPrices = {
  promptPricePico: usdToPico("0.000003"), // $3 / M
  completionPricePico: usdToPico("0.000015"), // $15 / M
  requestPricePico: 0n,
  imagePricePico: 0n,
};

describe("pricing", () => {
  it("converts $1 upstream at 1000 cr/$ +25% to 1250 credits", () => {
    expect(picoToMicroCredits(usdToPico("1"), cfg)).toBe(1_250_000_000n);
  });
  it("always rounds up in favour of the platform (never undercharges)", () => {
    expect(picoToMicroCredits(1n, cfg)).toBe(1n);
    expect(picoToMicroCredits(0n, cfg)).toBe(0n);
  });
  it("computes token cost exactly", () => {
    // 1000 prompt × $3/M + 500 completion × $15/M = $0.003 + $0.0075 = $0.0105
    expect(tokenCostPico(prices, 1000, 500)).toBe(usdToPico("0.0105"));
  });
  it("prefers upstream reported cost", () => {
    const r = computeCharge(prices, cfg, { promptTokens: 1000, completionTokens: 500, upstreamCostPico: usdToPico("0.002") });
    expect(r.costPico).toBe(usdToPico("0.002"));
    expect(r.chargeMicro).toBe(2_500_000n); // 0.002 × 1000 × 1.25 = 2.5 credits
  });
  it("applies min and max clamps", () => {
    const c = { ...cfg, minChargeMicro: 100_000n, maxChargeMicro: 5_000_000n };
    expect(clampCharge(1n, c)).toBe(100_000n);
    expect(clampCharge(99_000_000n, c)).toBe(5_000_000n);
  });
  it("reservation ≥ any actual charge for the same token budget", () => {
    const reserve = estimateReservation(prices, cfg, 1000, 2000);
    const { chargeMicro } = computeCharge(prices, cfg, { promptTokens: 1000, completionTokens: 2000 });
    expect(reserve).toBeGreaterThanOrEqual(chargeMicro);
  });
  it("caps completion tokens to what the balance can pay", () => {
    const available = 10_000_000n; // 10 credits = $0.008 upstream before markup
    const t = maxAffordableCompletionTokens(prices, cfg, 100, available, 100_000);
    const worst = estimateReservation(prices, cfg, 100, t);
    expect(worst).toBeLessThanOrEqual(available);
    expect(t).toBeGreaterThan(0);
    expect(maxAffordableCompletionTokens(prices, cfg, 100, 0n, 100_000)).toBe(0);
  });
  it("snapshot round-trips", () => {
    const s = snapshot(cfg, prices);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(fromSnapshot(s).prices.completionPricePico).toBe(prices.completionPricePico);
  });
});

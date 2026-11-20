import { describe, expect, it } from "vitest";
import { ceilDiv, formatCredits, formatScaled, parseDecimal, usdToPico } from "@/lib/money";

describe("parseDecimal", () => {
  it("parses OpenRouter per-token prices exactly", () => {
    expect(usdToPico("0.0000025")).toBe(2_500_000n);
    expect(usdToPico("0.000000075")).toBe(75_000n);
    expect(usdToPico("0")).toBe(0n);
    expect(usdToPico("15")).toBe(15_000_000_000_000n);
  });
  it("handles exponent notation", () => {
    expect(usdToPico("1e-7")).toBe(100_000n);
    expect(usdToPico("2.5E-6")).toBe(2_500_000n);
    expect(usdToPico("1.5e2")).toBe(150_000_000_000_000n);
    expect(usdToPico(1e-7)).toBe(100_000n);
  });
  it("rounds half-up on excess precision", () => {
    expect(parseDecimal("0.0000005", 6)).toBe(1n);
    expect(parseDecimal("0.0000004", 6)).toBe(0n);
    expect(parseDecimal("-1.25", 1)).toBe(-13n);
  });
  it("rejects garbage", () => {
    expect(() => parseDecimal("abc", 6)).toThrow();
    expect(() => parseDecimal("1.2.3", 6)).toThrow();
    expect(() => parseDecimal(Number.NaN, 6)).toThrow();
  });
  it("has no float drift (0.1 + 0.2)", () => {
    expect(parseDecimal("0.1", 12) + parseDecimal("0.2", 12)).toBe(parseDecimal("0.3", 12));
  });
});

describe("formatting", () => {
  it("formats credits", () => {
    expect(formatCredits(3_500_000_000n)).toBe("3500.00");
    expect(formatCredits(1_234_567n, 4)).toBe("1.2345");
    expect(formatScaled(-1_500_000n, 6, 1)).toBe("-1.5");
    expect(formatScaled(5n, 6, 0)).toBe("0");
  });
  it("ceilDiv", () => {
    expect(ceilDiv(10n, 3n)).toBe(4n);
    expect(ceilDiv(9n, 3n)).toBe(3n);
    expect(ceilDiv(0n, 3n)).toBe(0n);
    expect(() => ceilDiv(1n, 0n)).toThrow();
  });
});

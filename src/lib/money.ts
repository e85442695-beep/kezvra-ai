/**
 * Exact fixed-point money helpers. NO floating point is used for any amount.
 *
 *  - USD:     BigInt picoUSD   (1 USD    = 10^12 pico)
 *  - Credits: BigInt micro     (1 credit = 10^6 micro)
 */

export const PICO_PER_USD = 1_000_000_000_000n;
export const MICRO_PER_CREDIT = 1_000_000n;
export const BPS = 10_000n;

const DECIMAL_RE = /^(-)?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/**
 * Parse a decimal string (e.g. OpenRouter "0.0000025" or "1e-7") into an integer scaled by 10^scale.
 * Rounds half-up away from zero on excess precision. Throws on malformed input.
 */
export function parseDecimal(input: string | number, scale: number): bigint {
  const str = typeof input === "number" ? numberToPlainString(input) : input.trim();
  const m = DECIMAL_RE.exec(str);
  if (!m) throw new Error(`Invalid decimal: ${String(input)}`);
  const neg = m[1] === "-";
  let intPart = m[2]!;
  let frac = m[3] ?? "";
  const exp = m[4] ? Number.parseInt(m[4], 10) : 0;
  // apply exponent by shifting the decimal point
  if (exp > 0) {
    const shift = frac.slice(0, exp).padEnd(exp, "0");
    intPart = intPart + shift;
    frac = frac.slice(exp);
  } else if (exp < 0) {
    const n = -exp;
    const padded = intPart.padStart(n + 1, "0");
    frac = padded.slice(padded.length - n) + frac;
    intPart = padded.slice(0, padded.length - n);
  }
  const kept = frac.slice(0, scale).padEnd(scale, "0");
  const rest = frac.slice(scale);
  let value = BigInt(intPart + kept);
  if (rest.length > 0 && rest[0]! >= "5") value += 1n;
  return neg ? -value : value;
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Invalid number: ${n}`);
  // toString may produce exponent form; parseDecimal handles exponents.
  return n.toString();
}

/** Format a scaled integer as a decimal string with `digits` fractional digits (truncating toward zero). */
export function formatScaled(value: bigint, scale: number, digits: number): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const base = 10n ** BigInt(scale);
  const int = abs / base;
  let frac = (abs % base).toString().padStart(scale, "0").slice(0, digits);
  if (digits === 0) frac = "";
  return `${neg ? "-" : ""}${int.toString()}${frac ? "." + frac : ""}`;
}

export const usdToPico = (usd: string | number) => parseDecimal(usd, 12);
export const creditsToMicro = (credits: string | number) => parseDecimal(credits, 6);
export const formatCredits = (micro: bigint, digits = 2) => formatScaled(micro, 6, digits);
export const formatUsd = (pico: bigint, digits = 6) => formatScaled(pico, 12, digits);

/** Integer ceil division for non-negative operands. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new Error("ceilDiv: divisor must be positive");
  if (a <= 0n) return a / b; // floor toward zero for ≤ 0 — callers never pass negatives
  return (a + b - 1n) / b;
}

export const minBig = (a: bigint, b: bigint) => (a < b ? a : b);
export const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);

/** JSON-safe serialization of bigint fields (as strings). */
export function bigintReplacer(_k: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() : v;
}

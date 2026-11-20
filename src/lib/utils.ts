import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** microcredits (bigint or string) → "12.34" (display only, exact integer math) */
export function credits(micro: bigint | string | number | null | undefined, digits = 2) {
  if (micro == null) return "0";
  const v = typeof micro === "bigint" ? micro : BigInt(micro);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const int = a / 1_000_000n;
  const frac = (a % 1_000_000n).toString().padStart(6, "0").slice(0, digits);
  const intStr = int.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${intStr}${digits ? "." + frac : ""}`;
}

export function formatDate(d: string | Date, locale: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }) {
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-US", opts).format(new Date(d));
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

/** Format minor units for display (fiat cents or Stars). */
export function money(amount: number, currency: string, locale: string) {
  if (currency === "XTR") return `${amount} ⭐`;
  return new Intl.NumberFormat(locale === "uk" ? "uk-UA" : "en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
}

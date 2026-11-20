import { uk, type Dict } from "./uk";
import { en } from "./en";

export const LOCALES = ["uk", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const dictionaries: Record<Locale, Dict> = { uk, en };
export const isLocale = (v: unknown): v is Locale => v === "uk" || v === "en";
export type { Dict };

/** "{n} items" interpolation */
export function fmt(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

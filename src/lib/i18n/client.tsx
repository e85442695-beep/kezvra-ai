"use client";
import { createContext, useContext } from "react";
import { dictionaries, type Dict, type Locale } from "./index";

const Ctx = createContext<{ locale: Locale; t: Dict }>({ locale: "uk", t: dictionaries.uk });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={{ locale, t: dictionaries[locale] }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

export function setLocaleCookie(locale: Locale) {
  document.cookie = `kz-locale=${locale}; path=/; max-age=31536000; samesite=lax`;
}

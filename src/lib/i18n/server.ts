import { cookies, headers } from "next/headers";
import { dictionaries, isLocale, type Locale } from "./index";

/** Locale resolution: `kz-locale` cookie → Accept-Language → "uk". */
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get("kz-locale")?.value;
  if (isLocale(c)) return c;
  const al = (await headers()).get("accept-language") ?? "";
  return /^en/i.test(al) && !/uk|ru/i.test(al.split(",")[0] ?? "") ? "en" : "uk";
}

export async function getDict() {
  const locale = await getLocale();
  return { locale, t: dictionaries[locale] };
}

import type { Metadata } from "next";
import { ProsePage } from "@/components/layout/prose-page";
import { getDict } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Changelog" };

/** Release notes. Add a new entry at the top for each deploy. */
const entries = [
  {
    version: "0.1.0",
    date: "2026-11-20",
    uk: ["Перший реліз: чат зі стрімінгом, каталог моделей OpenRouter, Image Studio, аналіз файлів, порівняння моделей", "Система Kezvra Credits із резервуванням і ledger", "Оплата через Stripe, адаптер Telegram Stars", "API для розробників /api/v1, реферальна програма, адмінпанель"],
    en: ["First release: streaming chat, OpenRouter model catalog, Image Studio, file analysis, model comparison", "Kezvra Credits with reservations and a ledger", "Stripe payments, Telegram Stars adapter", "Developer API /api/v1, referral program, admin panel"],
  },
];

export default async function ChangelogPage() {
  const { locale, t } = await getDict();
  return (
    <ProsePage title={t.nav.changelog}>
      {entries.map((e) => (
        <section key={e.version}>
          <h2>
            {e.version} <span className="font-mono text-sm font-normal text-faint">{e.date}</span>
          </h2>
          <ul>{(locale === "en" ? e.en : e.uk).map((l) => <li key={l}>{l}</li>)}</ul>
        </section>
      ))}
    </ProsePage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { getDict } from "@/lib/i18n/server";
import { listPublicModels } from "@/lib/models-query";
import { CATEGORIES } from "@/lib/openrouter/models";
import { Badge } from "@/components/ui/misc";
import { cn, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "AI models", description: "Catalog of AI models synced from OpenRouter: context window, prices and capabilities.", alternates: { canonical: "/models" } };
export const revalidate = 300;

export default async function ModelsPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string; page?: string }> }) {
  const { t, locale } = await getDict();
  const sp = await searchParams;
  const category = sp.category && (CATEGORIES as readonly string[]).includes(sp.category) ? sp.category : undefined;
  const q = sp.q?.slice(0, 100);
  const all = await listPublicModels({ category, q }).catch(() => []);
  const PER_PAGE = 60;
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const pageNo = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const models = all.slice((pageNo - 1) * PER_PAGE, pageNo * PER_PAGE);
  const pageHref = (n: number) => `/models?${new URLSearchParams({ ...(category ? { category } : {}), ...(q ? { q } : {}), page: String(n) })}`;
  const lastSync = all.reduce<Date | null>((a, m) => (!a || m.lastSyncedAt > a ? m.lastSyncedAt : a), null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-medium tracking-[-0.02em]">{t.models.title}</h1>
      <p className="mt-2 max-w-3xl text-muted">{t.models.sub}</p>
      {lastSync && <p className="mt-1 text-xs text-muted">{t.models.lastSync}: {formatDate(lastSync, locale)}</p>}

      <form className="mt-6 flex max-w-md items-center gap-2" role="search">
        {category && <input type="hidden" name="category" value={category} />}
        <label htmlFor="mq" className="sr-only">{t.chat.searchModels}</label>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input id="mq" name="q" defaultValue={q} placeholder={t.chat.searchModels} className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm" />
        </div>
      </form>

      <nav aria-label="Categories" className="mt-4 flex flex-wrap gap-2">
        {[undefined, ...CATEGORIES].map((c) => (
          <Link
            key={c ?? "all"}
            href={c ? `/models?category=${c}` : "/models"}
            aria-current={c === category ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm transition-colors", c === category ? "border-primary bg-primary/10 text-primary" : "border-border text-muted hover:text-text")}
          >
            {c ? t.models.cats[c] : t.models.all}
          </Link>
        ))}
      </nav>
      <p className="mt-2 text-xs text-muted">{t.models.heuristicNote}</p>

      {models.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted">{t.models.noModels}</p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">{t.models.title}</caption>
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Model</th>
                <th scope="col" className="px-4 py-3 font-medium">{t.models.context}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t.models.input} $/1M</th>
                <th scope="col" className="px-4 py-3 font-medium">{t.models.output} $/1M</th>
                <th scope="col" className="px-4 py-3 font-medium">{t.models.capabilities}</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-t border-border hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <Link href={`/models/${encodeURIComponent(m.id)}`} className="font-medium hover:text-primary">{m.name}</Link>
                    <div className="text-xs text-muted">{m.id}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{m.contextLength ? m.contextLength.toLocaleString("en-US") : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{m.isFree ? t.common.free : m.variablePricing ? t.models.variable : m.usdPerMInput}</td>
                  <td className="px-4 py-3 tabular-nums">{m.isFree ? t.common.free : m.variablePricing ? t.models.variable : m.usdPerMOutput}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">{m.categories.map((c) => <Badge key={c} tone={c === "free" ? "success" : "default"}>{t.models.cats[c] ?? c}</Badge>)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="font-mono text-xs text-faint">{(pageNo - 1) * PER_PAGE + 1}–{Math.min(pageNo * PER_PAGE, all.length)} / {all.length}</span>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <Link key={n} href={pageHref(n)} aria-current={n === pageNo ? "page" : undefined} className={cn("grid h-8 min-w-8 place-items-center rounded-md border px-2 font-mono text-xs", n === pageNo ? "border-transparent bg-elevated text-text" : "border-border text-muted hover:text-text")}>{n}</Link>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

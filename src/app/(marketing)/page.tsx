import Link from "next/link";
import { ArrowRight, Boxes, Code2, FileText, GitCompare, ImageIcon, Scale } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/misc";
import { HeroDemo } from "@/components/landing/hero-demo";
import { Reveal } from "@/components/landing/reveal";
import { getDict } from "@/lib/i18n/server";
import { db } from "@/lib/db";
import { listPublicModels, type PublicModel } from "@/lib/models-query";
import { getSettings } from "@/lib/settings";
import { credits, money } from "@/lib/utils";
import { env } from "@/lib/env";

export const revalidate = 600;

async function loadData() {
  try {
    const [models, packages, catCounts, s] = await Promise.all([
      listPublicModels(),
      db.creditPackage.findMany({ where: { active: true, provider: "STRIPE" }, orderBy: { sortOrder: "asc" } }),
      db.$queryRaw<{ cat: string; n: bigint }[]>`SELECT unnest("categories") AS cat, count(*) AS n FROM "AIModel" WHERE enabled AND available GROUP BY 1`,
      getSettings(),
    ]);
    return { models, packages, catCounts: Object.fromEntries(catCounts.map((c) => [c.cat, Number(c.n)])), creditsPerUsd: s.creditsPerUsd, ok: true };
  } catch {
    return { models: [] as PublicModel[], packages: [], catCounts: {} as Record<string, number>, creditsPerUsd: "1000", ok: false };
  }
}

export default async function Landing() {
  const { t, locale } = await getDict();
  const { models, packages, catCounts, creditsPerUsd } = await loadData();
  const featured = (models.filter((m) => m.featured).length ? models.filter((m) => m.featured) : models).slice(0, 8);
  const L = t.landing;

  const features = [
    { icon: Boxes, t: L.f1t, d: L.f1d },
    { icon: FileText, t: L.f2t, d: L.f2d },
    { icon: ImageIcon, t: L.f3t, d: L.f3d },
    { icon: GitCompare, t: L.f4t, d: L.f4d },
    { icon: Code2, t: L.f5t, d: L.f5d },
    { icon: Scale, t: L.f6t, d: L.f6d },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "Kezvra AI", url: env.APP_URL, logo: `${env.APP_URL}/icon.svg` },
      { "@type": "SoftwareApplication", name: "Kezvra AI", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: env.APP_URL, description: L.heroSubtitle },
      { "@type": "FAQPage", mainEntity: t.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1fr_1.1fr] lg:gap-16 lg:py-20">
          <div>
            <p className="mb-6 font-mono text-xs text-faint">{models.length > 0 ? `${models.length} ${t.nav.models.toLowerCase()} · OpenRouter` : "OpenRouter"}</p>
            <h1 className="text-[40px] font-medium leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-[64px]">{L.heroTitle}</h1>
            <p className="mt-6 max-w-[36rem] text-lg leading-7 text-muted">{L.heroSubtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonVariants({ size: "lg" })}>{L.ctaStart} <ArrowRight /></Link>
              <Link href="/models" className={buttonVariants({ size: "lg", variant: "secondary" })}>{L.ctaModels}</Link>
            </div>
          </div>
          <HeroDemo />
        </div>
      </section>

      {/* Popular models */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6" aria-labelledby="models-h">
        <Reveal>
          <h2 id="models-h" className="text-3xl font-medium tracking-[-0.02em]">{L.popularModels}</h2>
          <p className="mt-2 max-w-2xl text-muted">{L.popularModelsSub}</p>
        </Reveal>
        {featured.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">{t.models.noModels}</p>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((m) => (
              <li key={m.id}>
                <Link href={`/models/${encodeURIComponent(m.id)}`} className="group block h-full rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-elevated">
                  <div className="font-mono text-xs text-faint">{m.provider}</div>
                  <div className="mt-1 font-medium">{m.name}</div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {m.isFree && <Badge tone="success">{t.common.free}</Badge>}
                    {m.categories.slice(0, 3).map((c) => <Badge key={c}>{t.models.cats[c] ?? c}</Badge>)}
                  </div>
                  <div className="mt-4 font-mono text-xs text-faint tabular-nums">
                    {m.contextLength ? `${(m.contextLength / 1000).toFixed(0)}K ctx · ` : ""}
                    {m.isFree ? t.common.free : m.variablePricing ? t.models.variable : `$${m.usdPerMInput} ${L.perMInput}`}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Features */}
      <section className="border-y border-border bg-surface/40" aria-labelledby="features-h">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <h2 id="features-h" className="text-3xl font-medium tracking-[-0.02em]">{L.features}</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.t} delay={i * 0.05}>
                <Card className="h-full p-6">
                  <f.icon className="size-[18px] text-faint" strokeWidth={1.5} aria-hidden />
                  <h3 className="mt-4 text-[15px] font-medium">{f.t}</h3>
                  <p className="mt-2 text-sm text-muted">{f.d}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Capability comparison — real counts from the synced catalog */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6" aria-labelledby="cmp-h">
        <h2 id="cmp-h" className="text-3xl font-medium tracking-[-0.02em]">{L.compareTitle}</h2>
        <div className="mt-8 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">{L.compareTitle}</caption>
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">{t.models.capabilities}</th>
                <th scope="col" className="px-4 py-3 font-medium">{t.nav.models}</th>
                <th scope="col" className="px-4 py-3 font-medium">Kezvra</th>
              </tr>
            </thead>
            <tbody>
              {(["general", "coding", "reasoning", "vision", "documents", "image", "free"] as const).map((c) => (
                <tr key={c} className="border-t border-border">
                  <th scope="row" className="px-4 py-3 text-left font-normal">{t.models.cats[c]}</th>
                  <td className="px-4 py-3 tabular-nums">{catCounts[c] ?? 0}</td>
                  <td className="px-4 py-3">
                    <Link className="text-primary hover:underline" href={`/models?category=${c}`}>{t.common.open} →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">{t.models.heuristicNote}</p>
      </section>

      {/* Images + documents */}
      <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-20 sm:px-6 lg:grid-cols-2">
        <Card className="p-8">
          <ImageIcon className="size-[18px] text-faint" strokeWidth={1.5} aria-hidden />
          <h2 className="mt-4 text-2xl font-medium">{L.imagesTitle}</h2>
          <p className="mt-2 text-muted">{L.imagesSub}</p>
          <Link href="/images" className={buttonVariants({ variant: "secondary", className: "mt-6" })}>{t.nav.images} <ArrowRight /></Link>
        </Card>
        <Card className="p-8">
          <FileText className="size-[18px] text-faint" strokeWidth={1.5} aria-hidden />
          <h2 className="mt-4 text-2xl font-medium">{L.docsTitle}</h2>
          <p className="mt-2 text-muted">{L.docsSub}</p>
          <Link href="/files" className={buttonVariants({ variant: "secondary", className: "mt-6" })}>{t.nav.files} <ArrowRight /></Link>
        </Card>
      </section>

      {/* Credits */}
      <section className="border-y border-border bg-surface/40" aria-labelledby="credits-h">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 id="credits-h" className="text-3xl font-medium tracking-[-0.02em]">{L.creditsTitle}</h2>
            <p className="mt-4 text-muted">{L.creditsSub}</p>
          </div>
          <figure className="rounded-2xl border border-border bg-bg p-6 font-mono text-[13px]" aria-label={L.creditsTitle}>
            <figcaption className="mb-4 flex justify-between text-xs text-faint">
              <span>{locale === "en" ? "Request" : "Запит"} · openai/gpt-4o-mini</span>
              <span>1 USD = {creditsPerUsd} cr</span>
            </figcaption>
            <dl className="divide-y divide-dashed divide-border">
              {(locale === "en"
                ? [["Reserved before the request", "−2.400000", ""], ["Actual cost from provider", "/usr/bin/bash.000336", ""], ["Charged (+ markup)", "−0.420000", "key"], ["Returned to balance", "+1.980000", ""]]
                : [["Резерв перед запитом", "−2.400000", ""], ["Фактична вартість у провайдера", "/usr/bin/bash.000336", ""], ["Списано (+ націнка)", "−0.420000", "key"], ["Повернуто на баланс", "+1.980000", ""]]
              ).map(([k, v, key]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className={key ? "text-primary tabular-nums" : "tabular-nums"}>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-faint">{locale === "en" ? "Example. Amounts in credits, 6 decimal places, no floating point." : "Приклад. Суми в кредитах, 6 знаків після коми, без floating point."}</p>
          </figure>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6" aria-labelledby="pricing-h">
        <h2 id="pricing-h" className="text-3xl font-medium tracking-[-0.02em]">{L.pricingTitle}</h2>
        <p className="mt-2 text-muted">{L.pricingSub}</p>
        {packages.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">{L.noPackages}</p>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {packages.map((p, i) => (
              <Card key={p.id} className={i === 1 ? "bg-elevated p-6" : "p-6"}>
                <h3 className="font-medium">{p.name}</h3>
                <div className="mt-3 text-[32px] font-medium leading-none tabular-nums">{money(p.priceAmount, p.currency, locale)}</div>
                <div className="mt-3 font-mono text-xs text-faint tabular-nums">
                  {credits(p.credits, 0)} {t.common.credits}
                  {p.bonusCredits > 0n && <span> + {credits(p.bonusCredits, 0)} bonus</span>}
                </div>
                {p.description && <p className="mt-3 text-sm text-muted">{p.description}</p>}
                <Link href="/billing" className={buttonVariants({ variant: i === 1 ? "primary" : "secondary", className: "mt-6 w-full" })}>{t.billing.buy}</Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6" aria-labelledby="faq-h">
        <h2 id="faq-h" className="text-3xl font-medium tracking-[-0.02em]">{L.faqTitle}</h2>
        <div className="mt-8 divide-y divide-border rounded-xl border border-border">
          {t.faq.map(([q, a]) => (
            <details key={q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q}
                <span aria-hidden className="text-muted transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Testimonials — real only */}
      <section className="mx-auto max-w-3xl px-4 pb-24 text-center sm:px-6" aria-labelledby="t-h">
        <h2 id="t-h" className="text-2xl font-medium">{L.testimonialsTitle}</h2>
        <p className="mt-3 text-sm text-muted">{L.testimonialsEmpty}</p>
      </section>
    </>
  );
}

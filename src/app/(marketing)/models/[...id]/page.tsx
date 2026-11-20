import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { toPublicModels } from "@/lib/models-query";
import { getDict } from "@/lib/i18n/server";
import { Badge, Card } from "@/components/ui/misc";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export const revalidate = 300;

async function load(idParts: string[]) {
  const id = idParts.map(decodeURIComponent).join("/");
  const m = await db.aIModel.findFirst({ where: { id, enabled: true } }).catch(() => null);
  if (!m) return null;
  return (await toPublicModels([m]))[0]!;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string[] }> }): Promise<Metadata> {
  const m = await load((await params).id);
  if (!m) return { title: "Model not found" };
  return { title: `${m.name} (${m.provider})`, description: m.description?.slice(0, 160) ?? undefined, alternates: { canonical: `/models/${m.id}` } };
}

export default async function ModelPage({ params }: { params: Promise<{ id: string[] }> }) {
  const m = await load((await params).id);
  if (!m) notFound();
  const { t, locale } = await getDict();
  const rows: [string, string][] = [
    [t.models.context, m.contextLength ? `${m.contextLength.toLocaleString("en-US")} tokens` : "—"],
    ["Max output", m.maxCompletion ? `${m.maxCompletion.toLocaleString("en-US")} tokens` : "—"],
    [`${t.models.input} (USD)`, m.isFree ? t.common.free : m.variablePricing ? t.models.variable : `$${m.usdPerMInput} ${t.landing.perMInput}`],
    [`${t.models.output} (USD)`, m.isFree ? t.common.free : m.variablePricing ? t.models.variable : `$${m.usdPerMOutput} ${t.landing.perMOutput}`],
    [`${t.models.input} (Kezvra)`, m.isFree ? t.common.free : `${m.creditsPerMInput} ${t.common.credits} ${t.landing.perMInput}`],
    [`${t.models.output} (Kezvra)`, m.isFree ? t.common.free : `${m.creditsPerMOutput} ${t.common.credits} ${t.landing.perMOutput}`],
    ["Input", m.inputModalities.join(", ")],
    ["Output", m.outputModalities.join(", ")],
  ];
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <Link href="/models" className="text-sm text-muted hover:text-text">← {t.nav.models}</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-xs text-faint">{m.provider}</div>
          <h1 className="text-3xl font-medium tracking-[-0.02em]">{m.name}</h1>
          <code className="mt-1 block text-xs text-muted">{m.id}</code>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={m.available ? "success" : "danger"}>{m.available ? t.models.available : t.models.unavailable}</Badge>
          {m.outputModalities.includes("text") && (
            <Link href={`/chat?model=${encodeURIComponent(m.id)}`} className={buttonVariants()}>{t.models.tryInChat}</Link>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1">{m.categories.map((c) => <Badge key={c}>{t.models.cats[c] ?? c}</Badge>)}</div>
      {m.description && <p className="mt-6 whitespace-pre-line text-muted">{m.description}</p>}
      <Card className="mt-8 overflow-hidden">
        <dl className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-2 gap-4 px-5 py-3 text-sm">
              <dt className="text-muted">{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      {m.supportedParams.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium">Supported parameters</h2>
          <div className="mt-2 flex flex-wrap gap-1">{m.supportedParams.map((p) => <Badge key={p}>{p}</Badge>)}</div>
        </div>
      )}
      <p className="mt-6 text-xs text-muted">{t.models.lastSync}: {formatDate(m.lastSyncedAt, locale)} · OpenRouter</p>
    </div>
  );
}

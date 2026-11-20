"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, ErrorState, PageHeader, Skeleton, Stat } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { useI18n } from "@/lib/i18n/client";
import { credits, formatDate, money } from "@/lib/utils";

interface Pkg { id: string; name: string; description: string | null; provider: "STRIPE" | "TELEGRAM_STARS"; priceAmount: number; currency: string; credits: string; bonusCredits: string }
interface Summary {
  balance: { bonus: string; purchased: string; reserved: string; available: string };
  transactions: { id: string; type: string; bucket: string; amount: string; balanceAfter: string; note: string | null; createdAt: string }[];
  payments: { id: string; provider: string; status: string; amount: number; currency: string; creditsGranted: string; bonusGranted: string; refundedAmount: number; receiptUrl: string | null; createdAt: string }[];
}

export function BillingView({ packages, stripeReady }: { packages: Pkg[]; stripeReady: boolean }) {
  const { t, locale } = useI18n();
  const sp = useSearchParams();
  const { data, loading, error, reload } = useFetch<Summary>("/api/billing/summary");
  const [buying, setBuying] = useState<string | null>(null);
  const status = sp.get("status");

  async function buy(p: Pkg) {
    setBuying(p.id);
    try {
      const r = await api<{ url: string }>("/api/billing/checkout", { method: "POST", body: { packageId: p.id, provider: p.provider } });
      window.location.assign(r.url);
    } catch (e) {
      toast.error(t.errors[e instanceof ApiError ? e.code : ""] ?? t.common.error);
      setBuying(null);
    }
  }

  const tone = (s: string) => (s === "SUCCEEDED" ? "success" : s === "FAILED" || s === "DISPUTED" ? "danger" : s.includes("REFUND") ? "warning" : "default") as "success" | "danger" | "warning" | "default";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader title={t.billing.title} />
      {status === "success" && <p role="status" className="mb-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm">{t.billing.success}</p>}
      {status === "cancelled" && <p role="status" className="mb-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">{t.billing.cancelled}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !data ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)
        ) : data ? (
          <>
            <Stat label={t.billing.balance} value={<span className="text-primary">{credits(data.balance.available)}</span>} />
            <Stat label={t.billing.purchased} value={credits(data.balance.purchased)} />
            <Stat label={t.billing.bonus} value={credits(data.balance.bonus)} />
            <Stat label={t.billing.reserved} value={credits(data.balance.reserved)} />
          </>
        ) : null}
      </div>
      {error && <div className="mt-4"><ErrorState title={t.common.error} action={<Button variant="secondary" onClick={reload}>{t.common.retry}</Button>} /></div>}

      <section className="mt-10" aria-labelledby="pk-h">
        <h2 id="pk-h" className="mb-4 text-lg font-medium">{t.billing.packages}</h2>
        {!stripeReady && <p className="mb-4 text-sm text-muted">{t.errors.PAYMENTS_NOT_CONFIGURED}</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {packages.map((p) => (
            <Card key={p.id} className="flex flex-col p-5">
              <h3 className="font-medium">{p.name}</h3>
              <div className="mt-3 text-[28px] font-medium leading-none tabular-nums">{money(p.priceAmount, p.currency, locale)}</div>
              <div className="mt-3 font-mono text-xs text-faint tabular-nums">
                {credits(p.credits, 0)} {t.common.credits}{BigInt(p.bonusCredits) > 0n ? ` + ${credits(p.bonusCredits, 0)} bonus` : ""}
              </div>
              {p.description && <p className="mt-2 text-sm text-muted">{p.description}</p>}
              <div className="mt-auto pt-5">
                {p.provider === "TELEGRAM_STARS" ? (
                  <p className="text-xs text-faint">{t.billing.telegramOnly}</p>
                ) : (
                  <Button className="w-full" disabled={!stripeReady || buying !== null} onClick={() => buy(p)}>{buying === p.id && <Loader2 className="animate-spin" />} {t.billing.buy}</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="tx-h">
          <h2 id="tx-h" className="mb-4 text-lg font-medium">{t.billing.history}</h2>
          <Card>
            <ul className="divide-y divide-border">
              {data?.transactions.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{t.common.empty}</li>}
              {data?.transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div>{t.billing.tx[tx.type] ?? tx.type}</div>
                    <div className="font-mono text-xs text-faint">{formatDate(tx.createdAt, locale)}</div>
                  </div>
                  <span className="font-mono tabular-nums">{BigInt(tx.amount) > 0n ? "+" : ""}{credits(tx.amount, 6)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
        <section aria-labelledby="pay-h">
          <h2 id="pay-h" className="mb-4 text-lg font-medium">{t.billing.payments}</h2>
          <Card>
            <ul className="divide-y divide-border">
              {data?.payments.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{t.common.empty}</li>}
              {data?.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="tabular-nums">{money(p.amount, p.currency, locale)} · {credits(BigInt(p.creditsGranted) + BigInt(p.bonusGranted), 0)} cr</div>
                    <div className="font-mono text-xs text-faint">{formatDate(p.createdAt, locale)} · {p.provider}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={tone(p.status)}>{t.billing.status[p.status] ?? p.status}</Badge>
                    {p.receiptUrl && <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-text" aria-label={t.billing.receipt}><ExternalLink className="size-4" /></a>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>
    </div>
  );
}

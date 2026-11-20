"use client";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, ErrorState, PageHeader, Skeleton, Stat } from "@/components/ui/misc";
import { useFetch } from "@/hooks/use-fetch";
import { useI18n } from "@/lib/i18n/client";
import { fmt } from "@/lib/i18n";
import { credits, formatDate } from "@/lib/utils";

interface R {
  code: string;
  link: string;
  program: { enabled: boolean; referrerRewardMicro: string; referredRewardMicro: string };
  stats: { invited: number; pending: number; converted: number; rejected: number; conversionRate: number; totalEarnedMicro: string; rewards: { id: string; amount: string; kind: string; createdAt: string }[] };
}

export function ReferralsView() {
  const { t, locale } = useI18n();
  const { data, error } = useFetch<R>("/api/referrals");
  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success(t.common.copied);
  };
  if (error) return <div className="p-8"><ErrorState title={t.common.error} /></div>;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title={t.referrals.title} description={t.referrals.sub} />
      {!data ? (
        <Skeleton className="h-40" />
      ) : !data.program.enabled ? (
        <p className="text-sm text-muted">{t.referrals.disabled}</p>
      ) : (
        <>
          <Card className="space-y-4 p-5">
            <p className="text-sm">{fmt(t.referrals.you, { a: credits(data.program.referrerRewardMicro, 0), b: credits(data.program.referredRewardMicro, 0) })}</p>
            <div className="space-y-1.5">
              <label htmlFor="ref-link" className="text-sm font-medium">{t.referrals.link}</label>
              <div className="flex gap-2">
                <Input id="ref-link" readOnly value={data.link} onFocus={(e) => e.currentTarget.select()} />
                <Button variant="secondary" size="icon" aria-label={t.common.copy} onClick={() => copy(data.link)}><Copy /></Button>
              </div>
            </div>
            <p className="text-sm text-muted">{t.referrals.code}: <kbd className="rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-text">{data.code}</kbd></p>
          </Card>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Stat label={t.referrals.invited} value={data.stats.invited} />
            <Stat label={t.referrals.converted} value={data.stats.converted} hint={`${Math.round(data.stats.conversionRate * 100)}%`} />
            <Stat label={t.referrals.earned} value={credits(data.stats.totalEarnedMicro, 0)} />
          </div>
          <h2 className="mb-3 mt-8 text-lg font-medium">{t.referrals.rewards}</h2>
          <Card>
            <ul className="divide-y divide-border">
              {data.stats.rewards.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">{t.common.empty}</li>}
              {data.stats.rewards.map((r) => (
                <li key={r.id} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="font-mono text-xs text-faint">{formatDate(r.createdAt, locale)}</span>
                  <span className="font-mono tabular-nums">+{credits(r.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

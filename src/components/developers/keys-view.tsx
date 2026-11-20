"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { api, ApiError } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { useI18n } from "@/lib/i18n/client";
import { credits, formatDate } from "@/lib/utils";

interface Key {
  id: string; name: string; prefix: string; scopes: string[]; allowedModels: string[]; spendLimit: string | null; spent: string; rateLimitRpm: number;
  lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string;
  usage30d: { _count: number; _sum: { promptTokens: number | null; completionTokens: number | null; chargedMicro: string | null } } | null;
}

export function KeysView({ baseUrl }: { baseUrl: string }) {
  const { t, locale } = useI18n();
  const { data, loading, reload } = useFetch<{ keys: Key[] }>("/api/keys");
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", spendLimit: "", rpm: "60", expires: "", scopes: { chat: true, models: true, usage: true } });
  const err = (e: unknown) => toast.error(t.errors[e instanceof ApiError ? e.code : ""] ?? (e instanceof ApiError ? e.code : t.common.error));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ secret: string }>("/api/keys", {
        method: "POST",
        body: {
          name: form.name,
          scopes: Object.entries(form.scopes).filter(([, v]) => v).map(([k]) => k),
          spendLimit: form.spendLimit || null,
          rateLimitRpm: Number(form.rpm) || 60,
          expiresInDays: form.expires ? Number(form.expires) : null,
        },
      });
      setOpen(false);
      setSecret(r.secret);
      reload();
    } catch (e2) {
      err(e2);
    }
  }

  const active = data?.keys.filter((k) => !k.revokedAt) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title={t.developers.title}
        description={t.developers.sub}
        actions={
          <>
            <Button variant="secondary" asChild><Link href="/docs/api">{t.developers.docs}</Link></Button>
            <Button onClick={() => setOpen(true)}><Plus /> {t.developers.create}</Button>
          </>
        }
      />
      <Card className="mb-6 p-4 font-mono text-xs text-muted">
        <span className="text-faint">Base URL</span> {baseUrl}/api/v1
      </Card>

      {loading && !data ? (
        <Skeleton className="h-40" />
      ) : active.length === 0 ? (
        <EmptyState icon={<KeyRound />} title={t.common.empty} action={<Button onClick={() => setOpen(true)}><Plus /> {t.developers.create}</Button>} />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">{t.developers.keys}</caption>
            <thead className="text-left text-xs text-faint">
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-2.5 font-normal">{t.developers.name}</th>
                <th scope="col" className="px-4 py-2.5 font-normal">{t.developers.scopes}</th>
                <th scope="col" className="px-4 py-2.5 font-normal">{t.developers.spent}</th>
                <th scope="col" className="px-4 py-2.5 font-normal">{t.developers.usage30}</th>
                <th scope="col" className="px-4 py-2.5 font-normal">{t.developers.lastUsed}</th>
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {active.map((k) => (
                <tr key={k.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div>{k.name}</div>
                    <code className="text-xs text-faint">{k.prefix}…</code>
                  </td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{k.scopes.map((s) => <Badge key={s}>{s}</Badge>)}</div></td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums">{credits(k.spent, 4)}{k.spendLimit ? ` / ${credits(k.spendLimit, 0)}` : ""}</td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-muted">
                    {k.usage30d ? `${k.usage30d._count} req · ${(k.usage30d._sum.promptTokens ?? 0) + (k.usage30d._sum.completionTokens ?? 0)} tok` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-faint">{k.lastUsedAt ? formatDate(k.lastUsedAt, locale, { dateStyle: "short", timeStyle: "short" }) : t.developers.never}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`${t.developers.rotate} ${k.name}`} onClick={() => api<{ secret: string }>(`/api/keys/${k.id}`, { method: "POST" }).then((r) => { setSecret(r.secret); reload(); }).catch(err)}><RotateCw /></Button>
                      <Button size="icon-sm" variant="ghost" aria-label={`${t.developers.revoke} ${k.name}`} onClick={() => confirm(`${t.developers.revoke}?`) && api(`/api/keys/${k.id}`, { method: "DELETE" }).then(reload).catch(err)}><Trash2 /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t.developers.create}>
          <form onSubmit={create} className="space-y-4">
            <Field label={t.developers.name}>{(p) => <Input {...p} required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">{t.developers.scopes}</legend>
              <div className="flex gap-4">
                {(["chat", "models", "usage"] as const).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-[var(--text)]" checked={form.scopes[s]} onChange={(e) => setForm({ ...form, scopes: { ...form.scopes, [s]: e.target.checked } })} /> {s}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t.developers.spendLimit}>{(p) => <Input {...p} inputMode="decimal" value={form.spendLimit} onChange={(e) => setForm({ ...form, spendLimit: e.target.value })} />}</Field>
              <Field label={t.developers.rpm}>{(p) => <Input {...p} type="number" min={1} max={600} value={form.rpm} onChange={(e) => setForm({ ...form, rpm: e.target.value })} />}</Field>
              <Field label={t.developers.expires}>{(p) => <Input {...p} type="number" min={1} max={730} value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} />}</Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
              <Button type="submit" disabled={!form.name.trim()}>{t.developers.create}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(secret)} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent title="API key" description={t.developers.secretOnce}>
          <div className="flex gap-2">
            <Input readOnly value={secret ?? ""} className="font-mono text-xs" aria-label="API key" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" size="icon" aria-label={t.common.copy} onClick={() => { navigator.clipboard.writeText(secret ?? ""); toast.success(t.common.copied); }}><Copy /></Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge, Card, ErrorState, PageHeader, Skeleton, Stat } from "@/components/ui/misc";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/menu";
import { SupportView } from "@/components/support/support-view";
import { api, ApiError } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { useI18n } from "@/lib/i18n/client";
import { bytes, credits, formatDate, money } from "@/lib/utils";

const toastErr = (e: unknown) => toast.error(e instanceof ApiError ? e.code : "Error");

/** Every admin mutation asks for a reason; the server records it in AdminAction. */
function askReason(label: string) {
  const r = window.prompt(label);
  return r && r.trim().length >= 3 ? r.trim() : null;
}

export function AdminPanel({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  const A = t.admin;
  const tabs: [string, string, boolean][] = [
    ["dashboard", A.dashboard, isAdmin],
    ["users", A.users, true],
    ["models", A.models, isAdmin],
    ["packages", A.packages, isAdmin],
    ["payments", A.payments, isAdmin],
    ["settings", A.settings, isAdmin],
    ["support", A.support, true],
    ["announce", A.announce, isAdmin],
    ["audit", A.audit, isAdmin],
    ["admin-actions", "Admin actions", isAdmin],
    ["keys", A.keys, isAdmin],
    ["files", A.files, isAdmin],
    ["referrals", A.referrals, isAdmin],
    ["errors", A.logs, isAdmin],
  ];
  const visible = tabs.filter(([, , ok]) => ok);
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6">
      <PageHeader title={A.title} />
      <Tabs defaultValue={visible[0]![0]}>
        <TabsList className="mb-6">
          {visible.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="dashboard"><Dashboard /></TabsContent>
        <TabsContent value="users"><Users isAdmin={isAdmin} /></TabsContent>
        <TabsContent value="models"><Models /></TabsContent>
        <TabsContent value="packages"><Packages /></TabsContent>
        <TabsContent value="payments"><Payments /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
        <TabsContent value="support"><SupportView staff /></TabsContent>
        <TabsContent value="announce"><Announce /></TabsContent>
        {(["audit", "admin-actions", "keys", "files", "referrals", "errors"] as const).map((v) => (
          <TabsContent key={v} value={v}><OpsTable view={v} /></TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

// ───────────── Dashboard ─────────────

interface Stats {
  users: { total: number; new: number; active: number };
  requests: Record<string, number>;
  tokens: { prompt: number; completion: number };
  upstreamCostUsd: number;
  consumedValueUsd: number;
  usageMarginPct: number | null;
  revenue: { provider: string; currency: string; count: number; gross: number; refunded: number; net: number }[];
  byModel: { modelId: string; requests: number; costUsd: number; creditsCharged: number }[];
  daily: { day: string; requests: number; costUsd: number; credits: number; signups: number }[];
}

function Dashboard() {
  const { locale } = useI18n();
  const [days, setDays] = useState(30);
  const { data, error, loading } = useFetch<Stats>(`/api/admin/stats?days=${days}`);
  if (error) return <ErrorState title={error} />;
  if (loading || !data) return <div className="grid gap-4 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  const req = Object.values(data.requests).reduce((a, b) => a + b, 0);
  const usd = (n: number) => `$${n.toFixed(n > 0 && n < 1 ? 4 : 2)}`;
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Select aria-label="Period" className="w-40" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>{d} days</option>)}
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={data.users.total.toLocaleString("en-US")} hint={`+${data.users.new} new · ${data.users.active} active, last ${days}d`} />
        <Stat label="AI requests" value={req.toLocaleString("en-US")} hint={`${data.requests.FAILED ?? 0} failed`} />
        <Stat label="OpenRouter cost" value={usd(data.upstreamCostUsd)} hint={`Credits consumed worth ${usd(data.consumedValueUsd)}`} />
        <Stat label="Usage margin" value={data.usageMarginPct == null ? "—" : `${data.usageMarginPct.toFixed(1)}%`} hint="(consumed value − cost) ÷ consumed value" />
      </div>
      <Card className="p-5">
        <h2 className="mb-4 text-sm text-muted">Requests per day</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.daily} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: "var(--faint)", fontSize: 11, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fill: "var(--faint)", fontSize: 11, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ background: "var(--elevated)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="requests" stroke="var(--primary)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="signups" stroke="var(--faint)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="border-b border-border px-4 py-3 text-sm text-muted">Revenue</h2>
          <ul className="divide-y divide-border">
            {data.revenue.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">—</li>}
            {data.revenue.map((r) => (
              <li key={r.provider + r.currency} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{r.provider} · {r.count} payments</span>
                <span className="font-mono tabular-nums">{money(r.gross, r.currency, locale)} gross · {money(r.refunded, r.currency, locale)} refunded · <span className="text-primary">{money(r.net, r.currency, locale)} net</span></span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="border-b border-border px-4 py-3 text-sm text-muted">Top models</h2>
          <ul className="divide-y divide-border">
            {data.byModel.map((m) => {
              const max = data.byModel[0]?.requests || 1;
              return (
                <li key={m.modelId} className="px-4 py-2.5 text-sm">
                  <div className="flex justify-between gap-4"><span className="truncate">{m.modelId}</span><span className="font-mono text-xs text-faint tabular-nums">{m.requests} · ${m.costUsd.toFixed(3)} · {m.creditsCharged} cr</span></div>
                  <div className="mt-1.5 h-1 rounded-full bg-elevated"><div className="h-1 rounded-full bg-text/40" style={{ width: `${(m.requests / max) * 100}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ───────────── Users ─────────────

interface U { id: string; email: string; name: string | null; role: string; status: string; emailVerified: string | null; createdAt: string; wallet: { bonusBalance: string; purchasedBalance: string } | null; _count: { aiRequests: number; payments: number } }

function Users({ isAdmin }: { isAdmin: boolean }) {
  const { locale, t } = useI18n();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data, reload } = useFetch<{ users: U[] }>(`/api/admin/users?q=${encodeURIComponent(query)}`);
  const [adjust, setAdjust] = useState<U | null>(null);
  const [form, setForm] = useState({ amount: "", bucket: "BONUS", reason: "" });

  const act = async (body: object) => {
    try {
      await api("/api/admin/users", { method: "POST", body });
      toast.success(t.common.saved);
      reload();
    } catch (e) {
      toastErr(e);
    }
  };
  return (
    <div className="space-y-4">
      <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
        <label htmlFor="uq" className="sr-only">{t.common.search}</label>
        <Input id="uq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="email, name, id" />
        <Button type="submit" variant="secondary" size="icon" aria-label={t.common.search}><Search /></Button>
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-faint"><tr className="border-b border-border">{["User", "Role", "Status", "Balance", "Requests", "Joined", ""].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5"><div>{u.email}</div><div className="font-mono text-xs text-faint">{u.id}{u.emailVerified ? "" : " · unverified"}</div></td>
                <td className="px-4 py-2.5">
                  {isAdmin ? (
                    <Select aria-label={`Role ${u.email}`} className="h-8 w-36" value={u.role} onChange={(e) => { const reason = askReason(t.admin.reason); if (reason) act({ action: "role", userId: u.id, role: e.target.value, reason }); }}>
                      {["USER", "MODERATOR", "ADMIN", "SUPER_ADMIN"].map((r) => <option key={r}>{r}</option>)}
                    </Select>
                  ) : <Badge>{u.role}</Badge>}
                </td>
                <td className="px-4 py-2.5"><Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>{u.status}</Badge></td>
                <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{credits(BigInt(u.wallet?.bonusBalance ?? 0) + BigInt(u.wallet?.purchasedBalance ?? 0))}</td>
                <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{u._count.aiRequests} · {u._count.payments} pay</td>
                <td className="px-4 py-2.5 font-mono text-xs text-faint">{formatDate(u.createdAt, locale, { dateStyle: "short" })}</td>
                <td className="px-4 py-2.5">
                  {isAdmin && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setAdjust(u); setForm({ amount: "", bucket: "BONUS", reason: "" }); }}>Credits</Button>
                      {u.status === "ACTIVE" ? (
                        <Button size="sm" variant="ghost" onClick={() => { const reason = askReason(t.admin.reason); if (reason) act({ action: "status", userId: u.id, status: "BANNED", reason }); }}>Block</Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => { const reason = askReason(t.admin.reason); if (reason) act({ action: "status", userId: u.id, status: "ACTIVE", reason }); }}>Unblock</Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Dialog open={Boolean(adjust)} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent title={`Adjust credits · ${adjust?.email ?? ""}`} description="Signed amount in credits, e.g. 100 or -25.5. Recorded in the ledger and audit log.">
          <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (!adjust) return; await act({ action: "credits", userId: adjust.id, amount: form.amount, bucket: form.bucket, reason: form.reason, idempotencyKey: crypto.randomUUID() }); setAdjust(null); }}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">{(p) => <Input {...p} required pattern="-?\d+(\.\d{1,6})?" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />}</Field>
              <Field label="Bucket">{(p) => <Select {...p} value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })}><option>BONUS</option><option>PURCHASED</option></Select>}</Field>
            </div>
            <Field label={t.admin.reason}>{(p) => <Input {...p} required minLength={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />}</Field>
            <div className="flex justify-end"><Button type="submit">{t.common.save}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───────────── Models ─────────────

interface M { id: string; name: string; provider: string; enabled: boolean; featured: boolean; markupBps: number | null; upstreamAvailable: boolean; isFree: boolean; usdPerMInput: string; usdPerMOutput: string }

function Models() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const { data, reload, loading } = useFetch<{ models: M[] }>(`/api/admin/models?q=${encodeURIComponent(query)}`);
  const [syncing, setSyncing] = useState(false);
  const patch = async (ids: string[], data: object) => {
    const reason = askReason("Reason (recorded in audit log)");
    if (!reason) return;
    try {
      await api("/api/admin/models", { method: "PATCH", body: { ids, reason, ...data } });
      reload();
    } catch (e) {
      toastErr(e);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <form className="flex max-w-md flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
          <label htmlFor="mq2" className="sr-only">Search</label>
          <Input id="mq2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="model id or name" />
          <Button type="submit" variant="secondary" size="icon" aria-label="Search"><Search /></Button>
        </form>
        <Button variant="secondary" disabled={syncing} onClick={async () => {
          setSyncing(true);
          try {
            const r = await api<{ upserted: number; markedUnavailable: number }>("/api/admin/models", { method: "POST" });
            toast.success(`Synced ${r.upserted}, ${r.markedUnavailable} unavailable`);
            reload();
          } catch (e) { toastErr(e); } finally { setSyncing(false); }
        }}>{syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync from OpenRouter</Button>
      </div>
      {loading && !data ? <Skeleton className="h-64" /> : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="text-left text-xs text-faint"><tr className="border-b border-border">{["Model", "$/1M in · out", "Upstream", "Enabled", "Featured", "Markup, bps", ""].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {data?.models.slice(0, 300).map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2"><div>{m.name}</div><div className="font-mono text-xs text-faint">{m.id}</div></td>
                  <td className="px-4 py-2 font-mono text-xs tabular-nums">{m.isFree ? "free" : `${m.usdPerMInput} · ${m.usdPerMOutput}`}</td>
                  <td className="px-4 py-2"><Badge tone={m.upstreamAvailable ? "success" : "danger"}>{m.upstreamAvailable ? "ok" : "gone"}</Badge></td>
                  <td className="px-4 py-2"><Switch label={`Enable ${m.id}`} checked={m.enabled} onCheckedChange={(v) => patch([m.id], { enabled: v })} /></td>
                  <td className="px-4 py-2"><Switch label={`Feature ${m.id}`} checked={m.featured} onCheckedChange={(v) => patch([m.id], { featured: v })} /></td>
                  <td className="px-4 py-2 font-mono text-xs">{m.markupBps ?? "global"}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => {
                      const v = window.prompt("Markup in basis points (2500 = +25%). Empty = use global.", m.markupBps?.toString() ?? "");
                      if (v === null) return;
                      patch([m.id], { markupBps: v.trim() === "" ? null : Number(v) });
                    }}>Markup</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(data?.models.length ?? 0) > 300 && <p className="px-4 py-3 text-xs text-faint">Showing 300 of {data?.models.length}. Use search to narrow.</p>}
        </Card>
      )}
    </div>
  );
}

// ───────────── Packages ─────────────

interface P { id: string; slug: string; name: string; description: string | null; provider: string; priceAmount: number; currency: string; credits: string; bonusCredits: string; active: boolean; sortOrder: number }
const emptyPkg = { id: "", slug: "", name: "", description: "", provider: "STRIPE", priceAmount: "", currency: "usd", credits: "", bonusCredits: "0", active: true, sortOrder: "0", reason: "" };

function Packages() {
  const { locale, t } = useI18n();
  const { data, reload } = useFetch<{ packages: P[] }>("/api/admin/packages");
  const [edit, setEdit] = useState<typeof emptyPkg | null>(null);
  const set = (k: keyof typeof emptyPkg) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setEdit((x) => x && { ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button onClick={() => setEdit(emptyPkg)}>{t.common.new}</Button></div>
      <Card>
        <ul className="divide-y divide-border">
          {data?.packages.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <div>
                <div>{p.name} {!p.active && <Badge>inactive</Badge>}</div>
                <div className="font-mono text-xs text-faint">{p.slug} · {p.provider} · {money(p.priceAmount, p.currency, locale)} → {credits(p.credits, 0)} + {credits(p.bonusCredits, 0)} cr</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEdit({ ...p, description: p.description ?? "", priceAmount: String(p.priceAmount), credits: credits(p.credits, 6).replace(/ /g, ""), bonusCredits: credits(p.bonusCredits, 6).replace(/ /g, ""), sortOrder: String(p.sortOrder), reason: "" })}>{t.chat.edit}</Button>
            </li>
          ))}
        </ul>
      </Card>
      <Dialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? t.chat.edit : t.common.new} description="Price: cents for fiat, number of Stars for TELEGRAM_STARS (currency XTR). Past payments keep their own snapshot." className="max-w-xl">
          {edit && (
            <form className="grid grid-cols-2 gap-3" onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/api/admin/packages", { method: "POST", body: { ...edit, id: edit.id || undefined, priceAmount: Number(edit.priceAmount), sortOrder: Number(edit.sortOrder), description: edit.description || null } });
                setEdit(null);
                reload();
              } catch (err) { toastErr(err); }
            }}>
              <Field label="Slug">{(p) => <Input {...p} required value={edit.slug} onChange={set("slug")} />}</Field>
              <Field label="Name">{(p) => <Input {...p} required value={edit.name} onChange={set("name")} />}</Field>
              <Field label="Provider">{(p) => <Select {...p} value={edit.provider} onChange={set("provider")}><option>STRIPE</option><option>TELEGRAM_STARS</option></Select>}</Field>
              <Field label="Currency">{(p) => <Input {...p} required value={edit.currency} onChange={set("currency")} />}</Field>
              <Field label="Price (minor units / Stars)">{(p) => <Input {...p} required type="number" min={1} value={edit.priceAmount} onChange={set("priceAmount")} />}</Field>
              <Field label="Sort order">{(p) => <Input {...p} type="number" value={edit.sortOrder} onChange={set("sortOrder")} />}</Field>
              <Field label="Credits">{(p) => <Input {...p} required value={edit.credits} onChange={set("credits")} />}</Field>
              <Field label="Bonus credits">{(p) => <Input {...p} value={edit.bonusCredits} onChange={set("bonusCredits")} />}</Field>
              <div className="col-span-2"><Field label="Description">{(p) => <Input {...p} value={edit.description} onChange={set("description")} />}</Field></div>
              <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={edit.active} onChange={set("active")} /> Active</label>
              <div className="col-span-2"><Field label={t.admin.reason}>{(p) => <Input {...p} required minLength={3} value={edit.reason} onChange={set("reason")} />}</Field></div>
              <div className="col-span-2 flex justify-end"><Button type="submit">{t.common.save}</Button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───────────── Payments ─────────────

interface Pay { id: string; provider: string; status: string; amount: number; currency: string; refundedAmount: number; creditsGranted: string; createdAt: string; user: { email: string }; events: { type: string; processedAt: string | null; error: string | null }[] }

function Payments() {
  const { locale, t } = useI18n();
  const [status, setStatus] = useState("");
  const { data, reload } = useFetch<{ payments: Pay[] }>(`/api/admin/payments${status ? `?status=${status}` : ""}`);
  return (
    <div className="space-y-4">
      <Select aria-label="Status" className="w-56" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {Object.keys(t.billing.status).map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="text-left text-xs text-faint"><tr className="border-b border-border">{["Payment", "User", "Amount", "Status", "Webhook events", ""].map((h) => <th key={h} scope="col" className="px-4 py-2.5 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {data?.payments.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2.5"><div className="font-mono text-xs">{p.id}</div><div className="font-mono text-xs text-faint">{p.provider} · {formatDate(p.createdAt, locale)}</div></td>
                <td className="px-4 py-2.5">{p.user.email}</td>
                <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{money(p.amount, p.currency, locale)}{p.refundedAmount ? ` (−${money(p.refundedAmount, p.currency, locale)})` : ""}</td>
                <td className="px-4 py-2.5"><Badge tone={p.status === "SUCCEEDED" ? "success" : p.status === "FAILED" || p.status === "DISPUTED" ? "danger" : "default"}>{p.status}</Badge></td>
                <td className="px-4 py-2.5 font-mono text-xs text-faint">{p.events.map((e) => `${e.type}${e.error ? " ✕" : e.processedAt ? " ✓" : ""}`).join(", ") || "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  {["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(p.status) && (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const amt = window.prompt(`Refund amount in minor units (empty = full remaining ${p.amount - p.refundedAmount})`, "");
                      if (amt === null) return;
                      const reason = askReason(t.admin.reason);
                      if (!reason) return;
                      try {
                        const r = await api<{ note?: string }>("/api/admin/payments", { method: "POST", body: { paymentId: p.id, amount: amt ? Number(amt) : undefined, reason } });
                        toast.success(r.note ?? t.common.saved);
                        reload();
                      } catch (e) { toastErr(e); }
                    }}>Refund</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ───────────── Settings ─────────────

function SettingsTab() {
  const { t } = useI18n();
  const { data, reload } = useFetch<{ settings: Record<string, unknown>; integrations: Record<string, boolean>; platformSpendTodayPico: string }>("/api/admin/settings");
  const [json, setJson] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  if (!data) return <Skeleton className="h-64" />;
  const text = json ?? JSON.stringify(data.settings, null, 2);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="space-y-3 p-5">
        <p className="text-sm text-muted">Platform settings. Money values are strings: credits in microcredits (1 credit = 1 000 000), USD as decimals. The server validates every field.</p>
        <label htmlFor="sj" className="sr-only">Settings JSON</label>
        <Textarea id="sj" rows={24} className="font-mono text-xs" value={text} onChange={(e) => setJson(e.target.value)} spellCheck={false} />
        <Field label={t.admin.reason}>{(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <div className="flex justify-end">
          <Button disabled={reason.trim().length < 3} onClick={async () => {
            let patch: unknown;
            try { patch = JSON.parse(text); } catch { toast.error("Invalid JSON"); return; }
            try {
              await api("/api/admin/settings", { method: "PATCH", body: { reason, patch } });
              toast.success(t.common.saved);
              setJson(null); setReason(""); reload();
            } catch (e) {
              const d = e instanceof ApiError ? (e.data as { details?: { path: string; message: string }[] }) : null;
              toast.error(d?.details?.map((x) => `${x.path}: ${x.message}`).join("; ") ?? (e instanceof ApiError ? e.code : "Error"));
            }
          }}>{t.common.save}</Button>
        </div>
      </Card>
      <Card className="h-fit p-5">
        <h2 className="mb-3 text-sm font-medium">Integrations</h2>
        <ul className="space-y-2 text-sm">
          {Object.entries(data.integrations).map(([k, v]) => (
            <li key={k} className="flex justify-between"><span>{k}</span><Badge tone={v ? "success" : "warning"}>{v ? "configured" : "not configured"}</Badge></li>
          ))}
        </ul>
        <p className="mt-4 font-mono text-xs text-faint">OpenRouter spend today: ${(Number(BigInt(data.platformSpendTodayPico) / 1_000_000n) / 1e6).toFixed(4)}</p>
      </Card>
    </div>
  );
}

// ───────────── Announcements ─────────────

function Announce() {
  const { t } = useI18n();
  const [f, setF] = useState({ title: "", body: "", link: "", expiresInDays: "", reason: "" });
  return (
    <Card className="max-w-2xl p-5">
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("/api/admin/ops", { method: "POST", body: { op: "announce", title: f.title, body: f.body, link: f.link || undefined, expiresInDays: f.expiresInDays ? Number(f.expiresInDays) : undefined, reason: f.reason } });
          toast.success(t.common.saved);
          setF({ title: "", body: "", link: "", expiresInDays: "", reason: "" });
        } catch (err) { toastErr(err); }
      }}>
        <Field label="Title">{(p) => <Input {...p} required maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />}</Field>
        <Field label="Text">{(p) => <Textarea {...p} required rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Link (/path)">{(p) => <Input {...p} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} />}</Field>
          <Field label="Expires in days">{(p) => <Input {...p} type="number" min={1} max={365} value={f.expiresInDays} onChange={(e) => setF({ ...f, expiresInDays: e.target.value })} />}</Field>
        </div>
        <Field label={t.admin.reason}>{(p) => <Input {...p} required minLength={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />}</Field>
        <div className="flex justify-end"><Button type="submit">{t.chat.send}</Button></div>
      </form>
    </Card>
  );
}

// ───────────── Read-only operational tables ─────────────

type Row = Record<string, unknown> & { id: string };

function OpsTable({ view }: { view: "audit" | "admin-actions" | "keys" | "files" | "referrals" | "errors" }) {
  const { locale } = useI18n();
  const { data, reload, error } = useFetch<{ items: Row[]; totalBytes?: number; totalFiles?: number }>(`/api/admin/ops?view=${view}`);
  if (error) return <ErrorState title={error} />;
  if (!data) return <Skeleton className="h-64" />;
  const op = async (body: object) => {
    const reason = askReason("Reason (recorded in audit log)");
    if (!reason) return;
    try { await api("/api/admin/ops", { method: "POST", body: { ...body, reason } }); reload(); } catch (e) { toastErr(e); }
  };
  const d = (v: unknown) => (typeof v === "string" ? formatDate(v, locale) : "—");
  const email = (v: unknown) => (v as { email?: string } | null)?.email ?? "—";
  const cols: Record<typeof view, [string, (r: Row) => React.ReactNode][]> = {
    audit: [["When", (r) => d(r.createdAt)], ["Action", (r) => <code>{String(r.action)}</code>], ["Actor", (r) => email(r.actor)], ["Target", (r) => String(r.target ?? "—")], ["IP", (r) => String(r.ip ?? "—")]],
    "admin-actions": [["When", (r) => d(r.createdAt)], ["Admin", (r) => email(r.admin)], ["Action", (r) => <code>{String(r.action)}</code>], ["Target", (r) => email(r.targetUser)], ["Reason", (r) => String(r.reason)]],
    keys: [["Key", (r) => <><div>{String(r.name)}</div><code className="text-xs text-faint">{String(r.prefix)}…</code></>], ["User", (r) => email(r.user)], ["Spent", (r) => credits(String(r.spent), 4)], ["Last used", (r) => d(r.lastUsedAt)], ["", (r) => (r.revokedAt ? <Badge>revoked</Badge> : <Button size="sm" variant="ghost" onClick={() => op({ op: "revoke-key", id: r.id })}>Revoke</Button>)]],
    files: [["File", (r) => String(r.name)], ["User", (r) => email(r.user)], ["Size", (r) => bytes(Number(r.sizeBytes))], ["Status", (r) => String(r.status)], ["", (r) => <Button size="sm" variant="ghost" onClick={() => op({ op: "delete-file", id: r.id })}>Delete</Button>]],
    referrals: [["When", (r) => d(r.createdAt)], ["Referrer", (r) => email(r.referrer)], ["Referred", (r) => email(r.referred)], ["Status", (r) => <>{String(r.status)} {r.rejectReason ? <span className="text-xs text-faint">({String(r.rejectReason)})</span> : null}</>], ["", (r) => (["PENDING", "QUALIFIED"].includes(String(r.status)) ? <Button size="sm" variant="ghost" onClick={() => op({ op: "reject-referral", id: r.id })}>Reject</Button> : null)]],
    errors: [["When", (r) => d(r.createdAt)], ["Source", (r) => String(r.source)], ["Message", (r) => String(r.message)]],
  };
  return (
    <div className="space-y-3">
      {view === "files" && <p className="font-mono text-xs text-faint">{data.totalFiles} files · {bytes(data.totalBytes ?? 0)}</p>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-faint"><tr className="border-b border-border">{cols[view].map(([h], i) => <th key={i} scope="col" className="px-4 py-2.5 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {data.items.length === 0 && <tr><td colSpan={cols[view].length} className="px-4 py-8 text-center text-muted">—</td></tr>}
            {data.items.map((r) => <tr key={r.id} className="border-b border-border last:border-0">{cols[view].map(([, fn], i) => <td key={i} className="px-4 py-2.5 align-top">{fn(r)}</td>)}</tr>)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

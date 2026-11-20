"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card, PageHeader, Skeleton, Stat } from "@/components/ui/misc";
import { ModelPicker } from "@/components/chat/model-picker";
import { api, ApiError } from "@/lib/api-client";
import { useFetch } from "@/hooks/use-fetch";
import { setLocaleCookie, useI18n } from "@/lib/i18n/client";
import { cn, credits, formatDate } from "@/lib/utils";

interface Profile {
  user: { id: string; email: string; name: string | null; image: string | null; locale: string; theme: string; defaultModelId: string | null; hasPassword: boolean };
  balance: { available: string };
  stats: { requests: number; promptTokens: number; completionTokens: number; spentMicro: string; byModel: { modelId: string; _count: number; _sum: { chargedMicro: string | null } }[] };
}
interface Sess { id: string; ip: string | null; userAgent: string | null; createdAt: string; lastSeenAt: string; current: boolean }

export function SettingsView({ tab, defaultModelId }: { tab: "profile" | "security"; defaultModelId: string }) {
  const { t, locale } = useI18n();
  const tabs = [
    ["profile", "/settings", t.settings.profile],
    ["security", "/settings/security", t.settings.security],
  ] as const;
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title={t.settings.title} />
      <nav aria-label={t.settings.title} className="mb-6 flex gap-1 border-b border-border">
        {tabs.map(([k, href, label]) => (
          <Link key={k} href={href} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === k ? "border-text text-text" : "border-transparent text-muted hover:text-text")}>
            {label}
          </Link>
        ))}
        <Link href="/billing" className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-text">{t.nav.billing}</Link>
        <Link href="/developers" className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-text">{t.nav.developers}</Link>
      </nav>
      {tab === "profile" ? <ProfileTab defaultModelId={defaultModelId} /> : <SecurityTab />}
      <span className="hidden">{locale}</span>
    </div>
  );
}

function ProfileTab({ defaultModelId }: { defaultModelId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const { setTheme } = useTheme();
  const { data, reload } = useFetch<Profile>("/api/account/profile");
  const [draft, setDraft] = useState<Partial<Profile["user"]>>({});
  if (!data) return <Skeleton className="h-64" />;
  const u = { ...data.user, ...draft };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/account/profile", { method: "PATCH", body: { name: u.name || undefined, image: u.image || null, locale: u.locale, theme: u.theme, defaultModelId: u.defaultModelId } });
      setLocaleCookie(u.locale as "uk" | "en");
      setTheme(u.theme);
      toast.success(t.common.saved);
      setDraft({});
      reload();
      router.refresh();
    } catch (err) {
      toast.error(t.errors[err instanceof ApiError ? err.code : ""] ?? t.common.error);
    }
  }

  return (
    <div className="space-y-8">
      <Card className="p-5">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Field label={t.auth.name}>{(p) => <Input {...p} maxLength={80} value={u.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</Field>
          <Field label={t.auth.email}>{(p) => <Input {...p} value={u.email} readOnly disabled />}</Field>
          <Field label={t.settings.avatar}>{(p) => <Input {...p} type="url" placeholder="https://" value={u.image ?? ""} onChange={(e) => setDraft({ ...draft, image: e.target.value })} />}</Field>
          <Field label={t.settings.language}>
            {(p) => (
              <Select {...p} value={u.locale} onChange={(e) => setDraft({ ...draft, locale: e.target.value })}>
                <option value="uk">Українська</option>
                <option value="en">English</option>
              </Select>
            )}
          </Field>
          <Field label={t.settings.theme}>
            {(p) => (
              <Select {...p} value={u.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })}>
                <option value="system">{t.common.theme.system}</option>
                <option value="dark">{t.common.theme.dark}</option>
                <option value="light">{t.common.theme.light}</option>
              </Select>
            )}
          </Field>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">{t.settings.defaultModel}</span>
            <ModelPicker value={u.defaultModelId ?? defaultModelId} onChange={(id) => setDraft({ ...draft, defaultModelId: id })} />
          </div>
          <div className="sm:col-span-2 flex justify-end"><Button type="submit">{t.common.save}</Button></div>
        </form>
      </Card>

      <section aria-labelledby="st-h">
        <h2 id="st-h" className="mb-3 text-lg font-medium">{t.settings.stats}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label={t.settings.requests} value={data.stats.requests.toLocaleString("en-US")} />
          <Stat label={t.chat.tokens} value={(data.stats.promptTokens + data.stats.completionTokens).toLocaleString("en-US")} />
          <Stat label={t.settings.spent} value={credits(data.stats.spentMicro)} />
        </div>
        {data.stats.byModel.length > 0 && (
          <Card className="mt-4">
            <ul className="divide-y divide-border">
              {data.stats.byModel.map((m) => (
                <li key={m.modelId} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                  <span className="truncate">{m.modelId}</span>
                  <span className="font-mono text-xs text-faint tabular-nums">{m._count} · {credits(m._sum.chargedMicro ?? "0", 4)} cr</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section aria-labelledby="data-h" className="space-y-4">
        <h2 id="data-h" className="text-lg font-medium">{t.settings.exportData}</h2>
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-sm text-muted">{t.settings.exportDesc}</p>
          <Button variant="secondary" onClick={() => (window.location.href = "/api/account/export")}>{t.settings.exportData}</Button>
        </Card>
        <DeleteAccount hasPassword={data.user.hasPassword} />
      </section>
    </div>
  );
}

function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  return (
    <Card className="space-y-4 border-danger/30 p-5">
      <h3 className="font-medium text-danger">{t.settings.deleteAccount}</h3>
      <p className="text-sm text-muted">{t.settings.deleteDesc}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.settings.deleteConfirm}>{(p) => <Input {...p} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />}</Field>
        {hasPassword && <Field label={t.auth.password}>{(p) => <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}</Field>}
      </div>
      <Button
        variant="danger"
        disabled={confirm !== "DELETE"}
        onClick={async () => {
          try {
            await api("/api/account/delete", { method: "POST", body: { confirm, password: password || undefined } });
            router.replace("/");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof ApiError ? e.code : t.common.error);
          }
        }}
      >
        {t.settings.deleteAccount}
      </Button>
    </Card>
  );
}

function SecurityTab() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { data, reload } = useFetch<{ sessions: Sess[] }>("/api/account/sessions");
  const profile = useFetch<Profile>("/api/account/profile");
  const [pw, setPw] = useState({ current: "", next: "" });

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/account/password", { method: "POST", body: { current: pw.current || undefined, next: pw.next } });
      toast.success(t.common.saved);
      setPw({ current: "", next: "" });
      reload();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      toast.error(t.auth.errors[code] ?? code ?? t.common.error);
    }
  }
  const revoke = async (body: object) => {
    await api("/api/account/sessions", { method: "DELETE", body });
    reload();
  };

  return (
    <div className="space-y-8">
      <Card className="p-5">
        <h2 className="mb-4 text-lg font-medium">{t.settings.changePassword}</h2>
        <form onSubmit={changePassword} className="grid gap-4 sm:grid-cols-2">
          {profile.data?.user.hasPassword && <Field label={t.settings.currentPassword}>{(p) => <Input {...p} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />}</Field>}
          <Field label={t.settings.newPassword} hint={t.auth.passwordHint}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />}</Field>
          <div className="flex justify-end sm:col-span-2"><Button type="submit" disabled={!pw.next}>{t.common.save}</Button></div>
        </form>
      </Card>

      <section aria-labelledby="ses-h">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="ses-h" className="text-lg font-medium">{t.settings.sessions}</h2>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => revoke({ all: true })}>{t.settings.revokeAll}</Button>
            <Button variant="ghost" size="sm" onClick={async () => { await revoke({ all: true, includeCurrent: true }); router.replace("/login"); }}>{t.common.signOut}</Button>
          </div>
        </div>
        <Card>
          <ul className="divide-y divide-border">
            {!data && <li className="p-4"><Skeleton className="h-10" /></li>}
            {data?.sessions.map((s) => {
              const mobile = /mobile|android|iphone/i.test(s.userAgent ?? "");
              const Icon = mobile ? Smartphone : Monitor;
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <Icon className="size-4 text-faint" strokeWidth={1.5} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{browserName(s.userAgent)} {s.current && <span className="text-xs text-primary">· {t.settings.current}</span>}</div>
                    <div className="font-mono text-xs text-faint">{s.ip ?? "—"} · {formatDate(s.lastSeenAt, locale)}</div>
                  </div>
                  {!s.current && <Button size="sm" variant="ghost" onClick={() => revoke({ id: s.id })}>{t.settings.revoke}</Button>}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function browserName(ua: string | null) {
  if (!ua) return "Unknown device";
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return `${b}${os ? ` · ${os}` : ""}`;
}

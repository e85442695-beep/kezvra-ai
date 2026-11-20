"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";

function GoogleButton({ next }: { next: string }) {
  const { t } = useI18n();
  return (
    <Button variant="secondary" className="w-full" onClick={() => signIn("google", { redirectTo: next })}>
      <svg viewBox="0 0 24 24" aria-hidden className="size-4"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.9 1.5l2.6-2.5C16.9 3.3 14.7 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" /></svg>
      {t.auth.google}
    </Button>
  );
}

function Divider() {
  const { t } = useI18n();
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-border" /> {t.common.or} <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function Notice({ tone, children }: { tone: "ok" | "err"; children: React.ReactNode }) {
  return (
    <p role={tone === "err" ? "alert" : "status"} className={tone === "err" ? "rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" : "rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success"}>
      {children}
    </p>
  );
}

function errText(t: ReturnType<typeof useI18n>["t"], code: string) {
  return t.auth.errors[code] ?? t.errors[code] ?? t.common.error;
}

export function LoginForm({ google }: { google: boolean }) {
  const { t } = useI18n();
  const sp = useSearchParams();
  const router = useRouter();
  const next = sp.get("next")?.startsWith("/") && !sp.get("next")?.startsWith("//") ? sp.get("next")! : "/chat";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(sp.get("error") ? errText(t, sp.get("error")!) : null);
  const [busy, setBusy] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const verify = sp.get("verify");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/account/login", { method: "POST", body: { email, password } });
      router.replace(next);
      router.refresh();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "INTERNAL_ERROR";
      setUnverified(code === "EMAIL_NOT_VERIFIED");
      setError(errText(t, code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 text-xl font-medium">{t.auth.loginTitle}</h1>
      <div className="space-y-3">
        {verify === "ok" && <Notice tone="ok">{t.auth.verified}</Notice>}
        {verify === "invalid" && <Notice tone="err">{t.auth.verifyInvalid}</Notice>}
        {error && <Notice tone="err">{error}</Notice>}
        {unverified && (
          <Button variant="link" size="sm" onClick={() => api("/api/account/verify", { method: "POST", body: { email } }).then(() => setError(t.auth.checkEmail))}>
            {t.auth.resend}
          </Button>
        )}
      </div>
      {google && (
        <div className="mt-4">
          <GoogleButton next={next} />
          <Divider />
        </div>
      )}
      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <Field label={t.auth.email}>{(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label={t.auth.password}>{(p) => <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">{t.auth.forgot}</Link>
        </div>
        <Button type="submit" className="w-full" disabled={busy || !email || !password}>
          {busy && <Loader2 className="animate-spin" />} {t.common.signIn}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t.auth.noAccount} <Link href="/register" className="text-primary underline underline-offset-4">{t.common.signUp}</Link>
      </p>
    </>
  );
}

export function RegisterForm({ google }: { google: boolean }) {
  const { t, locale } = useI18n();
  const sp = useSearchParams();
  const [form, setForm] = useState({ name: "", email: "", password: "", referral: sp.get("ref") ?? "", acceptTerms: false });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/account/register", { method: "POST", body: { ...form, name: form.name || undefined, referral: form.referral || undefined, locale } });
      setDone(true);
    } catch (err) {
      setError(errText(t, err instanceof ApiError ? err.code : "INTERNAL_ERROR"));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <>
        <h1 className="mb-4 text-xl font-medium">{t.auth.registerTitle}</h1>
        <Notice tone="ok">{t.auth.checkEmail}</Notice>
        <Link href="/login" className="mt-6 block text-center text-sm text-primary hover:underline">{t.common.signIn}</Link>
      </>
    );

  return (
    <>
      <h1 className="mb-6 text-xl font-medium">{t.auth.registerTitle}</h1>
      {error && <Notice tone="err">{error}</Notice>}
      {google && (
        <div className="mt-4">
          <GoogleButton next="/chat" />
          <Divider />
        </div>
      )}
      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        <Field label={t.auth.name}>{(p) => <Input {...p} autoComplete="name" value={form.name} onChange={set("name")} />}</Field>
        <Field label={t.auth.email}>{(p) => <Input {...p} type="email" autoComplete="email" required value={form.email} onChange={set("email")} />}</Field>
        <Field label={t.auth.password} hint={t.auth.passwordHint}>{(p) => <Input {...p} type="password" autoComplete="new-password" required minLength={10} value={form.password} onChange={set("password")} />}</Field>
        <Field label={t.auth.referral}>{(p) => <Input {...p} value={form.referral} onChange={set("referral")} />}</Field>
        <label className="flex items-start gap-2 text-sm text-muted">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--text)]" checked={form.acceptTerms} onChange={set("acceptTerms")} required />
          <span>
            {t.auth.terms} (<Link href="/legal/terms" className="text-primary underline">Terms</Link>, <Link href="/legal/privacy" className="text-primary underline">Privacy</Link>)
          </span>
        </label>
        <Button type="submit" className="w-full" disabled={busy || !form.email || !form.password || !form.acceptTerms}>
          {busy && <Loader2 className="animate-spin" />} {t.common.signUp}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {t.auth.haveAccount} <Link href="/login" className="text-primary underline underline-offset-4">{t.common.signIn}</Link>
      </p>
    </>
  );
}

export function ForgotForm() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  return (
    <>
      <h1 className="mb-6 text-xl font-medium">{t.auth.forgotTitle}</h1>
      {state === "sent" ? (
        <Notice tone="ok">{t.auth.forgotSent}</Notice>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setState("busy");
            try {
              await api("/api/account/forgot", { method: "POST", body: { email } });
              setState("sent");
            } catch {
              setState("error");
            }
          }}
        >
          {state === "error" && <Notice tone="err">{t.auth.errors.TOO_MANY_ATTEMPTS}</Notice>}
          <Field label={t.auth.email}>{(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Button type="submit" className="w-full" disabled={state === "busy" || !email}>{t.auth.sendLink}</Button>
        </form>
      )}
      <Link href="/login" className="mt-6 block text-center text-sm text-primary hover:underline">← {t.common.signIn}</Link>
    </>
  );
}

export function ResetForm() {
  const { t } = useI18n();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  return (
    <>
      <h1 className="mb-6 text-xl font-medium">{t.auth.resetTitle}</h1>
      {done ? (
        <Notice tone="ok">{t.auth.resetDone}</Notice>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await api("/api/account/reset", { method: "POST", body: { token, password } });
              setDone(true);
            } catch (err) {
              setError(errText(t, err instanceof ApiError ? err.code : "INTERNAL_ERROR"));
            }
          }}
        >
          {error && <Notice tone="err">{error}</Notice>}
          <Field label={t.settings.newPassword} hint={t.auth.passwordHint}>{(p) => <Input {...p} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <Button type="submit" className="w-full" disabled={!token || !password}>{t.common.save}</Button>
        </form>
      )}
      <Link href="/login" className="mt-6 block text-center text-sm text-primary hover:underline">← {t.common.signIn}</Link>
    </>
  );
}

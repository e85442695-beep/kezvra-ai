import Link from "next/link";
import { Logo } from "./logo";
import { LocaleSwitcher, ThemeSwitcher } from "./switchers";
import { buttonVariants } from "@/components/ui/button";
import type { Dict } from "@/lib/i18n";

export function MarketingHeader({ t, signedIn }: { t: Dict; signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-elevated focus:px-3 focus:py-2">
        {t.nav.skip}
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 text-sm md:flex">
          {[
            ["/models", t.nav.models],
            ["/#pricing", t.nav.pricing],
            ["/docs/api", t.nav.developers],
            ["/help", t.nav.help],
          ].map(([href, label]) => (
            <Link key={href} href={href!} className="rounded-md px-3 py-2 text-muted transition-colors hover:text-text">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeSwitcher />
          {signedIn ? (
            <Link href="/chat" className={buttonVariants({ size: "sm" })}>{t.nav.chat}</Link>
          ) : (
            <>
              <Link href="/login" className="hidden px-3 text-sm text-muted transition-colors hover:text-text sm:inline">{t.common.signIn}</Link>
              <Link href="/register" className={buttonVariants({ size: "sm" })}>{t.landing.ctaStart}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter({ t }: { t: Dict }) {
  const cols: [string, [string, string][]][] = [
    ["Kezvra", [["/models", t.nav.models], ["/#pricing", t.nav.pricing], ["/compare", t.nav.compare], ["/images", t.nav.images]]],
    [t.nav.developers, [["/docs/api", "API docs"], ["/developers", t.developers.keys], ["/status", t.nav.status], ["/changelog", t.nav.changelog]]],
    [t.nav.help, [["/help", t.nav.help], ["/support", t.nav.support], ["mailto:support@kezvra.ai", "support@kezvra.ai"]]],
    ["Legal", [["/legal/terms", "Terms of Service"], ["/legal/privacy", "Privacy Policy"], ["/legal/cookies", "Cookie Policy"]]],
  ];
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-5">
        <div className="space-y-3 md:col-span-1">
          <Logo />
          <p className="text-sm text-muted">{t.landing.heroTitle}</p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <h2 className="mb-3 text-sm font-medium">{title}</h2>
            <ul className="space-y-2 text-sm">
              {links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="text-muted hover:text-text">{label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border py-6 text-center text-xs text-muted">© {new Date().getFullYear()} Kezvra AI</div>
    </footer>
  );
}

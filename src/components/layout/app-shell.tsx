"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Bell, Bot, Code2, Coins, CreditCard, FileText, GitCompare, Gift, ImageIcon, LayoutGrid, LifeBuoy, LogOut, Menu as MenuIcon,
  MessageSquare, Plus, Settings, Shield, Sparkles, X, Command as CommandIcon, BookMarked,
} from "lucide-react";
import { Logo } from "./logo";
import { LocaleSwitcher, ThemeSwitcher } from "./switchers";
import { CommandMenu } from "./command-menu";
import { Notifications } from "./notifications";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, MenuLabel } from "@/components/ui/menu";
import { useI18n } from "@/lib/i18n/client";
import { useBalance } from "@/hooks/use-balance";
import { cn, credits } from "@/lib/utils";

export interface ShellUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  isStaff: boolean;
  isAdmin: boolean;
  emailVerified: boolean;
}

export function AppShell({ user, initialBalance, children }: { user: ShellUser; initialBalance: string; children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const balance = useBalance(initialBalance);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        router.push("/chat?new=1");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const nav = [
    { href: "/chat", icon: MessageSquare, label: t.nav.chat },
    { href: "/compare", icon: GitCompare, label: t.nav.compare },
    { href: "/images", icon: ImageIcon, label: t.nav.images },
    { href: "/files", icon: FileText, label: t.nav.files },
    { href: "/models", icon: LayoutGrid, label: t.nav.models },
    { href: "/assistants", icon: Bot, label: t.nav.assistants },
    { href: "/prompts", icon: BookMarked, label: t.nav.prompts },
  ];
  const nav2 = [
    { href: "/billing", icon: CreditCard, label: t.nav.billing },
    { href: "/referrals", icon: Gift, label: t.nav.referrals },
    { href: "/developers", icon: Code2, label: t.nav.developers },
    { href: "/support", icon: LifeBuoy, label: t.nav.support },
    { href: "/settings", icon: Settings, label: t.nav.settings },
    ...(user.isStaff ? [{ href: "/admin", icon: Shield, label: t.nav.admin }] : []),
  ];

  const signOut = async () => {
    await fetch("/api/account/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Logo href="/chat" />
        <button className="rounded-md p-1.5 text-muted hover:bg-elevated lg:hidden" onClick={() => setMobileOpen(false)} aria-label={t.common.close}>
          <X className="size-5" />
        </button>
      </div>
      <div className="px-3">
        <Button asChild className="w-full justify-start">
          <Link href="/chat?new=1"><Plus /> {t.chat.newChat}</Link>
        </Button>
        <button
          onClick={() => setCmdOpen(true)}
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-muted hover:text-text"
        >
          <CommandIcon className="size-4" aria-hidden /> {t.common.search}
          <kbd className="ml-auto rounded border border-border px-1.5 text-[10px]">Ctrl K</kbd>
        </button>
      </div>
      <nav aria-label="App" className="mt-4 flex-1 space-y-6 overflow-y-auto px-3">
        {[nav, nav2].map((group, gi) => (
          <ul key={gi} className="space-y-0.5">
            {group.map((n) => {
              const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex h-9 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors", active ? "bg-elevated text-text shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]" : "text-muted hover:bg-elevated/60 hover:text-text")}
                  >
                    <n.icon className={cn("size-4 text-faint", active && "text-text")} strokeWidth={1.5} aria-hidden /> {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <Link href="/billing" className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm hover:bg-elevated">
          <span className="flex items-center gap-2 text-muted"><Coins className="size-4 text-faint" strokeWidth={1.5} aria-hidden /> {t.billing.balance}</span>
          <span className="font-mono text-[13px] tabular-nums" aria-live="polite">{credits(balance)}</span>
        </Link>
        <Menu>
          <MenuTrigger asChild>
            <button className="mt-2 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-elevated">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" className="size-8 rounded-full object-cover" />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-elevated text-sm font-medium">{(user.name ?? user.email)[0]?.toUpperCase()}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{user.name ?? user.email.split("@")[0]}</span>
                <span className="block truncate text-xs text-muted">{user.email}</span>
              </span>
            </button>
          </MenuTrigger>
          <MenuContent align="start" className="w-60">
            <MenuLabel>{user.email}</MenuLabel>
            <MenuItem onSelect={() => router.push("/settings")}><Settings /> {t.nav.settings}</MenuItem>
            <MenuItem onSelect={() => router.push("/billing")}><CreditCard /> {t.nav.billing}</MenuItem>
            <MenuItem onSelect={() => router.push("/help")}><Sparkles /> {t.nav.help}</MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={signOut}><LogOut /> {t.common.signOut}</MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-elevated focus:px-3 focus:py-2">{t.nav.skip}</a>
      <aside className="hidden w-64 shrink-0 border-r border-border bg-[color-mix(in_oklab,var(--bg)_70%,black)] dark:bg-[#0f0f10] lg:block" aria-label={t.chat.sidebar}>{sidebar}</aside>
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label={t.chat.sidebar}
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-bg lg:hidden"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-3 sm:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t.chat.sidebar} aria-expanded={mobileOpen}>
            <MenuIcon />
          </Button>
          <div id="kz-topbar-slot" className="flex min-w-0 flex-1 items-center gap-2" />
          <div className="flex items-center gap-1">
            <Notifications />
            <LocaleSwitcher />
            <ThemeSwitcher />
          </div>
        </header>
        {!user.emailVerified && (
          <div role="status" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-xs text-warning">{t.errors.EMAIL_NOT_VERIFIED}</div>
        )}
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} isAdmin={user.isAdmin} />
    </div>
  );
}

export function BellIcon() {
  return <Bell />;
}

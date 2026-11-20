import { Logo } from "@/components/layout/logo";
import { LocaleSwitcher, ThemeSwitcher } from "@/components/layout/switchers";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <header className="relative flex items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeSwitcher />
        </div>
      </header>
      <main id="main" className="relative flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}

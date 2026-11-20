"use client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { MotionConfig } from "motion/react";
import { I18nProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";

export function Providers({ locale, nonce, children }: { locale: Locale; nonce?: string; children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange nonce={nonce}>
      <I18nProvider locale={locale}>
        {/* respects prefers-reduced-motion for every motion component */}
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
        <Toaster richColors closeButton position="bottom-right" toastOptions={{ className: "!bg-elevated !border-border !text-text" }} />
      </I18nProvider>
    </ThemeProvider>
  );
}

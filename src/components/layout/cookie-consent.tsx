"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

/**
 * Kezvra only sets strictly necessary cookies (session, CSRF-safe auth, locale, theme preference)
 * and runs no analytics/advertising trackers, so no opt-in is legally required. This notice
 * informs users and records acknowledgement; if non-essential cookies are ever added they must be
 * gated on an explicit "accept" stored here.
 */
export function CookieConsent() {
  const { locale } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!document.cookie.includes("kz-cookies=")), []);
  if (!show) return null;
  const ack = () => {
    document.cookie = "kz-cookies=essential; path=/; max-age=31536000; samesite=lax";
    setShow(false);
  };
  return (
    <div role="region" aria-label="Cookies" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border border-border bg-elevated p-4 shadow-2xl sm:inset-x-auto sm:right-4">
      <p className="text-sm text-muted">
        {locale === "en"
          ? "We use only strictly necessary cookies (sign-in, language, theme). No tracking or advertising cookies."
          : "Ми використовуємо лише необхідні cookies (вхід, мова, тема). Жодних трекінгових чи рекламних cookies."}{" "}
        <Link href="/legal/cookies" className="text-primary underline">
          {locale === "en" ? "Cookie Policy" : "Політика cookies"}
        </Link>
      </p>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={ack}>OK</Button>
      </div>
    </div>
  );
}

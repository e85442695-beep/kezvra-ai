"use client";
import { useCallback, useEffect, useState } from "react";

/** Shared balance state. Any component can call `refreshBalance()` after a billed action. */
export function refreshBalance() {
  window.dispatchEvent(new Event("kz:balance"));
}

export function useBalance(initial: string) {
  const [micro, setMicro] = useState(initial);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/billing/summary", { credentials: "same-origin" });
      if (r.ok) {
        const d = (await r.json()) as { balance: { available: string } };
        setMicro(d.balance.available);
      }
    } catch {
      /* keep last value */
    }
  }, []);
  useEffect(() => {
    window.addEventListener("kz:balance", load);
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("kz:balance", load);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);
  return micro;
}

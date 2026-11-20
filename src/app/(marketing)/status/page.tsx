import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { integrations } from "@/lib/env";
import { getDict } from "@/lib/i18n/server";
import { Card } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "System status" };
export const dynamic = "force-dynamic";

async function check(fn: () => Promise<unknown>, ms = 2500) {
  const t0 = Date.now();
  try {
    await Promise.race([fn(), new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
    return { ok: true, ms: Date.now() - t0 };
  } catch {
    return { ok: false, ms: Date.now() - t0 };
  }
}

async function probe() {
  return Promise.all([
    check(() => db.$queryRaw`SELECT 1`),
    check(() => getRedis().ping()),
    check(() => fetch("https://openrouter.ai/api/v1/models?limit=1", { cache: "no-store" }).then((r) => { if (!r.ok) throw new Error(); })),
    db.aIRequest.groupBy({ by: ["status"], where: { createdAt: { gte: new Date(Date.now() - 3600_000) } }, _count: true }).catch(() => []),
  ]);
}

/** Live checks of our own dependencies plus configuration state of external integrations. */
export default async function StatusPage() {
  const { locale } = await getDict();
  const en = locale === "en";
  const [database, redis, openrouter, recent] = await probe();
  const checkedAt = new Date().toISOString();
  const rows: [string, { ok: boolean; ms: number } | "configured" | "not-configured"][] = [
    ["Web app", { ok: true, ms: 0 }],
    [en ? "Database" : "База даних", database],
    [en ? "Queue / cache (Redis)" : "Черга / кеш (Redis)", redis],
    ["OpenRouter API", openrouter],
    [en ? "File storage" : "Сховище файлів", integrations.storage ? "configured" : "not-configured"],
    [en ? "Payments (Stripe)" : "Платежі (Stripe)", integrations.stripe ? "configured" : "not-configured"],
    ["Email (SMTP)", integrations.email ? "configured" : "not-configured"],
  ];
  const total = recent.reduce((a, r) => a + r._count, 0);
  const failed = recent.find((r) => r.status === "FAILED")?._count ?? 0;
  const allOk = rows.every(([, v]) => v === "configured" || v === "not-configured" || v.ok);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-medium tracking-[-0.02em]">{en ? "System status" : "Статус системи"}</h1>
      <p className={cn("mt-3 flex items-center gap-2 text-sm", allOk ? "text-success" : "text-warning")}>
        <span className={cn("size-2 rounded-full", allOk ? "bg-success" : "bg-warning")} aria-hidden />
        {allOk ? (en ? "All systems operational" : "Усі системи працюють") : en ? "Some systems are degraded" : "Частина систем працює з перебоями"}
      </p>
      <Card className="mt-8">
        <ul className="divide-y divide-border">
          {rows.map(([name, v]) => (
            <li key={name} className="flex items-center justify-between px-5 py-3 text-sm">
              <span>{name}</span>
              {typeof v === "string" ? (
                <span className="font-mono text-xs text-faint">{v === "configured" ? (en ? "configured" : "налаштовано") : en ? "not configured" : "не налаштовано"}</span>
              ) : (
                <span className={cn("flex items-center gap-2 font-mono text-xs", v.ok ? "text-success" : "text-danger")}>
                  <span className={cn("size-1.5 rounded-full", v.ok ? "bg-success" : "bg-danger")} aria-hidden />
                  {v.ok ? (v.ms ? `${v.ms} ms` : "ok") : en ? "down" : "недоступно"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-4 font-mono text-xs text-faint">
        {en ? "AI requests, last hour" : "AI-запитів за годину"}: {total} · {en ? "failed" : "помилок"}: {failed} · {checkedAt}
      </p>
    </div>
  );
}

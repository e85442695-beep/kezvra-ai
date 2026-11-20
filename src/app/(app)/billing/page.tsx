import { Suspense } from "react";
import type { Metadata } from "next";
import { BillingView } from "@/components/billing/billing-view";
import { db } from "@/lib/db";
import { integrations } from "@/lib/env";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const pkgs = await db.creditPackage.findMany({ where: { active: true }, orderBy: [{ provider: "asc" }, { sortOrder: "asc" }] });
  const packages = pkgs.map((p) => ({ id: p.id, name: p.name, description: p.description, provider: p.provider as "STRIPE" | "TELEGRAM_STARS", priceAmount: p.priceAmount, currency: p.currency, credits: p.credits.toString(), bonusCredits: p.bonusCredits.toString() }));
  return (
    <Suspense>
      <BillingView packages={packages} stripeReady={integrations.stripe} />
    </Suspense>
  );
}

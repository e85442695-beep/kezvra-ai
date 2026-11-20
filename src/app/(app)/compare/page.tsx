import type { Metadata } from "next";
import { CompareView } from "@/components/compare/compare-view";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Compare models" };

export default async function ComparePage() {
  const s = await getSettings();
  // Defaults: featured text models from the live catalog, falling back to the platform default.
  const featured = await db.aIModel.findMany({ where: { featured: true, enabled: true, available: true, outputModalities: { has: "text" } }, select: { id: true }, take: 4 });
  const ids = featured.map((m) => m.id);
  return <CompareView defaults={ids.length >= 2 ? ids : [s.defaultModelId, ...ids].slice(0, 4)} />;
}

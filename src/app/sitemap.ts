import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.APP_URL;
  const staticPages = ["", "/models", "/docs/api", "/help", "/status", "/changelog", "/legal/terms", "/legal/privacy", "/legal/cookies", "/login", "/register"];
  const models = await db.aIModel.findMany({ where: { enabled: true, available: true }, select: { id: true, updatedAt: true } }).catch(() => []);
  return [
    ...staticPages.map((p) => ({ url: `${base}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.6 })),
    ...models.map((m) => ({ url: `${base}/models/${m.id}`, lastModified: m.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}

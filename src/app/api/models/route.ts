import { json, route } from "@/lib/http/route";
import { listPublicModels } from "@/lib/models-query";
import { CATEGORIES } from "@/lib/openrouter/models";

export const dynamic = "force-dynamic";

/** Public catalog (synced from OpenRouter Models API). ?category=coding&q=claude */
export const GET = route(async (req) => {
  const sp = req.nextUrl.searchParams;
  const category = sp.get("category") ?? undefined;
  const models = await listPublicModels({
    category: category && (CATEGORIES as readonly string[]).includes(category) ? category : undefined,
    q: sp.get("q")?.slice(0, 100) || undefined,
  });
  return json({ models, categories: CATEGORIES }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
});

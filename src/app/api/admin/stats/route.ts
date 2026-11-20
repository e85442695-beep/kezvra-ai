import { json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { dashboardStats } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireUser("ADMIN");
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 30) || 30));
  return json(await dashboardStats(days));
});

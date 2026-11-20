import { z } from "zod";
import { db } from "@/lib/db";
import { body, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { adminAction } from "@/lib/audit";
import { getSettings, settingsSchema, updateSettings } from "@/lib/settings";
import { integrations } from "@/lib/env";
import { platformSpendToday } from "@/lib/credits/spend-guard";

export const GET = route(async () => {
  await requireUser("ADMIN");
  return json({ settings: await getSettings(), integrations, platformSpendTodayPico: await platformSpendToday() });
});

export const PATCH = route(async (req) => {
  const admin = await requireUser("ADMIN");
  const { reason, patch } = await body(req, z.object({ reason: z.string().min(3).max(500), patch: settingsSchema.partial() }));
  const r = await updateSettings(patch, admin.id);
  await db.$transaction((tx) => adminAction(tx, { adminId: admin.id, action: "settings.update", reason, before: r.before, after: r.after }));
  return json({ settings: r.after });
});

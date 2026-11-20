import type { NextRequest } from "next/server";
import { handleTelegramUpdate, verifyTelegramWebhook } from "@/lib/billing/telegram-stars";
import { integrations } from "@/lib/env";
import { json } from "@/lib/http/route";
import { logger, errorInfo } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!integrations.telegramStars) return json({ error: "TELEGRAM_NOT_CONFIGURED" }, { status: 503 });
  if (!verifyTelegramWebhook(req.headers.get("x-telegram-bot-api-secret-token"))) return json({ error: "FORBIDDEN" }, { status: 403 });
  try {
    await handleTelegramUpdate(await req.json());
    return json({ ok: true });
  } catch (err) {
    logger.error({ err: errorInfo(err) }, "telegram webhook failed");
    return json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
}

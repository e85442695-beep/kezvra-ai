import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { env, integrations } from "@/lib/env";
import { safeEqual } from "@/lib/security/tokens";
import { applyRefund, fulfillPayment, markEvent, recordEvent } from "./fulfill";

/**
 * Telegram Stars adapter (for the future Telegram Mini App).
 * Official Bot API: createInvoiceLink (currency "XTR", empty provider_token),
 * pre_checkout_query → answerPreCheckoutQuery, message.successful_payment, refundStarPayment.
 *
 * Tariffs are in Stars and are NOT converted to USD — e.g. the "3 500 credits for 150 Stars" package
 * is a Telegram-specific CreditPackage (provider=TELEGRAM_STARS, currency=XTR, priceAmount=150).
 */

async function bot<T>(method: string, params: Record<string, unknown>): Promise<T> {
  if (!integrations.telegramStars) throw new Error("TELEGRAM_NOT_CONFIGURED");
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  return data.result as T;
}

export async function createStarsInvoice(payment: { id: string; amount: number; currency: string; packageSnapshot: unknown }) {
  if (payment.currency !== "XTR") throw new Error("NOT_A_STARS_PACKAGE");
  const snap = payment.packageSnapshot as { name: string; credits: string };
  const link = await bot<string>("createInvoiceLink", {
    title: `Kezvra Credits — ${snap.name}`.slice(0, 32),
    description: `${BigInt(snap.credits) / 1_000_000n} Kezvra Credits`,
    payload: payment.id,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: snap.name.slice(0, 32), amount: payment.amount }],
  });
  await db.payment.update({ where: { id: payment.id }, data: { status: "PENDING" } });
  return link;
}

/** Webhook authenticity: Telegram sends the secret configured via setWebhook(secret_token). */
export function verifyTelegramWebhook(header: string | null) {
  return Boolean(header && env.TELEGRAM_WEBHOOK_SECRET && safeEqual(header, env.TELEGRAM_WEBHOOK_SECRET));
}

interface TgUpdate {
  update_id: number;
  pre_checkout_query?: { id: string; currency: string; total_amount: number; invoice_payload: string };
  message?: {
    from?: { id: number };
    successful_payment?: { currency: string; total_amount: number; invoice_payload: string; telegram_payment_charge_id: string };
    refunded_payment?: { currency: string; total_amount: number; invoice_payload: string; telegram_payment_charge_id: string };
  };
}

export async function handleTelegramUpdate(u: TgUpdate) {
  if (u.pre_checkout_query) {
    const q = u.pre_checkout_query;
    const p = await db.payment.findUnique({ where: { id: q.invoice_payload } });
    const ok = Boolean(p && p.provider === "TELEGRAM_STARS" && ["CREATED", "PENDING"].includes(p.status) && p.amount === q.total_amount && q.currency === "XTR");
    await bot("answerPreCheckoutQuery", ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: "Payment is no longer valid" });
    return;
  }
  const sp = u.message?.successful_payment;
  if (sp) {
    const evId = `charge:${sp.telegram_payment_charge_id}`;
    if (!(await recordEvent("TELEGRAM_STARS", evId, "successful_payment", { ...sp, from: u.message?.from?.id }))) return;
    try {
      await db.payment.updateMany({ where: { id: sp.invoice_payload, providerRef: null }, data: { providerRef: sp.telegram_payment_charge_id } });
      await fulfillPayment(sp.invoice_payload, { amount: sp.total_amount, currency: sp.currency, providerPaymentId: String(u.message?.from?.id ?? "") });
      await markEvent("TELEGRAM_STARS", evId, { paymentId: sp.invoice_payload });
    } catch (e) {
      await markEvent("TELEGRAM_STARS", evId, { paymentId: sp.invoice_payload, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
    return;
  }
  const rp = u.message?.refunded_payment;
  if (rp) {
    const evId = `refund:${rp.telegram_payment_charge_id}`;
    if (!(await recordEvent("TELEGRAM_STARS", evId, "refunded_payment", rp))) return;
    await applyRefund(rp.invoice_payload, rp.total_amount, "REFUND");
    await markEvent("TELEGRAM_STARS", evId, { paymentId: rp.invoice_payload });
  }
}

export async function refundStars(paymentId: string) {
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (p.provider !== "TELEGRAM_STARS" || !p.providerRef || !p.providerPaymentId) throw new Error("NOT_REFUNDABLE");
  await bot("refundStarPayment", { user_id: Number(p.providerPaymentId), telegram_payment_charge_id: p.providerRef });
  await applyRefund(p.id, p.amount, "REFUND");
}

/** Validate Telegram Mini App initData (HMAC-SHA256 with key = HMAC("WebAppData", bot_token)). */
export function verifyMiniAppInitData(initData: string, maxAgeSec = 3600) {
  if (!env.TELEGRAM_BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(env.TELEGRAM_BOT_TOKEN).digest();
  const calc = createHmac("sha256", secret).update(dataCheck).digest("hex");
  if (!safeEqual(calc, hash)) return null;
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  const user = params.get("user");
  return user ? (JSON.parse(user) as { id: number; first_name?: string; username?: string }) : null;
}

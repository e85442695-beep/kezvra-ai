import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { adminAction } from "@/lib/audit";
import { refundStripePayment } from "@/lib/billing/stripe";
import { refundStars } from "@/lib/billing/telegram-stars";

export const GET = route(async (req) => {
  await requireUser("ADMIN");
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const payments = await db.payment.findMany({
    where: { ...(status ? { status: status as never } : {}), ...(sp.get("user") ? { userId: sp.get("user")! } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { email: true } }, events: { orderBy: { createdAt: "asc" }, select: { type: true, processedAt: true, error: true, createdAt: true } } },
  });
  return json({ payments });
});

/**
 * Refund (full or partial). Money moves at the provider; credits are clawed back when the
 * provider confirms via webhook (Stripe charge.refunded) — or immediately for Stars (API is synchronous).
 */
export const POST = route(async (req) => {
  const admin = await requireUser("ADMIN");
  const input = await body(req, z.object({ paymentId: z.string(), amount: z.number().int().positive().optional(), reason: z.string().min(3).max(500) }));
  const p = await db.payment.findUnique({ where: { id: input.paymentId } });
  if (!p) throw new HttpError(404, "NOT_FOUND");
  if (!["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(p.status)) throw new HttpError(400, "NOT_REFUNDABLE");
  if (input.amount && input.amount > p.amount - p.refundedAmount) throw new HttpError(400, "AMOUNT_EXCEEDS_REFUNDABLE");

  await db.$transaction((tx) => adminAction(tx, { adminId: admin.id, targetUserId: p.userId, action: "payment.refund_requested", reason: input.reason, before: { status: p.status, refunded: p.refundedAmount }, after: { amount: input.amount ?? p.amount - p.refundedAmount } }));
  if (p.provider === "STRIPE") {
    const r = await refundStripePayment(p.id, input.amount, admin.id);
    return json({ ok: true, providerStatus: r.status, note: "Credits are revoked when Stripe confirms the refund via webhook." });
  }
  if (p.provider === "TELEGRAM_STARS") {
    if (input.amount && input.amount !== p.amount) throw new HttpError(400, "STARS_FULL_REFUND_ONLY");
    await refundStars(p.id);
    return json({ ok: true });
  }
  throw new HttpError(400, "NOT_REFUNDABLE");
});

import Stripe from "stripe";
import { db } from "@/lib/db";
import { env, integrations } from "@/lib/env";
import { applyRefund, failPayment, fulfillPayment, markEvent, recordEvent } from "./fulfill";
import { logger, errorInfo } from "@/lib/logger";

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!integrations.stripe) throw new Error("STRIPE_NOT_CONFIGURED");
  client ??= new Stripe(env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, appInfo: { name: "Kezvra AI" } });
  return client;
}

/** Create a Stripe Checkout Session for a local pending Payment. */
export async function createCheckout(payment: { id: string; userId: string; amount: number; currency: string; packageSnapshot: unknown }, email: string) {
  const snap = payment.packageSnapshot as { name: string };
  const session = await stripe().checkout.sessions.create(
    {
      mode: "payment",
      customer_email: email,
      client_reference_id: payment.id,
      line_items: [{ quantity: 1, price_data: { currency: payment.currency, unit_amount: payment.amount, product_data: { name: `Kezvra Credits — ${snap.name}` } } }],
      metadata: { paymentId: payment.id, userId: payment.userId },
      payment_intent_data: { metadata: { paymentId: payment.id, userId: payment.userId } },
      success_url: `${env.APP_URL}/billing?status=success&payment=${payment.id}`,
      cancel_url: `${env.APP_URL}/billing?status=cancelled&payment=${payment.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    { idempotencyKey: `checkout:${payment.id}` },
  );
  await db.payment.update({ where: { id: payment.id }, data: { providerRef: session.id, status: "PENDING" } });
  return session.url;
}

/** Verify the signature and parse a webhook. Throws on invalid signature. */
export function constructEvent(rawBody: string, signature: string | null) {
  if (!signature) throw new Error("MISSING_SIGNATURE");
  return stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET!);
}

async function paymentIdFromSession(s: Stripe.Checkout.Session) {
  const id = s.metadata?.paymentId ?? s.client_reference_id;
  if (!id) return null;
  // Cross-check: the local payment must reference this checkout session.
  const p = await db.payment.findUnique({ where: { id }, select: { providerRef: true } });
  if (!p || (p.providerRef && p.providerRef !== s.id)) return null;
  return id;
}

async function receiptFor(paymentIntentId: string | null) {
  if (!paymentIntentId) return null;
  try {
    const pi = await stripe().paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge"] });
    const ch = pi.latest_charge as Stripe.Charge | null;
    return ch?.receipt_url ?? null;
  } catch {
    return null;
  }
}

export async function handleStripeEvent(event: Stripe.Event) {
  const fresh = await recordEvent("STRIPE", event.id, event.type, event.data.object);
  if (!fresh) return { duplicate: true };
  let paymentId: string | undefined;
  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object;
        paymentId = (await paymentIdFromSession(s)) ?? undefined;
        if (!paymentId) throw new Error("UNKNOWN_PAYMENT");
        if (s.payment_status !== "paid") {
          await db.payment.updateMany({ where: { id: paymentId, status: "CREATED" }, data: { status: "PENDING" } });
          break; // async methods: wait for async_payment_succeeded
        }
        const pi = typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null);
        await fulfillPayment(paymentId, { amount: s.amount_total ?? -1, currency: s.currency ?? "", providerPaymentId: pi, receiptUrl: await receiptFor(pi) });
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        paymentId = (await paymentIdFromSession(event.data.object)) ?? undefined;
        if (paymentId) await failPayment(paymentId, event.type === "checkout.session.expired" ? "CANCELED" : "FAILED");
        break;
      }
      case "charge.refunded": {
        const ch = event.data.object;
        const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
        const p = pi ? await db.payment.findFirst({ where: { providerPaymentId: pi, provider: "STRIPE" } }) : null;
        if (!p) throw new Error("UNKNOWN_PAYMENT");
        paymentId = p.id;
        await applyRefund(p.id, ch.amount_refunded, "REFUND");
        break;
      }
      case "charge.dispute.created": {
        const d = event.data.object;
        const pi = typeof d.payment_intent === "string" ? d.payment_intent : d.payment_intent?.id;
        const p = pi ? await db.payment.findFirst({ where: { providerPaymentId: pi, provider: "STRIPE" } }) : null;
        if (!p) throw new Error("UNKNOWN_PAYMENT");
        paymentId = p.id;
        await applyRefund(p.id, d.amount, "CHARGEBACK");
        break;
      }
      default:
        break; // ignored event types are still recorded
    }
    await markEvent("STRIPE", event.id, { paymentId });
    return { duplicate: false };
  } catch (err) {
    logger.error({ err: errorInfo(err), eventId: event.id, type: event.type }, "stripe webhook processing failed");
    await markEvent("STRIPE", event.id, { paymentId, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/** Admin-initiated refund. Credits are clawed back when Stripe's charge.refunded webhook arrives. */
export async function refundStripePayment(paymentId: string, amount: number | undefined, actorId: string) {
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (p.provider !== "STRIPE" || !p.providerPaymentId) throw new Error("NOT_REFUNDABLE");
  return stripe().refunds.create(
    { payment_intent: p.providerPaymentId, amount, metadata: { paymentId, actorId } },
    { idempotencyKey: `refund:${paymentId}:${amount ?? "full"}:${p.refundedAmount}` },
  );
}

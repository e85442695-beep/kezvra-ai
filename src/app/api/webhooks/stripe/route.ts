import type { NextRequest } from "next/server";
import { constructEvent, handleStripeEvent } from "@/lib/billing/stripe";
import { integrations } from "@/lib/env";
import { json } from "@/lib/http/route";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe webhook. Signature is verified against the RAW body. No CSRF check (server-to-server). */
export async function POST(req: NextRequest) {
  if (!integrations.stripe) return json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 503 });
  const raw = await req.text();
  let event;
  try {
    event = constructEvent(raw, req.headers.get("stripe-signature"));
  } catch {
    logger.warn("stripe webhook signature verification failed");
    return json({ error: "INVALID_SIGNATURE" }, { status: 400 });
  }
  try {
    const r = await handleStripeEvent(event);
    return json({ received: true, duplicate: r.duplicate });
  } catch {
    // 500 → Stripe retries with backoff; processing is idempotent.
    return json({ error: "PROCESSING_FAILED" }, { status: 500 });
  }
}

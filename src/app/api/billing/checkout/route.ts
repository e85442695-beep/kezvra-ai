import { z } from "zod";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { createPendingPayment } from "@/lib/billing/fulfill";
import { createCheckout } from "@/lib/billing/stripe";
import { createStarsInvoice } from "@/lib/billing/telegram-stars";
import { integrations } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ packageId: z.string().min(1), provider: z.enum(["STRIPE", "TELEGRAM_STARS"]).default("STRIPE") });

export const POST = route(async (req) => {
  const me = await requireUser();
  if (!me.emailVerified) throw new HttpError(403, "EMAIL_NOT_VERIFIED");
  const rl = await rateLimit(`checkout:${me.id}`, 10, 600);
  if (!rl.ok) throw new HttpError(429, "TOO_MANY_REQUESTS");
  const { packageId, provider } = await body(req, schema);
  if (provider === "STRIPE" && !integrations.stripe) throw new HttpError(503, "PAYMENTS_NOT_CONFIGURED");
  if (provider === "TELEGRAM_STARS" && !integrations.telegramStars) throw new HttpError(503, "PAYMENTS_NOT_CONFIGURED");

  const payment = await createPendingPayment(me.id, packageId, provider);
  if (!payment) throw new HttpError(404, "PACKAGE_NOT_FOUND");
  const url = provider === "STRIPE" ? await createCheckout(payment, me.email) : await createStarsInvoice(payment);
  return json({ url, paymentId: payment.id });
});

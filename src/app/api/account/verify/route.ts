import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { body, clientIp, HttpError, json, route } from "@/lib/http/route";
import { consumeToken, sendVerification } from "@/lib/auth/verification";
import { rateLimit } from "@/lib/rate-limit";

/** GET ?token= (the link from the email). */
export const GET = route(async (req) => {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const email = token ? await consumeToken(token, "verify-email") : null;
  if (!email) return NextResponse.redirect(new URL("/login?verify=invalid", env.APP_URL));
  await db.user.updateMany({ where: { email, emailVerified: null }, data: { emailVerified: new Date() } });
  return NextResponse.redirect(new URL("/login?verify=ok", env.APP_URL));
});

/** POST { email } resends the link. Always returns ok. */
export const POST = route(async (req) => {
  const { email } = await body(req, z.object({ email: z.string().email() }));
  const rl = await rateLimit(`verify:${clientIp(req)}`, 5, 3600);
  if (!rl.ok) throw new HttpError(429, "TOO_MANY_REQUESTS");
  const u = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { emailVerified: true, locale: true } });
  if (u && !u.emailVerified) await sendVerification(email.toLowerCase(), u.locale);
  return json({ ok: true });
});

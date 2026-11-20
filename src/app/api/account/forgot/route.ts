import { z } from "zod";
import { db } from "@/lib/db";
import { body, clientIp, HttpError, json, route } from "@/lib/http/route";
import { sendReset } from "@/lib/auth/verification";
import { rateLimit } from "@/lib/rate-limit";

export const POST = route(async (req) => {
  const { email } = await body(req, z.object({ email: z.string().email().max(254) }));
  const e = email.toLowerCase().trim();
  const [a, b] = await Promise.all([rateLimit(`forgot:${clientIp(req)}`, 5, 3600), rateLimit(`forgot:${e}`, 3, 3600)]);
  if (!a.ok || !b.ok) throw new HttpError(429, "TOO_MANY_REQUESTS");
  const u = await db.user.findUnique({ where: { email: e }, select: { locale: true, status: true } });
  if (u && u.status === "ACTIVE") await sendReset(e, u.locale);
  return json({ ok: true }); // identical response either way
});

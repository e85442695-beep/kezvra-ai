import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { json, route } from "@/lib/http/route";
import { currentSessionToken, sessionCookieName } from "@/lib/auth/password-session";

export const POST = route(async () => {
  const token = await currentSessionToken();
  if (token) await db.session.deleteMany({ where: { sessionToken: token } });
  (await cookies()).delete(sessionCookieName());
  return json({ ok: true });
});

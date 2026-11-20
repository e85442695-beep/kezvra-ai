import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/security/tokens";

const MAX_AGE = 30 * 24 * 60 * 60;
const secure = () => env.APP_URL.startsWith("https://");
export const sessionCookieName = () => (secure() ? "__Secure-authjs.session-token" : "authjs.session-token");

/** Issue an Auth.js-compatible database session (same table/cookie Auth.js reads). */
export async function createDbSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const sessionToken = randomToken(32);
  const expires = new Date(Date.now() + MAX_AGE * 1000);
  await db.session.create({ data: { sessionToken, userId, expires, ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null } });
  const jar = await cookies();
  jar.set(sessionCookieName(), sessionToken, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", expires });
  return sessionToken;
}

export async function currentSessionToken() {
  return (await cookies()).get(sessionCookieName())?.value ?? null;
}

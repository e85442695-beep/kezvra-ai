import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, type Role } from "@/lib/db";

export { hasRole, AuthError } from "./roles";
import { hasRole, AuthError } from "./roles";

/** Current user (fresh from DB so bans/role changes apply immediately). */
export const currentUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const u = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, image: true, role: true, status: true, locale: true, theme: true, emailVerified: true, referralCode: true, favoriteModelIds: true, defaultModelId: true, passwordHash: true },
  });
  if (!u || u.status !== "ACTIVE") return null;
  const { passwordHash, ...rest } = u;
  return { ...rest, hasPassword: Boolean(passwordHash) };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

/** For route handlers: throws AuthError. */
export async function requireUser(min: Role = "USER"): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) throw new AuthError(401);
  if (!hasRole(u.role, min)) throw new AuthError(403);
  return u;
}

/** For server components/pages: redirects. */
export async function requirePageUser(min: Role = "USER", next = "/chat"): Promise<CurrentUser> {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!hasRole(u.role, min)) redirect("/chat");
  return u;
}

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  return { ip, userAgent: h.get("user-agent") };
}

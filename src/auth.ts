import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { db } from "@/lib/db";
import { env, integrations } from "@/lib/env";
import { onUserCreated } from "@/lib/auth/onboarding";
import { audit } from "@/lib/audit";

/**
 * Auth.js v5. Database sessions (revocable, listable). Email+password login uses a dedicated route
 * (`/api/auth/password/login`) that issues a database session in the same format — Auth.js'
 * Credentials provider only supports JWT sessions.
 */
const base = PrismaAdapter(db) as Adapter;
const adapter: Adapter = {
  ...base,
  // Our User model requires a referralCode; generate it on OAuth sign-up.
  async createUser(data) {
    const user = await onUserCreated({ email: data.email, name: data.name ?? null, image: data.image ?? null, emailVerified: data.emailVerified ?? null });
    return { ...user, emailVerified: user.emailVerified } as never;
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  secret: env.AUTH_SECRET ?? (env.NODE_ENV !== "production" ? "dev-only-insecure-secret-change-me-0123456789" : undefined),
  trustHost: true,
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  providers: integrations.google
    ? [Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET, allowDangerousEmailAccountLinking: false })]
    : [],
  pages: { signIn: "/login", error: "/login", verifyRequest: "/login?verify=1" },
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      const u = await db.user.findUnique({ where: { email: user.email.toLowerCase() }, select: { status: true } });
      if (u && u.status !== "ACTIVE") return "/login?error=AccountDisabled";
      return true;
    },
    async session({ session, user }) {
      const u = user as unknown as { id: string; role: string; locale: string; status: string };
      session.user.id = u.id;
      (session.user as { role?: string }).role = u.role;
      (session.user as { locale?: string }).locale = u.locale;
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      await audit("auth.login", { actorId: user.id, metadata: { provider: account?.provider ?? "unknown" } });
    },
  },
});

import type { Metadata } from "next";
import { AdminPanel } from "@/components/admin/admin-panel";
import { hasRole, requirePageUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

/** MODERATOR+ can open the panel (users, support). Everything else is ADMIN-only, enforced again by each API. */
export default async function AdminPage() {
  const user = await requirePageUser("MODERATOR", "/admin");
  return <AdminPanel isAdmin={hasRole(user.role, "ADMIN")} />;
}

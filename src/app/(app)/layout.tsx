import { AppShell } from "@/components/layout/app-shell";
import { requirePageUser, hasRole } from "@/lib/auth/session";
import { getBalance } from "@/lib/credits/ledger";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  const balance = await getBalance(user.id);
  return (
    <AppShell
      user={{ id: user.id, name: user.name, email: user.email, image: user.image, isStaff: hasRole(user.role, "MODERATOR"), isAdmin: hasRole(user.role, "ADMIN"), emailVerified: Boolean(user.emailVerified) }}
      initialBalance={balance.available.toString()}
    >
      {children}
    </AppShell>
  );
}

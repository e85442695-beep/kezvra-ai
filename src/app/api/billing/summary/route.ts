import { db } from "@/lib/db";
import { json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { getBalance } from "@/lib/credits/ledger";

/** Balance, recent ledger entries and payments for the current user. */
export const GET = route(async (req) => {
  const me = await requireUser();
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const wallet = await db.wallet.findUnique({ where: { userId: me.id }, select: { id: true } });
  const [balance, transactions, payments] = await Promise.all([
    getBalance(me.id),
    wallet
      ? db.walletTransaction.findMany({
          // hide internal reserve/release bookkeeping; keep charges (they post against RESERVED)
          where: { walletId: wallet.id, type: { notIn: ["RESERVE", "RELEASE"] } },
          orderBy: { createdAt: "desc" },
          take: 50,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true, type: true, bucket: true, amount: true, balanceAfter: true, note: true, createdAt: true, aiRequestId: true, paymentId: true },
        })
      : [],
    db.payment.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, provider: true, status: true, amount: true, currency: true, creditsGranted: true, bonusGranted: true, refundedAmount: true, receiptUrl: true, createdAt: true },
    }),
  ]);
  return json({ balance, transactions, payments });
});

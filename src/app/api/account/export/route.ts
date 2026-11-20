import { db } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

/** GDPR-style data export (JSON). File contents are not inlined — they can be downloaded from /files. */
export const GET = route(async () => {
  const me = await requireUser();
  const rl = await rateLimit(`export:${me.id}`, 3, 3600);
  if (!rl.ok) throw new HttpError(429, "TOO_MANY_REQUESTS");
  const wallet = await db.wallet.findUnique({ where: { userId: me.id } });
  const [chats, files, payments, transactions, images, assistants, prompts, referrals, apiKeys] = await Promise.all([
    db.chat.findMany({ where: { userId: me.id }, include: { messages: { where: { superseded: false }, select: { role: true, content: true, modelId: true, createdAt: true } } } }),
    db.storedFile.findMany({ where: { userId: me.id }, select: { id: true, name: true, mime: true, sizeBytes: true, createdAt: true, summary: true } }),
    db.payment.findMany({ where: { userId: me.id }, select: { id: true, provider: true, status: true, amount: true, currency: true, creditsGranted: true, createdAt: true } }),
    wallet ? db.walletTransaction.findMany({ where: { walletId: wallet.id }, select: { type: true, bucket: true, amount: true, createdAt: true, note: true } }) : [],
    db.imageGeneration.findMany({ where: { userId: me.id }, select: { id: true, prompt: true, modelId: true, status: true, createdAt: true } }),
    db.assistant.findMany({ where: { userId: me.id } }),
    db.savedPrompt.findMany({ where: { userId: me.id } }),
    db.referral.findMany({ where: { referrerId: me.id }, select: { status: true, createdAt: true } }),
    db.apiKey.findMany({ where: { userId: me.id }, select: { name: true, prefix: true, createdAt: true, revokedAt: true } }),
  ]);
  await audit("account.export", { actorId: me.id });
  return json(
    { exportedAt: new Date(), profile: me, wallet, chats, files, payments, transactions, images, assistants, prompts, referrals, apiKeys },
    { headers: { "content-disposition": `attachment; filename="kezvra-export-${me.id}.json"` } },
  );
});

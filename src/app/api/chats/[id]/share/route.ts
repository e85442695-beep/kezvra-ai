import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { body, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { ownedChat } from "@/lib/chat/service";
import { randomToken } from "@/lib/security/tokens";
import { audit } from "@/lib/audit";

/**
 * Public share link with access control: enable/disable, optional expiry, and token rotation
 * (rotating invalidates previously shared links). Shared view is read-only and omits the system prompt.
 */
const schema = z.object({ enabled: z.boolean(), expiresInDays: z.number().int().min(1).max(365).nullable().optional(), rotate: z.boolean().optional() });

export const POST = route<{ id: string }>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const chat = await ownedChat(me.id, id);
  const input = await body(req, schema);
  const token = input.rotate || !chat.shareToken ? randomToken(18) : chat.shareToken;
  const updated = await db.chat.update({
    where: { id: chat.id },
    data: {
      shareEnabled: input.enabled,
      shareToken: token,
      shareExpires: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    },
  });
  await audit("chat.share", { actorId: me.id, target: chat.id, metadata: { enabled: input.enabled, rotate: Boolean(input.rotate) } });
  return json({ enabled: updated.shareEnabled, url: updated.shareEnabled ? `${env.APP_URL}/share/${token}` : null, expires: updated.shareExpires });
});

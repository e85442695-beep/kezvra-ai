import { db } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { deleteObject, presignGet } from "@/lib/storage";
import { enqueueImage } from "@/lib/queue";

type P = { id: string };

/** Job status + short-lived signed URLs for results (owner only). */
export const GET = route<P>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const g = await db.imageGeneration.findFirst({ where: { id, userId: me.id }, include: { aiRequest: { select: { chargedMicro: true } } } });
  if (!g) throw new HttpError(404, "NOT_FOUND");
  const download = req.nextUrl.searchParams.get("download") === "1";
  const urls = await Promise.all(g.resultKeys.map((k, i) => presignGet(k, download ? `kezvra-${g.id}-${i + 1}.png` : undefined, 600)));
  return json({ generation: { ...g, resultKeys: undefined, urls } });
});

/** Re-run the same prompt/settings as a new job. */
export const POST = route<P>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const g = await db.imageGeneration.findFirst({ where: { id, userId: me.id } });
  if (!g) throw new HttpError(404, "NOT_FOUND");
  const n = await db.imageGeneration.create({ data: { userId: me.id, modelId: g.modelId, prompt: g.prompt, aspectRatio: g.aspectRatio, sourceFileId: g.sourceFileId } });
  await enqueueImage(n.id);
  return json({ generation: n }, { status: 202 });
});

export const DELETE = route<P>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const g = await db.imageGeneration.findFirst({ where: { id, userId: me.id } });
  if (!g) throw new HttpError(404, "NOT_FOUND");
  await Promise.all(g.resultKeys.map((k) => deleteObject(k).catch(() => {})));
  await db.imageGeneration.delete({ where: { id: g.id } });
  return json({ ok: true });
});

import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { getUsableModel } from "@/lib/openrouter/models";
import { enqueueImage } from "@/lib/queue";
import { getSettings } from "@/lib/settings";
import { integrations } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";


const schema = z.object({
  modelId: z.string().max(200),
  prompt: z.string().trim().min(3).max(4000),
  aspectRatio: z.string().regex(/^\d{1,2}:\d{1,2}$/).default("1:1"),
  /** image-to-image / edit: one of the user's uploaded images */
  sourceFileId: z.string().optional(),
});

export const GET = route(async (req) => {
  const me = await requireUser();
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const items = await db.imageGeneration.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    take: 40,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, modelId: true, prompt: true, aspectRatio: true, status: true, error: true, resultKeys: true, createdAt: true, sourceFileId: true, aiRequest: { select: { chargedMicro: true } } },
  });
  return json({ items: items.map(({ resultKeys, ...i }) => ({ ...i, imageCount: resultKeys.length })) });
});

/** Queue an image generation job. Credits are reserved by the worker before calling the provider. */
export const POST = route(async (req) => {
  const me = await requireUser();
  if (!integrations.storage) throw new HttpError(503, "STORAGE_NOT_CONFIGURED");
  const s = await getSettings();
  if (!s.imageGenerationEnabled) throw new HttpError(503, "IMAGES_DISABLED");
  const rl = await rateLimit(`img:${me.id}`, 10, 60);
  if (!rl.ok) throw new HttpError(429, "TOO_MANY_REQUESTS");
  const input = await body(req, schema);
  const model = await getUsableModel(input.modelId);
  if (!model || !model.outputModalities.includes("image")) throw new HttpError(400, "MODEL_NOT_IMAGE_CAPABLE");
  const opts = (model.imageOptions ?? null) as { aspectRatios?: string[]; maxInputImages?: number } | null;
  if (opts?.aspectRatios?.length && !opts.aspectRatios.includes(input.aspectRatio)) throw new HttpError(400, "ASPECT_RATIO_NOT_SUPPORTED");
  if (input.sourceFileId) {
    // Only offer image-to-image when the model accepts image input.
    if (!model.inputModalities.includes("image") || (opts && !opts.maxInputImages)) throw new HttpError(400, "MODEL_NO_IMAGE_INPUT");
    const f = await db.storedFile.findFirst({ where: { id: input.sourceFileId, userId: me.id, mime: { startsWith: "image/" } } });
    if (!f) throw new HttpError(404, "FILE_NOT_FOUND");
  }
  const active = await db.imageGeneration.count({ where: { userId: me.id, status: { in: ["QUEUED", "RUNNING"] } } });
  if (active >= 4) throw new HttpError(429, "TOO_MANY_ACTIVE_JOBS");
  const gen = await db.imageGeneration.create({ data: { userId: me.id, modelId: model.id, prompt: input.prompt, aspectRatio: input.aspectRatio, sourceFileId: input.sourceFileId } });
  await enqueueImage(gen.id);
  return json({ generation: gen }, { status: 202 });
});

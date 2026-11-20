import { db } from "@/lib/db";
import { getObjectBytes, putObject, userKey } from "@/lib/storage";
import { chunkText, extractText } from "@/lib/files/extract";
import { estimateTokens } from "@/lib/pricing";
import { embed } from "@/lib/openrouter/client";
import { generateImages } from "@/lib/openrouter/client";
import { toVectorLiteral } from "@/lib/files/retrieval";
import { prepareRequest } from "@/lib/ai/executor";
import { getUsableModel } from "@/lib/openrouter/models";
import { getSettings } from "@/lib/settings";
import { usdToPico } from "@/lib/money";
import { randomToken } from "@/lib/security/tokens";
import { logger, errorInfo } from "@/lib/logger";
import { integrations } from "@/lib/env";

/** Extract → chunk → (optionally) embed. Embeddings are a platform cost (not billed to users). */
export async function processFile(fileId: string) {
  const f = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!f) return;
  try {
    const bytes = await getObjectBytes(f.storageKey);
    const { text, pageCount } = await extractText(bytes, f.mime);
    const chunks = chunkText(text);
    await db.$transaction([
      db.fileChunk.deleteMany({ where: { fileId } }),
      db.fileChunk.createMany({ data: chunks.map((content, index) => ({ fileId, index, content, tokens: estimateTokens(content) })) }),
    ]);
    // Embeddings only pay off for documents too large to include whole.
    if (integrations.openrouter && text.length > 24_000) {
      try {
        for (let i = 0; i < chunks.length; i += 64) {
          const batch = chunks.slice(i, i + 64);
          const r = await embed(batch);
          for (const e of r.data) {
            await db.$executeRaw`UPDATE "FileChunk" SET "embedding" = ${toVectorLiteral(e.embedding)}::vector WHERE "fileId" = ${fileId} AND "index" = ${i + e.index}`;
          }
        }
      } catch (err) {
        logger.warn({ err: errorInfo(err), fileId }, "embedding failed; full-text retrieval will be used");
      }
    }
    await db.storedFile.update({ where: { id: fileId }, data: { status: "READY", textLength: text.length, pageCount: pageCount ?? null, error: null } });
  } catch (err) {
    logger.error({ err: errorInfo(err), fileId }, "file processing failed");
    await db.storedFile.update({ where: { id: fileId }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "PROCESSING_FAILED" } });
  }
}

/** Reserve → call OpenRouter /images → store results privately in S3 → settle at reported cost. */
export async function runImageGeneration(generationId: string) {
  const g = await db.imageGeneration.findUnique({ where: { id: generationId } });
  if (!g || g.status !== "QUEUED") return;
  await db.imageGeneration.update({ where: { id: g.id }, data: { status: "RUNNING" } });
  const model = await getUsableModel(g.modelId);
  if (!model) {
    await db.imageGeneration.update({ where: { id: g.id }, data: { status: "FAILED", error: "MODEL_UNAVAILABLE", completedAt: new Date() } });
    return;
  }
  const s = await getSettings();
  let prep;
  try {
    prep = await prepareRequest({
      userId: g.userId, model, kind: "IMAGE", estPromptTokens: estimateTokens(g.prompt), idempotencyKey: `img:${g.id}`,
      fixedEstimatePico: model.isFree ? undefined : usdToPico(s.imageReserveUsd),
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "FAILED";
    await db.imageGeneration.update({ where: { id: g.id }, data: { status: "FAILED", error: code, completedAt: new Date() } });
    return;
  }
  await db.imageGeneration.update({ where: { id: g.id }, data: { aiRequestId: prep.aiRequestId } });
  try {
    let refs: { type: "image_url"; image_url: { url: string } }[] | undefined;
    if (g.sourceFileId) {
      const src = await db.storedFile.findFirst({ where: { id: g.sourceFileId, userId: g.userId } });
      if (src) refs = [{ type: "image_url", image_url: { url: `data:${src.mime};base64,${Buffer.from(await getObjectBytes(src.storageKey)).toString("base64")}` } }];
    }
    const r = await generateImages({ model: model.id, prompt: g.prompt, aspect_ratio: g.aspectRatio, n: 1, input_references: refs });
    const keys: string[] = [];
    for (const img of r.data) {
      if (!img.b64_json) continue;
      const key = userKey(g.userId, "images", `${g.id}-${randomToken(6)}`);
      await putObject(key, Buffer.from(img.b64_json, "base64"), img.media_type ?? "image/png");
      keys.push(key);
    }
    if (keys.length === 0) throw new Error("NO_IMAGE_RETURNED");
    await prep.finalize({
      promptTokens: r.usage?.prompt_tokens ?? 0,
      completionTokens: r.usage?.completion_tokens ?? 0,
      upstreamCost: r.usage?.cost ?? null,
      images: keys.length,
    });
    await db.imageGeneration.update({ where: { id: g.id }, data: { status: "SUCCEEDED", resultKeys: keys, completedAt: new Date() } });
  } catch (err) {
    await prep.fail(err instanceof Error ? err.message : String(err));
    await db.imageGeneration.update({ where: { id: g.id }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "FAILED", completedAt: new Date() } });
  }
}

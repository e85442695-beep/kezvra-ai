import { z } from "zod";
import { db } from "@/lib/db";
import { body, errorResponse, HttpError, json } from "@/lib/http/route";
import { adjustKeyBudget, authenticateApiKey, holdKeyBudget } from "@/lib/apikeys";
import { getUsableModel } from "@/lib/openrouter/models";
import { estimateMessagesTokens, prepareRequest } from "@/lib/ai/executor";
import { streamChat, type ORUsage } from "@/lib/openrouter/client";
import { randomToken } from "@/lib/security/tokens";
import { formatCredits } from "@/lib/money";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const part = z.union([
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("image_url"), image_url: z.object({ url: z.string().max(20_000_000) }) }),
]);
const schema = z.object({
  model: z.string().max(200),
  messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.union([z.string(), z.array(part)]) })).min(1).max(500),
  stream: z.boolean().default(false),
  max_tokens: z.number().int().min(1).max(200_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
});

/**
 * POST /api/v1/chat/completions — OpenAI-compatible gateway.
 * Auth: `Authorization: Bearer kz_live_…`. Billing: same reserve→settle ledger as the web app,
 * plus the key's own spend limit (held atomically). Never proxies the platform's OpenRouter key.
 */
export async function POST(req: NextRequest) {
  try {
    const { key } = await authenticateApiKey(req.headers.get("authorization"), "chat");
    const input = await body(req, schema);
    if (key.allowedModels.length > 0 && !key.allowedModels.includes(input.model)) throw new HttpError(403, "MODEL_NOT_ALLOWED_FOR_KEY");
    const model = await getUsableModel(input.model);
    if (!model) throw new HttpError(404, "MODEL_NOT_FOUND");

    const est = estimateMessagesTokens(input.messages);
    if (model.contextLength && est.tokens > model.contextLength) throw new HttpError(400, "CONTEXT_TOO_LONG");
    const prep = await prepareRequest({
      userId: key.userId, model, kind: "API", estPromptTokens: est.tokens, requestedMaxTokens: input.max_tokens, images: est.images,
      apiKeyId: key.id, idempotencyKey: `api:${key.id}:${randomToken(10)}`,
    });
    const reserved = prep.reservedMicro;
    if (reserved > 0n && !(await holdKeyBudget(key.id, reserved))) {
      await prep.fail("KEY_SPEND_LIMIT");
      throw new HttpError(402, "KEY_SPEND_LIMIT_EXCEEDED");
    }

    const started = Date.now();
    const params = { model: model.id, messages: input.messages, max_tokens: prep.maxTokens, temperature: input.temperature, top_p: input.top_p, user: key.userId };
    const finish = async (usage: ORUsage | undefined, text: string, upstreamId?: string) => {
      const promptTokens = usage?.prompt_tokens ?? est.tokens;
      const completionTokens = usage?.completion_tokens ?? Math.ceil(text.length / 3);
      const { chargedMicro } = await prep.finalize({ promptTokens, completionTokens, upstreamCost: usage?.cost ?? null, upstreamId });
      await adjustKeyBudget(key.id, chargedMicro - reserved);
      await db.apiUsage.create({ data: { apiKeyId: key.id, aiRequestId: prep.aiRequestId, endpoint: "chat.completions", promptTokens, completionTokens, chargedMicro, statusCode: 200 } });
      return { promptTokens, completionTokens, chargedMicro };
    };
    const failAll = async (e: unknown) => {
      await prep.fail(e instanceof Error ? e.message : String(e));
      await adjustKeyBudget(key.id, -reserved);
    };
    const id = `chatcmpl-${prep.aiRequestId}`;
    const created = Math.floor(Date.now() / 1000);

    if (!input.stream) {
      let text = "";
      let usage: ORUsage | undefined;
      let upstreamId: string | undefined;
      let finishReason: string | null | undefined;
      try {
        for await (const ev of streamChat(params, req.signal)) {
          if (ev.type === "delta") text += ev.text ?? "";
          else ((usage = ev.usage), (upstreamId = ev.id), (finishReason = ev.finishReason));
        }
      } catch (e) {
        await failAll(e);
        throw e;
      }
      const u = await finish(usage, text, upstreamId);
      return json({
        id, object: "chat.completion", created, model: model.id,
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: finishReason ?? "stop" }],
        usage: { prompt_tokens: u.promptTokens, completion_tokens: u.completionTokens, total_tokens: u.promptTokens + u.completionTokens },
        kezvra: { credits_charged: formatCredits(u.chargedMicro, 6), latency_ms: Date.now() - started },
      });
    }

    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (o: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
        let text = "";
        try {
          let usage: ORUsage | undefined;
          let upstreamId: string | undefined;
          let fr: string | null | undefined;
          for await (const ev of streamChat(params, req.signal)) {
            if (ev.type === "delta") {
              text += ev.text ?? "";
              write({ id, object: "chat.completion.chunk", created, model: model.id, choices: [{ index: 0, delta: { content: ev.text }, finish_reason: null }] });
            } else ((usage = ev.usage), (upstreamId = ev.id), (fr = ev.finishReason));
          }
          const u = await finish(usage, text, upstreamId);
          write({
            id, object: "chat.completion.chunk", created, model: model.id, choices: [{ index: 0, delta: {}, finish_reason: fr ?? "stop" }],
            usage: { prompt_tokens: u.promptTokens, completion_tokens: u.completionTokens, total_tokens: u.promptTokens + u.completionTokens },
            kezvra: { credits_charged: formatCredits(u.chargedMicro, 6) },
          });
          controller.enqueue(enc.encode("data: [DONE]\n\n"));
        } catch (e) {
          if (text.length > 0) await finish(undefined, text).catch(() => failAll(e));
          else await failAll(e);
          try {
            write({ error: { message: e instanceof Error ? e.message : "stream error" } });
          } catch {
            /* client gone */
          }
        } finally {
          try {
            controller.close();
          } catch {
            /* closed */
          }
        }
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "x-accel-buffering": "no" } });
  } catch (err) {
    const res = errorResponse(err);
    const payload = (await res.clone().json()) as { error: string; message?: string };
    return json({ error: { code: payload.error, message: payload.message ?? payload.error } }, { status: res.status });
  }
}

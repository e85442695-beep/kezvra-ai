import { z } from "zod";
import { db } from "@/lib/db";
import { body, errorResponse, HttpError, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { getUsableModel } from "@/lib/openrouter/models";
import { runChat } from "@/lib/ai/executor";
import { sseStream } from "@/lib/http/sse";
import { rateLimit } from "@/lib/rate-limit";
import { randomToken } from "@/lib/security/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  prompt: z.string().trim().min(1).max(50_000),
  models: z.array(z.string().max(200)).min(2).max(4),
  systemPrompt: z.string().max(10_000).optional(),
  maxTokens: z.number().int().min(16).max(32_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

/**
 * Send one prompt to 2–4 models concurrently. Each model is reserved & billed separately
 * at its actual usage. SSE events are tagged with the model index.
 */
export const POST = route(async (req) => {
  const me = await requireUser();
  const input = await body(req, schema);
  if (new Set(input.models).size !== input.models.length) throw new HttpError(400, "DUPLICATE_MODELS");
  const rl = await rateLimit(`compare:${me.id}`, 10, 60);
  if (!rl.ok) throw new HttpError(429, "TOO_MANY_REQUESTS");
  const models = await Promise.all(input.models.map((id) => getUsableModel(id)));
  if (models.some((m) => !m)) throw new HttpError(400, "MODEL_UNAVAILABLE");
  const batch = randomToken(8);

  return sseStream(async (send) => {
    await Promise.all(
      models.map(async (model, i) => {
        const started = Date.now();
        let firstTokenMs: number | null = null;
        try {
          const r = await runChat({
            userId: me.id,
            model: model!,
            kind: "COMPARE",
            maxTokens: input.maxTokens,
            temperature: input.temperature,
            idempotencyKey: `compare:${batch}:${i}`,
            signal: req.signal,
            messages: [...(input.systemPrompt ? [{ role: "system" as const, content: input.systemPrompt }] : []), { role: "user", content: input.prompt }],
            onDelta: (t) => {
              firstTokenMs ??= Date.now() - started;
              send("delta", { i, t });
            },
          });
          send("done", { i, modelId: model!.id, aiRequestId: r.aiRequestId, chargedMicro: r.chargedMicro, promptTokens: r.promptTokens, completionTokens: r.completionTokens, latencyMs: r.latencyMs, firstTokenMs });
        } catch (err) {
          const res = errorResponse(err);
          send("error", { i, ...(await res.json()), status: res.status });
        }
      }),
    );
    send("end", { batch });
  });
});

/** Continue a compare result as a regular chat with the chosen model. */
export const PUT = route(async (req) => {
  const me = await requireUser();
  const input = await body(req, z.object({ modelId: z.string(), prompt: z.string().max(50_000), answer: z.string().max(200_000) }));
  if (!(await getUsableModel(input.modelId))) throw new HttpError(400, "MODEL_UNAVAILABLE");
  const chat = await db.chat.create({
    data: {
      userId: me.id, modelId: input.modelId, title: input.prompt.slice(0, 60) || "Compare",
      messages: { create: [{ role: "user", content: input.prompt, createdAt: new Date(Date.now() - 1) }, { role: "assistant", content: input.answer, modelId: input.modelId }] },
    },
  });
  return new Response(JSON.stringify({ chatId: chat.id }), { status: 201, headers: { "content-type": "application/json" } });
});

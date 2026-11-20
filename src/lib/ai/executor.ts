import { db, type AIModel, type AIRequestKind } from "@/lib/db";
import { reserve, settle, release, getBalance, InsufficientCreditsError } from "@/lib/credits/ledger";
import { holdPlatformBudget, type BudgetRelease } from "@/lib/credits/spend-guard";
import { usdToPico } from "@/lib/money";
import {
  clampCharge, computeCharge, estimateReservation, picoToMicroCredits, maxAffordableCompletionTokens, snapshot, tokenCostPico,
  type ModelPrices,
} from "@/lib/pricing";
import { getSettings, pricingConfig, type PlatformSettings } from "@/lib/settings";
import { streamChat, completeChat, type ORMessage, type ORUsage } from "@/lib/openrouter/client";
import { logger, errorInfo } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

/** Conservative fallback for models whose upstream price is variable/unknown (OpenRouter "-1"). */
const FALLBACK_PRICES: ModelPrices = {
  promptPricePico: usdToPico("0.000015"),
  completionPricePico: usdToPico("0.000075"),
  requestPricePico: 0n,
  imagePricePico: 0n,
};

export function effectivePrices(m: AIModel): ModelPrices {
  const p = {
    promptPricePico: m.promptPricePico,
    completionPricePico: m.completionPricePico,
    requestPricePico: m.requestPricePico,
    imagePricePico: m.imagePricePico,
  };
  if (!m.isFree && p.promptPricePico === 0n && p.completionPricePico === 0n && p.requestPricePico === 0n) return FALLBACK_PRICES;
  return p;
}

export class FreeQuotaError extends Error {
  constructor() {
    super("FREE_DAILY_LIMIT");
  }
}

async function checkFreeQuota(userId: string, s: PlatformSettings) {
  const key = `kz:free:${userId}:${new Date().toISOString().slice(0, 10)}`;
  try {
    const n = await getRedis().incr(key);
    await getRedis().expire(key, 60 * 60 * 26);
    if (n > s.freeModelDailyRequests) throw new FreeQuotaError();
  } catch (e) {
    if (e instanceof FreeQuotaError) throw e;
    // Redis down → fall back to DB count
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const n = await db.aIRequest.count({ where: { userId, createdAt: { gte: since }, model: { isFree: true } } });
    if (n >= s.freeModelDailyRequests) throw new FreeQuotaError();
  }
}

export interface PreparedRequest {
  aiRequestId: string;
  reservationId: string | null;
  reservedMicro: bigint;
  maxTokens: number;
  finalize: (usage: { promptTokens: number; completionTokens: number; upstreamCost?: number | string | null; upstreamId?: string; images?: number }) => Promise<{ chargedMicro: bigint }>;
  fail: (error: string, partialUsage?: ORUsage) => Promise<void>;
}

/**
 * Reserve credits and create an AIRequest. Every paid AI call in Kezvra goes through here.
 *  1. Model must be enabled & available.
 *  2. max_tokens is capped to what the balance can pay (and model/platform max).
 *  3. Worst-case cost is reserved atomically; insufficient balance → InsufficientCreditsError.
 *  4. Platform-wide daily upstream budget is held.
 */
export async function prepareRequest(opts: {
  userId: string;
  model: AIModel;
  kind: AIRequestKind;
  estPromptTokens: number;
  requestedMaxTokens?: number;
  images?: number;
  apiKeyId?: string;
  idempotencyKey: string;
  /** fixed worst-case upstream cost (picoUSD) for non-token billing, e.g. image generation */
  fixedEstimatePico?: bigint;
}): Promise<PreparedRequest> {
  const s = await getSettings();
  const cfg = pricingConfig(s, opts.model.markupBps);
  const prices = effectivePrices(opts.model);
  const hardCap = Math.min(opts.requestedMaxTokens ?? s.maxCompletionTokens, opts.model.maxCompletion ?? s.maxCompletionTokens, s.maxCompletionTokens);

  let maxTokens = hardCap;
  let reservationAmount = 0n;
  const isFree = opts.model.isFree;
  if (isFree) {
    await checkFreeQuota(opts.userId, s);
  } else if (opts.fixedEstimatePico != null) {
    const bal = await getBalance(opts.userId);
    reservationAmount = clampCharge(picoToMicroCredits(opts.fixedEstimatePico, cfg), cfg);
    if (bal.available < reservationAmount) throw new InsufficientCreditsError(reservationAmount, bal.available);
  } else {
    const bal = await getBalance(opts.userId);
    maxTokens = maxAffordableCompletionTokens(prices, cfg, opts.estPromptTokens, bal.available, hardCap);
    if (maxTokens < 16) {
      throw new InsufficientCreditsError(estimateReservation(prices, cfg, opts.estPromptTokens, 16, opts.images ?? 0), bal.available);
    }
    reservationAmount = estimateReservation(prices, cfg, opts.estPromptTokens, maxTokens, opts.images ?? 0);
  }

  const estPico = isFree ? 0n : opts.fixedEstimatePico != null ? opts.fixedEstimatePico : tokenCostPico(prices, opts.estPromptTokens, maxTokens, opts.images ?? 0);
  const releaseBudget: BudgetRelease = estPico > 0n ? await holdPlatformBudget(estPico) : async () => {};

  let reservationId: string | null = null;
  try {
    if (reservationAmount > 0n) {
      const r = await reserve({ userId: opts.userId, amount: reservationAmount, reason: `${opts.kind}:${opts.model.id}`, idempotencyKey: `ai:${opts.idempotencyKey}` });
      reservationId = r.id;
    }
  } catch (e) {
    await releaseBudget(0n);
    throw e;
  }

  const req = await db.aIRequest.create({
    data: {
      userId: opts.userId,
      modelId: opts.model.id,
      kind: opts.kind,
      status: "RUNNING",
      apiKeyId: opts.apiKeyId,
      reservationId,
      pricingSnapshot: { ...snapshot(cfg, prices), reservedMicro: reservationAmount.toString(), maxTokens },
    },
  });
  const started = Date.now();

  const finalize: PreparedRequest["finalize"] = async (u) => {
      const upstreamCostPico = u.upstreamCost != null && u.upstreamCost !== "" ? usdToPico(String(u.upstreamCost)) : null;
      const { costPico, chargeMicro } = isFree
        ? { costPico: upstreamCostPico ?? 0n, chargeMicro: 0n }
        : computeCharge(prices, cfg, { promptTokens: u.promptTokens, completionTokens: u.completionTokens, images: u.images, upstreamCostPico });
      // Record the charge on the request first so crash-recovery can settle correctly.
      await db.aIRequest.update({
        where: { id: req.id },
        data: {
          status: "SUCCEEDED",
          upstreamId: u.upstreamId,
          promptTokens: u.promptTokens,
          completionTokens: u.completionTokens,
          costPico,
          chargedMicro: chargeMicro,
          latencyMs: Date.now() - started,
          completedAt: new Date(),
        },
      });
      let charged = 0n;
      if (reservationId) {
        const r = await settle(reservationId, chargeMicro, req.id);
        charged = r.charged;
        if (r.shortfall > 0n) logger.warn({ aiRequestId: req.id, shortfall: r.shortfall.toString() }, "credit shortfall on settle");
        if (charged !== chargeMicro) await db.aIRequest.update({ where: { id: req.id }, data: { chargedMicro: charged } });
      }
      await releaseBudget(costPico);
      return { chargedMicro: charged };
  };

  return {
    aiRequestId: req.id,
    reservationId,
    reservedMicro: reservationAmount,
    maxTokens,
    finalize,
    async fail(error, partial) {
      try {
        // If tokens were produced before the failure/stop, the provider bills them — charge them.
        if (partial && (partial.completion_tokens > 0 || partial.cost)) {
          await finalize({ promptTokens: partial.prompt_tokens, completionTokens: partial.completion_tokens, upstreamCost: partial.cost ?? null });
          await db.aIRequest.update({ where: { id: req.id }, data: { error: error.slice(0, 500) } });
          return;
        }
        await db.aIRequest.update({ where: { id: req.id }, data: { status: "FAILED", error: error.slice(0, 500), completedAt: new Date(), latencyMs: Date.now() - started } });
        if (reservationId) await release(reservationId);
        await releaseBudget(0n);
      } catch (e) {
        // The worker's stale-reservation sweeper is the backstop.
        logger.error({ err: errorInfo(e), aiRequestId: req.id }, "failed to release reservation");
      }
    },
  };
}

// ───────────── Streaming chat helper used by /api/chat, /api/compare and /api/v1 ─────────────

export interface RunChatOptions {
  userId: string;
  model: AIModel;
  messages: ORMessage[];
  kind: AIRequestKind;
  temperature?: number;
  maxTokens?: number;
  apiKeyId?: string;
  idempotencyKey: string;
  signal?: AbortSignal;
  onDelta?: (text: string) => void | Promise<void>;
}

export interface RunChatResult {
  aiRequestId: string;
  text: string;
  promptTokens: number;
  completionTokens: number;
  chargedMicro: bigint;
  latencyMs: number;
  stopped: boolean;
  finishReason?: string | null;
}

export function estimateMessagesTokens(messages: ORMessage[]) {
  let chars = 0;
  let images = 0;
  for (const m of messages) {
    if (typeof m.content === "string") chars += m.content.length;
    else
      for (const p of m.content) {
        if (p.type === "text") chars += p.text.length;
        else if (p.type === "image_url") images++;
        else chars += Math.min(p.file.file_data.length, 400_000) / 2;
      }
    chars += 16;
  }
  return { tokens: Math.ceil(chars / 3) + images * 1200 + 8, images };
}

export async function runChat(o: RunChatOptions): Promise<RunChatResult> {
  const est = estimateMessagesTokens(o.messages);
  if (o.model.contextLength && est.tokens > o.model.contextLength) throw new Error("CONTEXT_TOO_LONG");
  const prep = await prepareRequest({
    userId: o.userId, model: o.model, kind: o.kind, estPromptTokens: est.tokens, requestedMaxTokens: o.maxTokens,
    images: est.images, apiKeyId: o.apiKeyId, idempotencyKey: o.idempotencyKey,
  });
  const started = Date.now();
  let text = "";
  let usage: ORUsage | undefined;
  let upstreamId: string | undefined;
  let finishReason: string | null | undefined;
  try {
    for await (const ev of streamChat(
      {
        model: o.model.id,
        messages: o.messages,
        max_tokens: prep.maxTokens,
        temperature: o.model.supportedParams.includes("temperature") ? o.temperature : undefined,
        user: o.userId,
      },
      o.signal,
    )) {
      if (ev.type === "delta" && ev.text) {
        text += ev.text;
        await o.onDelta?.(ev.text);
      } else if (ev.type === "done") {
        usage = ev.usage;
        upstreamId = ev.id;
        finishReason = ev.finishReason;
      }
    }
  } catch (err) {
    const aborted = o.signal?.aborted || (err instanceof Error && err.name === "AbortError");
    if (aborted && text.length > 0) {
      // User pressed stop: provider bills generated tokens; we charge our estimate of them.
      const completionTokens = Math.ceil(text.length / 3);
      const { chargedMicro } = await prep.finalize({ promptTokens: est.tokens, completionTokens, upstreamId });
      return { aiRequestId: prep.aiRequestId, text, promptTokens: est.tokens, completionTokens, chargedMicro, latencyMs: Date.now() - started, stopped: true };
    }
    await prep.fail(err instanceof Error ? err.message : String(err));
    throw err;
  }
  const promptTokens = usage?.prompt_tokens ?? est.tokens;
  const completionTokens = usage?.completion_tokens ?? Math.ceil(text.length / 3);
  const { chargedMicro } = await prep.finalize({ promptTokens, completionTokens, upstreamCost: usage?.cost ?? null, upstreamId });
  return { aiRequestId: prep.aiRequestId, text, promptTokens, completionTokens, chargedMicro, latencyMs: Date.now() - started, stopped: false, finishReason };
}

/** Non-streaming, billed completion (summaries, file Q&A). */
export async function runCompletion(o: Omit<RunChatOptions, "onDelta">) {
  const est = estimateMessagesTokens(o.messages);
  const prep = await prepareRequest({ userId: o.userId, model: o.model, kind: o.kind, estPromptTokens: est.tokens, requestedMaxTokens: o.maxTokens, images: est.images, idempotencyKey: o.idempotencyKey });
  try {
    const r = await completeChat({ model: o.model.id, messages: o.messages, max_tokens: prep.maxTokens, temperature: o.temperature }, o.signal);
    const { chargedMicro } = await prep.finalize({
      promptTokens: r.usage?.prompt_tokens ?? est.tokens,
      completionTokens: r.usage?.completion_tokens ?? Math.ceil(r.text.length / 3),
      upstreamCost: r.usage?.cost ?? null,
      upstreamId: r.id,
    });
    return { text: r.text, chargedMicro, aiRequestId: prep.aiRequestId };
  } catch (e) {
    await prep.fail(e instanceof Error ? e.message : String(e));
    throw e;
  }
}

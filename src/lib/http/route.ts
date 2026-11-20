import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AuthError } from "@/lib/auth/roles";
import { InsufficientCreditsError, SpendLimitError } from "@/lib/credits/ledger";
import { PlatformBudgetError } from "@/lib/credits/spend-guard";
import { FreeQuotaError } from "@/lib/ai/executor";
import { OpenRouterError, OpenRouterNotConfiguredError } from "@/lib/openrouter/client";
import { env } from "@/lib/env";
import { logger, errorInfo } from "@/lib/logger";
import { bigintReplacer } from "@/lib/money";

export class HttpError extends Error {
  constructor(public status: number, public code: string, public details?: unknown) {
    super(code);
  }
}

export function json(data: unknown, init?: ResponseInit) {
  return new NextResponse(JSON.stringify(data, bigintReplacer), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init?.headers ?? {}) },
  });
}

export function errorResponse(err: unknown) {
  if (err instanceof HttpError) return json({ error: err.code, details: err.details }, { status: err.status });
  if (err instanceof AuthError) return json({ error: err.message }, { status: err.status });
  if (err instanceof ZodError) return json({ error: "VALIDATION_ERROR", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  if (err instanceof InsufficientCreditsError) return json({ error: "INSUFFICIENT_CREDITS", required: err.required.toString(), available: err.available.toString() }, { status: 402 });
  if (err instanceof SpendLimitError) return json({ error: err.message }, { status: 402 });
  if (err instanceof FreeQuotaError) return json({ error: "FREE_DAILY_LIMIT" }, { status: 429 });
  if (err instanceof PlatformBudgetError) return json({ error: "SERVICE_BUSY" }, { status: 503 });
  if (err instanceof OpenRouterNotConfiguredError) return json({ error: "AI_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
  if (err instanceof OpenRouterError) return json({ error: "UPSTREAM_ERROR", message: err.message }, { status: err.status >= 500 ? 502 : err.status });
  if (err instanceof Error && err.message === "CONTEXT_TOO_LONG") return json({ error: "CONTEXT_TOO_LONG" }, { status: 400 });
  logger.error({ err: errorInfo(err) }, "unhandled route error");
  return json({ error: "INTERNAL_ERROR" }, { status: 500 });
}

/**
 * CSRF defence for cookie-authenticated mutations: require Origin (or Referer) to match APP_URL.
 * SameSite=Lax cookies + this check block cross-site form posts and fetches.
 * Bearer-token (API key) and signed webhook routes skip this check.
 */
export function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin") ?? (req.headers.get("referer") ? new URL(req.headers.get("referer")!).origin : null);
  const allowed = new Set([new URL(env.APP_URL).origin, req.nextUrl.origin]);
  if (!origin || !allowed.has(origin)) throw new HttpError(403, "CSRF_ORIGIN_MISMATCH");
}

type Ctx<P> = { params: Promise<P> };

export function route<P = Record<string, never>>(
  handler: (req: NextRequest, ctx: Ctx<P>) => Promise<Response>,
  opts: { csrf?: boolean } = {},
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      if (opts.csrf !== false) assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      // Let Next.js control-flow errors (dynamic usage bailout, redirect, notFound) propagate.
      if (err && typeof err === "object" && "digest" in err) throw err;
      return errorResponse(err);
    }
  };
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON");
  }
  return schema.parse(raw);
}

export function clientIp(req: NextRequest) {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim() || "unknown";
}

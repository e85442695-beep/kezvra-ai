import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, json } from "@/lib/http/route";
import { authenticateApiKey } from "@/lib/apikeys";

export const dynamic = "force-dynamic";

/** GET /api/v1/models — models available to this key (OpenAI-style list). */
export async function GET(req: NextRequest) {
  try {
    const { key } = await authenticateApiKey(req.headers.get("authorization"), "models");
    const models = await db.aIModel.findMany({
      where: { enabled: true, available: true, outputModalities: { has: "text" }, ...(key.allowedModels.length ? { id: { in: key.allowedModels } } : {}) },
      orderBy: { id: "asc" },
      select: { id: true, name: true, provider: true, contextLength: true, inputModalities: true, isFree: true },
    });
    return json({ object: "list", data: models.map((m) => ({ id: m.id, object: "model", owned_by: m.provider, name: m.name, context_length: m.contextLength, input_modalities: m.inputModalities, free: m.isFree })) });
  } catch (e) {
    return errorResponse(e);
  }
}

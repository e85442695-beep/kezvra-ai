import { z } from "zod";
import { db } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { getUsableModel } from "@/lib/openrouter/models";
import { runCompletion } from "@/lib/ai/executor";
import { retrieve, wrapUntrusted } from "@/lib/files/retrieval";
import { randomToken } from "@/lib/security/tokens";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  fileIds: z.array(z.string()).min(1).max(5),
  action: z.enum(["summary", "ask", "compare", "extract"]),
  question: z.string().max(4000).optional(),
  modelId: z.string().max(200).optional(),
});

const PROMPTS = {
  summary: "Write a structured summary of the document: key points, important numbers/dates, conclusions. Use headings and bullet lists.",
  compare: "Compare the documents: similarities, differences, contradictions, and a short conclusion. Use a Markdown table where useful.",
  extract: "Extract the key entities as Markdown tables: people, organizations, dates, amounts, obligations/deadlines.",
} as const;

/** Billed document analysis. Document text is wrapped as untrusted data (prompt-injection guard). */
export const POST = route(async (req) => {
  const me = await requireUser();
  const input = await body(req, schema);
  if (input.action === "ask" && !input.question?.trim()) throw new HttpError(400, "QUESTION_REQUIRED");
  if (input.action === "compare" && input.fileIds.length < 2) throw new HttpError(400, "NEED_TWO_FILES");
  const files = await db.storedFile.findMany({ where: { id: { in: input.fileIds }, userId: me.id } });
  if (files.length !== input.fileIds.length) throw new HttpError(404, "FILE_NOT_FOUND");
  if (files.some((f) => f.status !== "READY")) throw new HttpError(409, "FILE_NOT_READY");

  const s = await getSettings();
  const model = await getUsableModel(input.modelId ?? s.defaultModelId);
  if (!model) throw new HttpError(400, "MODEL_UNAVAILABLE");
  const task = input.action === "ask" ? input.question! : PROMPTS[input.action];
  const ctx = await retrieve(me.id, input.fileIds, task, 12);
  const r = await runCompletion({
    userId: me.id,
    model,
    kind: "FILE_ANALYSIS",
    idempotencyKey: `file:${randomToken(10)}`,
    maxTokens: 4000,
    messages: [
      { role: "system", content: "You are a precise document analyst. Answer only from the provided documents; say so when the answer is not in them." },
      { role: "system", content: wrapUntrusted(ctx, randomToken(9)) },
      { role: "user", content: task },
    ],
  });
  if (input.action === "summary" && files.length === 1) await db.storedFile.update({ where: { id: files[0]!.id }, data: { summary: r.text.slice(0, 20_000) } });
  return json({ text: r.text, chargedMicro: r.chargedMicro });
});

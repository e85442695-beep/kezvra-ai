import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { env, integrations } from "@/lib/env";
import { HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { putObject, userKey } from "@/lib/storage";
import { sniffMime } from "@/lib/files/sniff";
import { ALLOWED, safeName } from "@/lib/files/types";
import { enqueueFileProcessing } from "@/lib/queue";
import { rateLimit } from "@/lib/rate-limit";
import { randomToken } from "@/lib/security/tokens";

export const runtime = "nodejs";
const MAX_FILES_PER_USER = 500;

export const GET = route(async () => {
  const me = await requireUser();
  const files = await db.storedFile.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, name: true, mime: true, sizeBytes: true, status: true, error: true, textLength: true, pageCount: true, summary: true, createdAt: true },
  });
  return json({ files });
});

/** multipart/form-data upload, field "file". Validates size, magic-bytes MIME, quota. */
export const POST = route(async (req) => {
  const me = await requireUser();
  if (!integrations.storage) throw new HttpError(503, "STORAGE_NOT_CONFIGURED");
  const rl = await rateLimit(`upload:${me.id}`, 30, 600);
  if (!rl.ok) throw new HttpError(429, "TOO_MANY_REQUESTS");
  const max = env.MAX_UPLOAD_MB * 1024 * 1024;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > max + 64 * 1024) throw new HttpError(413, "FILE_TOO_LARGE");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "NO_FILE");
  if (file.size === 0) throw new HttpError(400, "EMPTY_FILE");
  if (file.size > max) throw new HttpError(413, "FILE_TOO_LARGE");
  if ((await db.storedFile.count({ where: { userId: me.id } })) >= MAX_FILES_PER_USER) throw new HttpError(400, "FILE_QUOTA_EXCEEDED");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = safeName(file.name);
  const mime = await sniffMime(bytes, name);
  if (!mime || !ALLOWED[mime]) throw new HttpError(415, "UNSUPPORTED_FILE_TYPE");

  const id = randomToken(12);
  const key = userKey(me.id, "files", id);
  await putObject(key, bytes, mime);
  const stored = await db.storedFile.create({
    data: { userId: me.id, name, mime, sizeBytes: file.size, storageKey: key, sha256: createHash("sha256").update(bytes).digest("hex"), status: "PROCESSING" },
  });
  await enqueueFileProcessing(stored.id);
  return json({ file: { id: stored.id, name, mime, sizeBytes: stored.sizeBytes, status: stored.status } }, { status: 201 });
});

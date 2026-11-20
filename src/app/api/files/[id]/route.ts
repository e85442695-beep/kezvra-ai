import { db } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { deleteObject, presignGet } from "@/lib/storage";
import { audit } from "@/lib/audit";

type P = { id: string };

/** Metadata + extracted text preview; ?download=1 returns a short-lived signed URL. */
export const GET = route<P>(async (req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const f = await db.storedFile.findFirst({ where: { id, userId: me.id } });
  if (!f) throw new HttpError(404, "NOT_FOUND");
  if (req.nextUrl.searchParams.get("download") === "1") return json({ url: await presignGet(f.storageKey, f.name, 120) });
  const chunks = await db.fileChunk.findMany({ where: { fileId: f.id }, orderBy: { index: "asc" }, take: 3, select: { content: true } });
  return json({ file: { ...f, storageKey: undefined, sha256: undefined, preview: chunks.map((c) => c.content).join("\n\n").slice(0, 6000) } });
});

/** Delete file, its chunks/embeddings (cascade) and the stored object. */
export const DELETE = route<P>(async (_req, { params }) => {
  const me = await requireUser();
  const { id } = await params;
  const f = await db.storedFile.findFirst({ where: { id, userId: me.id } });
  if (!f) throw new HttpError(404, "NOT_FOUND");
  await deleteObject(f.storageKey).catch(() => {});
  await db.storedFile.delete({ where: { id: f.id } });
  await audit("file.deleted", { actorId: me.id, target: f.id });
  return json({ ok: true });
});

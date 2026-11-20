import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, integrations } from "./env";

/**
 * S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, …). Objects are private; access is
 * only through short-lived presigned URLs issued after an ownership check.
 * Key layout: u/<userId>/<kind>/<id> — the userId prefix is a second line of isolation.
 */
let client: S3Client | null = null;
function s3() {
  if (!integrations.storage) throw new Error("STORAGE_NOT_CONFIGURED");
  client ??= new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
  });
  return client;
}

export const userKey = (userId: string, kind: "files" | "images", id: string) => `u/${userId}/${kind}/${id}`;

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: env.S3_ENDPOINT ? undefined : "AES256" }));
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const r = await s3().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  if (!r.Body) throw new Error("EMPTY_OBJECT");
  return r.Body.transformToByteArray();
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}

export async function presignGet(key: string, filename?: string, ttlSec = 300) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ResponseContentDisposition: filename ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` : undefined,
    }),
    { expiresIn: ttlSec },
  );
}

import { hash, verify } from "@node-rs/argon2";

// OWASP 2024+ guidance for Argon2id: m=19 MiB, t=2, p=1 (minimum). We use m=19456 KiB, t=3.
const OPTS = { memoryCost: 19456, timeCost: 3, parallelism: 1, outputLen: 32 } as const;

export const hashPassword = (pw: string) => hash(pw, { ...OPTS, algorithm: 2 /* Argon2id */ });

export async function verifyPassword(stored: string, pw: string) {
  try {
    return await verify(stored, pw);
  } catch {
    return false;
  }
}

/** Constant-ish work for unknown users to prevent user enumeration via timing. */
let dummyHash: Promise<string> | null = null;
export async function dummyVerify(pw: string) {
  dummyHash ??= hashPassword("kezvra-dummy-" + Math.random());
  await verifyPassword(await dummyHash, pw);
}

export function passwordPolicy(pw: string): string | null {
  if (pw.length < 10) return "PASSWORD_TOO_SHORT";
  if (pw.length > 256) return "PASSWORD_TOO_LONG";
  if (!/[a-zA-Zа-яА-ЯіІїЇєЄґҐ]/.test(pw) || !/\d/.test(pw)) return "PASSWORD_TOO_WEAK";
  return null;
}

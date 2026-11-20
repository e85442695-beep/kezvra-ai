import { z } from "zod";
import { db } from "@/lib/db";
import { body, json, route } from "@/lib/http/route";
import { requireUser } from "@/lib/auth/session";
import { adminAction } from "@/lib/audit";
import { creditsToMicro } from "@/lib/money";

export const GET = route(async () => {
  await requireUser("ADMIN");
  return json({ packages: await db.creditPackage.findMany({ orderBy: [{ provider: "asc" }, { sortOrder: "asc" }] }) });
});

const schema = z.object({
  id: z.string().optional(),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  name: z.string().trim().min(1).max(60),
  description: z.string().max(300).nullable().optional(),
  provider: z.enum(["STRIPE", "TELEGRAM_STARS"]),
  /** cents for fiat, number of Stars for TELEGRAM_STARS */
  priceAmount: z.number().int().positive().max(100_000_000),
  currency: z.string().regex(/^([a-z]{3}|XTR)$/),
  credits: z.string().regex(/^\d+(\.\d{1,6})?$/),
  bonusCredits: z.string().regex(/^\d+(\.\d{1,6})?$/).default("0"),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  reason: z.string().min(3).max(500),
}).refine((p) => (p.provider === "TELEGRAM_STARS") === (p.currency === "XTR"), { message: "Telegram Stars packages must use currency XTR (and only they may)", path: ["currency"] });

/** Create or update a package. Existing payments keep their own snapshot, so edits never alter past purchases. */
export const POST = route(async (req) => {
  const admin = await requireUser("ADMIN");
  const { id, reason, credits, bonusCredits, ...rest } = await body(req, schema);
  const data = { ...rest, credits: creditsToMicro(credits), bonusCredits: creditsToMicro(bonusCredits) };
  const pkg = await db.$transaction(async (tx) => {
    const before = id ? await tx.creditPackage.findUnique({ where: { id } }) : null;
    const p = id ? await tx.creditPackage.update({ where: { id }, data }) : await tx.creditPackage.create({ data });
    await adminAction(tx, {
      adminId: admin.id, action: id ? "package.update" : "package.create", reason,
      before: before ? JSON.parse(JSON.stringify(before, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) : undefined,
      after: JSON.parse(JSON.stringify(p, (_k, v) => (typeof v === "bigint" ? v.toString() : v))),
    });
    return p;
  });
  return json({ package: pkg });
});

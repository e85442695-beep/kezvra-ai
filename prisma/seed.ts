import "dotenv/config";
import { db } from "../src/lib/db";
import { settingsSchema } from "../src/lib/settings";
import { syncModels } from "../src/lib/openrouter/models";
import { hashPassword } from "../src/lib/auth/password";
import { onUserCreated } from "../src/lib/auth/onboarding";
import { creditsToMicro } from "../src/lib/money";

/**
 * Idempotent seed. Safe to run repeatedly in any environment.
 *  - platform settings (defaults; existing values are kept)
 *  - default credit packages (only created if missing — edit them in /admin afterwards)
 *  - prompt templates
 *  - model catalog from the public OpenRouter Models API (real data)
 *  - optional local admin: only when SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD are set
 */
async function main() {
  const existing = await db.systemSetting.findUnique({ where: { key: "platform" } });
  const settings = settingsSchema.parse(existing?.value ?? {});
  await db.systemSetting.upsert({ where: { key: "platform" }, create: { key: "platform", value: settings }, update: {} });
  console.log("✓ settings");

  const packages = [
    // Fiat (Stripe). priceAmount in cents. Review these tariffs before launch.
    { slug: "starter", name: "Starter", provider: "STRIPE", priceAmount: 500, currency: "usd", credits: "5000", bonusCredits: "0", sortOrder: 1 },
    { slug: "plus", name: "Plus", provider: "STRIPE", priceAmount: 2000, currency: "usd", credits: "20000", bonusCredits: "1000", sortOrder: 2 },
    { slug: "pro", name: "Pro", provider: "STRIPE", priceAmount: 5000, currency: "usd", credits: "50000", bonusCredits: "5000", sortOrder: 3 },
    { slug: "team", name: "Team", provider: "STRIPE", priceAmount: 10000, currency: "usd", credits: "100000", bonusCredits: "15000", sortOrder: 4 },
    // Telegram-specific tariff. Priced in Stars (XTR); deliberately NOT converted to USD.
    { slug: "tg-3500", name: "3 500 credits", provider: "TELEGRAM_STARS", priceAmount: 150, currency: "XTR", credits: "3500", bonusCredits: "0", sortOrder: 1 },
  ] as const;
  for (const p of packages) {
    await db.creditPackage.upsert({
      where: { slug: p.slug },
      create: { ...p, credits: creditsToMicro(p.credits), bonusCredits: creditsToMicro(p.bonusCredits) },
      update: {},
    });
  }
  console.log(`✓ ${packages.length} credit packages`);

  const templates = [
    { title: "Code review", category: "Code", content: "Review the following code for bugs, security issues and readability. List concrete problems with line references and suggest fixes:\n\n```\n{{code}}\n```" },
    { title: "Summarize for a busy reader", category: "Writing", content: "Summarize the text below in 5 bullet points, then give a one-sentence takeaway:\n\n{{text}}" },
    { title: "Explain like a teacher", category: "Learning", content: "Explain {{topic}} step by step, starting from the basics, with one short example at each step." },
    { title: "Translate UK ⇄ EN", category: "Language", content: "Translate the following text between Ukrainian and English, keeping tone and formatting:\n\n{{text}}" },
    { title: "SQL from description", category: "Code", content: "Write a PostgreSQL query for: {{task}}. Tables: {{schema}}. Explain any index that would help." },
  ];
  for (const t of templates) {
    const found = await db.savedPrompt.findFirst({ where: { isTemplate: true, userId: null, title: t.title } });
    if (!found) await db.savedPrompt.create({ data: { ...t, isTemplate: true } });
  }
  console.log(`✓ ${templates.length} prompt templates`);

  try {
    const r = await syncModels();
    console.log(`✓ models synced from OpenRouter: ${r.upserted} (${r.markedUnavailable} marked unavailable)`);
    // Feature a handful of well-known families if they exist in the live catalog (never invented).
    const prefixes = ["openai/gpt-4o-mini", "anthropic/claude-sonnet", "google/gemini-2.5-flash", "deepseek/deepseek-chat", "meta-llama/llama-3.3-70b", "mistralai/mistral-small", "qwen/qwen3-coder", "x-ai/grok"];
    for (const prefix of prefixes) {
      // Skip routing variants like ":batch", ":free", ":thinking" — feature the base model.
      const m = await db.aIModel.findFirst({ where: { id: { startsWith: prefix }, available: true, NOT: { id: { contains: ":" } } }, orderBy: { id: "desc" } });
      if (m) await db.aIModel.update({ where: { id: m.id }, data: { featured: true } });
    }
    const def = await db.aIModel.findFirst({ where: { id: settings.defaultModelId } });
    if (!def) console.warn(`! default model ${settings.defaultModelId} not in catalog — set another in /admin`);
  } catch (e) {
    console.warn("! model sync failed (network?):", e instanceof Error ? e.message : e);
  }

  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (email && password) {
    const u = await db.user.findUnique({ where: { email } });
    if (!u) {
      await onUserCreated({ email, name: "Admin", passwordHash: await hashPassword(password), emailVerified: new Date(), locale: "uk" });
      await db.user.update({ where: { email }, data: { role: "SUPER_ADMIN" } });
      console.log(`✓ admin user ${email}`);
    } else console.log(`= admin user ${email} exists`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });

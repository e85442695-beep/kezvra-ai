import { z } from "zod";

/**
 * Server-side environment, validated once at startup. Integrations that are not configured are
 * reported as disabled (see `integrations`) instead of silently faking behaviour.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgresql://kezvra:kezvra@localhost:5432/kezvra"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api/v1"),
  /** Hard USD ceiling for all upstream spend per UTC day (decimal string). */
  OPENROUTER_DAILY_BUDGET_USD: z.string().default("50"),
  EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().default("Kezvra AI <no-reply@kezvra.ai>"),
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),
  SUPER_ADMIN_EMAILS: z.string().default(""),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with a readable message; never print values.
  console.error("Invalid environment:", parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  throw new Error("Invalid environment configuration");
}
export const env = parsed.data;

if (env.NODE_ENV === "production" && !env.AUTH_SECRET) {
  throw new Error("AUTH_SECRET is required in production");
}

export const integrations = {
  openrouter: Boolean(env.OPENROUTER_API_KEY),
  google: Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET),
  storage: Boolean(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY),
  stripe: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
  telegramStars: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_WEBHOOK_SECRET),
  email: Boolean(env.SMTP_URL),
  sentry: Boolean(env.SENTRY_DSN),
} as const;

export type Integration = keyof typeof integrations;

import pino from "pino";

/**
 * Structured JSON logger. Secrets, tokens, passwords, payment data and document contents are
 * redacted by path — never log raw request bodies.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.SERVICE_NAME ?? "kezvra-web" },
  redact: {
    paths: [
      "password", "*.password", "passwordHash", "*.passwordHash",
      "token", "*.token", "*.apiKey", "apiKey", "authorization", "*.authorization",
      "headers.authorization", "headers.cookie", "*.headers.authorization", "*.headers.cookie",
      "*.secret", "secret", "*.card", "*.content", "content", "messages", "*.messages", "prompt", "*.prompt",
    ],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function errorInfo(err: unknown) {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { message: String(err) };
}

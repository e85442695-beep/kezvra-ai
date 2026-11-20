import * as Sentry from "@sentry/nextjs";

/** Server/edge error monitoring. Enabled only when SENTRY_DSN is set; PII is not sent. */
export async function register() {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.05,
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data; // never ship prompts, documents or payment payloads
        if (event.request.headers) delete event.request.headers.authorization;
      }
      return event;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;

# Kezvra AI — progress log

Last updated: 2026-11-20 ~16:15 (session paused for a scheduled power outage at 17:00).
Read this first when resuming. Screenshots of every page: `screenshots/`.

## How to resume locally

```bash
pnpm install
npx prisma dev start kezvra          # local Postgres (Prisma dev server / PGlite, port 51214)
npx prisma migrate deploy
pnpm db:seed                          # settings, packages, templates, 500+ real models from OpenRouter
pnpm dev                              # http://localhost:3000
```

`.env` exists locally (git-ignored). A local SUPER_ADMIN is seeded from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env`.
`OPENROUTER_API_KEY` comes from the Windows user environment, so chat works locally with real models.

### Local environment limits (not app bugs)

- **No Redis on this machine** → rate limits fall back to in-memory, the BullMQ worker can't run, so file processing and image jobs stay queued. Use `docker compose up` (Redis included) to test them.
- **No S3** → files and images show "storage not configured".
- **`prisma dev` (PGlite) is single-database and dislikes parallel connections** → `next build` logs `prisma:error Connection terminated` during prerender (pages fall back gracefully), and integration tests now refuse to run against it (guard in `tests/integration/global-setup.ts`). Run integration tests against real Postgres: `docker compose up -d postgres` and set `TEST_DATABASE_URL`.

## Phase status

| Phase | Status |
| --- | --- |
| 1 Architecture, DB, design system | Done. Prisma 7 schema, 2 migrations (+ CHECK constraints, append-only ledger trigger, pgvector HNSW, FTS). Graphite design tokens, one violet accent, no gradients (per user request). |
| 2 Landing, auth, profile | Done. Landing, /login /register /forgot-password /reset-password, email verification, Argon2id, lockout + rate limits, DB sessions, revoke sessions, Google OAuth (when configured), /settings + /settings/security, export, account deletion. |
| 3 Chat, OpenRouter, models | Done and verified with a real OpenRouter key (reserve → charge → release). Streaming, stop, regenerate, edit, folders, pin, archive, search, share links, clone, export, params, attachments, Markdown/LaTeX/code. Catalog sync (502 models) with pagination. |
| 4 Images, files, compare | Done (UI + API + worker). Not tested end-to-end locally (needs S3 + Redis). |
| 5 Credits, billing, payments | Done. Not tested against real Stripe (no keys). |
| 6 Referrals, API gateway, settings | Done. /api/v1 OpenAI-compatible, docs at /docs/api. |
| 7 Admin, stats, audit | Done and checked in the browser (dashboard, users, models, packages, payments, settings, tickets, announcements, logs). |
| 8 Security, tests, deploy | Mostly done — see below. |

## Tests (last run 2026-11-20)

- Typecheck: clean. ESLint: 0 errors, 18 warnings (`react-hooks/set-state-in-effect`, intentionally downgraded — TODO refactor).
- Unit: 15/15 (`pnpm test`).
- Integration: 28/28 (`pnpm test:integration`) — ledger races, double crediting, refunds, chargebacks, webhook dedupe, payload sanitising, data isolation, roles, referrals, API key spend limits. NOTE: that run happened on PGlite before the guard existed; re-run on real Postgres.
- E2E: 30/30 (`pnpm test:e2e`, desktop + mobile) — axe WCAG 2.2 AA on public pages, auth redirects, skip link, security headers, CSRF, API key auth, unsigned webhook rejection.
- `next build`: succeeds.

## Fixed in this session (notable)

- Route wrapper swallowed Next.js dynamic-usage errors → could cache a 500 for `/api/models`. Now rethrows `digest` errors.
- Admin stats: raw SQL `sum()` returned numeric → BigInt mix crash; now cast to bigint; queries batched on one connection.
- Payment fulfillment read settings on a second connection inside its transaction → now read before the transaction.
- Contrast and keyboard a11y fixes (faint/danger tokens, underlined inline links, focusable code blocks).

## Next steps

0. Housekeeping on resume: delete the temporary screenshot session in the local DB — `DELETE FROM "Session" WHERE "userAgent" = 'claude-preview';` (expires by itself on 2026-11-21).
1. Run integration tests and a full flow against `docker compose up` (Postgres + Redis + worker): file upload/processing, image generation, Stripe test mode (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`).
2. Refactor the `set-state-in-effect` warnings.
3. E2E for signed-in flows (chat send with a mocked OpenRouter, billing checkout in Stripe test mode, admin credit adjustment).
4. Real prices for credit packages; legal texts reviewed by a lawyer.
5. Telegram Mini App frontend (backend adapter + webhook + initData verification exist).

## Integrations waiting for external setup

Stripe keys + webhook secret, S3 bucket, SMTP, Google OAuth client, Telegram bot token + webhook secret, Sentry DSN, legal texts, real package prices. OpenRouter key is set locally.

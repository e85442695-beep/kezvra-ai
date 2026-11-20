# Kezvra AI

AI platform: hundreds of models via OpenRouter in one interface — streaming chat, model comparison, image generation, document analysis, a developer API, and an exact credit ledger with Stripe payments.

Stack: Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 · Radix UI · Motion · PostgreSQL + pgvector · Prisma 7 · Redis + BullMQ · Auth.js v5 · Stripe · S3 · Sentry.

Status and open items: see [PROGRESS.md](PROGRESS.md). Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Security: [docs/SECURITY.md](docs/SECURITY.md). Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Local development

Requirements: Node 22, pnpm, PostgreSQL 15+ with the `vector` extension, Redis 7 (or just Docker).

```bash
pnpm install
cp .env.example .env            # fill DATABASE_URL, REDIS_URL, AUTH_SECRET, OPENROUTER_API_KEY
docker compose up -d postgres redis   # or use your own instances
pnpm db:migrate
pnpm db:seed                    # settings, credit packages, templates, real model catalog
pnpm dev                        # web on http://localhost:3000
pnpm worker                     # background jobs (files, images, sweeps, model sync)
```

No Docker on Windows? `npx prisma dev` starts a local Postgres for development (Redis-dependent features then fall back or wait).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm worker` | BullMQ worker (graceful shutdown on SIGTERM) |
| `pnpm typecheck` · `pnpm lint` | Static checks |
| `pnpm test` | Unit tests (money, pricing) |
| `pnpm test:integration` | Ledger, payments, refunds, webhooks, access control — against a separate `*_test` database |
| `pnpm test:e2e` | Playwright + axe accessibility checks |
| `pnpm db:migrate` · `pnpm db:seed` · `pnpm models:sync` | Database and catalog |

## What needs external setup before launch

Everything below is read from environment variables; features show an explicit "not configured" state until set.

- **OpenRouter** API key and a daily budget (`OPENROUTER_DAILY_BUDGET_USD`).
- **Stripe** secret key and webhook secret; webhook endpoint `/api/webhooks/stripe` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`.
- **S3-compatible bucket** (private) for files and images.
- **SMTP** for email verification and password reset.
- **Google OAuth** client (optional).
- **Telegram** bot token + webhook secret for Stars (future Mini App).
- **Sentry** DSN (optional).
- **Legal**: the Terms, Privacy and Cookie pages are templates — fill in the operator details and have them reviewed by a lawyer.
- **Prices**: seeded credit packages are placeholders; set real prices in Admin → Packages.

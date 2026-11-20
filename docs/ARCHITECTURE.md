# Architecture

## Processes

- **web** — Next.js app: pages, route handlers (`src/app/api/**`), SSE streaming for chat/compare/API.
- **worker** — BullMQ consumers (`src/worker`): file extraction + embeddings, image generation, stale-reservation sweeper (every minute), model catalog sync (every 6h), data-retention purge (daily).
- **PostgreSQL + pgvector**, **Redis** (queues, rate limits, platform spend counter), **S3** (private objects).

## Money

- USD amounts: `BigInt` **picoUSD** (10^-12 USD). OpenRouter per-token prices like `"0.0000025"` parse exactly.
- Credits: `BigInt` **microcredits** (10^-6 credit). No floating point anywhere in balances or charges (`src/lib/money.ts`).
- Price: `credits = ceil(costPico × creditsPerUsd × (10000 + markupBps) / 10000 / 10^6)`, then clamped by min/max charge (`src/lib/pricing.ts`). Rounding always favours the platform by at most one microcredit.
- The tariff (rate, markup, model prices, min/max) is snapshotted into `AIRequest.pricingSnapshot` at reservation time.

## Credit ledger (`src/lib/credits/ledger.ts`)

Wallet buckets: `bonus`, `purchased`, `reserved`. Every change writes `WalletTransaction` rows in the same DB transaction.

1. **Reserve** — lock wallet row (`SELECT … FOR UPDATE`), check available ≥ worst-case cost and the daily spend limit, move funds bonus-first into `reserved`.
2. **Call the model** with `max_tokens` capped to what the balance can pay (`maxAffordableCompletionTokens`), so a request can never exceed the balance.
3. **Settle** — charge the actual cost (OpenRouter `usage.cost`, else tokens × price) from the reserve, return the rest to the original buckets. Overage beyond the reserve is taken from the balance; anything uncollectable is logged as a shortfall, never a negative balance.
4. **Crash recovery** — reservations have a TTL; the worker settles or releases expired ones.

Guarantees: idempotency keys (unique) on every ledger operation; DB `CHECK` constraints forbid negative balances; a trigger makes `WalletTransaction` append-only; a Redis counter caps total OpenRouter spend per day (fails closed in production).

## Payments (`src/lib/billing`)

`createPendingPayment` snapshots the package → provider checkout → webhook. Double crediting is prevented three times: unique `(provider, providerEventId)` on `PaymentEvent`, a row lock + status check on `Payment`, and the ledger idempotency key `purchase:<paymentId>`. Paid amount and currency are verified against the order. Refunds and chargebacks claw back credits proportionally to the refunded amount; a chargeback that can't be collected suspends the account.

Telegram Stars uses the same state machine; Stars packages are priced in XTR and never converted to USD.

## Auth

Auth.js v5 with database sessions (listable, revocable). Email + password is a custom route that issues a session in the same table/cookie (Credentials provider can't use DB sessions). Argon2id hashes, layered rate limits, account lockout, constant-ish timing for unknown users, token hashes for verification/reset. RBAC: `USER < MODERATOR < ADMIN < SUPER_ADMIN`, checked on every route (`requireUser(min)`), with the user re-read from the DB each request so bans apply immediately.

## Documents and retrieval

Upload → magic-byte MIME check → S3 → worker extracts text → chunks (~2400 chars, 300 overlap) → embeddings only for large docs → `retrieve()` uses pgvector cosine (HNSW), falls back to Postgres full-text ranking. Document text is wrapped in `<untrusted-document>` blocks with a random boundary and explicit "data, not instructions" rules.

## Decisions

- **Prisma 7 + driver adapter (`@prisma/adapter-pg`)** — current stable; raw SQL used where Prisma can't express it (row locks, pgvector, FTS).
- **SSE instead of WebSockets** — one-directional streams, works through proxies/CDNs, no sticky sessions.
- **Graphite UI, single accent** — per product owner request; richness lives in content (the cost receipt under each answer is the signature detail).
- **OpenRouter `/images` endpoint** — image models and their real options (aspect ratios, reference images) come from `/images/models`; the UI only offers what each model supports.

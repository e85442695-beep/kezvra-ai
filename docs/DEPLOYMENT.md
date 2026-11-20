# Deployment

Target: one Linux VM (4 vCPU / 8 GB is comfortable to start) with Docker. Scale web and worker horizontally later — both are stateless.

## 1. First deploy

```bash
git clone <repo> kezvra && cd kezvra
cp .env.example .env    # fill every required value; generate secrets with: openssl rand -base64 48
docker compose up -d --build
docker compose run --rm worker pnpm db:seed
```

HTTPS: point DNS to the server, put your domain in `deploy/Caddyfile`, then `docker compose --profile https up -d caddy`. Caddy obtains certificates automatically and doesn't buffer SSE streams.

## 2. External services

1. **Stripe**: create a webhook endpoint `https://<domain>/api/webhooks/stripe` (events listed in README), copy the signing secret to `STRIPE_WEBHOOK_SECRET`.
2. **S3**: create a private bucket; the access key needs only `GetObject`, `PutObject`, `DeleteObject` on it.
3. **Telegram** (optional): `setWebhook` with `url=https://<domain>/api/webhooks/telegram` and `secret_token=$TELEGRAM_WEBHOOK_SECRET`.
4. Sign up with an email listed in `SUPER_ADMIN_EMAILS` → you get SUPER_ADMIN. Review Admin → Settings (credit rate, markup, bonuses) and Admin → Packages (real prices).

## 3. Updates

```bash
git pull && docker compose up -d --build   # migrate runs first; web/worker restart gracefully
```

Health: `GET /api/health` (liveness), `GET /api/health?ready=1` (DB + Redis). Public status page: `/status`.

## 4. Backups

- **PostgreSQL** — nightly logical dump, kept 14 days locally and copied off-site:
  ```bash
  # /etc/cron.d/kezvra-backup
  0 3 * * * root cd /opt/kezvra && docker compose exec -T postgres pg_dump -U kezvra -Fc kezvra > backups/kezvra-$(date +\%F).dump && find backups -name '*.dump' -mtime +14 -delete
  ```
  For point-in-time recovery use a managed Postgres or WAL archiving (pgBackRest / wal-g).
- **S3** — enable bucket versioning and a lifecycle rule; replicate to another region if required.
- **Redis** — AOF enabled; queues are recoverable (jobs are re-creatable from DB state), so Redis is not backed up.

## 5. Restore

```bash
docker compose stop web worker
docker compose exec -T postgres dropdb -U kezvra kezvra
docker compose exec -T postgres createdb -U kezvra kezvra
docker compose exec -T postgres pg_restore -U kezvra -d kezvra --no-owner < backups/kezvra-YYYY-MM-DD.dump
docker compose run --rm migrate          # applies any newer migrations
docker compose start web worker
```

Verify after restore: `/api/health?ready=1`, sign in as admin, check Admin → Overview totals, and confirm the ledger matches wallets:

```sql
SELECT w.id FROM "Wallet" w
JOIN (SELECT "walletId", bucket, sum(amount) s FROM "WalletTransaction" GROUP BY 1,2) t ON t."walletId" = w.id
WHERE (t.bucket='BONUS' AND t.s <> w."bonusBalance") OR (t.bucket='PURCHASED' AND t.s <> w."purchasedBalance") OR (t.bucket='RESERVED' AND t.s <> w."reservedBalance");
-- must return 0 rows
```

## 6. Resource limits & shutdown

Limits are set per service in `docker-compose.yml`. `stop_grace_period` gives web 30 s and worker 40 s to finish in-flight requests/jobs; the worker closes BullMQ consumers on SIGTERM, and unfinished credit reservations are released by the sweeper.

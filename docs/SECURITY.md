# Security

| Area | Implementation |
| --- | --- |
| Secrets | Only in environment variables; `.env` is git-ignored; `src/lib/env.ts` validates and never prints values. |
| Passwords | Argon2id (m=19 MiB, t=3). Policy: ≥10 chars, letters + digits. |
| Brute force | Per-IP and per-account rate limits, 15-minute lockout after 5 failures, uniform errors. |
| Sessions | DB sessions, httpOnly + SameSite=Lax + Secure (on HTTPS) cookies; password change/reset revokes other sessions. |
| CSRF | Cookie-authenticated mutations require a matching `Origin`/`Referer` (`assertSameOrigin`). API keys and signed webhooks are exempt. |
| XSS | React escaping; Markdown rendered without raw HTML; link schemes allow-listed; CSP with per-request nonce, `frame-ancestors 'none'`. |
| Headers | HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP. |
| Validation | zod on every route body/query. |
| Authorization | `requireUser(role)` on every route; every query on user data is scoped by `userId`; tests prove cross-user access returns 404. |
| Files | Size limit, magic-byte MIME sniffing, per-user quotas, private bucket, user-prefixed keys, 2–10 minute presigned URLs after an ownership check. |
| Prompt injection | Documents fenced as untrusted data with a random boundary and explicit rules. |
| Payments | Webhook signature verification on the raw body, event dedupe, amount/currency verification, idempotent fulfillment, payload sanitising before storage. |
| Spend limits | Per-request max charge, per-wallet daily limit, per-API-key spend limit (atomic), platform daily OpenRouter budget. |
| API keys | 256-bit random, SHA-256 stored, shown once, scopes, model allow-list, RPM limit, rotation, revocation. |
| Logging | pino with redaction of passwords, tokens, keys, cookies, prompts and message contents. Sentry strips request bodies, cookies and auth headers. |
| Audit | `AuditLog` for security events; `AdminAction` (with mandatory reason, before/after) for every admin mutation. |

## Data retention

- Chats, files, images: until the user deletes them or the account.
- Account deletion: content and objects removed immediately; user row anonymized after 30 days; payments and ledger kept for accounting obligations.
- Error logs: 90 days. Webhook payloads: stored sanitised.

## Reporting

Report vulnerabilities to [security contact to be set by the operator].

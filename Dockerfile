# syntax=docker/dockerfile:1.7
# Multi-stage build: deps → build → slim runtime (Next.js standalone) + worker image target.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm prisma generate && pnpm build

# ── Web runtime ──────────────────────────────────────────────
FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -r app && useradd -r -g app -u 10001 app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Next.js standalone server handles SIGTERM gracefully (finishes in-flight requests).
CMD ["node", "server.js"]

# ── Worker + migrations runtime (full deps, runs TS via tsx) ──
FROM build AS worker
ENV NODE_ENV=production SERVICE_NAME=kezvra-worker
RUN groupadd -r app && useradd -r -g app -u 10001 app && chown -R app:app /app
USER app
CMD ["pnpm", "worker"]

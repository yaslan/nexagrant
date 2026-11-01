# Multi-stage production Dockerfile for Avrupa Proje Fabrikası (Next.js 16)

# Node 22: graphile-worker 0.18 needs >= 22.18 (ADR-0008); CI already runs 22.
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
# pnpm-workspace.yaml carries `allowBuilds`: without it pnpm 11 stops with
# ERR_PNPM_IGNORED_BUILDS (prisma, esbuild, …) and no image builds.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# The client is generated here, not in deps: `next build` imports
# .prisma/client (index-browser) and fails without it (İNCELEME-38 B-2).
RUN node_modules/.bin/prisma generate
RUN pnpm build

# Scheduled-job worker (ADR-0008): `docker build --target worker`.
# Sits BEFORE `runner` on purpose: without --target, docker builds the LAST
# stage, and that must stay the web app (`docker build .`, İNCELEME-38 B-2).
# A long-running process next to the web container; it runs TypeScript through
# tsx, so it keeps the full dependency tree instead of the standalone bundle.
# Needs DATABASE_URL, and JOBS_CRON_ENABLED set explicitly (true/false): a
# production worker refuses to start without it (src/lib/env.ts jobsCronEnabled).
FROM base AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node_modules/.bin/prisma generate
# Revision label (FO-308 R-1): deploy/vps/ops.sh compares it with `git rev-parse HEAD` and refuses a
# mismatch. Build with: GIT_REVISION=$(git rev-parse HEAD) docker compose -f deploy/vps/docker-compose.prod.yml build
ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision=$GIT_REVISION
USER node
CMD ["node_modules/.bin/tsx", "scripts/jobs-worker.ts"]

# Web application: the default (last) stage, `docker build .` or `--target runner`.
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Database CA (public certificate, not a secret): DATABASE_URL names it with
# sslmode=verify-full&sslrootcert=/app/certs/... (docs/RELEASE_CHECKLIST.md §2.1).
# The worker stage has it through `COPY . .`.
COPY --from=builder /app/certs ./certs

ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision=$GIT_REVISION

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]

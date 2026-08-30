# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
# Skip Puppeteer's own Chromium download during npm ci — many hosting/VPS
# build environments block outbound access to Google's Chrome-for-Testing
# CDN. The runner stage installs Chromium from Debian's own apt mirrors
# instead, which is far more likely to be reachable.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build:docker

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

LABEL org.opencontainers.image.title="Epito" \
      org.opencontainers.image.description="Portal klienta dla biur rachunkowych" \
      org.opencontainers.image.source="https://github.com/GrimorDev/epito"

# Chromium (for rendering KSeF invoice PDFs) from Debian's own apt mirrors,
# not Puppeteer's bundled download. bookworm-backports is enabled because
# bookworm's own chromium build has needed a newer libc++/libunwind than the
# base release ships at times; harmless to add even when not needed.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && echo "deb http://deb.debian.org/debian bookworm-backports main" > /etc/apt/sources.list.d/backports.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends chromium \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/data/uploads \
    && chown -R nextjs:nodejs /app/data

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/db/postgres ./db/postgres

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "server.js"]

FROM base AS document_worker

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/data/uploads \
    && chown -R nextjs:nodejs /app/data

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/scripts ./scripts
RUN npm prune --omit=dev && chown -R nextjs:nodejs /app

USER nextjs

CMD ["node", "scripts/document-worker.mjs"]

FROM base AS ksef_worker

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/data/uploads \
    && chown -R nextjs:nodejs /app/data

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/scripts ./scripts
RUN npm prune --omit=dev && chown -R nextjs:nodejs /app

USER nextjs

CMD ["node", "scripts/ksef-worker.mjs"]

FROM postgres:16-alpine AS backup_worker
RUN apk add --no-cache openssl
COPY --chmod=0555 scripts/backup.sh /usr/local/bin/epito-backup
ENTRYPOINT ["/usr/local/bin/epito-backup"]

# Keep the web application as the default result of `docker build .`.
# Compose selects the worker targets explicitly.
FROM runner AS final

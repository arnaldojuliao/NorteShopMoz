# NorteShopMoz Frontend - Production Dockerfile
# Multi-stage build for Next.js with standalone output

# ── Base image ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine
# to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci

# ── Builder ─────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Build arguments for environment variables.
#
# IMPORTANTE: os valores NEXT_PUBLIC_* são inlined no bundle do browser em tempo
# de build — têm de ser declarados como ARG aqui e passados em build.args (ver
# docker-compose.prod.yml). Um ARG passado pelo compose mas não declarado é
# ignorado silenciosamente.
#
# O código consome NEXT_PUBLIC_API_BASE_URL (lib/api.ts) e NEXT_PUBLIC_SITE_URL
# (config/site.ts, proxy.ts); NEXT_PUBLIC_API_URL/APP_URL existem por
# compatibilidade e servem de fallback.
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_FACEBOOK_APP_ID
ARG NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES

ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-$NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL:-$NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_FACEBOOK_APP_ID=$NEXT_PUBLIC_FACEBOOK_APP_ID
ENV NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES=$NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client if needed (uncomment if using Prisma)
# RUN npx prisma generate

# Build the application with standalone output
RUN npm run build

# ── Runner ──────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", "server.js"]
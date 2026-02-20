# Frontend Dockerfile — Next.js 16 standalone build
FROM node:20-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build args become env vars at build time
ARG BACKEND_URL=http://localhost:8000
ARG AUTH_SECRET
ARG AUTH_GITHUB_ID
ARG AUTH_GITHUB_SECRET
ARG AUTH_GOOGLE_ID
ARG AUTH_GOOGLE_SECRET
ARG NEXT_PUBLIC_API_URL

ENV BACKEND_URL=${BACKEND_URL}
ENV AUTH_SECRET=${AUTH_SECRET}
ENV AUTH_GITHUB_ID=${AUTH_GITHUB_ID}
ENV AUTH_GITHUB_SECRET=${AUTH_GITHUB_SECRET}
ENV AUTH_GOOGLE_ID=${AUTH_GOOGLE_ID}
ENV AUTH_GOOGLE_SECRET=${AUTH_GOOGLE_SECRET}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

# --- Production ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

# Cloud Run sets PORT env var
ENV PORT=3000
EXPOSE ${PORT}

CMD ["node", "server.js"]

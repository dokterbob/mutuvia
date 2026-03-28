# ── Build stage ───────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Build tools required to compile better-sqlite3 (devDep used by drizzle-kit)
RUN apk add --no-cache python3=3.12.12-r0 make=4.4.1-r3 g++=14.2.0-r6

# Install all dependencies (devDeps required for build/type-gen)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Sentry release tracking: .git is excluded from the build context,
# so the vite plugin can't auto-detect the commit SHA. Pass it explicitly.
ARG SENTRY_RELEASE
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV SENTRY_RELEASE=$SENTRY_RELEASE

# Copy source and build
# svelte-adapter-bun uses esbuild to bundle the server into build/
# Source maps are uploaded to Sentry during build, not needed at runtime.
COPY . .
RUN bun run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine
WORKDIR /app

# Install production deps only (migrate.ts imports drizzle-orm/bun-sqlite,
# which is not bundled by the vite build)
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

# Bundled SvelteKit server
COPY --from=builder /app/build ./build

# Drizzle migration SQL files (both dialects) + runner script
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/migrate.ts ./scripts/migrate.ts

# Default to SQLite with a persistent-volume path.
# Override DB_PROVIDER=pg and DATABASE_URL at runtime for PostgreSQL.
ENV DB_PROVIDER=sqlite
ENV DB_FILE_NAME=/data/sqlite.db

# svelte-adapter-bun reads PORT (default 3000)
EXPOSE 3000

# Migrate then start — migrate.ts is provider-aware (SQLite or PostgreSQL)
CMD ["sh", "-c", "bun scripts/migrate.ts && bun build/index.js"]

# ── Build stage ───────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS builder
WORKDIR /app

# Build tools required to compile better-sqlite3 (devDep used by drizzle-kit)
RUN apk add --no-cache python3=3.12.12-r0 make=4.4.1-r3 g++=14.2.0-r6

# Install all dependencies (devDeps required for build/type-gen)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
# svelte-adapter-bun uses esbuild to bundle the server into build/
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

# Drizzle migration SQL files + runner script
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/migrate.ts ./scripts/migrate.ts

# SQLite database lives on a persistent volume
ENV DB_FILE_NAME=/data/sqlite.db
VOLUME ["/data"]

# svelte-adapter-bun reads PORT (default 3000)
EXPOSE 3000

# Migrate then start — bun:sqlite is a Bun built-in, no extra install needed
CMD ["sh", "-c", "bun scripts/migrate.ts && bun build/index.js"]

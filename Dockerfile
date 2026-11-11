# Pinned by tag + digest (multi-arch index, amd64 + arm64) so a mutable tag
# can never silently swap the base image out from under a build. Version
# chosen to match the Bun used locally and in CI (.github/workflows/ci.yml) —
# keep all three (here, the runtime stage below, and ci.yml's BUN_VERSION) in
# sync on a Bun bump. Re-resolve the digest with:
#   curl -s "https://auth.docker.io/token?service=registry.docker.io&scope=repository:oven/bun:pull" \
#     | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])" > /tmp/t
#   curl -s -H "Authorization: Bearer $(cat /tmp/t)" \
#     -H "Accept: application/vnd.oci.image.index.v1+json" \
#     "https://registry-1.docker.io/v2/oven/bun/manifests/<version>-alpine" -D - -o /dev/null \
#     | grep docker-content-digest
# (Written out literally rather than via an ARG — a `FROM $ARG` makes it
# harder for tools like hadolint's DL3006 to confirm the tag is pinned.)

# ── Build stage ───────────────────────────────────────────────────────────────
FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS builder
WORKDIR /app

# Belt-and-suspenders: Vite's own "build" command already treats itself as
# production internally, and the svelte-adapter-bun patch (see
# patches/svelte-adapter-bun@*.patch) makes the final server bundle respect
# whatever NODE_ENV actually is at build time instead of ignoring it. Setting
# it explicitly here means that's never left to implicit bundler behaviour.
ENV NODE_ENV=production

# Build tools required to compile better-sqlite3 (devDep used by drizzle-kit).
# Versions are pinned by the base image's Alpine release; apk lacks range
# syntax so exact pins break on patch bumps (e.g. python3 3.12.12→3.12.13).
# hadolint ignore=DL3018
RUN apk add --no-cache python3 make g++

# Install all dependencies (devDeps required for build/type-gen)
COPY package.json bun.lock ./
COPY patches/ patches/
RUN bun install --frozen-lockfile

# Copy source and build.
# svelte-adapter-bun uses rolldown to bundle the server into build/. The
# server bundle gets its own *.map files (build/server/**/*.map) but nothing
# in this repo currently uploads them to Sentry (see README's "Security
# headers / Sentry" section) — CI's SENTRY_AUTH_TOKEN wiring (ci.yml) was
# removed as dead rather than half-wired: the ARG here was never populated
# by a build-arg, and the `secrets:` block the Docker job passed was never
# mounted by this Dockerfile either way. If sourcemap upload is
# reintroduced, it needs SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT/
# SENTRY_RELEASE threaded back in here as ARGs/ENV, with a real BuildKit
# `RUN --mount=type=secret` for the token, not a plain ARG.
COPY . .
RUN bun run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a
WORKDIR /app

# Required at runtime (not just build time): our own config.ts reads this
# live via $env/dynamic/private to decide whether to run startup validation
# (BETTER_AUTH_SECRET strength, OTP delivery channel configured, etc.) — see
# config.isProduction / validateConfig() in src/lib/config.ts. It also
# affects any externalised dependency (e.g. Sentry) that checks NODE_ENV
# itself at runtime rather than through a bundled, baked-in reference.
ENV NODE_ENV=production

# Run as the image's existing non-root `bun` user (uid/gid 1000, created by
# oven/bun's own Alpine Dockerfile — see its dockerhub/alpine/Dockerfile)
# instead of root. /data (the SQLite volume mount point below) must exist
# and be owned by that user before we drop privileges — a non-root process
# cannot create a directory directly under /.
#
# UPGRADE HAZARD: an existing `sqlite-data` volume created by an older,
# root-running image has its sqlite.db (+ -wal/-shm) owned by root. This
# image's non-root `bun` user cannot write to those files — see README's
# "Upgrading" checklist for the one-off `chown` needed before the first
# restart on this image. A brand-new volume is unaffected: Docker
# initialises a fresh named volume's content (including ownership) from
# whatever already exists at the mount point in the image, which is this
# chown'd empty directory.
RUN mkdir -p /data && chown -R bun:bun /app /data

# Install production deps only (migrate.ts imports drizzle-orm/bun-sqlite,
# which is not bundled by the vite build). Copied with --chown so the
# non-root user below owns them without a separate (image-bloating) chown
# pass over node_modules.
COPY --chown=bun:bun package.json bun.lock ./
COPY --chown=bun:bun patches/ patches/

USER bun

RUN bun install --production --frozen-lockfile

# Bundled SvelteKit server. The build also emits build/server/**/*.map —
# useful for symbolicating a local stack trace, but nothing uploads them to
# Sentry (see the builder stage's comment) and they're not needed to run the
# server, so they're stripped rather than shipped into the runtime image.
COPY --from=builder --chown=bun:bun /app/build ./build
RUN find ./build -name '*.map' -type f -delete

# Drizzle migration SQL files (both dialects) + runner script.
# migrate.ts imports db-url.ts (log scrubbing) by relative path — it's a
# standalone, dependency-free module, so it's copied individually rather
# than pulling in all of src/.
COPY --from=builder --chown=bun:bun /app/drizzle ./drizzle
COPY --from=builder --chown=bun:bun /app/scripts/migrate.ts ./scripts/migrate.ts
COPY --from=builder --chown=bun:bun /app/src/lib/server/db-url.ts ./src/lib/server/db-url.ts

# Default to SQLite with a persistent-volume path.
# Override DB_PROVIDER=pg and DATABASE_URL at runtime for PostgreSQL.
ENV DB_PROVIDER=sqlite
ENV DB_FILE_NAME=/data/sqlite.db

# svelte-adapter-bun reads PORT (default 3000)
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Migrate then start — migrate.ts is provider-aware (SQLite or PostgreSQL)
CMD ["sh", "-c", "bun scripts/migrate.ts && bun build/index.js"]

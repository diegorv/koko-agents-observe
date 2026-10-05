FROM node:24-slim AS builder

WORKDIR /app

# Build tools for native addons (better-sqlite3 via node-gyp)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install server dependencies (includes native better-sqlite3); lockfile-strict
COPY app/server/package.json app/server/package-lock.json server/
RUN cd server && npm ci --no-audit --no-fund

# Install client dependencies and build.
# `--include=optional` keeps platform-specific bundler bindings (shipped as
# optionalDependencies) from being skipped by `npm ci` (npm/cli#4828).
COPY app/client/package.json app/client/package-lock.json client/
RUN cd client && npm ci --no-audit --no-fund --include=optional
COPY app/client/ client/
# vite.config.ts reads ../../package.json (resolves to /package.json inside image)
COPY package.json /package.json
RUN cd client && npm run build

# --- Production image (no build tools) ---
FROM node:24-slim

WORKDIR /app

# Copy built server node_modules (includes native better-sqlite3 binary)
COPY --from=builder /app/server/node_modules server/node_modules

# Copy built client dist
COPY --from=builder /app/client/dist client/dist

# Copy server source
COPY app/server/src server/src
COPY app/server/tsconfig.json server/
COPY app/server/package.json server/

# Copy VERSION file for /api/health endpoint
COPY VERSION /app/VERSION

# Copy CHANGELOG for /api/changelog endpoint
COPY CHANGELOG.md /app/CHANGELOG.md

EXPOSE 4981

# Exits 0 when /api/health responds 2xx (native fetch, no curl in slim image).
# Assumes the in-container port is 4981, which the plugin launcher forces.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4981/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/server
# Run tsx directly (avoids npx resolution at boot)
CMD ["./node_modules/.bin/tsx", "src/index.ts"]

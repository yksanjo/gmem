# Dockerfile for the gmem MCP server (stdio transport).
# Used by Glama and other MCP marketplaces to run gmem in a sandbox for
# introspection / verification. Multi-stage: build stage produces dist/,
# runtime stage ships a slim image with just node + dist + node_modules.

# ─── Stage 1: build ───────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Native dep build prerequisites for better-sqlite3 (the only native build
# in our tree). bookworm-slim ships without python/build tools.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Install deps with cache-friendly ordering: lockfile first, then sources.
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci --no-audit --no-fund

# Now bring in sources + schemas + examples.
COPY src ./src
COPY schema ./schema
COPY examples ./examples
COPY SPEC.md ROADMAP.md README.md LICENSE ./

RUN npm run build

# ─── Stage 2: runtime ─────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Copy only what's needed at runtime — no source, no toolchain.
COPY --from=build /app/dist          ./dist
COPY --from=build /app/schema        ./schema
COPY --from=build /app/node_modules  ./node_modules
COPY --from=build /app/package.json  ./package.json

# By default the gmem server resolves a per-project SQLite db under
# $HOME/.gmem/<projectHash>/memory.db. In a sandbox we want a writable,
# predictable location; the GMEM_DB env var overrides the auto-resolution.
ENV GMEM_DB=/data/memory.db
RUN mkdir -p /data && chown -R node:node /data

USER node

# gmem speaks JSON-RPC 2.0 over stdio per the Model Context Protocol spec.
# No ports to expose. The MCP client (or Glama's sandbox) launches this
# image and pipes stdin/stdout.
ENTRYPOINT ["node", "/app/dist/index.js"]

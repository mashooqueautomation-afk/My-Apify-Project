# WebMiner Worker — Actor Execution Engine
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY src ./src
RUN npm install && npm run build && npm prune --omit=dev

FROM node:20-slim
RUN apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Check-Date=false update \
    && apt-get install -y --no-install-recommends \
    curl ca-certificates docker.io dumb-init \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src/actors ./src/actors
RUN mkdir -p /app/storage /app/logs
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
# Playwright Runtime Image
# Used for actors that need browser automation

FROM mcr.microsoft.com/playwright:v1.43.0-jammy as base

# Install Node.js
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Create storage directory
RUN mkdir -p /app/storage

# Add non-root user for security
RUN useradd -m -u 1000 actor && chown -R actor:actor /app

USER actor

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('ok')" || exit 1

# Default command
CMD ["node"]
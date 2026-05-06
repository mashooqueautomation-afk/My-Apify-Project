#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WebMiner Platform — Local Development Setup Script
# Usage: bash scripts/setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
info() { echo -e "${BLUE}[→]${NC} $*"; }

echo -e "${CYAN}"
cat << 'ASCII'
 __        __   _     __  __ _
 \ \      / /__| |__ |  \/  (_)_ __   ___ _ __
  \ \ /\ / / _ \ '_ \| |\/| | | '_ \ / _ \ '__|
   \ V  V /  __/ |_) | |  | | | | | |  __/ |
    \_/\_/ \___|_.__/|_|  |_|_|_| |_|\___|_|

  Apify-like Web Scraping Platform
ASCII
echo -e "${NC}"

# ─── Dependency checks ───────────────────────────────────────────────────────
info "Checking dependencies..."

command -v docker  &>/dev/null || err "Docker not found. Install: https://docs.docker.com/get-docker/"
command -v node    &>/dev/null || err "Node.js not found. Install: https://nodejs.org/ (v18+)"
command -v npm     &>/dev/null || err "npm not found"

NODE_VER=$(node -e "console.log(process.versions.node.split('.')[0])")
[[ "$NODE_VER" -lt 18 ]] && err "Node.js 18+ required (found v${NODE_VER})"

log "Docker: $(docker --version | cut -d' ' -f3)"
log "Node.js: $(node --version)"
log "npm: $(npm --version)"

# ─── Environment setup ───────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  info "Creating .env from template..."
  cp .env.example .env
  warn "Review .env and update secrets before production use"
  log ".env created"
else
  log ".env already exists"
fi

# ─── Install dependencies ────────────────────────────────────────────────────
info "Installing npm dependencies..."
npm install
log "Dependencies installed"

# ─── Start infrastructure ─────────────────────────────────────────────────────
info "Starting PostgreSQL, Redis, MinIO..."
bash scripts/compose-dev.sh up

# Wait for postgres
info "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
  if bash scripts/compose-dev.sh exec postgres pg_isready -U webminer &>/dev/null; then
    log "PostgreSQL ready"
    break
  fi
  [[ $i -eq 30 ]] && err "PostgreSQL failed to start"
  sleep 2
done

# Wait for redis
info "Waiting for Redis..."
for i in {1..15}; do
  if bash scripts/compose-dev.sh exec redis redis-cli -a webminer_redis ping &>/dev/null; then
    log "Redis ready"
    break
  fi
  [[ $i -eq 15 ]] && err "Redis failed to start"
  sleep 1
done

log "MinIO started (console: http://localhost:9001)"

# ─── Database setup ───────────────────────────────────────────────────────────
info "Database schema applied (via init.sql on first start)"
log "Default credentials: admin@webminer.io / Admin@123"

# ─── Build runtime Docker images ─────────────────────────────────────────────
if [[ "${BUILD_RUNTIMES:-false}" == "true" ]]; then
  info "Building actor runtime images..."
  bash scripts/build-runtimes.sh || warn "runtime image build failed"
  log "Runtime images built"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Setup complete! Start the platform:${NC}"
echo ""
echo -e "  ${CYAN}npm run docker:up:dev${NC}  # Restart local infra later if needed"
echo -e "  ${CYAN}npm run docker:down:dev${NC} # Remove stale dev containers"
echo -e "  ${CYAN}npm run dev${NC}          # Start all services in dev mode"
echo ""
echo -e "  ${YELLOW}Services:${NC}"
echo -e "  API:        ${CYAN}http://localhost:3000${NC}"
echo -e "  Dashboard:  ${CYAN}http://localhost:3001${NC}"
echo -e "  MinIO:      ${CYAN}http://localhost:9001${NC}  (webminer / webminer_minio)"
echo -e "  PostgreSQL: ${CYAN}localhost:5432${NC}  (webminer / webminer_secret)"
echo -e "  Redis:      ${CYAN}localhost:6379${NC}"
echo ""
echo -e "  ${YELLOW}Default login:${NC} admin@webminer.io / Admin@123"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

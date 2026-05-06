#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WebMiner — Production Docker Deployment Script
# Usage: bash scripts/deploy.sh [--tag v1.2.0] [--scale-workers 5]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✔] $(date +%H:%M:%S)${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
info() { echo -e "${BLUE}[→]${NC} $*"; }

# ─── Parse args ───────────────────────────────────────────────────────────────
TAG="${1:-latest}"
WORKERS="${SCALE_WORKERS:-3}"
REGISTRY="${REGISTRY:-}"

info "Deploying WebMiner (tag: ${TAG}, workers: ${WORKERS})"

# ─── Pre-flight checks ────────────────────────────────────────────────────────
[[ -f .env ]] || err ".env file not found. Run: cp .env.example .env"
source .env
[[ "$JWT_SECRET" == *"dev-secret"* ]] && err "Change JWT_SECRET before production deploy!"
[[ -z "$DATABASE_URL" ]] && err "DATABASE_URL not set in .env"

log "Pre-flight checks passed"

# ─── Build images ─────────────────────────────────────────────────────────────
info "Building Docker images..."

services=("api" "worker" "scheduler" "dashboard")
for svc in "${services[@]}"; do
  info "Building webminer/${svc}:${TAG}..."
  docker build \
    -f "packages/${svc}/Dockerfile" \
    -t "webminer/${svc}:${TAG}" \
    -t "webminer/${svc}:latest" \
    --build-arg BUILD_DATE="$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    --build-arg VERSION="${TAG}" \
    "packages/${svc}" || { warn "Build failed for ${svc}"; continue; }
  log "Built webminer/${svc}:${TAG}"
done

# ─── Push to registry (optional) ─────────────────────────────────────────────
if [[ -n "$REGISTRY" ]]; then
  info "Pushing to registry: ${REGISTRY}"
  for svc in "${services[@]}"; do
    docker tag "webminer/${svc}:${TAG}" "${REGISTRY}/webminer/${svc}:${TAG}"
    docker push "${REGISTRY}/webminer/${svc}:${TAG}"
  done
  log "Images pushed to ${REGISTRY}"
fi

# ─── Rolling deployment with Docker Compose ───────────────────────────────────
info "Starting rolling deployment..."

# Update infra first (no-downtime)
docker compose up -d postgres redis minio

# Zero-downtime API update
info "Updating API (rolling)..."
docker compose up -d --no-deps --scale api=2 api
sleep 10
docker compose up -d --no-deps --scale api=2 api
log "API updated"

# Update workers (they pick up new jobs gradually)
info "Updating workers (scale: ${WORKERS})..."
docker compose up -d --no-deps --scale worker="${WORKERS}" worker
log "Workers updated (x${WORKERS})"

# Update scheduler (singleton)
info "Updating scheduler..."
docker compose up -d --no-deps scheduler
log "Scheduler updated"

# Update dashboard
info "Updating dashboard..."
docker compose up -d --no-deps dashboard
log "Dashboard updated"

# ─── Health checks ────────────────────────────────────────────────────────────
info "Running health checks..."
sleep 5

API_URL="${API_URL:-http://localhost:3000}"

for i in {1..12}; do
  HEALTH=$(curl -sf "${API_URL}/health" 2>/dev/null || echo "")
  if echo "$HEALTH" | grep -q '"status":"ok"'; then
    log "API health check passed"
    break
  fi
  [[ $i -eq 12 ]] && err "API health check failed after 60s"
  info "Waiting for API... (${i}/12)"
  sleep 5
done

# ─── Cleanup old images ───────────────────────────────────────────────────────
info "Cleaning up old Docker images..."
docker image prune -f --filter "until=24h" 2>/dev/null || true

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Deployment complete! Tag: ${TAG}${NC}"
echo ""
echo -e "  Running containers:"
docker compose ps --format "  {{.Name}}\t{{.Status}}" 2>/dev/null || docker compose ps
echo ""
echo -e "  ${CYAN}API:${NC}       ${API_URL}/api/v1"
echo -e "  ${CYAN}Health:${NC}    ${API_URL}/health"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

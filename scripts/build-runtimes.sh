#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WebMiner — Build Actor Runtime Docker Images
# These are the base images actors run inside
# Usage: bash scripts/build-runtimes.sh [--push] [--tag v1.0.0]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'

PUSH_TO_REGISTRY=false
TAG="${1:-latest}"
REGISTRY="${REGISTRY:-}"
SKIP_PYTHON_RUNTIME="${SKIP_PYTHON_RUNTIME:-false}"
PYTHON_BUILD_FAILED=false

for arg in "$@"; do
  case $arg in
    --push)  PUSH_TO_REGISTRY=true ;;
    --tag=*) TAG="${arg#*=}" ;;
    --skip-python) SKIP_PYTHON_RUNTIME=true ;;
  esac
done

log()  { echo -e "${GREEN}[✔]${NC} $*"; }
info() { echo -e "${BLUE}[→]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }

echo -e "${BLUE}WebMiner Runtime Image Builder${NC}"
echo -e "Tag: ${TAG}\n"

RUNTIMES_DIR="infra/docker/runtimes"

# ─── Build Node.js 18 Runtime ─────────────────────────────────────────────────
info "Building webminer/runtime-node18:${TAG}..."
docker build \
  -f "${RUNTIMES_DIR}/Dockerfile.node18" \
  -t "webminer/runtime-node18:${TAG}" \
  -t "webminer/runtime-node18:latest" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --label "org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --label "org.opencontainers.image.version=${TAG}" \
  --label "org.opencontainers.image.title=WebMiner Node.js 18 Runtime" \
  .

log "Built webminer/runtime-node18:${TAG}"

# ─── Build Playwright Runtime ──────────────────────────────────────────────────
info "Building webminer/runtime-playwright:${TAG}..."
docker build \
  -f "${RUNTIMES_DIR}/Dockerfile.playwright" \
  -t "webminer/runtime-playwright:${TAG}" \
  -t "webminer/runtime-playwright:latest" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --label "org.opencontainers.image.title=WebMiner Playwright Runtime" \
  .

log "Built webminer/runtime-playwright:${TAG}"

# ─── Build Python 3.10 Runtime (minimal) ─────────────────────────────────────
if [[ "${SKIP_PYTHON_RUNTIME}" == "true" ]]; then
  warn "Skipping webminer/runtime-python310:${TAG} (SKIP_PYTHON_RUNTIME=true)"
else
info "Building webminer/runtime-python310:${TAG}..."
cat > /tmp/Dockerfile.python310 << 'EOF'
FROM python:3.10-slim

RUN apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Check-Date=false update \
    && apt-get install -y --no-install-recommends \
    curl gcc libssl-dev dumb-init \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    requests==2.31.0 \
    httpx==0.26.0 \
    beautifulsoup4==4.12.3 \
    lxml==5.1.0 \
    playwright==1.41.0 \
    scrapy==2.11.0 \
    pandas==2.1.4 \
    pydantic==2.5.3 \
    python-dotenv==1.0.0 \
    aiohttp==3.9.1

WORKDIR /app
ENTRYPOINT ["dumb-init", "--"]
CMD ["python", "src/main.py"]
EOF

if docker build \
  -f /tmp/Dockerfile.python310 \
  -t "webminer/runtime-python310:${TAG}" \
  -t "webminer/runtime-python310:latest" \
  .
then
  log "Built webminer/runtime-python310:${TAG}"
else
  warn "Failed to build webminer/runtime-python310:${TAG}. Continuing without Python runtime."
  PYTHON_BUILD_FAILED=true
fi

fi

# ─── Push to registry ─────────────────────────────────────────────────────────
if [[ "$PUSH_TO_REGISTRY" == "true" ]]; then
  if [[ -z "$REGISTRY" ]]; then
    warn "REGISTRY env var not set. Skipping push."
  else
    for image in node18 playwright python310; do
      info "Pushing webminer/runtime-${image}:${TAG} to ${REGISTRY}..."
      docker tag "webminer/runtime-${image}:${TAG}" "${REGISTRY}/webminer/runtime-${image}:${TAG}"
      docker push "${REGISTRY}/webminer/runtime-${image}:${TAG}"
      log "Pushed ${image}"
    done
  fi
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [[ "${PYTHON_BUILD_FAILED}" == "true" ]]; then
  echo -e "${YELLOW}  Node18 and Playwright runtimes built. Python runtime failed.${NC}"
else
  echo -e "${GREEN}  Runtime images built successfully!${NC}"
fi
echo ""
docker images | grep "webminer/runtime" | awk '{printf "  %-45s %s\n", $1":"$2, $7" "$8}'
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

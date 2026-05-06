#!/usr/bin/env bash

set -euo pipefail

COMPOSE_FILE="docker-compose.yml"

if docker compose version >/dev/null 2>&1; then
  COMPOSE_BIN=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_BIN=(docker-compose)
else
  echo "Docker Compose not found. Install docker compose plugin or docker-compose." >&2
  exit 1
fi

case "${1:-}" in
  up)
    "${COMPOSE_BIN[@]}" -f "$COMPOSE_FILE" up -d
    ;;
  down)
    "${COMPOSE_BIN[@]}" -f "$COMPOSE_FILE" down
    ;;
  *)
    echo "Usage: $0 {up|down}" >&2
    exit 1
    ;;
esac

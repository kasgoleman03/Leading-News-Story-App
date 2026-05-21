#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# News Reader — one-shot setup.
#
# Installs npm dependencies for both the client and the proxy, downloads Go
# module dependencies for the scorer service, and copies .env.example to
# .env in /proxy if one doesn't already exist (so the user doesn't get a
# hard "missing env var" failure on the first run).
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Installing client dependencies"
(cd client && npm install)

echo "==> Installing proxy dependencies"
(cd proxy && npm install)

echo "==> Downloading Go module dependencies"
(cd services && go mod tidy)

if [ ! -f "proxy/.env" ]; then
  echo "==> Creating proxy/.env from proxy/.env.example"
  cp proxy/.env.example proxy/.env
  echo "    !! Edit proxy/.env and set THENEWSAPI_KEY before running."
fi

echo "==> Setup complete. Run scripts/dev.sh to start everything."

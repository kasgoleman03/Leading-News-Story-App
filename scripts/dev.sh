#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# News Reader — start all dev servers (client, proxy, Go scorer) in parallel.
#
# Logs are interleaved with a "[client]"/"[proxy]"/"[scorer]" prefix so you
# can tell which process is talking. Ctrl-C cleanly stops all three.
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PIDS=()

cleanup() {
  echo
  echo "==> Stopping all dev processes"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait "${PIDS[@]}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

run() {
  local prefix="$1"; shift
  ("$@" 2>&1 | sed -u "s/^/[$prefix] /") &
  PIDS+=("$!")
}

if [ ! -f "proxy/.env" ]; then
  echo "!! proxy/.env missing. Run scripts/setup.sh first."
  exit 1
fi

# Scorer first — proxy depends on it being up.
run scorer bash -c "cd services && go run ./cmd/scorer"
sleep 1
run proxy  bash -c "cd proxy && npm run dev"
run client bash -c "cd client && npm run dev"

wait

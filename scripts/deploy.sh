#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "=== Repo ==="
echo "App dir: $APP_DIR"
echo "Head before: $(git rev-parse --short HEAD)"

RUN_GIT_OPERATIONS=1
if [ -n "${GITHUB_ACTIONS:-}" ] && [ -n "${GITHUB_WORKSPACE:-}" ]; then
    if [[ "$APP_DIR" == "$GITHUB_WORKSPACE"* ]]; then
        RUN_GIT_OPERATIONS=0
    fi
fi

if [ "$RUN_GIT_OPERATIONS" -eq 1 ]; then
    echo "=== Fetch + reset to origin/main ==="
    git fetch origin main
    git reset --hard origin/main
    echo "Head after: $(git rev-parse --short HEAD)"
fi

echo "=== Restart service ==="
docker compose up -d --build --force-recreate

echo "=== Health check ==="
for i in $(seq 1 15); do
  if curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then
    echo "OK"
    exit 0
  fi
  echo "Waiting for server... (${i}/15)"
  sleep 2
done
echo "ERROR: Server did not become ready after 30s"
echo "=== Container logs (last 50 lines) ==="
docker compose logs --tail=50
exit 1

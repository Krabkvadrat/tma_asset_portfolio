#!/usr/bin/env bash
# Rebuild, restart, health-check and (if needed) roll back the prod stack.
#
# Run on the Pi by .github/workflows/deploy.yml AFTER the repo has been updated
# to the latest main. Safe to run by hand on the Pi too:
#
#     cd /path/to/tma_asset_portfolio && bash scripts/deploy.sh
#
# Exit code: 0 = deployed and healthy, 1 = unhealthy (built images rolled back
# to the previous ones if they existed). The workflow restores the git checkout
# on 1.
#
# Server-side config (./.env) is untracked, so `git reset --hard` in the
# workflow does not touch it.
set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
# Only these are built from this repo; db/nginx/tunnel are upstream images.
BUILT_SERVICES=(backend frontend)
IMAGE_PREFIX="tma-portfolio"   # must match the `image:` keys in the compose file
HEALTH_TIMEOUT=120             # generous: the Pi is slow and db gates backend
HEALTH_INTERVAL=5

# Run from the repo root regardless of where the script was invoked.
cd "$(dirname "$0")/.."

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# Preserve the currently running images so we can roll back if the new ones are
# bad. Also remember what :prev pointed at *before* this deploy — it becomes
# untagged once we move the tag, and is the only thing we clean up on success.
# This Pi is shared with other projects, so we never prune broadly.
have_prev=0
superseded=""   # "<service> <image id>" lines, one per service that had one
for svc in "${BUILT_SERVICES[@]}"; do
  if docker image inspect "${IMAGE_PREFIX}-${svc}:prod" >/dev/null 2>&1; then
    old="$(docker images -q "${IMAGE_PREFIX}-${svc}:prev" 2>/dev/null || true)"
    if [ -n "$old" ]; then
      superseded="${superseded}${svc} ${old}"$'\n'
    fi
    docker tag "${IMAGE_PREFIX}-${svc}:prod" "${IMAGE_PREFIX}-${svc}:prev"
    have_prev=1
  fi
done

echo "[deploy] Building and starting ($COMPOSE_FILE)..."
# --force-recreate guarantees fresh containers every deploy. Without it, a no-op
# image rebuild (e.g. a docs- or compose-only change produces an identical image)
# leaves the long-lived old container running — and the health check below would
# then inspect that stale container, whose cumulative RestartCount may be >0 from
# an unrelated restart hours ago, yielding a false "crash loop". A fresh
# container starts at RestartCount=0, so that signal becomes meaningful.
# Recreating db is safe: its data lives in the postgres_data volume.
compose up -d --build --force-recreate

# --- Health check ----------------------------------------------------------
# nginx publishes no host port (only the tunnel reaches it), so probe from
# inside the compose network using the nginx container's busybox wget:
#
#   http://localhost/      nginx -> frontend, i.e. the SPA is actually served
#   http://backend:8000/   FastAPI root; reaching it implies the DB was up too,
#                          since lifespan runs create_all before serving
#
# Probing here rather than through the public hostname keeps a Cloudflare
# outage from being reported as a bad deploy.
probe() { compose exec -T nginx wget -q -T 5 -O /dev/null "$1"; }

echo "[deploy] Health check (timeout ${HEALTH_TIMEOUT}s)..."
healthy=0
elapsed=0
crashed=""
while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
  sleep "$HEALTH_INTERVAL"
  elapsed=$((elapsed + HEALTH_INTERVAL))

  # A crash loop is fatal — no point waiting out the whole timeout.
  for svc in "${BUILT_SERVICES[@]}"; do
    cid="$(compose ps -q "$svc" 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      restarts="$(docker inspect -f '{{.RestartCount}}' "$cid" 2>/dev/null || echo 0)"
      if [ "$restarts" -gt 0 ]; then
        crashed="$svc (restarted ${restarts}x)"
      fi
    fi
  done
  if [ -n "$crashed" ]; then
    echo "[deploy] $crashed — crash loop detected."
    break
  fi

  if probe "http://localhost/" && probe "http://backend:8000/"; then
    healthy=1
    break
  fi
  echo "[deploy]   ...not serving yet (${elapsed}s)"
done

if [ "$healthy" -eq 1 ]; then
  echo "[deploy] Healthy ✓"
  # Remove only this project's now-superseded images (what :prev pointed at
  # before this deploy), guarding against the current :prod / :prev.
  while read -r svc old; do
    [ -n "${old:-}" ] || continue
    cur_prod="$(docker images -q "${IMAGE_PREFIX}-${svc}:prod" 2>/dev/null || true)"
    cur_prev="$(docker images -q "${IMAGE_PREFIX}-${svc}:prev" 2>/dev/null || true)"
    if [ "$old" != "$cur_prod" ] && [ "$old" != "$cur_prev" ]; then
      echo "[deploy] Removing superseded $svc image $old..."
      docker rmi "$old" 2>/dev/null || true
    fi
  done <<< "$superseded"
  echo "[deploy] Status:"
  compose ps
  exit 0
fi

# --- Rollback --------------------------------------------------------------
echo "[deploy] UNHEALTHY ✗ — recent logs:"
for svc in "${BUILT_SERVICES[@]}"; do
  echo "--- $svc ---"
  compose logs --tail 40 "$svc" 2>&1 || true
done

if [ "$have_prev" -eq 1 ]; then
  echo "[deploy] Rolling back to previous images..."
  for svc in "${BUILT_SERVICES[@]}"; do
    if docker image inspect "${IMAGE_PREFIX}-${svc}:prev" >/dev/null 2>&1; then
      docker tag "${IMAGE_PREFIX}-${svc}:prev" "${IMAGE_PREFIX}-${svc}:prod"
    fi
  done
  compose up -d --force-recreate  # no --build: reuse the previous images
  echo "[deploy] Rolled back. Status:"
  compose ps
else
  echo "[deploy] No previous images to roll back to (first deploy?)."
fi
exit 1

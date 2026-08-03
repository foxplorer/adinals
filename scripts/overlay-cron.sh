#!/usr/bin/env bash
#
# Scheduled overlay maintenance.
#
# The node's completeness does not depend on anyone opening the application. A
# wallet can only offer records it holds and can prove, which leaves out every
# Adinal that changed hands outside this application and every lineage a wallet's
# BEEF has pruned. Those are exactly what confirmed reconciliation and the
# confirmed backfill recover, and they run server-side with no visitor involved.
#
# Usage: overlay-cron.sh <reconcile|backfill|shadow>
#
# cron gives a task almost no environment, so node is located explicitly and the
# repository root is derived from this script rather than from the caller's
# working directory. A lock keeps a slow run from overlapping the next one, and
# every run appends one timestamped log that names its outcome.
set -uo pipefail

MODE="${1:-reconcile}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/reports/overlay-cron"
LOCK="/tmp/adinals-overlay-cron-$MODE.lock"

# cron runs without a login shell, so an nvm-installed node is not on PATH and a
# distribution one usually is. Prefer the newest nvm runtime unconditionally
# rather than only when nothing is found: an older system node reaches Vite and
# fails on syntax it does not know, which reads as a broken repository.
for candidate in $(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V); do
  NVM_BIN="$candidate"
done
[ -n "${NVM_BIN:-}" ] && PATH="$NVM_BIN:$PATH"
export PATH

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "node 22 or newer is required; found $(node --version 2>/dev/null || echo none)" >&2
  exit 4
fi

: "${ADINALS_OVERLAY_URL:=https://backend.93913ed6b421f18f80e669c61239a690.projects.babbage.systems}"
export ADINALS_OVERLAY_URL

mkdir -p "$LOG_DIR"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
LOG="$LOG_DIR/$MODE-$STAMP.log"

case "$MODE" in
  reconcile) SCRIPT="overlay:reconcile" ;;
  backfill)  SCRIPT="overlay:backfill" ;;
  shadow)    SCRIPT="overlay:shadow" ;;
  *) echo "unknown mode: $MODE (expected reconcile, backfill, or shadow)" >&2; exit 2 ;;
esac

# Serialise runs of the same mode before doing any work. A still-running
# predecessor means this tick is skipped rather than queued: the next tick
# covers the same ground, and two concurrent backfills would only race.
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "$STAMP skipped: a $MODE run is already in progress" >>"$LOG"
  exit 0
fi

{
  echo "=== $MODE $STAMP against $ADINALS_OVERLAY_URL ==="
  cd "$ROOT" || exit 1
  # Fail fast when the node is unreachable, rather than burning a run on it.
  if ! curl -sf -m 20 -o /dev/null "$ADINALS_OVERLAY_URL/health"; then
    echo "overlay-unavailable: $ADINALS_OVERLAY_URL/health did not answer"
    exit 3
  fi
  npm run --silent "$SCRIPT"
} >>"$LOG" 2>&1
STATUS=$?
echo "=== exit $STATUS ===" >>"$LOG"

# Clean rounds are noise after a while; failures are kept until reviewed.
if [ "$STATUS" -eq 0 ]; then
  find "$LOG_DIR" -name "$MODE-*.log" -mtime +7 -delete 2>/dev/null
fi
exit "$STATUS"

#!/bin/bash
# stop-cleanup.sh — Stop hook, ADP §8.2.
#
# Session-end housekeeping (never blocks the stop):
#   1. Prune orphan git worktrees (left by competition mode §16.3 or
#      baseline-per-session checks §6.1 that didn't clean up).
#   2. If scripts/wire-sync.sh exists, regenerate .adp/ wire files from
#      docs/tasks/current.md (L4 adoption — §9.4).
#   3. Drop this session's dispatch-freshness latch.
#
# Requires: jq (optional — only for the latch). Kill switch: ADP_STOP_HOOK_DISABLE=1.

set -uo pipefail   # deliberately NOT -e: cleanup must never fail the stop

[ "${ADP_STOP_HOOK_DISABLE:-0}" = "1" ] && exit 0

ROOT="${CLAUDE_PROJECT_DIR:-.}"

# 1. Prune worktree bookkeeping for deleted dirs, then remove ADP-tagged
#    throwaway worktrees (created as <repo>-adp-* by convention).
if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "$ROOT" worktree prune 2>/dev/null
  git -C "$ROOT" worktree list --porcelain 2>/dev/null \
    | awk '/^worktree /{print $2}' \
    | grep -E -- '-adp-(competition|baseline|tmp)-' \
    | while read -r wt; do
        git -C "$ROOT" worktree remove --force "$wt" 2>/dev/null
      done
fi

# 2. Wire sync (no-op unless the repo adopted L2/L4)
if [ -x "$ROOT/scripts/wire-sync.sh" ] && [ -d "$ROOT/.adp" ]; then
  "$ROOT/scripts/wire-sync.sh" >/dev/null 2>&1
fi

# 3. Release the freshness latch for this session
INPUT="$(cat 2>/dev/null || echo '{}')"
SESSION="$(printf '%s' "$INPUT" | jq -r '.session_id // ""' 2>/dev/null || echo "")"
case "$SESSION" in (""|*[!A-Za-z0-9_-]*) SESSION="" ;; esac  # never a path fragment
[ -n "$SESSION" ] && rm -f "/tmp/.adp-dispatch-ok-${SESSION}" 2>/dev/null

exit 0

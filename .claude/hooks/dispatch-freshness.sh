#!/bin/bash
# dispatch-freshness.sh — UserPromptSubmit hook, ADP §6.2 freshness gate.
#
# Refuses to start role work on a stale Dispatch: blocks if
# docs/tasks/current.md is older than 24h OR older than the last 3 commits.
# A stale Dispatch means sessions pick up priorities the architect has
# already changed — the architect must rewrite Dispatch first.
#
# Fires once per session (touch-file latch in /tmp keyed by session_id) so
# every subsequent prompt in an already-vetted session passes free.
#
# Requires: jq. Kill switches:
#   export ADP_DISPATCH_HOOK_DISABLE=1   # off entirely
#   export ADP_DISPATCH_STALE_OK=1       # architect session updating Dispatch

set -euo pipefail

[ "${ADP_DISPATCH_HOOK_DISABLE:-0}" = "1" ] && exit 0
[ "${ADP_DISPATCH_STALE_OK:-0}" = "1" ] && exit 0

DISPATCH="${CLAUDE_PROJECT_DIR:-.}/docs/tasks/current.md"
[ -f "$DISPATCH" ] || exit 0   # no Dispatch yet (fresh install) — don't block

INPUT="$(cat 2>/dev/null || echo '{}')"
SESSION="$(printf '%s' "$INPUT" | jq -r '.session_id // "nosession"' 2>/dev/null || echo nosession)"
case "$SESSION" in (""|*[!A-Za-z0-9_-]*) SESSION="nosession" ;; esac  # never a path fragment
LATCH="/tmp/.adp-dispatch-ok-${SESSION}"
[ -f "$LATCH" ] && exit 0

block() {
  jq -n --arg r "$1" '{decision: "block", reason: $r}'
  exit 0
}

# Gate A — wall-clock: older than 24h?
# GNU stat first (-c), BSD/macOS fallback (-f). GNU's -f is "filesystem mode"
# and can exit 0 with garbage, so it must come second.
NOW="$(date +%s)"
MTIME="$(stat -c %Y "$DISPATCH" 2>/dev/null || stat -f %m "$DISPATCH" 2>/dev/null || echo "$NOW")"
case "$MTIME" in ''|*[!0-9]*) MTIME="$NOW" ;; esac   # paranoia: numeric or skip gate
AGE_H=$(( (NOW - MTIME) / 3600 ))
if [ "$AGE_H" -ge 24 ]; then
  block "ADP §6.2 freshness gate: Dispatch (docs/tasks/current.md) is ${AGE_H}h old (limit 24h). The architect must rewrite the Dispatch block before role sessions start. Architect sessions: set ADP_DISPATCH_STALE_OK=1 to update it."
fi

# Gate B — repo-clock: older than the last 3 commits?
if git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --git-dir >/dev/null 2>&1; then
  LAST_DISPATCH_COMMIT="$(git -C "${CLAUDE_PROJECT_DIR:-.}" log -1 --format=%H -- docs/tasks/current.md 2>/dev/null || echo "")"
  if [ -n "$LAST_DISPATCH_COMMIT" ]; then
    NEWER="$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-list --count "${LAST_DISPATCH_COMMIT}..HEAD" 2>/dev/null || echo 0)"
    if [ "$NEWER" -gt 3 ]; then
      block "ADP §6.2 freshness gate: ${NEWER} commits have landed since Dispatch was last updated (limit 3). The architect must re-issue the Dispatch block so it reflects the repo's current state. Architect sessions: set ADP_DISPATCH_STALE_OK=1."
    fi
  fi
fi

touch "$LATCH" 2>/dev/null || true
exit 0

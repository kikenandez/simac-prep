#!/usr/bin/env bash
# verify-hooks.sh — prove the ADP hook chain works WITHOUT a host restart (retro #11).
#
# Pipes synthetic Claude Code payloads through each installed hook and asserts the
# decision (deny / ask / allow / no-block). This validates the script + jq + bash
# chain at install time. The deliberate-violation test in a live session then only
# needs to confirm host wiring (settings.json), not the scripts themselves.
#
# Usage:  ./verify-hooks.sh /path/to/repo     (defaults to current dir)
# Exit:   0 = all checks passed; 1 = a check failed; 2 = cannot run (missing dep/files)

set -uo pipefail

TARGET="${1:-$(pwd)}"
[ -d "$TARGET" ] || { echo "Error: not a directory: $TARGET"; exit 2; }
TARGET="$(cd "$TARGET" && pwd)"
export CLAUDE_PROJECT_DIR="$TARGET"
HOOKS="$TARGET/.claude/hooks"

[ -d "$HOOKS" ] || { echo "Error: no hooks at $HOOKS (install with --host=claude-code)."; exit 2; }
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq not found — the hooks require it. Install jq, then re-run."
  echo "  macOS: brew install jq   Linux: apt install jq   Windows: winget install jqlang.jq"
  exit 2
fi

PASS=0; FAIL=0
ok()   { echo "  PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $1 (expected $2, got $3)"; FAIL=$((FAIL+1)); }

# Assert git-hygiene's permissionDecision for a given command.
gh_decision() { # $1 = command string -> prints deny|ask|allow|none
  local out dec
  out="$(printf '{"tool_input":{"command":%s}}' "$(jq -Rn --arg c "$1" '$c')" \
        | bash "$HOOKS/git-hygiene.sh" 2>/dev/null)"
  # No output = no rule fired = the command is simply permitted ("none").
  [ -z "$out" ] && { echo "none"; return; }
  dec="$(printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "none"' 2>/dev/null)"
  echo "${dec:-none}"
}
check_gh() { # $1 = label  $2 = command  $3 = expected
  local got; got="$(gh_decision "$2")"
  [ "$got" = "$3" ] && ok "$1" || bad "$1" "$3" "$got"
}

echo "==> Verifying ADP hooks in: $TARGET"
echo ""
echo "git-hygiene.sh (the enforcing gate):"
check_gh "bulk 'git add -A' is DENIED"            "git add -A"                              deny
check_gh "bulk 'git add .' is DENIED"             "git add ."                               deny
check_gh "'git commit -a' is DENIED"              "git commit -am wip"                      deny
check_gh "'git reset --hard' ASKS"                "git reset --hard HEAD~1"                 ask
check_gh "force-push ASKS"                         "git push --force origin main"            ask
check_gh "plain 'git commit' is ALLOWED"          "git commit -m 'feat: x'"                 allow
check_gh "exact-path 'git add' passes (no rule)"  "git add api/main.py"                     none
check_gh "commit MSG mentioning 'git add -A' OK"  "git commit -m 'doc: why git add -A bad'" allow
check_gh "non-git command is ignored"             "ls -la"                                  none

echo ""
echo "dispatch-freshness.sh (freshness gate):"
if [ -f "$TARGET/docs/tasks/current.md" ]; then
  touch "$TARGET/docs/tasks/current.md"   # make it fresh for the test
  rm -f "/tmp/.adp-dispatch-ok-verify-$$" 2>/dev/null || true
  out="$(printf '{"session_id":"verify-%s"}' "$$" | bash "$HOOKS/dispatch-freshness.sh" 2>/dev/null)"
  dec="$(printf '%s' "$out" | jq -r '.decision // "none"' 2>/dev/null || echo none)"
  [ "$dec" != "block" ] && ok "fresh Dispatch is NOT blocked" || bad "fresh Dispatch not blocked" "not-block" "block"
else
  echo "  SKIP  no docs/tasks/current.md yet"
fi

echo ""
echo "post-commit-orphan-check.sh (advisory):"
if printf '{"tool_input":{"command":"git status"}}' | bash "$HOOKS/post-commit-orphan-check.sh" >/dev/null 2>&1; then
  ok "runs clean on a normal git command"
else
  bad "runs clean" "exit 0" "non-zero"
fi

echo ""
echo "Note: stop-cleanup.sh is not exercised here — it mutates .adp/ via wire-sync."
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "==> ALL $PASS checks passed. The script+jq+bash chain works."
  echo "    Final step: in a live Claude Code session, try 'git add -A' to confirm"
  echo "    host wiring (settings.json) actually invokes these hooks."
  exit 0
else
  echo "==> $FAIL check(s) FAILED, $PASS passed. Enforcement is not reliable yet."
  exit 1
fi

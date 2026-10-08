#!/bin/bash
# post-commit-orphan-check.sh — PostToolUse(Bash) hook, ADP §6.4 rule 3.
#
# After any `git commit`, verify HEAD is reachable from a branch.
# An empty `git branch --contains HEAD` means the commit is an orphan
# (detached HEAD or a worktree race) = data-loss risk. We can't block a
# commit that already happened, so we inject a warning the model sees.
#
# Requires: jq. Kill switch: export ADP_GIT_HOOK_DISABLE=1.

set -euo pipefail

[ "${ADP_GIT_HOOK_DISABLE:-0}" = "1" ] && exit 0

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")"

# Only act on commands that actually ran a git commit (strip quoted text first
# so a message mentioning "git commit" doesn't trigger).
STRIPPED="$(printf '%s' "$CMD" | sed "s/'[^']*'//g; s/\"[^\"]*\"//g")"
printf '%s' "$STRIPPED" | grep -Eq 'git[[:space:]]+commit([[:space:]]|$)' || exit 0

HASH="$(git rev-parse --short HEAD 2>/dev/null || echo "")"
[ -z "$HASH" ] && exit 0

# for-each-ref over refs/heads only — `git branch --contains` also lists the
# "(HEAD detached at …)" pseudo-entry, which would mask exactly the orphan
# case this hook exists to catch.
CONTAINS="$(git for-each-ref refs/heads --contains "$HASH" 2>/dev/null || echo "")"
if [ -z "$CONTAINS" ]; then
  jq -n --arg h "$HASH" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: ("⚠️ ADP §6.4 rule 3: commit \($h) is NOT reachable from any branch (orphan — detached HEAD or worktree race). Recover NOW before it is GC-eligible: git branch rescue/\($h) \($h), then merge or cherry-pick onto the intended branch. Do not claim \"committed\" in the task Result until git branch --contains \($h) is non-empty.")
    }
  }'
fi

exit 0

# Cross-platform hooks (Node) — optional

ADP ships two interchangeable hook implementations. Pick one; don't run both.

| | Default: `*.sh` (bash) | Optional: `*.mjs` (Node) |
|---|---|---|
| Wired by | `.claude/settings.json` | `.claude/settings.node.json` |
| Needs | bash + `jq` | `node` only |
| Best for | macOS / Linux | **Windows**, or any host where bash/jq aren't guaranteed |

Both enforce identical rules (§6.4 commit hygiene, §6.2 dispatch freshness,
§6.4 rule 3 orphan check, §8.2 stop cleanup). The Node versions additionally
**fail safe** (ASK on internal error) instead of silently allowing, and keep
their session latch in the OS temp dir.

## Switch to the Node hooks

```bash
# back up the bash wiring, then activate the Node wiring
mv .claude/settings.json .claude/settings.bash.json   # optional keepsake
cp .claude/settings.node.json .claude/settings.json
```

(Or merge the `hooks` block from `settings.node.json` into your existing
`settings.json` if it has other keys.)

Then prove it without restarting the host — pipe a synthetic payload through the
gate (no jq needed):

```bash
printf '{"tool_input":{"command":"git add -A"}}' | node .claude/hooks/git-hygiene.mjs
# expect a JSON object with "permissionDecision":"deny"
```

Finally, the real test: in a live Claude Code session try `git add -A` and confirm
it's blocked.

> `scripts/wire-sync.sh` (called by the Stop hook) is still bash; on native
> Windows it runs only if a bash interpreter is reachable. Porting it is tracked
> separately and doesn't affect the enforcing gates.

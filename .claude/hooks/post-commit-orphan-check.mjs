#!/usr/bin/env node
// post-commit-orphan-check.mjs — PostToolUse(Bash) hook, ADP §6.4 rule 3 (Node port).
//
// After any `git commit`, warn if HEAD is unreachable from a branch (orphan —
// detached HEAD or worktree race = data-loss risk). Can't block a commit that
// already happened, so it injects an advisory the model sees.
//
// Kill switch: ADP_GIT_HOOK_DISABLE=1
import { execSync } from 'node:child_process';

if (process.env.ADP_GIT_HOOK_DISABLE === '1') process.exit(0);

const ROOT = process.env.CLAUDE_PROJECT_DIR || '.';
async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}
const git = (a) => execSync(a, { cwd: ROOT, encoding: 'utf8' }).trim();

try {
  const raw = await readStdin();
  let cmd = '';
  try { cmd = JSON.parse(raw || '{}')?.tool_input?.command || ''; } catch { cmd = ''; }
  const s = cmd.replace(/'[^']*'/g, '').replace(/"[^"]*"/g, '');
  if (!/git\s+commit(\s|$)/.test(s)) process.exit(0);

  let hash = '';
  try { hash = git('git rev-parse --short HEAD'); } catch { process.exit(0); }
  if (!hash) process.exit(0);

  let contains = '';
  try { contains = git(`git for-each-ref refs/heads --contains ${hash}`); } catch { contains = ''; }
  if (!contains) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `⚠️ ADP §6.4 rule 3: commit ${hash} is NOT reachable from any branch (orphan — detached HEAD or worktree race). Recover NOW before it is GC-eligible: git branch rescue/${hash} ${hash}, then merge or cherry-pick onto the intended branch. Do not claim "committed" in the task Result until git branch --contains ${hash} is non-empty.`
    } }));
  }
  process.exit(0);
} catch {
  process.exit(0); // advisory only — never disrupt on error
}

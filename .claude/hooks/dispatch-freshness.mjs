#!/usr/bin/env node
// dispatch-freshness.mjs — UserPromptSubmit hook, ADP §6.2 (Node port).
//
// Blocks starting role work on a stale Dispatch: docs/tasks/current.md older
// than 24h OR more than 3 commits behind HEAD. Fires once per session (latch in
// the OS temp dir, so it works on Windows too — the .sh used /tmp only).
//
// Kill switches: ADP_DISPATCH_HOOK_DISABLE=1 (off), ADP_DISPATCH_STALE_OK=1
// (architect session updating the Dispatch).
import { execSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

if (process.env.ADP_DISPATCH_HOOK_DISABLE === '1') process.exit(0);
if (process.env.ADP_DISPATCH_STALE_OK === '1') process.exit(0);

const ROOT = process.env.CLAUDE_PROJECT_DIR || '.';
const DISPATCH = join(ROOT, 'docs', 'tasks', 'current.md');
if (!existsSync(DISPATCH)) process.exit(0); // fresh install, no Dispatch yet

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}
async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

try {
  const raw = await readStdin();
  let session = 'nosession';
  try { session = JSON.parse(raw || '{}')?.session_id || 'nosession'; } catch {}
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(session)) session = 'nosession'; // never a path fragment
  const latch = join(tmpdir(), `.adp-dispatch-ok-${session}`);
  if (existsSync(latch)) process.exit(0);

  // Gate A — wall clock: older than 24h?
  const ageH = (Date.now() - statSync(DISPATCH).mtimeMs) / 3.6e6;
  if (ageH >= 24)
    block(`ADP §6.2 freshness gate: Dispatch (docs/tasks/current.md) is ${Math.floor(ageH)}h old (limit 24h). The architect must rewrite the Dispatch block before role sessions start. Architect sessions: set ADP_DISPATCH_STALE_OK=1 to update it.`);

  // Gate B — repo clock: more than 3 commits since Dispatch last changed?
  try {
    const last = execSync('git log -1 --format=%H -- docs/tasks/current.md', { cwd: ROOT, encoding: 'utf8' }).trim();
    if (last) {
      const newer = parseInt(execSync(`git rev-list --count ${last}..HEAD`, { cwd: ROOT, encoding: 'utf8' }).trim() || '0', 10);
      if (newer > 3)
        block(`ADP §6.2 freshness gate: ${newer} commits have landed since Dispatch was last updated (limit 3). The architect must re-issue the Dispatch block so it reflects the repo's current state. Architect sessions: set ADP_DISPATCH_STALE_OK=1.`);
    }
  } catch { /* not a git repo / no history — skip gate B */ }

  try { writeFileSync(latch, ''); } catch {}
  process.exit(0);
} catch {
  process.exit(0); // never block a prompt on an unexpected error
}

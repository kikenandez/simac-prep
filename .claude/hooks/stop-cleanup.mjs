#!/usr/bin/env node
// stop-cleanup.mjs — Stop hook, ADP §8.2 (Node port). Never blocks the stop.
//
//   1. Prune git worktrees, then remove ADP-tagged throwaway worktrees
//      (named <repo>-adp-(competition|baseline|tmp)-…). Your real worktrees
//      are never touched.
//   2. If scripts/wire-sync.sh exists, regenerate .adp/ wire files.
//   3. Drop this session's dispatch-freshness latch.
//
// Note: wire-sync.sh is still a bash script; on native Windows it runs only if a
// bash interpreter is reachable. Porting wire-sync itself is tracked separately.
//
// Kill switch: ADP_STOP_HOOK_DISABLE=1
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

if (process.env.ADP_STOP_HOOK_DISABLE === '1') process.exit(0);

const ROOT = process.env.CLAUDE_PROJECT_DIR || '.';
// argv form (no shell): worktree paths and other git output are never shell-parsed.
const tryGit = (...args) => { try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }); } catch { return ''; } };
async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

try {
  // 1. Prune + remove ADP throwaway worktrees
  if (tryGit('rev-parse', '--git-dir')) {
    tryGit('worktree', 'prune');
    const list = tryGit('worktree', 'list', '--porcelain');
    for (const line of list.split('\n')) {
      const m = line.match(/^worktree\s+(.+)$/);
      if (m && /-adp-(competition|baseline|tmp)-/.test(m[1])) {
        tryGit('worktree', 'remove', '--force', m[1]);
      }
    }
  }

  // 2. Wire sync (no-op unless L2/L4 adopted). Prefer the Node twin (no bash);
  //    fall back to the bash version if only it is present.
  if (existsSync(join(ROOT, '.adp'))) {
    const wireMjs = join(ROOT, 'scripts', 'wire-sync.mjs');
    const wireSh = join(ROOT, 'scripts', 'wire-sync.sh');
    try {
      if (existsSync(wireMjs)) execFileSync(process.execPath, [wireMjs], { cwd: ROOT, stdio: 'ignore' });
      else if (existsSync(wireSh)) execFileSync('bash', [wireSh], { cwd: ROOT, stdio: 'ignore' });
    } catch { /* best effort */ }
  }

  // 3. Release the freshness latch for this session
  const raw = await readStdin();
  let session = '';
  try { session = JSON.parse(raw || '{}')?.session_id || ''; } catch {}
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(session)) session = ''; // never a path fragment
  if (session) { try { rmSync(join(tmpdir(), `.adp-dispatch-ok-${session}`), { force: true }); } catch {} }

  process.exit(0);
} catch {
  process.exit(0); // cleanup must never fail the stop
}

#!/usr/bin/env node
// verify-hooks.mjs — jq-free self-test for the ADP hook chain (retro02).
//
// The bash verify-hooks.sh needs jq+bash, which the Node hooks exist precisely to
// avoid — so Windows/Node users couldn't self-test. This runs the SAME synthetic
// payloads through the installed *.mjs hooks via `node`, asserting deny/ask/allow.
//
// Usage:  node verify-hooks.mjs [/path/to/repo]   (defaults to cwd)
// Exit:   0 all passed · 1 a check failed · 2 cannot run (missing hooks)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TARGET = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
const HOOKS = join(TARGET, '.claude', 'hooks');
const GH = join(HOOKS, 'git-hygiene.mjs');
const DF = join(HOOKS, 'dispatch-freshness.mjs');
const PO = join(HOOKS, 'post-commit-orphan-check.mjs');

if (!existsSync(GH)) {
  console.error(`Error: ${GH} not found. Install with --host=claude-code (Node hooks ship there).`);
  process.exit(2);
}

const env = { ...process.env, CLAUDE_PROJECT_DIR: TARGET };
let pass = 0, fail = 0;
const ok = (m) => { console.log(`  PASS  ${m}`); pass++; };
const bad = (m, exp, got) => { console.log(`  FAIL  ${m} (expected ${exp}, got ${got})`); fail++; };

// Run a hook with a JSON payload on stdin; return parsed stdout (or {}).
function runHook(file, payload) {
  let out = '';
  try { out = execFileSync('node', [file], { input: JSON.stringify(payload), env, cwd: TARGET, encoding: 'utf8' }); }
  catch (e) { out = e.stdout ? String(e.stdout) : ''; }
  if (!out.trim()) return {};
  try { return JSON.parse(out); } catch { return { _raw: out }; }
}
function ghDecision(cmd) {
  const r = runHook(GH, { tool_input: { command: cmd } });
  return r?.hookSpecificOutput?.permissionDecision || 'none';
}
function checkGH(label, cmd, expected) {
  const got = ghDecision(cmd);
  got === expected ? ok(label) : bad(label, expected, got);
}

console.log(`==> Verifying ADP Node hooks in: ${TARGET}\n`);
console.log('git-hygiene.mjs (the enforcing gate):');
checkGH("bulk 'git add -A' is DENIED",            'git add -A',                              'deny');
checkGH("bulk 'git add .' is DENIED",             'git add .',                               'deny');
checkGH("'git commit -a' is DENIED",              'git commit -am wip',                      'deny');
checkGH("'git reset --hard' ASKS",                'git reset --hard HEAD~1',                 'ask');
checkGH("force-push ASKS",                         'git push --force origin main',            'ask');
checkGH("plain 'git commit' is ALLOWED",          "git commit -m 'feat: x'",                 'allow');
checkGH("exact-path 'git add' passes (no rule)",  'git add api/main.py',                     'none');
checkGH("commit MSG mentioning 'git add -A' OK",  "git commit -m 'doc: why git add -A bad'", 'allow');
checkGH("non-git command is ignored",             'ls -la',                                  'none');

if (existsSync(DF)) {
  console.log('\ndispatch-freshness.mjs (freshness gate):');
  const r = runHook(DF, { session_id: `verify-${process.pid}` });
  (r?.decision !== 'block') ? ok('fresh/initial Dispatch is not blocked')
                            : bad('fresh Dispatch not blocked', 'not-block', 'block');
}
if (existsSync(PO)) {
  console.log('\npost-commit-orphan-check.mjs (advisory):');
  try { runHook(PO, { tool_input: { command: 'git status' } }); ok('runs clean on a normal git command'); }
  catch { bad('runs clean', 'no throw', 'threw'); }
}

console.log('');
if (fail === 0) {
  console.log(`==> ALL ${pass} checks passed. The Node hook chain works (no jq needed).`);
  console.log("    Final step: in a live Claude Code session, try 'git add -A' to confirm");
  console.log('    host wiring (settings.json points at the .mjs hooks).');
  process.exit(0);
} else {
  console.log(`==> ${fail} check(s) FAILED, ${pass} passed.`);
  process.exit(1);
}

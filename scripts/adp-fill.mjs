#!/usr/bin/env node
// adp-fill.mjs — substitute <<<KEY>>> placeholders from adp.answers (backlog #4).
//
// Turns ~40 hand-edits into ~10 answers: fill adp.answers, run this once, and every
// <<<KEY>>> in docs/ and memory/CLAUDE.md is replaced. Cross-platform (no bash, no
// jq). Reports what was filled, what keys you left blank, and any slots still open.
//
// Usage:  node adp-fill.mjs [path/to/repo]   (defaults to cwd)
import * as fs from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2] ? fs.realpathSync(process.argv[2]) : process.cwd();
const answersPath = join(repo, 'adp.answers');
if (!fs.existsSync(answersPath)) { console.error(`Error: ${answersPath} not found.`); process.exit(1); }

// Parse KEY=value (value = everything after first '='). Blank/'#' lines ignored.
const answers = new Map(); const blank = [];
for (const line of fs.readFileSync(answersPath, 'utf8').split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith('#')) continue;
  const i = line.indexOf('='); if (i < 0) continue;
  const key = line.slice(0, i).trim(); const val = line.slice(i + 1).trim();
  if (!key) continue;
  if (val) answers.set(key, val); else blank.push(key);
}

// Gather target files: docs/**/*.md + memory/CLAUDE.md
function walk(dir) { const o = []; if (!fs.existsSync(dir)) return o; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) o.push(...walk(p)); else if (e.name.endsWith('.md')) o.push(p); } return o; }
const targets = walk(join(repo, 'docs'));
const claude = join(repo, 'memory', 'CLAUDE.md'); if (fs.existsSync(claude)) targets.push(claude);

let subs = 0; const usedKeys = new Set();
for (const f of targets) {
  let text = fs.readFileSync(f, 'utf8'); let changed = false;
  for (const [key, val] of answers) {
    const token = `<<<${key}>>>`;
    if (text.includes(token)) { text = text.split(token).join(val); changed = true; usedKeys.add(key); subs++; }
  }
  if (changed) fs.writeFileSync(f, text);
}

// Report
console.log(`==> adp-fill: applied ${usedKeys.size} key(s) across ${targets.length} files (${subs} substitutions).`);
const unusedAnswers = [...answers.keys()].filter(k => !usedKeys.has(k));
if (unusedAnswers.length) console.log(`  note: ${unusedAnswers.length} filled key(s) matched no placeholder (already filled, or not in your install): ${unusedAnswers.join(', ')}`);
const remaining = new Set();
for (const f of targets) for (const m of fs.readFileSync(f, 'utf8').matchAll(/<<<([A-Z0-9_]+)>>>/g)) remaining.add(m[1]);
if (remaining.size) {
  console.log(`\n  STILL OPEN — ${remaining.size} placeholder(s) not yet filled:`);
  console.log('    ' + [...remaining].sort().join(', '));
  console.log('  Fill them in adp.answers and re-run, or edit the files directly.');
  process.exit(2);
}
console.log('\n  All <<<placeholders>>> filled. (Runtime {{RUNTIME:...}} markers are left for the architect.)');
process.exit(0);

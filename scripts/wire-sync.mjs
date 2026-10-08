#!/usr/bin/env node
// wire-sync.mjs — cross-platform twin of wire-sync.sh (no bash, no python).
//
// Direction: prose -> wire (prose is canonical). Reads docs/tasks/current.md and
// writes .adp/dispatch.wire + .adp/tasks.wire, then reports orphan IN_PROG rows.
// Called by the Node Stop hook (stop-cleanup.mjs) so the wire sync works on hosts
// without bash/python. Never overwrites anything under docs/.
//
// Usage:  node wire-sync.mjs [path/to/repo-root]
import * as fs from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2] ? process.argv[2] : process.cwd();
const adp = join(repo, '.adp');
const current = join(repo, 'docs', 'tasks', 'current.md');
if (!fs.existsSync(adp)) { console.error(`Error: .adp/ not found at ${adp}`); process.exit(1); }
if (!fs.existsSync(current)) { console.error('Error: docs/tasks/current.md not found. Nothing to sync.'); process.exit(1); }

const lines = fs.readFileSync(current, 'utf8').split(/\r?\n/);
const compact = (s) => s == null ? null : s.replace(/`/g, '').trim().replace(/\s+/g, ' ');

// --- Dispatch block: from "## Dispatch" to the next top-level "## " ----------
const dispatch = [];
{
  let inBlock = false;
  for (const l of lines) {
    if (l.startsWith('## Dispatch')) { inBlock = true; continue; }
    if (inBlock && l.startsWith('## ') && !l.startsWith('### ')) break;
    if (inBlock) dispatch.push(l);
  }
}
function roleBlock(name) {
  const out = []; let cap = false; const needle = ('### ' + name).toLowerCase();
  for (const l of dispatch) {
    if (l.toLowerCase().startsWith(needle)) { cap = true; continue; }
    if (cap && l.startsWith('### ')) break;
    if (cap) out.push(l);
  }
  return out;
}
function field(block, prefix) {
  for (const l of block) {
    let m = l.match(new RegExp('^\\s*-\\s*\\*\\*' + prefix + ':\\*\\*\\s*(.+)$'));
    if (m) return m[1].trim();
    m = l.match(new RegExp('^\\s*-\\s*' + prefix + ':\\s*(.+)$', 'i'));
    if (m) return m[1].trim();
  }
  return null;
}
function afterField(block) {
  for (const l of block) { const m = l.match(/^\s*-\s*\*\*After[^:]*:\*\*\s*(.+)$/); if (m) return m[1].trim(); }
  return null;
}
function roleToWire(short, block) {
  if (!block.length) return null;
  const take = compact(field(block, 'Pick up')), nxt = compact(afterField(block)),
        no = compact(field(block, 'Do not start')), cap = compact(field(block, 'Context budget')),
        rem = compact(field(block, 'Standing reminders'));
  const o = [short];
  if (take) o.push(` take ${take.slice(0, 80)}`);
  if (nxt) o.push(` next ${nxt.slice(0, 80)}`);
  if (no) o.push(` no   ${no.slice(0, 80)}`);
  if (cap) o.push(` cap  ${cap.slice(0, 40)}`);
  if (rem) o.push(` rem  ${rem.slice(0, 80)}`);
  return o.join('\n');
}
const now = new Date().toISOString().replace(/:\d\d\.\d+Z$/, 'Z');
const dOut = ['; ADP dispatch — wire v1.1 (auto-synced from docs/tasks/current.md)', 'v 1.1', `upd ${now} by=wire-sync`, ''];
for (const [short, name] of [['dev', 'Developer session'], ['des', 'Designer session'], ['rev', 'Reviewer queue']]) {
  const w = roleToWire(short, roleBlock(name)); if (w) { dOut.push(w, ''); }
}
const usr = roleBlock('User actions pending');
if (usr.length) { dOut.push('usr'); for (const l of usr) { const m = l.match(/^\s*-\s+(.*)$/); if (m && m[1].trim()) dOut.push(` - ${compact(m[1]).slice(0, 90)}`); } dOut.push(''); }
fs.writeFileSync(join(adp, 'dispatch.wire'), dOut.join('\n'));
console.log(`WROTE  .adp/dispatch.wire  (${fs.statSync(join(adp, 'dispatch.wire')).size} bytes)`);

// --- Tasks: each "### T{N}: title" + its fields -> one wire line --------------
const tOut = ['; ADP tasks — wire v1.1 (auto-synced from docs/tasks/current.md)',
              '; T{N} | role | state | prio | plan-ref | inst-ref | acc-summary', ''];
const fmt = (t) => {
  const tid = t.id || '?';
  const role = (t.agent || '?').slice(0, 3);
  const state = (t.status || 'NEW').toUpperCase().slice(0, 8);
  const prio = t.priority || 'P2';
  let plan = t.plan || '-';
  if (plan !== '-' && !plan.startsWith('@')) plan = '@' + plan;
  const inst = plan !== '-' ? `inst@${plan}#${tid}` : '-';
  return `${tid.padEnd(6)}| ${role} | ${state.padEnd(8)} | ${prio} | ${plan} | ${inst} | see-plan`;
};
let cur = null;
for (const l of lines) {
  // Task IDs: T{N} plus schemes like WX.5 / FND-FU.2; skip ARCHIVED stubs; any ##/### heading ends a task.
  if (l.startsWith('## ') || l.startsWith('### ')) {
    if (cur) tOut.push(fmt(cur)); cur = null;
    const m = l.match(/^### ([A-Z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*):\s+(.+?)$/);
    if (m && !m[2].includes('ARCHIVED')) cur = { id: m[1], title: m[2].trim() };
    continue;
  }
  if (cur) { const f = l.match(/^\s*-\s+\*\*(\w+):\*\*\s+(.+?)$/); if (f) cur[f[1].toLowerCase()] = f[2].trim(); }
}
if (cur) tOut.push(fmt(cur));
fs.writeFileSync(join(adp, 'tasks.wire'), tOut.join('\n') + '\n');
console.log(`WROTE  .adp/tasks.wire  (${fs.statSync(join(adp, 'tasks.wire')).size} bytes)`);

// --- Orphan check ------------------------------------------------------------
const statusPath = join(adp, 'status');
if (fs.existsSync(statusPath)) {
  const inProg = fs.readFileSync(statusPath, 'utf8').split(/\r?\n/).filter(l => l.includes('IN_PROG'));
  if (inProg.length) { console.log('\nWARN  Active IN_PROG roles (verify these are still alive):'); for (const l of inProg) console.log(`      ${l.trim()}`); }
}
console.log('\nSync complete.');

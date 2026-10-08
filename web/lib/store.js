// lib/store.js — mémoire locale des rendez-vous (localStorage) + récupération simple (RAG léger).
// Chaque rendez-vous est une ligne plate, exportable en CSV et ré-importable : le CSV EST la base RAG.

import { toCSV, parseCSV } from './csv.js';

const KEY = 'simac.meetings';
const DRAFT_KEY = 'simac.draft';

export const COLUMNS = [
  'id', 'date', 'company', 'sector', 'website',
  'contact_name', 'contact_role', 'contact_weight',
  'contact2_name', 'contact2_role', 'contact2_weight', 'soncas_2', 'top3_2',
  'contact3_name', 'contact3_role', 'contact3_weight', 'soncas_3', 'top3_3',
  'product', 'objective', 'fallback',
  'soncas_S', 'soncas_O', 'soncas_N', 'soncas_C', 'soncas_A', 'soncas_Y', 'soncas_E', 'top3',
  'main_message', 'tensions', 'idea', 'conclusion', 'objections_prepared',
  'outcome', 'objections_heard', 'decision_maker',
  'next_action', 'next_owner', 'next_due', 'next_output', 'next_status',
  'action2', 'action2_owner', 'action2_due', 'action2_output', 'action2_status',
  'action3', 'action3_owner', 'action3_due', 'action3_output', 'action3_status',
  'lessons', 'notes', 'research_json',
];

export function listMeetings() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function saveMeeting(rec) {
  const all = listMeetings();
  const i = all.findIndex((m) => m.id === rec.id);
  if (i >= 0) all[i] = rec; else all.unshift(rec);
  localStorage.setItem(KEY, JSON.stringify(all));
  return rec;
}

export function deleteMeeting(id) {
  localStorage.setItem(KEY, JSON.stringify(listMeetings().filter((m) => m.id !== id)));
}

export function exportCSV(rows = listMeetings()) {
  return toCSV(rows, COLUMNS);
}

export function importCSV(text) {
  const rows = parseCSV(text);
  let n = 0;
  for (const r of rows) {
    if (!r.company && !r.contact_name) continue;
    const rec = Object.fromEntries(COLUMNS.map((c) => [c, r[c] ?? '']));
    rec.id = rec.id || newId();
    saveMeeting(rec); n++;
  }
  return n;
}

export function saveDraft(state) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch { /* quota */ }
}
export function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; }
}

export function newId() {
  return 'm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Récupération : les k rendez-vous passés les plus proches (même société, secteur, offre, rôle), rendus en texte compact. */
export function retrieve(query, k = 3) {
  const q = tokens([query.company, query.sector, query.product, query.contactRole, query.contactName, query.otherContacts].join(' '));
  if (!q.size) return '';
  const scored = listMeetings().map((m) => {
    const t = tokens([m.company, m.sector, m.product, m.contact_role, m.contact_name, m.contact2_name, m.contact2_role, m.contact3_name, m.contact3_role, m.notes].join(' '));
    let s = 0;
    for (const w of q) if (t.has(w)) s += 1;
    if (m.company && query.company && m.company.toLowerCase() === query.company.toLowerCase()) s += 5;
    return { m, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || (b.m.date || '').localeCompare(a.m.date || '')).slice(0, k);
  return scored.map(({ m }) => (
    `- ${m.date || '?'} | ${m.company || '?'} / ${[[m.contact_name, m.contact_role], [m.contact2_name, m.contact2_role], [m.contact3_name, m.contact3_role]].filter((c) => c[0]).map((c) => `${c[0]} (${c[1] || '?'})`).join(', ') || '?'} | offre : ${m.product || '?'}\n` +
    `  top SONCAS : ${m.top3 || '?'} | message : ${m.main_message || '-'}\n` +
    `  résultat : ${m.outcome || '-'} | objections entendues : ${m.objections_heard || '-'}\n` +
    `  suite : ${m.next_action || '-'} (${m.next_owner || '?'}, ${m.next_due || '?'}) | leçons : ${m.lessons || '-'}`
  )).join('\n');
}

function tokens(s) {
  return new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
}
const STOP = new Set(['les', 'des', 'une', 'pour', 'avec', 'dans', 'sur', 'and', 'the', 'par', 'est', 'pas', 'que', 'qui']);

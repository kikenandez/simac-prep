import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantExport, applyMinutes, minutesList, domainOf, appliedKeys, MINUTES_FORMAT } from '../web/lib/assistant.js';

const base = 'https://simac.avapmo.com/';
const meeting = () => ({
  id: 'm1', date: '2026-10-01', company: 'Acme', website: 'https://www.acme.fr/contact', contact_name: 'Léa', contact_role: 'DG', contact_weight: 'decide',
  product: 'Yoga', objections_prepared: 'Prix | Temps', next_action: 'Envoyer le devis', next_owner: 'me', next_due: '2026-10-10', next_output: 'devis', next_status: 'todo',
  action2: 'Valider le budget', action2_owner: 'client', action2_due: '2026-10-14', action2_status: 'doing', notes: 'Bon accueil',
  research_json: JSON.stringify({ version: 1, client: { location: 'Lyon, France' } }),
});
const minutes = (o = {}) => ({ format: MINUTES_FORMAT, version: 1, meeting_id: 'm1', idempotency_key: 'k1', ...o });

test('export: meetings with domain, contacts, actions, back link and alerts', () => {
  const x = assistantExport([meeting(), { id: 'm2', company: 'Zed' }], { base, today: '2026-10-12', now: new Date('2026-10-12T08:00:00Z') });
  assert.equal(x.format, 'simac-prep/assistant-export'); assert.equal(x.version, 1);
  const m = x.meetings[0];
  assert.equal(m.link, 'https://simac.avapmo.com/?rdv=m1');
  assert.equal(m.domain, 'acme.fr'); assert.equal(m.location, 'Lyon, France'); assert.equal(m.prep_date, '2026-10-01');
  assert.deepEqual(m.contacts, [{ name: 'Léa', role: 'DG', weight: 'decide' }]);
  assert.deepEqual(m.objections_prepared, ['Prix', 'Temps']);
  assert.deepEqual(m.actions.map((a) => [a.n, a.owner, a.due, a.status]), [[1, 'me', '2026-10-10', 'todo'], [2, 'client', '2026-10-14', 'doing']]);
  assert.deepEqual(x.alerts.map((a) => [a.id, a.kind, a.severity]), [['m1-a1', 'overdue', 'high'], ['m1-a2', 'due_soon', 'normal']]);
  assert.equal(x.meetings[1].actions.length, 0);
});

test('export: alert id stays the same when an action becomes overdue', () => {
  const soon = assistantExport([meeting()], { base, today: '2026-10-08' }).alerts.find((a) => a.id === 'm1-a1');
  const late = assistantExport([meeting()], { base, today: '2026-10-12' }).alerts.find((a) => a.id === 'm1-a1');
  assert.equal(soon.kind, 'due_soon'); assert.equal(late.kind, 'overdue');
});

test('minutes: actions replace, decisions append to notes, key stored', () => {
  const r = applyMinutes(meeting(), minutes({ source_date: '2026-10-11', summary: 'OK pour un pilote', decisions: ['Pilote de 3 mois'], actions: [{ action: 'Planifier le pilote', owner: 'client', due: '2026-10-20', deliverable: 'planning' }] }), { today: '2026-10-12' });
  assert.equal(r.status, 'applied');
  const m = r.record;
  assert.equal(m.next_action, 'Planifier le pilote'); assert.equal(m.next_owner, 'client'); assert.equal(m.next_due, '2026-10-20'); assert.equal(m.next_output, 'planning'); assert.equal(m.next_status, 'todo');
  assert.equal(m.action2, ''); assert.equal(m.action2_due, '');
  assert.match(m.notes, /^Bon accueil\n\n\[Compte rendu de l’assistant, 2026-10-11\]\nRésumé : OK pour un pilote\nDécisions :\n- Pilote de 3 mois$/);
  assert.deepEqual(appliedKeys(m), ['k1']);
});

test('minutes: same key twice is applied once', () => {
  const once = applyMinutes(meeting(), minutes({ decisions: ['A'] }), { today: '2026-10-12' }).record;
  assert.deepEqual(applyMinutes(once, minutes({ decisions: ['A'] }), { today: '2026-10-12' }), { status: 'duplicate' });
});

test('minutes: without actions the existing actions are kept', () => {
  const r = applyMinutes(meeting(), minutes({ decisions: ['Go'] }), { today: '2026-10-12' });
  assert.equal(r.record.next_action, 'Envoyer le devis'); assert.equal(r.record.action2, 'Valider le budget');
});

test('minutes: refused when format, key or meeting is wrong; extra actions and bad dates flagged', () => {
  assert.equal(applyMinutes(meeting(), { ...minutes(), format: 'x' }).code, 'format');
  assert.equal(applyMinutes(meeting(), minutes({ idempotency_key: ' ' })).code, 'key');
  assert.equal(applyMinutes(meeting(), minutes({ meeting_id: 'other' })).code, 'meeting');
  assert.equal(applyMinutes(undefined, minutes()).code, 'meeting');
  assert.equal(applyMinutes(meeting(), minutes({ actions: 'x' })).code, 'invalid');
  const r = applyMinutes(meeting(), minutes({ actions: [1, 2, 3, 4].map((n) => ({ action: 'A' + n, due: n === 1 ? 'demain' : '' })) }), { today: '2026-10-12' });
  assert.deepEqual(r.warnings.sort(), ['actions_truncated', 'due_ignored']);
  assert.equal(r.record.action3, 'A3'); assert.equal(r.record.next_due, '');
});

test('minutes: text is plain and bounded; file shapes accepted', () => {
  const r = applyMinutes(meeting(), minutes({ decisions: ['a\u0007b'.padEnd(2000, 'x')] }), { today: '2026-10-12' });
  assert.ok(!r.record.notes.includes('\u0007'));
  assert.ok(r.record.notes.split('\n').at(-1).length <= 1002);
  assert.equal(minutesList([1, 2]).length, 2); assert.equal(minutesList({ minutes: [1] }).length, 1); assert.equal(minutesList({ a: 1 }).length, 1); assert.equal(minutesList(null).length, 0);
  assert.equal(domainOf('acme.fr'), 'acme.fr'); assert.equal(domainOf(''), '');
});

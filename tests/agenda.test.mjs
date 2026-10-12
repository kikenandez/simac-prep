import test from 'node:test';
import assert from 'node:assert/strict';
import { icsEvent, icsCalendar, googleCalendarUrl, actionsOf, dueBuckets, nextDay } from '../web/lib/agenda.js';

test('ics: all-day event with a reminder the day before, text escaped and folded', () => {
  const ev = icsEvent({ uid: 'm1-0', date: '2026-10-30', title: 'Envoyer la proposition; Acme, Paris', description: 'Livrable : devis\nClient : Acme' });
  assert.match(ev, /DTSTART;VALUE=DATE:20261030\r\nDTEND;VALUE=DATE:20261031/);
  assert.ok(ev.includes('SUMMARY:Envoyer la proposition\\; Acme\\, Paris'), ev);
  assert.ok(ev.includes('DESCRIPTION:Livrable : devis\\nClient : Acme'), ev);
  assert.match(ev, /TRIGGER:-P1D/);
  assert.equal(icsEvent({ date: 'pas une date', title: 'x' }), '');
  const cal = icsCalendar([ev]);
  assert.ok(cal.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0') && cal.endsWith('END:VCALENDAR\r\n'));
  for (const line of cal.split('\r\n')) assert.ok(line.length <= 75, line);
  assert.equal(nextDay('2026-12-31'), '20270101');
});

test('google calendar link is an all-day template', () => {
  const u = new URL(googleCalendarUrl({ date: '2026-10-30', title: 'Relance Acme', description: 'devis' }));
  assert.equal(u.searchParams.get('dates'), '20261030/20261031');
  assert.equal(u.searchParams.get('text'), 'Relance Acme');
  assert.equal(googleCalendarUrl({ date: '', title: 'x' }), '');
});

test('due buckets: overdue, this week, done and undated skipped, sorted by date', () => {
  const ms = [
    { id: 'a', company: 'Zed', next_action: 'Appeler', next_due: '2026-10-10', next_status: 'todo', action2: 'Devis', action2_due: '2026-10-15', action2_status: 'doing', action3: 'Fait', action3_due: '2026-10-01', action3_status: 'done' },
    { id: 'b', company: 'Acme', next_action: 'Relancer', next_due: '2026-10-10', next_owner: 'client', action2: 'Sans date', action3: 'Loin', action3_due: '2026-11-30' },
    { id: 'c', company: 'Nul' },
  ];
  const { overdue, week } = dueBuckets(ms, '2026-10-12');
  assert.deepEqual(overdue.map((x) => [x.meeting.id, x.action]), [['b', 'Relancer'], ['a', 'Appeler']]);
  assert.deepEqual(week.map((x) => [x.meeting.id, x.action, x.status]), [['a', 'Devis', 'doing']]);
  assert.equal(overdue[0].owner, 'client');
  assert.deepEqual(actionsOf(ms[2]), []);
  assert.equal(dueBuckets(ms, '2026-10-12', 60).week.length, 2);
});

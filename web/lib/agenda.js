// lib/agenda.js — relances dans l'agenda : fichier .ics (tous agendas, sans compte) et lien Google Agenda ;
// tri des actions convenues en « en retard / cette semaine ». La méthode dit : on ne repart jamais sans une date.

/** AAAA-MM-JJ → AAAAMMJJ ; '' si illisible. */
const day = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.replace(/-/g, '') : '');
/** Jour suivant en AAAAMMJJ (fin exclusive d'un événement « journée entière »). */
export function nextDay(d) {
  if (!day(d)) return '';
  const [y, m, j] = d.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, j + 1));
  return x.toISOString().slice(0, 10).replace(/-/g, '');
}
const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
/** Plie les lignes à 75 octets (RFC 5545). */
const fold = (line) => { const out = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };

/** Un événement « journée entière » avec rappel la veille. */
export function icsEvent({ uid, date, title, description = '', alarmDays = 1 }) {
  const d = day(date); if (!d) return '';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VEVENT', `UID:${uid || 'simac-' + d + '-' + Math.random().toString(36).slice(2, 8)}@simac.avapmo.com`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nextDay(date)}`,
    fold(`SUMMARY:${icsText(title)}`), ...(description ? [fold(`DESCRIPTION:${icsText(description)}`)] : []),
    ...(alarmDays > 0 ? ['BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsText(title)}`), `TRIGGER:-P${alarmDays}D`, 'END:VALARM'] : []),
    'END:VEVENT',
  ].join('\r\n');
}
export function icsCalendar(events) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SIMAC Prep//simac.avapmo.com//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events.filter(Boolean), 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
/** URL préremplie « créer un événement » dans Google Agenda (journée entière). */
export function googleCalendarUrl({ date, title, description = '' }) {
  const d = day(date); if (!d) return '';
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE'); u.searchParams.set('text', title); u.searchParams.set('dates', `${d}/${nextDay(date)}`);
  if (description) u.searchParams.set('details', description);
  return u.href;
}

/** Les actions convenues d'un rendez-vous enregistré (colonnes plates du CSV) → liste [{ i, action, owner, due, output, status }]. */
export function actionsOf(m) {
  return [
    { i: 0, action: m.next_action, owner: m.next_owner, due: m.next_due, output: m.next_output, status: m.next_status },
    { i: 1, action: m.action2, owner: m.action2_owner, due: m.action2_due, output: m.action2_output, status: m.action2_status },
    { i: 2, action: m.action3, owner: m.action3_owner, due: m.action3_due, output: m.action3_output, status: m.action3_status },
  ].filter((a) => a.action).map((a) => ({ ...a, owner: a.owner || 'me', due: a.due || '', output: a.output || '', status: a.status === 'doing' || a.status === 'done' ? a.status : 'todo' }));
}
/** Colonnes CSV d'une action par position. */
export const ACTION_COLUMNS = [
  { action: 'next_action', owner: 'next_owner', due: 'next_due', output: 'next_output', status: 'next_status' },
  { action: 'action2', owner: 'action2_owner', due: 'action2_due', output: 'action2_output', status: 'action2_status' },
  { action: 'action3', owner: 'action3_owner', due: 'action3_due', output: 'action3_output', status: 'action3_status' },
];

/** Relances datées non réalisées : en retard (avant aujourd'hui) et cette semaine (aujourd'hui + 7 jours), les plus urgentes d'abord. */
export function dueBuckets(meetings, today, horizonDays = 7) {
  const limit = nextDays(today, horizonDays);
  const overdue = [], week = [];
  for (const m of meetings) for (const a of actionsOf(m)) {
    if (!day(a.due) || a.status === 'done') continue;
    const item = { meeting: m, ...a };
    if (a.due < today) overdue.push(item); else if (a.due <= limit) week.push(item);
  }
  const byDue = (x, y) => x.due.localeCompare(y.due) || (x.meeting.company || '').localeCompare(y.meeting.company || '');
  return { overdue: overdue.sort(byDue), week: week.sort(byDue) };
}
function nextDays(d, n) {
  if (!day(d)) return '';
  const [y, m, j] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, j + n)).toISOString().slice(0, 10);
}

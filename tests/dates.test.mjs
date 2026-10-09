import test from 'node:test';
import assert from 'node:assert/strict';
process.env.TZ = 'Europe/Paris';
const { localDay } = await import('../web/lib/dates.js');

test('localDay gives the calendar day where the user is, not the UTC day', () => {
  assert.equal(localDay('2026-10-08T23:30:00Z'), '2026-10-09'); // 01:30 à Paris
  assert.equal(localDay('2026-10-09T12:00:00Z'), '2026-10-09');
  assert.equal(localDay(new Date(2026, 0, 5, 0, 15)), '2026-01-05');
});

test('localDay without argument is today; unreadable input gives an empty string', () => {
  const now = new Date();
  assert.equal(localDay(), [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-'));
  assert.equal(localDay('pas une date'), '');
  assert.equal(localDay(''), '');
});

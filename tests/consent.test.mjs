import test from 'node:test';
import assert from 'node:assert/strict';

// Navigateur minimal : cookies écrits, stockage local, formulaire soumis.
const cookies = [];
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.location = { hostname: 'simac.avapmo.com' };
globalThis.document = {
  set cookie(v) { cookies.push(v); }, get cookie() { return ''; },
  createElement: () => ({ setAttribute() {}, append() {}, submit() {}, remove() {} }),
  body: { append() {} },
};
const { accept, resend, confirmEmail } = await import('../web/lib/consent.js');

test('sign-up and resend mark a pending SIMAC confirmation for the shared /merci/ page (all *.avapmo.com)', async () => {
  cookies.length = 0;
  await accept({ email: 'a@b.fr' });
  await resend();
  assert.equal(cookies.length, 2);
  for (const c of cookies) assert.match(c, /^simac_pending=1; Domain=avapmo\.com; Path=\/; Max-Age=604800; SameSite=Lax; Secure$/);
});

test('confirmation return clears the pending cookie', () => {
  cookies.length = 0;
  confirmEmail();
  assert.deepEqual(cookies, ['simac_pending=; Domain=avapmo.com; Path=/; Max-Age=0; SameSite=Lax; Secure']);
});

test('outside avapmo.com (localhost, tests) no cookie is written', async () => {
  cookies.length = 0; location.hostname = 'localhost';
  await accept({ email: 'a@b.fr' }); confirmEmail();
  assert.equal(cookies.length, 0);
  location.hostname = 'simac.avapmo.com';
});

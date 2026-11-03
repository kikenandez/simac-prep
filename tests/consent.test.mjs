import test from 'node:test';
import assert from 'node:assert/strict';

// Navigateur minimal : cookies écrits, stockage local, formulaire soumis.
const cookies = [];
let forms = 0;
const posts = [];
globalThis.fetch = async (url, opts) => { posts.push({ url, opts }); return {}; };
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
globalThis.location = { hostname: 'simac.avapmo.com' };
globalThis.document = {
  set cookie(v) { cookies.push(v); }, get cookie() { return ''; },
  createElement: () => ({ setAttribute() {}, append() {}, submit() { forms++; }, remove() {} }),
  body: { append() {} },
};
const { accept, resend, confirmEmail, hasAccepted } = await import('../web/lib/consent.js');
const { CONFIG } = await import('../web/config.js');

test('default: access opens at once and the sign-up is posted in the background, no Buttondown tab', async () => {
  forms = 0; posts.length = 0;
  const rec = await accept({ email: 'a@b.fr' });
  assert.equal(rec.confirmed, true); assert.equal(hasAccepted(), true);
  assert.equal(forms, 0);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, CONFIG.emailEndpoint);
  assert.equal(posts[0].opts.mode, 'no-cors');
  assert.equal(posts[0].opts.body.get('email'), 'a@b.fr');
});

test('confirmation mode: the form opens in a visible tab instead of a background post', async () => {
  CONFIG.confirmToUnlock = true; forms = 0; posts.length = 0; store.clear();
  const rec = await accept({ email: 'a@b.fr' });
  assert.equal(rec.confirmed, false); assert.equal(forms, 1); assert.equal(posts.length, 0);
  CONFIG.confirmToUnlock = false; store.clear();
});

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

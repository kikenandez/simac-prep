// tests/e2e.mjs — parcours complet en mode démo. Prérequis : serveur statique sur :8765 (npm run serve) + Playwright.
import fs from 'node:fs';
import { chromium } from 'playwright';
const shots = process.env.SHOTS || 'test-results';
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
fs.mkdirSync(shots, { recursive: true });
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
// Aucun email d’inscription envoyé pendant les tests.
await p.route('https://buttondown.com/**', route => route.fulfill({ status: 200, body: '' }));
await p.goto('http://localhost:8765/');
await p.waitForSelector('#gate:not([hidden])'); await p.fill('#gate-email', 'test@exemple.fr'); await p.check('#gate-accept'); await p.click('#gate-form .btn');
// accès après confirmation : panneau d'attente, page d'accueil toujours fermée, renvoi bloqué 60 s
await p.waitForSelector('#gate-wait:not([hidden])');
const waiting = await p.evaluate(() => !document.querySelector('#gate').hidden && document.querySelector('#gate-form').hidden
  && document.querySelector('#gate-wait-email').textContent === 'test@exemple.fr' && document.querySelector('#gate-resend').disabled
  && JSON.parse(localStorage.getItem('simac.consent')).confirmed === false);
// rechargement avant confirmation : toujours en attente
await p.reload(); await p.waitForSelector('#gate-wait:not([hidden])');
// retour du lien de confirmation Buttondown
await p.goto('http://localhost:8765/?ok=1'); await p.waitForSelector('#gate[hidden]', { state: 'attached' });
const confirmed = await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('simac.consent')); return c.confirmed === true && c.email === 'test@exemple.fr' && location.search === '' && /bienvenue/.test(document.querySelector('#toast').textContent); });
const gateAgain = await p.evaluate(() => JSON.parse(localStorage.getItem('simac.consent')).accepted);
// consentement antérieur (sans champ confirmed) : accès conservé ; lien ouvert sur un autre navigateur : accès ouvert
const legacy = await (async () => {
  const q = await b.newPage();
  await q.route('https://buttondown.com/**', route => route.fulfill({ status: 200, body: '' }));
  await q.goto('http://localhost:8765/');
  const version = await q.evaluate(async () => (await import('./config.js')).CONFIG.termsVersion);
  await q.evaluate((version) => localStorage.setItem('simac.consent', JSON.stringify({ accepted: true, version, email: 'old@exemple.fr', at: '2026-10-01T00:00:00Z', sent: true })), version);
  await q.reload(); await q.waitForSelector('#gate[hidden]', { state: 'attached' });
  const legacyOk = await q.evaluate(() => document.querySelector('#gate').hidden);
  await q.evaluate(() => localStorage.clear()); await q.goto('http://localhost:8765/?confirmed=1'); await q.waitForSelector('#gate[hidden]', { state: 'attached' });
  const otherOk = await q.evaluate(() => { const c = JSON.parse(localStorage.getItem('simac.consent')); return c.confirmed === true && c.email === '' && location.search === '' && /ce navigateur/.test(document.querySelector('#toast').textContent); });
  await q.close(); return legacyOk && otherOk;
})();
// settings -> mock
await p.click('[data-step=settings]');
await p.selectOption('#provider', 'mock'); await p.click('#save');
// offer
await p.click('[data-step=offer]');
await p.fill('[data-bind="offer.description"]', 'J’accompagne des artisans pendant 3 mois pour qu’ils signent plus de devis.');
await p.click('#offer-extract'); await p.waitForFunction(() => document.querySelector('[data-bind="product.name"]').value.length > 0);
const extracted = await p.$eval('[data-bind="product.targets"]', el => el.value.split('\n').length);
await p.setInputFiles('#offer-files', { name: 'plaquette.txt', mimeType: 'text/plain', buffer: Buffer.from('Plaquette : coaching prospection, 3 mois, 900 € HT par mois.') });
await p.waitForSelector('#offer-sources .card');
await p.click('#offer-chat .chat-start'); await p.waitForSelector('#offer-chat .chat-answer');
await p.fill('#offer-chat .chat-answer', '900 € HT par mois'); await p.click('#offer-chat .chat-send');
await p.waitForFunction(() => document.querySelector('[data-bind="product.price"]').value.includes('900'));
await p.click('#offer-maturity'); await p.waitForSelector('.gauge');
const maturity = await p.$$eval('.gauge span.on', s => s.length);
await p.fill('[data-bind="product.price"]', '900 € HT / mois');
await p.screenshot({ path: shots + '/1-offer.png' });
// client
await p.click('#next');
await p.fill('[data-bind="clientChat.description"]', 'RDV sur place jeudi avec le directeur d’un collège privé à Paris, 30 min.');
await p.click('#client-extract'); await p.waitForFunction(() => document.querySelector('[data-bind="client.meetingFormat"]').value.length > 0);
await p.click('#client-chat .chat-start'); await p.waitForSelector('#client-chat .chat-answer');
await p.fill('#client-chat .chat-answer', 'Le directeur décide seul avant la Toussaint'); await p.click('#client-chat .chat-send');
await p.waitForFunction(() => document.querySelector('[data-bind="client.decisionProcess"]').value.includes('Toussaint'));
await p.fill('[data-bind="client.company"]', 'Atelier Dupont');
await p.fill('[data-bind="client.sector"]', 'Menuiserie');
// interlocuteurs : l'extraction démo en a posé 2 ; on renomme le 1er, on ajoute un 3e, le bouton + disparaît
const afterExtract = await p.$$eval('.contact-row', r => r.length);
await p.fill('.contact-row[data-i="0"] [data-ck="name"]', 'Marie Dupont');
await p.fill('.contact-row[data-i="0"] [data-ck="role"]', 'Gérante');
await p.click('#add-contact'); await p.fill('.contact-row[data-i="2"] [data-ck="name"]', 'Paul'); await p.selectOption('.contact-row[data-i="2"] [data-ck="weight"]', 'use');
const contactRows = await p.$$eval('.contact-row', r => r.length);
const addGone = await p.$('#add-contact') === null;
await p.fill('[data-bind="client.notes"]', 'Entreprise familiale, 12 salariés.');
await p.click('#brief'); await p.waitForSelector('#to-persona');
await p.screenshot({ path: shots + '/2-client.png', fullPage: true });
// persona
await p.click('#to-persona'); await p.click('#ai'); await p.waitForSelector('.main-message:not(:placeholder-shown)');
const tabs = await p.$$eval('#people-tabs button', b => b.length);
const tensions = await p.$$eval('.card.warn h3', h => h.filter(x => /Tensions/.test(x.textContent)).length);
await p.click('.score[data-code="O"] button[data-v="3"]');
await p.click('#people-tabs button[data-p="1"]'); await p.waitForSelector('#people-tabs button[data-p="1"].on');
const p2top = await p.$eval('#top3', el => el.textContent);
await p.click('#people-tabs button[data-p="0"]');
await p.screenshot({ path: shots + '/3-persona.png', fullPage: true });
// simac
await p.click('#next'); await p.fill('[data-bind="objective.primary"]', 'Accord pour un essai sur 3 RDV');
await p.click('#ai'); await p.waitForSelector('#copy');
const whoCol = await p.$$eval('#simac-out thead th', th => th.filter(x => x.textContent === 'Qui').length);
await p.screenshot({ path: shots + '/4-simac.png', fullPage: true });
// followup
await p.click('#next');
await p.fill('[data-bind="debrief.description"]', 'Il veut l’avis de sa prof. Je présente mardi, j’envoie le dossier avant.');
await p.click('#debrief-extract'); await p.waitForFunction(() => document.querySelector('.action-row[data-i="1"] [data-ak="action"]')?.value.length > 0);
await p.selectOption('[data-bind="debrief.outcome"]', 'Proposition à envoyer');
const actionRows = await p.$$eval('.action-row', r => r.length);
await p.selectOption('.action-row[data-i="0"] [data-ak="status"]', 'doing');
await p.fill('.action-row[data-i="0"] [data-ak="action"]', 'Envoyer la proposition'); await p.fill('.action-row[data-i="0"] [data-ak="due"]', '2026-10-15');
await p.click('#ai'); await p.waitForSelector('#copy-mail');
await p.click('#save');
await p.screenshot({ path: shots + '/5-followup.png', fullPage: true });
await p.click('[data-step=simac]'); await p.emulateMedia({ media: 'print' }); await p.pdf({ path: shots + '/simac.pdf', format: 'A4', printBackground: true }); await p.emulateMedia({ media: 'screen' });
// history + csv round trip
await p.click('[data-step=history]');
const rows = await p.$$eval('tbody tr', r => r.length);
const csv = await p.evaluate(async () => { const m = await import('./lib/store.js'); return m.exportCSV(); });
const reimport = await p.evaluate(async (csv) => { const m = await import('./lib/store.js'); localStorage.removeItem('simac.meetings'); const n = m.importCSV(csv); const r = m.listMeetings()[0]; return n + '/' + m.listMeetings().length + '/' + r.top3 + '/' + r.contact2_name + '/' + r.contact3_weight + '/' + r.soncas_2 + '/' + r.next_status + '/' + r.action2; }, csv);
// recharger depuis l'historique : 3 interlocuteurs et leurs scores reviennent
await p.click('[data-load]'); await p.waitForSelector('.contact-row[data-i="2"]');
const reloaded = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('simac.draft')); return d.client.contacts.length + '/' + d.persona.people.length + '/' + d.persona.people[1].scores.N; });
await p.screenshot({ path: shots + '/6-history.png' });
await p.setViewportSize({ width: 390, height: 800 }); await p.click('[data-step=persona]'); await p.screenshot({ path: shots + '/7-mobile.png' });
const radar = await p.$$eval('#radar svg polygon.me', s => s.length);
const ok = rows === 1 && reimport.startsWith('1/1/') && /\/La professeure d’histoire\/use\/S2 O2 N3/.test(reimport) && errors.length === 0 && extracted >= 3 && maturity === 3 && gateAgain === true && waiting && confirmed && legacy && radar === 1
  && actionRows === 2 && /\/doing\/Envoyer le devis pour 4 classes/.test(reimport) && afterExtract === 2 && contactRows === 3 && addGone && tabs === 3 && tensions === 1 && p2top.length > 0 && whoCol === 1 && reloaded === '3/3/3';
console.log(JSON.stringify({ actionRows, gateAgain, waiting, confirmed, legacy, radar, extracted, maturity, afterExtract, contactRows, addGone, tabs, tensions, p2top, whoCol, rows, reimport, reloaded, errors, ok }, null, 1));
await b.close(); process.exit(ok ? 0 : 1);

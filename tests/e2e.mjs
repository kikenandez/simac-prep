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
await p.goto('http://localhost:8765/');
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
await p.fill('[data-bind="client.contactName"]', 'Marie Dupont');
await p.fill('[data-bind="client.contactRole"]', 'Gérante');
await p.fill('[data-bind="client.notes"]', 'Entreprise familiale, 12 salariés.');
await p.click('#brief'); await p.waitForSelector('#to-persona');
await p.screenshot({ path: shots + '/2-client.png', fullPage: true });
// persona
await p.click('#to-persona'); await p.click('#ai'); await p.waitForSelector('.main-message:not(:placeholder-shown)');
await p.click('.score[data-code="O"] button[data-v="3"]');
await p.screenshot({ path: shots + '/3-persona.png', fullPage: true });
// simac
await p.click('#next'); await p.fill('[data-bind="objective.primary"]', 'Accord pour un essai sur 3 RDV');
await p.click('#ai'); await p.waitForSelector('#copy');
await p.screenshot({ path: shots + '/4-simac.png', fullPage: true });
// followup
await p.click('#next');
await p.fill('[data-bind="debrief.description"]', 'Il veut l’avis de sa prof. Je présente mardi, j’envoie le dossier avant.');
await p.click('#debrief-extract'); await p.waitForFunction(() => document.querySelector('[data-bind="debrief.nextAction"]').value.length > 0);
await p.selectOption('[data-bind="debrief.outcome"]', 'Proposition à envoyer');
await p.fill('[data-bind="debrief.nextAction"]', 'Envoyer la proposition'); await p.fill('[data-bind="debrief.nextDue"]', '2026-10-15');
await p.click('#ai'); await p.waitForSelector('#copy-mail');
await p.click('#save');
await p.screenshot({ path: shots + '/5-followup.png', fullPage: true });
await p.click('[data-step=simac]'); await p.emulateMedia({ media: 'print' }); await p.pdf({ path: shots + '/simac.pdf', format: 'A4', printBackground: true }); await p.emulateMedia({ media: 'screen' });
// history + csv round trip
await p.click('[data-step=history]');
const rows = await p.$$eval('tbody tr', r => r.length);
const csv = await p.evaluate(async () => { const m = await import('./lib/store.js'); return m.exportCSV(); });
const reimport = await p.evaluate(async (csv) => { const m = await import('./lib/store.js'); localStorage.removeItem('simac.meetings'); return m.importCSV(csv) + '/' + m.listMeetings().length + '/' + m.listMeetings()[0].top3; }, csv);
await p.screenshot({ path: shots + '/6-history.png' });
await p.setViewportSize({ width: 390, height: 800 }); await p.click('[data-step=persona]'); await p.screenshot({ path: shots + '/7-mobile.png' });
const ok = rows === 1 && reimport.startsWith('1/1/') && errors.length === 0 && extracted >= 3 && maturity === 3;
console.log(JSON.stringify({ extracted, maturity, rows, reimport, errors, ok }, null, 1));
await b.close(); process.exit(ok ? 0 : 1);

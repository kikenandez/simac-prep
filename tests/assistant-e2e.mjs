// tests/assistant-e2e.mjs — échange avec l'assistant du dirigeant : export JSON, compte rendu importé une seule fois,
// lien de retour vers le rendez-vous. Prérequis : serveur statique sur :8765 (npm run serve) + Playwright.
import fs from 'node:fs';
import { chromium } from 'playwright';
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
// accès déjà confirmé et un rendez-vous enregistré, avec une action en retard
await p.addInitScript(() => {
  if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
  localStorage.setItem('simac.consent', JSON.stringify({ accepted: true, version: '2026-10-08', email: 'test@exemple.fr', at: '2026-10-01T00:00:00Z', sent: true, confirmed: true }));
  localStorage.setItem('simac.meetings', JSON.stringify([{ id: 'rdv-1', date: '2026-10-01', company: 'Acme', website: 'https://www.acme.fr', contact_name: 'Léa', contact_role: 'DG', product: 'Yoga', next_action: 'Envoyer le devis', next_owner: 'me', next_due: '2020-01-10', next_status: 'todo', action2: 'Valider le budget', action2_owner: 'client', notes: 'Bon accueil' }]));
});
await p.goto('http://localhost:8765/');
await p.click('[data-step=history]');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export-assistant')]);
const exp = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
const exportOk = exp.format === 'simac-prep/assistant-export' && exp.meetings.length === 1 && exp.meetings[0].domain === 'acme.fr'
  && /\?rdv=rdv-1$/.test(exp.meetings[0].link) && exp.alerts.length === 1 && exp.alerts[0].kind === 'overdue' && /^simac-assistant-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename());
const mn = Buffer.from(JSON.stringify({ format: 'simac-prep/minutes', version: 1, meeting_id: 'rdv-1', idempotency_key: 'e2e-1', decisions: ['Pilote validé'], actions: [{ action: 'Planifier le pilote', owner: 'client', due: '2099-11-02' }] }));
const toast = () => p.evaluate(() => document.querySelector('#toast').textContent);
await p.setInputFiles('#import-minutes', { name: 'cr.json', mimeType: 'application/json', buffer: mn });
await p.waitForFunction(() => /1 compte\(s\) rendu\(s\) importé/.test(document.querySelector('#toast').textContent));
await p.setInputFiles('#import-minutes', { name: 'cr.json', mimeType: 'application/json', buffer: mn });
await p.waitForFunction(() => /1 déjà importé/.test(document.querySelector('#toast').textContent));
const minutesOk = await p.evaluate(() => { const m = JSON.parse(localStorage.getItem('simac.meetings'))[0]; return m.next_action === 'Planifier le pilote' && m.next_owner === 'client' && m.action2 === '' && (m.notes.match(/Pilote validé/g) || []).length === 1 && JSON.parse(m.minutes_keys).length === 1; });
const listed = await p.evaluate(() => /Planifier le pilote/.test(document.querySelector('.card:not(.due-card) tbody').textContent));
await p.setInputFiles('#import-minutes', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'simac-prep/minutes', version: 1, meeting_id: 'inconnu', idempotency_key: 'k' })) });
await p.waitForFunction(() => /introuvable/.test(document.querySelector('#toast').textContent));
const refusedOk = /0 compte\(s\) rendu\(s\) importé/.test(await toast());
await p.goto(exp.meetings[0].link.replace(/^https:\/\/[^/]+\//, 'http://localhost:8765/'));
const linkOk = await p.waitForSelector('tr.flash[data-row="rdv-1"]', { timeout: 5000 }).then(() => true, () => false) && await p.evaluate(() => location.search === '');
const ok = exportOk && minutesOk && listed && refusedOk && linkOk && errors.length === 0;
console.log(JSON.stringify({ exportOk, minutesOk, listed, refusedOk, linkOk, errors, ok }, null, 1));
await b.close(); process.exit(ok ? 0 : 1);

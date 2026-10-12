// tests/i18n-e2e.mjs — interface en anglais et en espagnol, choix du pays. Prérequis : serveur statique sur :8765 + Playwright.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { CONFIG } from '../web/config.js';
const shots = process.env.SHOTS || 'test-results';
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const FRENCH = /\b(Votre offre|Réglages|Historique|Rendez-vous|Enregistrer|Concurrents et alternatives|Identifier l’entreprise)\b/;
const expect = {
  en: { offer: 'Offer', settings: 'Settings', h1: /Your offer/i, market: 'Competitors and alternatives', registry: 'Companies House', country: 'GB' },
  es: { offer: 'Oferta', settings: 'Ajustes', h1: /Tu oferta/i, market: 'Competidores y alternativas', registry: 'BORME', country: 'ES' },
};
for (const [lang, x] of Object.entries(expect)) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(version => {
    localStorage.setItem('simac.consent', JSON.stringify({ accepted: true, version }));
    localStorage.setItem('simac.llm.settings', JSON.stringify({ provider: 'mock' }));
  }, CONFIG.termsVersion);
  await page.route('**/*', route => route.request().url().startsWith('http://localhost:8765/') ? route.continue() : route.fulfill({ status: 200, body: '' }));
  await page.goto(`http://localhost:8765/?lang=${lang}`);
  await page.waitForSelector('#main h1');
  assert.equal(await page.evaluate(() => document.documentElement.lang), lang);
  assert.equal(await page.textContent('#steps [data-step="offer"] b'), x.offer);
  assert.equal(await page.textContent('#steps [data-step="settings"] b'), x.settings);
  assert.match(await page.textContent('#main h1'), x.h1);
  assert.match(await page.textContent('#market-research h2'), new RegExp(x.market));
  assert.equal(await page.inputValue('#market-country'), x.country);
  // pays par défaut selon la langue ; le changer change les mots de la recherche concurrents
  await page.fill('[data-bind="product.oneLiner"]', 'Yoga classes for companies');
  await page.selectOption('#market-country', 'MX');
  assert.match(await page.inputValue('#market-query'), /proveedores precios/);
  await page.selectOption('#market-country', x.country);
  // démo : la fiche se remplit dans la langue choisie, sans erreur
  await page.fill('[data-bind="offer.description"]', 'Yoga classes for companies, 45 minutes, on site.');
  await page.click('#offer-extract');
  await page.waitForFunction(() => document.querySelector('[data-bind="product.name"]').value);
  await page.screenshot({ path: `${shots}/i18n-${lang}-offer.png`, fullPage: false });
  // client : hors de France, liens de registres du pays et lecture d'une page
  await page.click('#steps [data-step="client"]');
  await page.waitForSelector('#client-country');
  assert.match(await page.textContent('#client-research'), new RegExp(x.registry));
  assert.ok(await page.locator('#registry-url').count());
  await page.selectOption('#client-country', 'FR');
  await page.waitForSelector('#company-search');
  await page.selectOption('#client-country', x.country);
  await page.waitForSelector('#registry-url');
  await page.screenshot({ path: `${shots}/i18n-${lang}-client.png`, fullPage: true });
  for (const step of ['persona', 'simac', 'followup', 'history', 'settings']) {
    await page.click(`#steps [data-step="${step}"]`);
    const text = await page.textContent('#main');
    assert.doesNotMatch(text, FRENCH, `${lang} ${step}: ${text.match(FRENCH)?.[0]}`);
  }
  // retour au français par le sélecteur
  await Promise.all([page.waitForNavigation(), page.selectOption('.topbar .lang-switch select', 'fr')]);
  await page.waitForSelector('#main h1');
  assert.equal(await page.textContent('#steps [data-step="settings"] b'), 'Réglages');
  assert.deepEqual(errors, []);
  await page.close();
}
await browser.close();
console.log('i18n E2E passed: EN and ES UI, country defaults and switch, registry links, demo extraction, back to FR.');

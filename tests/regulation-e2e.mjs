// tests/regulation-e2e.mjs — réglementation dans la maturité de l'offre (es + Colombie, fr + coaching). Prérequis : serveur statique sur :8765 + Playwright.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { CONFIG } from '../web/config.js';
const shots = process.env.SHOTS || 'test-results';
fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});

async function open(lang, country) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(([version, country]) => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('simac.consent', JSON.stringify({ accepted: true, version }));
    localStorage.setItem('simac.llm.settings', JSON.stringify({ provider: 'mock' }));
    localStorage.setItem('simac.country', country);
  }, [CONFIG.termsVersion, country]);
  await page.route('**/*', route => route.request().url().startsWith('http://localhost:8765/') ? route.continue() : route.fulfill({ status: 200, body: '' }));
  await page.goto(`http://localhost:8765/?lang=${lang}`);
  await page.waitForSelector('#offer-maturity');
  return { page, errors };
}

// Espagnol, Colombie : clinique dentaire → activité réglementée, critère obligatoire
{
  const { page, errors } = await open('es', 'CO');
  await page.fill('[data-bind="product.name"]', 'Clínica dental móvil');
  await page.fill('[data-bind="product.oneLiner"]', 'Limpiezas dentales en la empresa, sin desplazarse');
  await page.click('#offer-maturity'); await page.waitForSelector('#regulation-card');
  assert.equal(await page.getAttribute('#regulation-card', 'data-status'), 'missing');
  const card = await page.textContent('#regulation-card');
  assert.match(card, /Regulación \(Colombia\)/);
  assert.match(card, /madurez limitada a 3 \/ 5/);
  assert.ok(await page.$('#regulation-card a[href="https://www.suin-juriscol.gov.co/"]'));
  assert.match(await page.getAttribute('#regulation-card a[href^="https://www.google.com/search"]', 'href'), /regulaci%C3%B3n.*Colombia/);
  assert.match(await page.textContent('#offer-maturity-out .grid > div:nth-child(2) li:first-child'), /^Regulación — /, 'the regulation gap comes first, with its UI label');
  assert.ok((await page.$$eval('.gauge span.on', s => s.length)) <= 3);
  // sans clé Jina : la recherche explique pourquoi et ne lève pas le plafond
  await page.click('#regulation-search'); await page.waitForFunction(() => /Jina/.test(document.querySelector('#toast').textContent));
  assert.equal(await page.getAttribute('#regulation-card', 'data-status'), 'missing');
  await page.screenshot({ path: shots + '/regulation-es.png' });
  // « No regulada (verificado) » : écrit dans la fiche, le critère est rempli
  await page.click('#regulation-none'); await page.waitForSelector('#regulation-card[data-status="confirmed"]');
  assert.match(await page.inputValue('[data-bind="product.regulation"]'), /^No regulada — verificado el /);
  assert.doesNotMatch(await page.textContent('#offer-maturity-out'), /Regulación — /);
  // recharger : la maturité et la réglementation sont conservées
  await page.reload(); await page.waitForSelector('#regulation-card[data-status="confirmed"]');
  assert.deepEqual(errors, []);
  await page.close();
}

// Français, France : coaching de prospection → rien de réglementé, simple rappel
{
  const { page, errors } = await open('fr', 'FR');
  await page.fill('[data-bind="product.name"]', 'Coaching prospection 3 mois');
  await page.fill('[data-bind="product.oneLiner"]', 'Un accompagnement de 3 mois pour structurer la prospection d’une petite entreprise.');
  await page.click('#offer-maturity'); await page.waitForSelector('#regulation-card');
  assert.equal(await page.getAttribute('#regulation-card', 'data-status'), 'none');
  assert.match(await page.textContent('#regulation-card'), /Aucune activité réglementée repérée/);
  assert.ok(await page.$('#regulation-card a[href="https://www.legifrance.gouv.fr/"]'));
  assert.deepEqual(errors, []);
  await page.close();
}

await browser.close();
console.log('regulation e2e ok');

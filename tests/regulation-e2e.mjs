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

const status = (page) => page.getAttribute('#regulation-card', 'data-status');
const gapLabels = (page) => page.$$eval('#offer-maturity-out .grid > div:nth-child(2) li b', (bs) => bs.map((b) => b.textContent));

// Espagnol, Colombie : clinique dentaire → activité réglementée, deux questions, plafond tant que les documents manquent
{
  const { page, errors } = await open('es', 'CO');
  await page.fill('[data-bind="product.name"]', 'Clínica dental móvil');
  await page.fill('[data-bind="product.oneLiner"]', 'Limpiezas dentales en la empresa, sin desplazarse');
  // les questions sont là avant même la maturité
  await page.click('[data-step=client]'); await page.click('[data-step=offer]');
  await page.waitForSelector('#regulation-card');
  assert.equal(await status(page), 'missing');
  const card = await page.textContent('#regulation-card');
  assert.match(card, /Regulación \(Colombia\)/);
  assert.match(card, /¿Sabes si tu producto o servicio pertenece a un sector o mercado regulado\?/);
  assert.ok(await page.$('#regulation-card a[href="https://www.suin-juriscol.gov.co/"]'));
  assert.match(await page.getAttribute('#regulation-card a[href^="https://www.google.com/search"]', 'href'), /regulaci%C3%B3n.*Colombia/);
  // maturité : plafond 3, manque Regulación en tête, et proposition lancée seule (pas de réponse, activité réglementée)
  await page.click('#offer-maturity'); await page.waitForSelector('.gauge');
  await page.waitForSelector('#regulation-card .reg-proposal');
  assert.match(await page.textContent('#regulation-card .reg-proposal'), /Propuesta de la IA, sin búsqueda web/);
  assert.equal((await gapLabels(page))[0], 'Regulación');
  assert.ok((await page.$$eval('.gauge span.on', (s) => s.length)) <= 3);
  // avertissement « tal cual » sous la maturité et dans la carte Regulación
  assert.equal((await page.$$('[data-role="maturity-disclaimer"]')).length, 2);
  assert.match(await page.textContent('#offer-maturity-out [data-role="maturity-disclaimer"]'), /«tal cual».*sector o mercado regulado.*Ningún compromiso ni responsabilidad/);
  // la proposition remplit le champ, sans lever le plafond : ce sont les réponses qui comptent
  await page.click('#regulation-use');
  assert.match(await page.inputValue('[data-bind="product.regulation"]'), /^\[DEMO\] Habilitación/);
  assert.equal(await status(page), 'missing');
  // « Sí » → question des documents ; « No » → plafond et nouvelle proposition ; « Sí, los tengo » → plus de plafond
  await page.check('input[name="reg-sector"][value="yes"]'); await page.waitForSelector('input[name="reg-docs"]');
  assert.equal(await status(page), 'not_ready');
  await page.check('input[name="reg-docs"][value="no"]'); await page.waitForSelector('#regulation-card[data-status="not_ready"] .reg-proposal');
  assert.equal((await gapLabels(page))[0], 'Regulación');
  await page.check('input[name="reg-docs"][value="yes"]'); await page.waitForSelector('#regulation-card[data-status="ready"]');
  assert.match(await page.textContent('#regulation-search'), /Confirmar con una búsqueda/);
  assert.ok(!(await gapLabels(page)).includes('Regulación'));
  await page.screenshot({ path: shots + '/regulation-es.png' });
  // recharger : les réponses sont conservées
  await page.reload(); await page.waitForSelector('#regulation-card[data-status="ready"]');
  assert.ok(await page.isChecked('input[name="reg-docs"][value="yes"]'));
  // autre pays : on redemande (réponses par pays) ; retour en Colombie : réponses retrouvées
  await page.selectOption('.country-switch select >> nth=0', 'ES');
  await page.waitForSelector('#regulation-card');
  assert.match(await page.textContent('#regulation-card'), /Regulación \(España\)/);
  assert.equal(await page.isChecked('input[name="reg-sector"][value="yes"]'), false);
  assert.equal(await page.$('input[name="reg-docs"]'), null);
  assert.equal((await gapLabels(page))[0], 'Regulación', 'Spain: no answer yet, the regulation cap is back');
  await page.selectOption('.country-switch select >> nth=0', 'CO');
  await page.waitForSelector('#regulation-card[data-status="ready"]');
  assert.ok(!(await gapLabels(page)).includes('Regulación'));
  assert.deepEqual(errors, []);
  await page.close();
}

// Français, France : coaching de prospection → rien de réglementé ; « Je ne sais pas » lance quand même la recherche
{
  const { page, errors } = await open('fr', 'FR');
  await page.fill('[data-bind="product.name"]', 'Coaching prospection 3 mois');
  await page.fill('[data-bind="product.oneLiner"]', 'Un accompagnement de 3 mois pour structurer la prospection d’une petite entreprise.');
  await page.click('#offer-maturity'); await page.waitForSelector('.gauge');
  assert.equal(await status(page), 'none');
  assert.match(await page.textContent('#regulation-card'), /Rien n’indique une activité réglementée/);
  assert.equal(await page.$('#regulation-search'), null, 'no search without a reason');
  assert.ok(await page.$('#regulation-card a[href="https://www.legifrance.gouv.fr/"]'));
  await page.check('input[name="reg-sector"][value="unknown"]'); await page.waitForSelector('#regulation-card .reg-proposal');
  await page.check('input[name="reg-sector"][value="no"]'); await page.waitForSelector('#regulation-card[data-status="declared_no"]');
  assert.deepEqual(errors, []);
  await page.close();
}

await browser.close();
console.log('regulation e2e ok');

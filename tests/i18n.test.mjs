// tests/i18n.test.mjs — chaque t('…') du code a sa traduction anglaise et espagnole, avec les mêmes {variables}.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dictionary, t } from '../web/lib/i18n.js';
import { COUNTRIES, words } from '../web/lib/countries.js';
import { competitorQuery, clientQueries, rankSource, makeSource } from '../web/lib/research.js';
import { simacMessages } from '../web/lib/prompts.js';

const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'i18n' ? [] : files(path.join(dir, e.name))) : e.name.endsWith('.js') && e.name !== 'i18n.js' ? [path.join(dir, e.name)] : []);
const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

test('every t() key has en and es translations with the same placeholders', () => {
  const dict = dictionary(), missing = [];
  for (const f of files('web')) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
      const key = m[1].replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t' }[c] ?? c));
      const e = dict[key];
      if (!e?.en || !e?.es) missing.push(`${path.basename(f)}: ${key}`);
      else if (vars(e.en) !== vars(key) || vars(e.es) !== vars(key)) missing.push(`${path.basename(f)} (placeholders): ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('French stays the default and the key itself', () => {
  assert.equal(t('Offre'), 'Offre');
  assert.equal(t('{n} sources à vérifier et à cocher.', { n: 3 }), '3 sources à vérifier et à cocher.');
});

test('countries: search words and sources follow the country', () => {
  for (const [code, c] of Object.entries(COUNTRIES)) {
    assert.ok(c.links.length, code);
    for (const l of c.links) assert.match(l.url('Acme & Co'), /^https:\/\//, `${code} ${l.label}`);
  }
  assert.match(competitorQuery({ oneLiner: 'Cours de yoga en entreprise' }, 'France', 'FR'), /prestataires tarifs$/);
  assert.match(competitorQuery({ oneLiner: 'Clases de yoga para empresas' }, 'España', 'ES'), /proveedores precios$/);
  assert.match(competitorQuery({ oneLiner: 'Corporate yoga classes' }, 'United Kingdom', 'GB'), /providers pricing$/);
  assert.equal(words('MX').providers, 'proveedores precios');
  const q = clientQueries({ company: 'Acme', contacts: [] }, 'ES');
  assert.match(q[0].query, /proyectos noticias/); assert.match(q[1].query, /site:es\.trustpilot\.com/);
  // domaine national et prix en livres reconnus pour le Royaume-Uni
  const r = rankSource(makeSource('https://acme.co.uk/pricing', 'web', 'Yoga sessions from £40'), { query: 'corporate yoga', geography: 'United Kingdom', country: 'GB' });
  assert.ok(r.hits.includes('United Kingdom') && r.hits.includes('prix publié'), JSON.stringify(r));
  // devises en mots entiers : « 20 years 2 ago » (ars 2) ou « open 24 hours » (pen 2) ne sont pas des prix
  for (const text of ['founded 20 years 2 ago', 'open 24 hours']) assert.ok(!rankSource(makeSource('https://acme.com', 'web', text), { query: 'yoga' }).hits.includes('prix publié'), text);
  assert.match(COUNTRIES.CO.links.find(l => l.label === 'Computrabajo').url('Acme Co'), /trabajo-de-acme-co$/);
});

test('prompts: Spanish method and output language, enumerated codes kept', () => {
  const [sys, user] = simacMessages({ lang: 'es', product: {}, client: {}, brief: {}, persona: {}, objective: {} });
  assert.match(sys.content, /Situación.*Idea.*Mecanismo.*Ventajas.*Conclusión/s);
  assert.match(sys.content, /Seguridad, Orgullo, Novedad, Comodidad, Dinero, Simpatía/);
  assert.match(user.content, /IDIOMA DE SALIDA/);
  const [, en] = simacMessages({ lang: 'en', product: {}, client: {}, brief: {}, persona: {}, objective: {} });
  assert.match(en.content, /OUTPUT LANGUAGE/);
  const [, fr] = simacMessages({ lang: 'fr', product: {}, client: {}, brief: {}, persona: {}, objective: {} });
  assert.doesNotMatch(fr.content, /OUTPUT LANGUAGE|IDIOMA/);
});

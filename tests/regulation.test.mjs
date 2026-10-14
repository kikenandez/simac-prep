// tests/regulation.test.mjs — activité réglementée : détection, requête par pays, plafond de maturité.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDomains, regulationQuery, regulationLinks, regulationStatus, applyRegulation, LAW_PORTALS } from '../web/lib/regulation.js';
import { offerMaturityMessages } from '../web/lib/prompts.js';
import { blockersFrom, essentialGaps } from '../web/lib/offer.js';

const coaching = { name: 'Coaching prospection 3 mois', oneLiner: 'Un accompagnement de 3 mois pour structurer la prospection d’une petite entreprise.', targets: 'Le dirigeant', problem: 'Pas le temps de prospecter', mechanism: 'Diagnostic\nFiche client\nDébrief', advantages: 'Plus de rendez-vous conclus', price: 'Paiement à 30 jours, déductible des impôts', regulation: '' };
const capoeira = { name: 'Ateliers capoeira', oneLiner: 'Ateliers de capoeira pour les écoles', targets: 'Directeurs d’école', problem: 'Énergie des élèves', regulation: '' };
const dental = { name: 'Clínica dental móvil', oneLiner: 'Limpiezas dentales en la empresa', regulation: '' };
const fiveStar = { score: 5, verdict: 'prêt pour la vente', gaps: [] };
const gap = { why: 'why', fix: 'fix' };

test('regulated activities are spotted in fr / es / en; a plain coaching offer is not, even with price or tax words', () => {
  assert.deepEqual(detectDomains(coaching), []);
  assert.ok(detectDomains(capoeira).includes('education'));
  assert.ok(detectDomains(capoeira).includes('sport'));
  assert.deepEqual(detectDomains(dental), ['health']);
  assert.deepEqual(detectDomains({ oneLiner: 'Home insurance for freelancers' }), ['finance']);
  assert.deepEqual(detectDomains({ oneLiner: 'Plus d’information pour vos clients' }), [], 'mid-word match (« information ») is ignored');
});

test('status: confirmed once the field is written, searched after a search, missing otherwise', () => {
  assert.equal(regulationStatus(coaching).status, 'none');
  assert.equal(regulationStatus(coaching, { aiRegulated: true }).status, 'missing');
  assert.equal(regulationStatus(capoeira).status, 'missing');
  assert.equal(regulationStatus(capoeira, { searched: true }).status, 'searched');
  assert.equal(regulationStatus({ ...capoeira, regulation: 'Carte professionnelle (Code du sport)' }).status, 'confirmed');
});

test('a regulated offer without the rule is capped at 3 with a regulation gap that becomes a blocker', () => {
  const m = applyRegulation(fiveStar, capoeira, { gap });
  assert.equal(m.score, 3); assert.equal(m.rawScore, 5);
  assert.equal(m.verdict, 'prêt pour des réunions à blanc');
  assert.deepEqual(m.gaps[0], { field: 'regulation', why: 'why', fix: 'fix' });
  assert.equal(m.regulation.cap, 3);
  assert.deepEqual(blockersFrom(m), ['regulation']);
  assert.deepEqual(essentialGaps({}, blockersFrom(m)).includes('regulation'), true);
});

test('searching lifts the cap to 4; writing the rule lifts it entirely and drops the gap', () => {
  assert.equal(applyRegulation(fiveStar, capoeira, { searched: true, gap }).score, 4);
  const done = applyRegulation({ ...fiveStar, gaps: [{ field: 'regulation', why: 'x', fix: 'y' }] }, { ...capoeira, regulation: 'Non réglementée — vérifié' }, { gap });
  assert.equal(done.score, 5); assert.equal(done.verdict, 'prêt pour la vente'); assert.deepEqual(done.gaps, []);
  assert.equal(done.regulation.cap, null);
});

test('a non-regulated offer is not capped; the AI flag alone is enough to cap', () => {
  assert.equal(applyRegulation(fiveStar, coaching, { gap }).score, 5);
  assert.equal(applyRegulation({ ...fiveStar, regulation: { regulated: true, domain: 'formation' } }, coaching, { gap }).score, 3);
  const low = applyRegulation({ score: 2, verdict: 'travailler l’offre', gaps: [] }, capoeira, { gap });
  assert.equal(low.score, 2); assert.equal(low.verdict, 'travailler l’offre');
});

test('search query and official sources follow the country', () => {
  assert.match(regulationQuery(dental, { code: 'CO', geography: 'Colombia' }), /^Clínica dental móvil regulación .* Colombia$/);
  assert.match(regulationQuery(capoeira, { code: 'FR', geography: 'France' }), /réglementation .* France$/);
  assert.match(regulationQuery(capoeira, { code: 'GB', geography: 'United Kingdom' }), /regulation licence/);
  assert.deepEqual(regulationLinks(dental, { code: 'CO' }).map((l) => l.label).slice(0, 1), ['SUIN-Juriscol']);
  assert.equal(regulationLinks(dental, { code: 'INT' }).length, 1, 'International: web search only');
  for (const list of Object.values(LAW_PORTALS)) for (const l of list) assert.match(l.url, /^https:\/\//);
});

test('the maturity prompt makes regulation a must-have for the selling country', () => {
  const user = offerMaturityMessages({ lang: 'es', current: dental, country: 'Colombia' })[1].content;
  assert.match(user, /CRITÈRE OBLIGATOIRE — réglementation \(pays de vente : Colombia\)/);
  assert.match(user, /"regulation":\{"regulated"/);
});

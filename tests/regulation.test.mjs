// tests/regulation.test.mjs — activité réglementée : détection, requête par pays, plafond de maturité.
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDomains, regulationQuery, regulationLinks, regulationStatus, applyRegulation, sanitizeProposal, LAW_PORTALS } from '../web/lib/regulation.js';
import { offerMaturityMessages, regulationProposalMessages } from '../web/lib/prompts.js';
import { blockersFrom, essentialGaps } from '../web/lib/offer.js';

const coaching = { name: 'Coaching prospection 3 mois', oneLiner: 'Un accompagnement de 3 mois pour structurer la prospection d’une petite entreprise.', targets: 'Le dirigeant', problem: 'Pas le temps de prospecter', mechanism: 'Diagnostic\nFiche client\nDébrief', advantages: 'Plus de rendez-vous conclus', price: 'Paiement à 30 jours, déductible des impôts', regulation: '' };
const capoeira = { name: 'Ateliers capoeira', oneLiner: 'Ateliers de capoeira pour les écoles', targets: 'Directeurs d’école', problem: 'Énergie des élèves', regulation: '' };
const tutoring = { oneLiner: 'Cours particuliers de maths à domicile' };
const dental = { name: 'Clínica dental móvil', oneLiner: 'Limpiezas dentales en la empresa', regulation: '' };
const fiveStar = { score: 5, verdict: 'prêt pour la vente', gaps: [] };
const gap = { why: 'why', fix: 'fix' };

test('regulated activities are spotted in fr / es / en; a plain coaching offer is not, even with price or tax words', () => {
  assert.deepEqual(detectDomains(coaching), []);
  assert.deepEqual(detectDomains(capoeira), ['sport']);
  assert.deepEqual(detectDomains(tutoring), ['education']);
  assert.deepEqual(detectDomains(dental), ['health']);
  assert.deepEqual(detectDomains({ oneLiner: 'Home insurance for freelancers' }), ['finance']);
  assert.deepEqual(detectDomains({ oneLiner: 'Plus d’information pour vos clients' }), [], 'mid-word match (« information ») is ignored');
});

test('Kike’s calibration: a book publisher is not regulated; a legal advisor and a food product are (fr / es / en)', () => {
  const publishers = [
    { name: 'Éditions Lumière', oneLiner: 'Maison d’édition de livres jeunesse et romans', targets: 'Libraires, écoles, bibliothèques', mechanism: 'Sélection des manuscrits\nImpression\nDiffusion en librairie', who: 'Éditrice indépendante' },
    { name: 'Editorial Andina', oneLiner: 'Editorial de libros infantiles para niños', targets: 'Colegios y librerías' },
    { name: 'Northwind Press', oneLiner: 'Independent publisher of children’s books and novels', targets: 'Bookshops, schools' },
  ];
  for (const p of publishers) assert.deepEqual(detectDomains(p), [], p.name);
  for (const oneLiner of ['Conseiller juridique pour TPE', 'Asesor legal para pymes', 'Legal advisor for small businesses']) assert.deepEqual(detectDomains({ oneLiner }), ['legal'], oneLiner);
  for (const oneLiner of ['Confitures artisanales, produit alimentaire bio', 'Producto alimenticio: salsas artesanales', 'Healthy snack food product']) assert.deepEqual(detectDomains({ oneLiner }), ['food'], oneLiner);
  assert.equal(applyRegulation(fiveStar, publishers[0], { gap }).score, 5);
  assert.equal(applyRegulation(fiveStar, { oneLiner: 'Asesor legal para pymes' }, { gap }).score, 3);
});

test('a service that includes user training is not a training business', () => {
  assert.deepEqual(detectDomains({ name: 'Proyecto llave en mano de CRM', mechanism: 'Paso a producción tras las pruebas, con dos capacitaciones y 30 días de garantía' }), []);
  assert.deepEqual(detectDomains({ oneLiner: 'Implémentation logicielle avec formation des utilisateurs' }), []);
  assert.deepEqual(detectDomains({ oneLiner: 'Organisme de formation pour artisans' }), ['education']);
  assert.deepEqual(detectDomains({ oneLiner: 'Instituto de formación para el trabajo en soldadura' }), ['education']);
});

test('two questions drive the cap: regulated? documents in hand?', () => {
  const st = (answers, opts = {}) => regulationStatus(capoeira, { answers, ...opts });
  assert.deepEqual([st({}).status, st({}).cap, st({}).search], ['missing', 3, 'propose'], 'no answer + regulated hint: cap 3, search and propose');
  assert.deepEqual([st({ sector: 'unknown' }).status, st({ sector: 'unknown' }).search], ['missing', 'propose'], '« I don’t know »: search and propose');
  assert.equal(st({ sector: 'unknown' }, { searched: true }).cap, 4, 'searched: cap 4');
  assert.deepEqual([st({ sector: 'yes' }).status, st({ sector: 'yes' }).cap], ['not_ready', 3]);
  assert.deepEqual([st({ sector: 'yes', docs: 'no' }).cap, st({ sector: 'yes', docs: 'no' }).search], [3, 'propose'], 'documents missing: search and propose');
  assert.deepEqual([st({ sector: 'yes', docs: 'unsure' }).cap, st({ sector: 'yes', docs: 'unsure' }).search], [3, 'propose'], 'not sure: 3 at most');
  assert.deepEqual([st({ sector: 'yes', docs: 'yes' }).status, st({ sector: 'yes', docs: 'yes' }).cap, st({ sector: 'yes', docs: 'yes' }).search], ['ready', null, 'confirm'], 'documents provided: no cap, a search can confirm');
  assert.deepEqual([st({ sector: 'no' }).status, st({ sector: 'no' }).cap, st({ sector: 'no' }).search], ['declared_no', null, '']);
  assert.equal(st({ sector: 'no', docs: 'yes' }).docs, '', 'documents only count when regulated');
  const plain = regulationStatus(coaching, {});
  assert.deepEqual([plain.status, plain.cap, plain.search], ['none', null, ''], 'nothing detected, no answer: a light question, no search');
  assert.equal(regulationStatus(coaching, { answers: { sector: 'unknown' } }).search, 'propose', '« I don’t know » always searches');
  assert.equal(regulationStatus(coaching, { answers: { sector: 'yes' } }).cap, 3, 'the person’s yes counts even without a hint');
});

test('the cap applies to the AI score with a regulation gap first; lifting it drops the gap', () => {
  const texts = { missing: gap, not_ready: { why: 'docs', fix: 'get them' } };
  const m = applyRegulation(fiveStar, capoeira, { gaps: texts });
  assert.equal(m.score, 3); assert.equal(m.rawScore, 5);
  assert.equal(m.verdict, 'prêt pour des réunions à blanc');
  assert.deepEqual(m.gaps[0], { field: 'regulation', why: 'why', fix: 'fix' });
  assert.deepEqual(blockersFrom(m), ['regulation']);
  assert.ok(essentialGaps({}, blockersFrom(m)).includes('regulation'));
  assert.equal(applyRegulation(fiveStar, capoeira, { searched: true }).score, 4);
  assert.deepEqual(applyRegulation(fiveStar, capoeira, { answers: { sector: 'yes', docs: 'no' }, gaps: texts }).gaps[0], { field: 'regulation', why: 'docs', fix: 'get them' });
  const ready = applyRegulation({ ...fiveStar, gaps: [{ field: 'regulation', why: 'x', fix: 'y' }] }, capoeira, { answers: { sector: 'yes', docs: 'yes' } });
  assert.equal(ready.score, 5); assert.equal(ready.verdict, 'prêt pour la vente'); assert.deepEqual(ready.gaps, []);
  assert.equal(applyRegulation(fiveStar, capoeira, { answers: { sector: 'no' } }).score, 5);
  assert.equal(applyRegulation(fiveStar, { ...capoeira, regulation: 'Carte professionnelle' }).score, 3, 'writing in the field alone does not answer the questions');
});

test('a non-regulated offer is not capped; the AI flag alone is enough to cap', () => {
  assert.equal(applyRegulation(fiveStar, coaching, { gap }).score, 5);
  assert.equal(applyRegulation({ ...fiveStar, regulation: { regulated: true, domain: 'formation' } }, coaching, { gap }).score, 3);
  const low = applyRegulation({ score: 2, verdict: 'travailler l’offre', gaps: [] }, capoeira, { gap });
  assert.equal(low.score, 2); assert.equal(low.verdict, 'travailler l’offre');
});

test('the proposal only keeps sources that the search actually returned', () => {
  const p = sanitizeProposal({ regulated: 'yes', summary: 's', requirements: [{ item: 'Licencia', authority: 'Secretaría de Salud', source: 'https://a.gov.co/x' }, { item: 'Seguro', authority: '', source: 'https://invented.example' }, { item: '' }], field_value: 'Licencia — por verificar' }, [{ source: 'https://a.gov.co/x' }]);
  assert.deepEqual(p.requirements, [{ item: 'Licencia', authority: 'Secretaría de Salud', source: 'https://a.gov.co/x' }, { item: 'Seguro', authority: '', source: '' }]);
  assert.equal(sanitizeProposal({ regulated: 'maybe' }).regulated, 'unknown');
});

test('the proposal prompt carries the country, the answers and the search results', () => {
  const user = regulationProposalMessages({ lang: 'es', product: dental, country: 'Colombia', sources: 'URL: https://a.gov.co/x\nResolución…', answers: { sector: 'yes', docs: 'no' } })[1].content;
  assert.match(user, /Pays de vente : Colombia/);
  assert.match(user, /réglementée \? yes ; documents[^\n]*\? no/);
  assert.match(user, /https:\/\/a\.gov\.co\/x/);
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

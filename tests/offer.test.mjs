import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFER_KEY_ORDER, blockersFrom, essentialGaps, questionTodo } from '../web/lib/offer.js';
import { debriefExtractMessages, offerQuestionMessages } from '../web/lib/prompts.js';

// Fiche du parcours 1 (capoeira) après extraction : tout l'essentiel est rempli, sauf le prix.
const capoeira = { oneLiner: 'Ateliers', targets: 'Écoles', problem: 'Énergie', who: 'Inès', nextStep: 'Appel', mechanism: 'Appel, séance', advantages: 'Motricité', proofs: 'CQP', objections: 'Tarif ?', delays: 'Séance découverte', name: '', price: '', floor: '', constraints: '' };

test('questions target empty fields first, never filled ones', () => {
  const todo = questionTodo({ current: capoeira });
  assert.deepEqual(todo, ['price', 'name', 'floor', 'constraints']);
  for (const k of todo) assert.equal(capoeira[k], '');
});

test('questions skip fields already asked or skipped, and add weak fields flagged by maturity', () => {
  const todo = questionTodo({ current: capoeira, asked: ['price'], skipped: ['name'], blockers: ['proofs', 'objections', 'price'] });
  assert.deepEqual(todo, ['proofs', 'objections', 'floor', 'constraints']);
});

test('the question prompt lists only the fields to ask, and asks to stop when none is left', () => {
  const user = offerQuestionMessages({ lang: 'fr', current: capoeira, blockers: ['proofs'] })[1].content;
  assert.match(user, /CHAMPS À DEMANDER[^\n]*proofs, price, name, floor, constraints/);
  const done = offerQuestionMessages({ lang: 'fr', current: Object.fromEntries(OFFER_KEY_ORDER.map((k) => [k, 'x'])) })[1].content;
  assert.match(done, /CHAMPS À DEMANDER[^\n]*aucun/);
});

test('essential gaps count empty essentials and fields maturity says block the sale', () => {
  assert.deepEqual(essentialGaps(capoeira), ['price']);
  assert.deepEqual(essentialGaps({ ...capoeira, price: '40-60 €' }), []);
  assert.deepEqual(essentialGaps({ ...capoeira, price: '40-60 €' }, ['price', 'proofs', 'floor']), ['proofs', 'price', 'floor']);
});

test('a blocker answered since the last maturity no longer counts as a gap; an empty essential always does', () => {
  const priced = { ...capoeira, price: '40-60 €' };
  assert.deepEqual(essentialGaps(priced, ['proofs', 'price'], ['price']), ['proofs']);
  assert.deepEqual(essentialGaps(priced, ['proofs', 'price'], ['price', 'proofs']), []);
  assert.deepEqual(essentialGaps(capoeira, ['price'], ['price']), ['price']);
});

test('blockers come from a low maturity only, restricted to known fields', () => {
  const gaps = [{ field: 'price' }, { field: 'proofs' }, { field: 'inconnu' }, { field: 'price' }];
  assert.deepEqual(blockersFrom({ score: 2, gaps }), ['proofs', 'price']);
  assert.deepEqual(blockersFrom({ score: 4, gaps }), []);
  assert.deepEqual(blockersFrom(null), []);
});

test('debrief extraction counts the client commitments as actions and turns approximate dates into a day', () => {
  const user = debriefExtractMessages({ lang: 'fr', description: 'x', current: {}, today: '2026-10-09' }).at(-1).content;
  assert.match(user, /engagements du client[^\n]*owner = "client"/);
  assert.match(user, /semaine du 3 novembre[^\n]*lundi de cette semaine/);
  assert.match(user, /avant la fin du mois[^\n]*dernier jour/);
});

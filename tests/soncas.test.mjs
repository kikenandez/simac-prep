// tests/soncas.test.mjs — saisie manuelle par motivation SONCAS : elle survit à une nouvelle proposition IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blankMine, normMine, mergeScores, lines, withMine, userInput, hasMine, packMine, unpackMine } from '../web/lib/soncas.js';

const two = { S: 2, O: 2, N: 2, C: 2, A: 2, Y: 2, E: 2 };

test('scores fixed by hand are kept when the AI proposes again', () => {
  const prev = { ...two, A: 1, E: 3 };
  const ai = { ...two, A: 3, E: 1, N: 3 };
  const out = mergeScores(ai, prev, { A: true, E: true });
  assert.equal(out.A, 1);
  assert.equal(out.E, 3);
  assert.equal(out.N, 3, 'AI score kept where the user did not fix it');
});

test('at most three 3s: AI scores give way before fixed ones', () => {
  const prev = { ...two, S: 3, O: 3, N: 3 };
  const ai = { ...two, C: 3, A: 3, Y: 3 };
  const out = mergeScores(ai, prev, { S: true, O: true, N: true });
  assert.deepEqual([out.S, out.O, out.N], [3, 3, 3]);
  assert.deepEqual([out.C, out.A, out.Y], [2, 2, 2]);
  const mixed = mergeScores({ ...two, C: 3, A: 3 }, { ...two, S: 3, E: 3 }, { S: true, E: true });
  assert.equal(Object.values(mixed).filter((v) => v === 3).length, 3);
  assert.equal(mixed.S, 3); assert.equal(mixed.E, 3); assert.equal(mixed.C, 3); assert.equal(mixed.A, 2);
});

test('nothing fixed: the AI proposal is taken as is', () => {
  assert.deepEqual(mergeScores({ ...two, S: 3 }, { ...two, A: 1 }, {}), { ...two, S: 3 });
  assert.deepEqual(mergeScores({ ...two, S: 3 }, { ...two, A: 1 }, undefined), { ...two, S: 3 });
});

test('arguments typed one per line are trimmed, empty lines dropped', () => {
  assert.deepEqual(lines('  Essai gratuit \n\n- Référence locale\n  '), ['Essai gratuit', 'Référence locale']);
  assert.deepEqual(lines(''), []);
  assert.deepEqual(lines(undefined), []);
});

test('user arguments come first, then the AI ones, without duplicates', () => {
  const mine = { ...blankMine(), args: { S: ['Essai gratuit'] } };
  assert.deepEqual(withMine(mine, { S: ['Garantie', 'essai gratuit'] }, 'S'), ['Essai gratuit', 'Garantie']);
  assert.deepEqual(withMine(mine, {}, 'A'), []);
  assert.deepEqual(withMine(undefined, { A: ['ROI'] }, 'A'), ['ROI']);
  // l'IA reformule l'argument de l'utilisateur dans une phrase plus longue : écarté
  const pay = { ...blankMine(), args: { A: ['Paiement en trois fois sans frais'] } };
  assert.deepEqual(withMine(pay, { A: ['Un paiement en trois fois sans frais, qui étale la dépense.', 'Prix connu d’avance'] }, 'A'), ['Paiement en trois fois sans frais', 'Prix connu d’avance']);
  // un argument très court ne fait pas disparaître les phrases qui le contiennent
  const short = { ...blankMine(), args: { A: ['Prix'] } };
  assert.equal(withMine(short, { A: ['Prix connu d’avance'] }, 'A').length, 2);
});

test('old drafts without user input get an empty one', () => {
  assert.deepEqual(normMine(undefined), blankMine());
  const m = normMine({ notes: { S: 'a dit « pas de risque »', X: 'bad' }, args: { S: 'pas une liste' }, fixed: { A: true } });
  assert.equal(m.notes.S, 'a dit « pas de risque »');
  assert.equal(m.notes.X, undefined);
  assert.deepEqual(m.args.S, undefined);
  assert.deepEqual(m.fixed, { A: true });
});

test('only what the user wrote goes to the AI, per person, in order', () => {
  const people = [
    { mine: { notes: { S: 'Veut un essai' }, args: { A: ['Pas de coût caché'] }, fixed: { A: true } }, scores: { ...two, A: 1 } },
    { mine: blankMine(), scores: two },
  ];
  const out = userInput(people, ['Jean', 'Marie']);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { person: 'Jean', index: 1, observations: { S: 'Veut un essai' }, arguments: { A: ['Pas de coût caché'] }, fixed_scores: { A: 1 } });
  assert.equal(userInput([{ mine: blankMine(), scores: two }], ['X']), null);
  assert.equal(hasMine(people[0].mine), true);
  assert.equal(hasMine(people[1].mine), false);
});

test('user input round-trips through the CSV column', () => {
  const people = [{ mine: { notes: { S: 'a, "dit" ; oui' }, args: { C: ['Clé en main'] }, fixed: { C: true } } }, { mine: blankMine() }];
  const packed = packMine(people);
  assert.equal(typeof packed, 'string');
  const back = unpackMine(packed, 2);
  assert.equal(back[0].notes.S, 'a, "dit" ; oui');
  assert.deepEqual(back[0].args.C, ['Clé en main']);
  assert.deepEqual(back[0].fixed, { C: true });
  assert.deepEqual(back[1], blankMine());
  assert.equal(packMine([{ mine: blankMine() }]), '');
  assert.deepEqual(unpackMine('', 1), [blankMine()]);
  assert.deepEqual(unpackMine('not json', 1), [blankMine()]);
});

test('SONCAS prompt carries the user input only when there is some, after the people list', async () => {
  const { soncasMessages } = await import('../web/lib/prompts.js');
  const base = { lang: 'fr', product: {}, client: { contacts: [{ name: 'Jean', role: 'DG', weight: 'decide' }] }, brief: {}, history: '' };
  const [, without] = soncasMessages(base);
  assert.doesNotMatch(without.content, /NOTÉ LUI-MÊME/);
  const mine = [{ person: 'Jean', index: 1, observations: { A: 'budget voté en juin' }, arguments: {}, fixed_scores: { A: 1 } }];
  const [, withIt] = soncasMessages({ ...base, mine });
  assert.match(withIt.content, /NOTÉ LUI-MÊME[\s\S]*budget voté en juin/);
  assert.match(withIt.content, /fixed_scores/);
  // le mode démo lit la liste des interlocuteurs entre ces deux repères : elle reste intacte
  const m = /INTERLOCUTEURS PRÉSENTS AU RENDEZ-VOUS[^\n]*\n(\[[\s\S]*?\])\nFICHE CLIENT/.exec(withIt.content);
  assert.equal(JSON.parse(m[1])[0].name, 'Jean');
});

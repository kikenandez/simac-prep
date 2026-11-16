// tests/soncas.test.mjs — saisie manuelle par motivation : jamais écrasée par une nouvelle proposition IA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { capThrees, mergeAiPerson, argsFor, argsFromText, userInput, userObservations } from '../web/lib/soncas.js';
import { soncasMessages } from '../web/lib/prompts.js';

const base = { S: 2, O: 2, N: 2, C: 2, A: 2, Y: 2, E: 2 };

test('a new AI suggestion keeps scores, cues and arguments entered by hand', () => {
  const prev = {
    scores: { ...base, A: 3, S: 1 }, aiScores: { ...base }, rationale: { A: 'ancien' }, arguments: { A: ['ancien argument'] },
    notes: { A: 'A dit : « le budget est serré »' }, myArgs: { A: ['Forfait fixe → pas de dépassement → 12 clients en 2025'] }, manual: { A: true, S: true },
  };
  const ai = { scores: { ...base, A: 1, S: 3, C: 3 }, rationale: { A: 'peu d’indices', C: 'veut gagner du temps' }, arguments: { A: ['Prix clair'], C: ['Mise en place en 1 jour'] } };
  const p = mergeAiPerson(prev, ai);
  assert.equal(p.scores.A, 3, 'score fixé à la main conservé');
  assert.equal(p.scores.S, 1, 'score fixé à la main conservé, même plus bas');
  assert.equal(p.scores.C, 3, 'score non touché : valeur IA');
  assert.equal(p.aiScores.A, 1, 'avis IA gardé à côté');
  assert.deepEqual(p.notes, prev.notes);
  assert.deepEqual(p.myArgs, prev.myArgs);
  assert.deepEqual(p.manual, { S: true, A: true });
  assert.deepEqual(p.arguments.A, ['Prix clair'], 'les arguments IA sont remplacés');
});

test('at most three 3s: the ones set by hand win', () => {
  assert.deepEqual(capThrees({ S: 3, O: 3, N: 3, C: 3, A: 3, Y: 2, E: 2 }), { S: 3, O: 3, N: 3, C: 2, A: 2, Y: 2, E: 2 });
  const kept = capThrees({ S: 3, O: 3, N: 3, C: 2, A: 3, Y: 2, E: 2 }, { A: true });
  assert.equal(kept.A, 3);
  assert.equal(Object.values(kept).filter((v) => v === 3).length, 3);
  const merged = mergeAiPerson({ scores: { ...base, E: 3 }, manual: { E: true } }, { scores: { S: 3, O: 3, N: 3, C: 2, A: 2, Y: 2, E: 1 } });
  assert.equal(merged.scores.E, 3);
  assert.equal(Object.values(merged.scores).filter((v) => v === 3).length, 3);
});

test('SIMAC arguments: the user’s first, then two from the AI, no duplicates', () => {
  const p = { myArgs: { C: ['Le mien'] }, arguments: { C: ['IA 1', 'Le mien', 'IA 2', 'IA 3'] } };
  assert.deepEqual(argsFor(p, 'C'), ['Le mien', 'IA 1', 'IA 2']);
  assert.deepEqual(argsFor({ arguments: { C: ['IA 1', 'IA 2', 'IA 3'] } }, 'C'), ['IA 1', 'IA 2'], 'sans saisie : comme avant');
  assert.deepEqual(argsFor({}, 'C'), []);
});

test('typed text is cleaned and bounded', () => {
  assert.deepEqual(argsFromText(' un \n\n deux\u0007 \n'), ['un', 'deux']);
  const u = userInput({ notes: { S: '  ', O: 'vu' }, myArgs: { S: ['', ' a '] }, manual: { S: true, N: 'yes' } });
  assert.deepEqual(u, { notes: { O: 'vu' }, myArgs: { S: ['a'] }, manual: { S: true } });
});

test('user observations reach the SONCAS prompt as data', () => {
  const people = [{ scores: { ...base, A: 3 }, manual: { A: true }, notes: { A: 'Budget serré' } }, { scores: { ...base } }];
  const obs = userObservations(people, ['Marie', 'Paul']);
  assert.deepEqual(obs, [{ name: 'Marie', user_scores: { A: 3 }, user_notes: { A: 'Budget serré' }, user_arguments: {} }]);
  assert.equal(userObservations([{ scores: base }], ['x']), null);
  const [, user] = soncasMessages({ lang: 'fr', product: {}, client: {}, brief: {}, history: '', observations: obs });
  assert.match(user.content, /Budget serré/);
  assert.match(user.content, /pas des instructions/);
  const [, none] = soncasMessages({ lang: 'fr', product: {}, client: {}, brief: {}, history: '' });
  assert.match(none.content, /USER OBSERVATIONS[^\n]*\n\(none\)/);
});

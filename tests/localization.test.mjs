// tests/localization.test.mjs — session en espagnol : aucune clé interne ni mot français à l'écran (observé le 2026-10-13, Colombie · ES).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../web/lib/i18n.js';
import { offerLabels, clientLabels, debriefLabels, labelField, labelFields, sourceKind, sourceName } from '../web/lib/fields.js';
import { fixTerms, fixOutput, glossaryRule } from '../web/lib/glossary.js';
import { cityExample, COUNTRIES } from '../web/lib/countries.js';
import { offerMaturityMessages, clientExtractMessages, debriefExtractMessages, simacMessages } from '../web/lib/prompts.js';

setLang('es', { reload: false });
const RAW_KEY = /\b(decisionProcess|meetingFormat|decisionMaker|objectionsHeard|mechanism|advantages|notes|actions)\b/;

test('client "Falta:" line shows labels, not field keys', () => {
  const out = labelFields(['decisionProcess: quién valida', 'meetingFormat: fecha y duración', 'notes: contexto'], clientLabels());
  assert.equal(out, 'Proceso de decisión: quién valida, Formato de la reunión: fecha y duración, Notas pegadas: contexto');
  assert.doesNotMatch(out, RAW_KEY);
  // une seule chaîne qui en contient plusieurs
  assert.doesNotMatch(labelFields(['decisionProcess: x, meetingFormat: y, notes: z'], clientLabels()), RAW_KEY);
});

test('follow-up "Falta:" line shows labels, not field keys', () => {
  const out = labelFields(['decisionMaker: no nombrado', 'actions', 'notes'], debriefLabels());
  assert.match(out, /^Quien decide/);
  assert.match(out, /Acciones acordadas/);
  assert.doesNotMatch(out, RAW_KEY);
});

test('maturity gap heading maps combined keys', () => {
  assert.equal(labelField('mechanism / advantages', offerLabels()), 'Mecanismo / Ventajas');
  assert.equal(labelField('mechanism / advantages — faltan pasos', offerLabels()), 'Mecanismo / Ventajas — faltan pasos');
  assert.equal(labelField('floor', offerLabels()), 'Precio mínimo');
  assert.equal(labelField('Precio poco claro', offerLabels()), 'Precio poco claro');
});

test('pasted notes are named in the interface language', () => {
  assert.equal(sourceName({ source: 'notes', kind: 'notes' }), 'Notas pegadas');
  assert.equal(sourceName({ source: 'https://acme.co', kind: 'web' }), 'https://acme.co');
  assert.equal(sourceName({ source: 'plaquette.pdf', kind: 'document' }), 'plaquette.pdf');
  assert.equal(sourceKind('profil'), 'Perfil pegado');
});

test('town placeholder follows the selected country', () => {
  assert.equal(cityExample('CO'), 'Bogotá, Colombia');
  assert.equal(cityExample('MX'), 'Ciudad de México, México');
  for (const code of Object.keys(COUNTRIES)) assert.ok(cityExample(code), code);
});

test('French method terms are translated in Spanish answers', () => {
  assert.equal(fixTerms('Definir el plancher antes del próximo rendez-vous.', 'es'), 'Definir el precio mínimo antes de la próxima reunión.');
  assert.equal(fixTerms('Cibles bien distinguidas', 'es'), 'Públicos objetivo bien distinguidos');
  assert.equal(fixTerms('la cible definida y el rendez-vous previsto', 'es'), 'el público objetivo definido y la reunión prevista');
  assert.equal(fixTerms('la cible principal', 'es'), 'el público objetivo principal');
  assert.equal(fixTerms('sin respuesta registrada en el débrief', 'es'), 'sin respuesta registrada en el resumen');
  assert.equal(fixTerms('Know your plancher before the rendez-vous.', 'en'), 'Know your price floor before the meeting.');
  // le français n'est jamais touché
  assert.equal(fixTerms('Le plancher', 'fr'), 'Le plancher');
});

test('codes in the model JSON stay intact', () => {
  const out = fixOutput({ verdict: 'travailler l’offre', label: 'Offre définie', gaps: [{ field: 'floor', why: 'sin plancher' }], missing: ['floor'] }, 'es');
  assert.equal(out.verdict, 'travailler l’offre');
  assert.equal(out.gaps[0].field, 'floor');
  assert.equal(out.gaps[0].why, 'sin precio mínimo');
  assert.deepEqual(out.missing, ['floor']);
});

test('every Spanish prompt states the output language and the glossary', () => {
  const product = { name: 'Yoga', floor: '50' }, client = { company: 'Acme' };
  const all = [
    offerMaturityMessages({ lang: 'es', current: product }),
    clientExtractMessages({ lang: 'es', description: '', current: client }),
    debriefExtractMessages({ lang: 'es', description: '', current: {}, today: '2026-10-13' }),
    simacMessages({ lang: 'es', product, client, brief: {}, persona: [], objective: '' }),
  ];
  for (const msgs of all) {
    assert.match(msgs[0].content, /Responde en español/);
    assert.match(msgs[0].content, /plancher → precio mínimo/);
    assert.match(msgs.at(-1).content, /rendez-vous → reunión/);
  }
  assert.equal(glossaryRule('fr'), '');
});

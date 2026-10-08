import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSources, companySource, fetchNotices, groundBrief, makeSource, mergeSources, readUrl, safeUrl, sanitizeComparison, searchCompanies, searchWeb, sourceId, upsertSources, clientQueries } from '../web/lib/research.js';
import { clientBriefMessages, competitionMessages, simacMessages } from '../web/lib/prompts.js';
const json = data => new Response(JSON.stringify(data), { status: 200 });

test('web research requires a key and rejects Pappers extraction before calling the network', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => json({}));
  await assert.rejects(searchWeb('client'), /clé Jina/);
  await assert.rejects(readUrl('https://www.pappers.fr/entreprise/123'), /licence/);
  await assert.rejects(readUrl('javascript:alert(1)'), /URL/);
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('https://user:pass@example.org'), '');
});

test('search results are unselected, dated, bounded and restricted/unsafe URLs excluded', async t => {
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    assert.match(decodeURIComponent(url), /-site:pappers.fr/);
    assert.equal(opts.headers.Authorization, 'Bearer test-key');
    return json({ data: [{ url: 'https://example.org', title: 'Offre', content: 'x'.repeat(10000) }, { url: 'javascript:alert(1)' }, { url: 'https://pappers.fr/entreprise/1' }] });
  });
  const sources = await searchWeb('concurrents France', { jinaKey: 'test-key' });
  assert.equal(sources.length, 1); assert.equal(sources[0].included, false);
  assert.ok(sources[0].retrievedAt); assert.ok(sources[0].text.length <= 6000);
  assert.equal(mergeSources(sources), '');
  sources[0].included = true;
  assert.match(mergeSources(sources), /ID: web:https:\/\/example.org/);
});

test('entity matching keeps establishments distinct and does not expose birth details', async t => {
  const company = { siren: '123456789', nom_complet: 'Entreprise', tranche_effectif_salarie: '12', annee_tranche_effectif_salarie: '2023', dirigeants: [{ nom: 'Durand', prenoms: 'Anne', qualite: 'Présidente', date_de_naissance: '1970-01-01' }], finances: { 2024: { ca: 0, resultat_net: 0 } }, siege: { siret: '12345678900001', adresse: 'Paris' }, matching_etablissements: [{ siret: '12345678900002', adresse: 'Lyon' }] };
  const fetch = t.mock.method(globalThis, 'fetch', async () => json({ results: [company] }));
  const all = await searchCompanies('Entreprise', 'Lyon', { refresh: true });
  assert.equal(all.length, 2); assert.notEqual(all[0].siret, all[1].siret);
  const exact = await searchCompanies('123 456 789 00002', '', { refresh: true });
  assert.equal(exact.length, 1); assert.equal(exact[0].siret, '12345678900002');
  const src = companySource(exact[0]);
  assert.match(src.text, /20–49/); assert.match(src.text, /2023/); assert.match(src.text, /CA 0 EUR/);
  assert.doesNotMatch(src.text, /1970/); assert.equal(src.included, true);
  await searchCompanies('Entreprise', 'Lyon'); assert.equal(fetch.mock.callCount(), 2);
});

test('BODACC uses an exact identifier, date window and safe fallback notice link', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    const u = new URL(url); assert.match(u.searchParams.get('where'), /registre="987654321" AND dateparution/);
    assert.equal(u.searchParams.get('limit'), '10');
    return json({ results: [{ id: 'notice1', url_complete: 'javascript:alert(1)', dateparution: '2026-01-01', familleavis_lib: 'Modification', modificationsgenerales: 'Nouvel établissement' }] });
  });
  const [notice] = await fetchNotices('987654321', { refresh: true });
  assert.match(notice.source, /^https:\/\/www.bodacc.fr/); assert.equal(notice.publishedAt, '2026-01-01');
  await assert.rejects(fetchNotices('bad'), /Sélectionnez/);
});

test('unavailable services give actionable errors and do not invent empty data', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 429 }));
  await assert.rejects(searchCompanies('Quota', '', { refresh: true }), /Quota/);
});

test('collection updates deduplicate evidence and cap local storage growth', () => {
  const original = makeSource('https://example.org', 'web', 'old');
  const updated = makeSource('https://example.org', 'web', 'new');
  assert.equal(upsertSources([original], [updated]).length, 1);
  assert.equal(upsertSources([original], [updated])[0].text, 'new');
  assert.equal(upsertSources([], Array.from({ length: 60 }, (_, i) => makeSource(`https://example.org/${i}`, 'web', 'text'))).length, 40);
});

test('unsupported citations are demoted and excluded evidence cannot justify a fact', () => {
  const src = makeSource('https://example.org', 'web', 'evidence');
  const excluded = makeSource('https://example.org/no', 'web', 'no', { included: false });
  const result = groundBrief({ facts: [{ fact: 'Good', source_ids: [sourceId(src)] }, { fact: 'Excluded', source_ids: [sourceId(excluded)] }, { fact: 'Invented', source_ids: ['fake'] }], participants: [{ documented_role: 'CEO', source_ids: ['fake'] }], signals: [{ fact: 'No', source_ids: ['fake'] }] }, [src, excluded]);
  assert.equal(result.facts.length, 1); assert.equal(result.assumptions.length, 2);
  assert.equal(result.signals.length, 0); assert.equal(result.participants[0].documented_role, 'Rôle à confirmer');
});

test('named competitors require evidence; generic alternatives remain hypotheses', () => {
  const src = makeSource('https://example.org', 'web', 'evidence');
  const result = sanitizeComparison({ candidates: [{ name: 'Valid', type: 'direct', source_ids: [sourceId(src)] }, { name: 'Invented', type: 'direct', source_ids: ['fake'] }, { name: 'Interne', type: 'alternative' }] }, [src]);
  assert.deepEqual(result.candidates.map(c => c.name), ['Valid', 'Interne']);
  assert.equal(result.candidates[0].price, 'Non publié');
});

test('queries cover each person; market evidence stays separate from offer extraction', () => {
  const queries = clientQueries({ company: 'Entreprise', contacts: [{ name: 'Anne', role: 'Direction' }, { name: 'Paul', role: 'Achats' }] });
  assert.equal(queries.length, 3); assert.match(queries[2].query, /Paul.*Achats/);
  const src = makeSource('https://example.org', 'web', 'competitor claim');
  const messages = competitionMessages({ lang: 'fr', product: { name: 'My offer' }, geography: 'France', sources: [src] });
  assert.match(messages[0].content, /DONNÉES NON FIABLES/); assert.match(messages[1].content, /NOTRE OFFRE/);
  const brief = clientBriefMessages({ lang: 'fr', product: {}, client: { preparationMode: 'email' }, sources: mergeSources([src]), market: { candidates: [] } });
  assert.match(brief[1].content, /email_body/); assert.match(brief[1].content, /participants/);
  assert.doesNotMatch(simacMessages({ lang: 'fr', product: {}, client: {}, objective: {} })[1].content, /au moins un que la concurrence n'a pas/);
  assert.equal(activeSources([src]).length, 1);
});

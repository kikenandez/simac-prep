import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSources, companySource, fetchNotices, groundBrief, makeSource, mergeSources, readUrl, safeUrl, sanitizeComparison, searchCompanies, searchWeb, sourceId, upsertSources, clientQueries, rankSource, rankSources, competitorQuery } from '../web/lib/research.js';
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

test('web search keeps the publication date and allows slow answers (Jina often takes 20-30 s)', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    setTimeout(() => resolve(json({ data: [
      { url: 'https://a.example', title: 'A', content: 'x', publishedTime: '2016-09-22T12:03:00+0200' },
      { url: 'https://b.example', title: 'B', content: 'x', date: 'Sep 14, 2026' },
      { url: 'https://c.example', title: 'C', content: 'x' }] })), 30000);
  }));
  const pending = searchWeb('BETC Pantin', { jinaKey: 'k' });
  t.mock.timers.tick(30000);
  const sources = await pending;
  assert.deepEqual(sources.map(s => s.publishedAt), ['2016-09-22', '2026-09-14', '']);
});

test('web search still gives up after its own longer timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (url, opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  const pending = searchWeb('BETC', { jinaKey: 'k' });
  t.mock.timers.tick(60000);
  await assert.rejects(pending, /délai dépassé \(45 s\)/);
});

const src = (source, text) => ({ source, kind: 'web', text, included: false });
const criteria = { query: 'yoga en entreprise Paris prestataires tarifs', geography: 'France' };

test('ranking criteria: query words (accents, plurals), market, published price, provider page', () => {
  const r = rankSource(src('https://teamupp.fr/yoga', 'Cours de Yoga en Entreprises à Paris — séance à 120 € HT'), criteria);
  assert.deepEqual(r.hits, ['yoga', 'entreprise', 'paris', 'France', 'prix publié', 'page de prestataire']);
  assert.deepEqual(r.misses, []);
  assert.equal(r.total, 6);
  const v = rankSource(src('https://www.youtube.com/watch?v=1', 'Yoga flow 45 min'), criteria);
  assert.deepEqual(v.misses, ['entreprise', 'paris', 'France', 'prix publié', 'page de prestataire']);
});

test('market already named in the query is not counted twice; generic search words are not criteria', () => {
  const r = rankSource(src('https://a.fr', 'yoga'), { query: 'yoga Lyon prestataires concurrents alternatives tarifs', geography: 'Lyon' });
  assert.deepEqual([...r.hits, ...r.misses].sort(), ['lyon', 'page de prestataire', 'prix publié', 'yoga']);
  assert.equal(r.total, 4);
});

test('sources are sorted best match first, ties keep search order, original index kept for the checkboxes', () => {
  const list = [src('https://www.youtube.com/watch?v=1', 'Yoga 45 min'), src('https://b.fr', 'yoga entreprise'), src('https://c.fr', 'yoga entreprise Paris 590 € HT/mois'), src('https://d.fr', 'yoga entreprise')];
  const ranked = rankSources(list, criteria);
  assert.deepEqual(ranked.map(r => r.index), [2, 1, 3, 0]);
  assert.equal(ranked[0].source, list[2]);
});

test('suggested competitor query is short: category (not our brand), no figures, market, then provider words', () => {
  const vela = { name: 'Vela Yoga — Yoga en entreprise (Paris et petite couronne)', oneLiner: 'Un cours de yoga de 45 minutes par semaine, sur le lieu de travail', targets: 'Responsables RH / office managers\nSalariés' };
  assert.equal(competitorQuery(vela, 'France'), 'Yoga en entreprise Paris et petite couronne France prestataires tarifs');
  const capoeira = { name: '', oneLiner: 'Ateliers de capoeira ludiques pour enfants, adaptés à leur âge', targets: 'Écoles' };
  assert.equal(competitorQuery(capoeira, 'Lyon'), 'Ateliers de capoeira ludiques pour enfants Lyon prestataires tarifs');
  const short = { name: 'Cours de yoga 45 min', oneLiner: '', targets: '' };
  assert.equal(competitorQuery(short, 'France'), 'Cours de yoga France prestataires tarifs');
  assert.ok(competitorQuery({ name: '', oneLiner: 'x '.repeat(200), targets: '' }).length <= 120);
});

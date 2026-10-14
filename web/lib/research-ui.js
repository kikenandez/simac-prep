import { activeSources, clientQueries, competitorQuery, companySource, entityFacts, fetchNotices, readUrl, safeUrl, positionable, positioningChoice, rankSources, sanitizeComparison, sanitizePositioning, searchCompanies, searchWeb, sourceId, upsertSources } from './research.js';
import { localDay } from './dates.js';
import { competitionMessages, positioningMessages } from './prompts.js';
import { chatJSON, loadSettings } from './llm.js';
import { t, lang } from './i18n.js';
import { sourceKind, sourceName } from './fields.js';
import { country, getCountry, setCountry, marketLabel, geoName, countryOptions, syncCountrySwitches } from './countries.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const link = (url, label) => safeUrl(url) ? `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label || url)} ${esc(t('(nouvel onglet)'))}">${esc(label || url)}</a>` : esc(label || url);
export const marketDefaults = () => ({ country: getCountry(), geography: geoName(), query: '', url: '', sources: [], comparison: null });
export const researchDefaults = () => ({ query: '', entity: null });
export const clientFingerprint = s => JSON.stringify([s.id, s.client.company, s.client.location, s.client.contacts]);
export const marketFingerprint = s => JSON.stringify([s.id, s.product, s.market.geography]);

export function citations(ids, sources) {
  return (Array.isArray(ids) ? ids : []).map(id => {
    const s = activeSources(sources).find(s => sourceId(s) === id);
    return s ? `${link(s.source, sourceName(s))} <small>${esc(t('(réf. {ref}, consulté {seen})', { ref: s.publishedAt || t('inconnue'), seen: localDay(s.retrievedAt) || t('inconnu') }))}</small>` : `<small>${t('Source à vérifier')}</small>`;
  }).join(', ');
}
const matchLine = (r) => `<p class="match"><b>${t('Correspondance {score} / {total}', r)}</b> ${[...r.hits.map((h) => `<span class="ok">✓ ${esc(h)}</span>`), ...r.misses.map((m) => `<span class="ko">✗ ${esc(m)}</span>`)].join(' ')}</p>`;
/** Sources à cocher ; avec `rank` (critères de recherche), classées du plus au moins correspondant, critères affichés. */
export function renderEvidence(el, sources, changed, rank = null) {
  if (!el) return;
  const rows = rank ? rankSources(sources, rank) : sources.map((source, index) => ({ source, index }));
  el.innerHTML = (rank && sources.length > 1 ? `<p class="note">${t('Classées par correspondance avec la recherche : mots utiles, marché, prix publié, page de prestataire.')}</p>` : '') + rows.map(({ source: s, index: i, ...r }) => `<div class="card evidence">
    <label class="check"><input type="checkbox" data-include="${i}" ${s.included !== false ? 'checked' : ''}> ${t('Inclure dans la préparation')}</label>
    <b>${esc(sourceKind(s.kind))}</b> — ${link(s.source, sourceName(s))}
    ${rank ? matchLine(r) : ''}
    <p class="note">${s.subject ? esc(t('Recherche : {subject}.', { subject: s.subject === 'organisation' ? t('organisation') : s.subject })) + ' ' : ''}${esc(t('Publication ou référence : {ref}. Consulté le {seen}.', { ref: s.publishedAt || t('inconnue'), seen: localDay(s.retrievedAt) || t('inconnu') }))}${s.stale ? ' ' + t('Le client a changé : vérifiez la pertinence avant de réinclure.') : ''}</p>
    <details><summary>${t('Vérifier le texte collecté')}${s.truncated ? ' ' + t('(tronqué)') : ''}</summary><pre class="source-text">${esc(s.text)}</pre></details>
    <button class="btn ghost small" data-remove="${i}">${t('Retirer')}</button>
    </div>`).join('');
  el.querySelectorAll('[data-include]').forEach(input => input.onchange = () => { const s = sources[+input.dataset.include]; s.included = input.checked; s.stale = false; changed(); });
  el.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { sources.splice(+button.dataset.remove, 1); changed(); });
}

export function mountMarket(el, getState, { save, invalidate, busy, toast }) {
  if (!el) return;
  const state = getState(), m = state.market;
  const current = () => getState() === state && getState().market === m;
  // pays changé ailleurs (barre du haut, carte client) : le marché et la recherche automatique suivent ;
  // un marché ou une recherche modifiés à la main sont conservés
  const code = getCountry(), before = m.country || 'FR';
  if (before !== code) {
    const autoQuery = competitorQuery(state.product, m.geography, before);
    if (!m.geography.trim() || [geoName(before), marketLabel(before)].includes(m.geography)) m.geography = geoName(code);
    if (!m.query || m.query === autoQuery) m.query = competitorQuery(state.product, m.geography, code);
    m.country = code; m.comparison = null; invalidate(); save();
  }
  el.innerHTML = `<div class="card"><h2>${t('Concurrents et alternatives')}</h2>
    <p class="note">${t('Comparez des solutions pour la même cible et le même besoin. Les résultats sont des candidats à vérifier, pas des concurrents connus du client.')}</p>
    ${countryPicker('market-country')}
    <label>${t('Marché géographique')} <input id="market-geography" value="${esc(m.geography)}" placeholder="${esc(t('France, région, pays…'))}"></label>
    <label>${t('Recherche modifiable')} <textarea id="market-query">${esc(m.query || competitorQuery(state.product, m.geography, getCountry()))}</textarea></label>
    <div class="actions"><button class="btn ghost" id="market-search">${t('Explorer les concurrents et alternatives')}</button><button class="btn ghost small" id="market-reset-query">${t('Recalculer la recherche')}</button></div>
    <p class="note">${t('Recherche web : clé Jina requise dans Réglages, crédits selon votre offre. Vérifiez l’identité, le marché et les dates, puis cochez les sources utiles.')}</p>
    <label>${t('Page d’un concurrent / d’une alternative')} <input id="market-url" value="${esc(m.url)}" placeholder="https://…"></label>
    <div class="actions"><button class="btn ghost small" id="market-read">${t('Lire cette page')}</button></div>
    <div id="market-sources"></div>
    <button class="btn" id="market-compare">${t('Comparer avec mon offre')}</button>
    <div id="market-comparison"></div></div>`;
  const redraw = () => { if (el.isConnected && current()) mountMarket(el, getState, { save, invalidate, busy, toast }); };
  const changed = () => { m.comparison = null; invalidate(); save(); redraw(); };
  const rankCriteria = () => ({ query: m.query || el.querySelector('#market-query').value, geography: m.geography, country: getCountry() });
  // pays : mots de recherche, domaine national et sources ; le marché suit le pays s'il n'a pas été personnalisé
  el.querySelector('#market-country').onchange = e => { setCountry(e.target.value); syncCountrySwitches(); redraw(); };
  renderEvidence(el.querySelector('#market-sources'), m.sources, changed, rankCriteria());
  el.querySelector('#market-geography').oninput = e => { m.geography = e.target.value; m.comparison = null; m.sources.forEach(s => { s.included = false; }); invalidate(); save(); el.querySelector('#market-comparison').innerHTML = ''; renderEvidence(el.querySelector('#market-sources'), m.sources, changed, rankCriteria()); };
  el.querySelector('#market-query').oninput = e => { m.query = e.target.value; save(); };
  el.querySelector('#market-url').oninput = e => { m.url = e.target.value; save(); };
  el.querySelector('#market-reset-query').onclick = () => { m.query = competitorQuery(state.product, m.geography, getCountry()); save(); redraw(); };
  el.querySelector('#market-search').onclick = e => busy(e.currentTarget, async () => {
    if (!state.product.oneLiner && !state.product.name) return toast(t('Décrivez d’abord votre offre et ses cibles.'));
    const fingerprint = marketFingerprint(state);
    const query = el.querySelector('#market-query').value.trim();
    if (!query) return toast(t('Indiquez une recherche.'));
    const sources = await searchWeb(query, { jinaKey: loadSettings().jinaKey || '' });
    if (!current() || marketFingerprint(state) !== fingerprint) return;
    m.query = query; m.sources = upsertSources(m.sources, sources); changed();
    toast(sources.length ? t('{n} sources à vérifier et à cocher.', { n: sources.length }) : t('Aucun résultat. Essayez une recherche plus précise.'));
  });
  el.querySelector('#market-read').onclick = e => busy(e.currentTarget, async () => {
    const fingerprint = marketFingerprint(state);
    const source = await readUrl(m.url, { jinaKey: loadSettings().jinaKey || '' });
    if (!current() || marketFingerprint(state) !== fingerprint) return;
    source.included = false; m.sources = upsertSources(m.sources, [source]); changed();
  });
  el.querySelector('#market-compare').onclick = e => busy(e.currentTarget, async () => {
    if (!activeSources(m.sources).length) return toast(t('Vérifiez et cochez au moins une source.'));
    const fingerprint = JSON.stringify([marketFingerprint(state), m.sources]);
    const result = await chatJSON(competitionMessages({ lang: lang(), product: state.product, geography: m.geography, sources: m.sources }));
    if (!current() || JSON.stringify([marketFingerprint(state), m.sources]) !== fingerprint) return;
    m.comparison = sanitizeComparison(result, m.sources); invalidate(); save(); redraw();
  });
  const comparison = m.comparison;
  if (!comparison) return;
  const out = el.querySelector('#market-comparison');
  const sourced = new Set(positionable(comparison.candidates, m.sources));
  // 3 concurrents proposés par défaut (sourcés, directs d'abord) ; l'utilisateur peut changer, 3 au plus
  if (!Array.isArray(comparison.pick)) comparison.pick = positionable(comparison.candidates, m.sources).slice(0, 3).map(c => comparison.candidates.indexOf(c));
  const pick = comparison.pick;
  out.innerHTML = `<h3>${t('Comparaison à relire et corriger')}</h3><p>${esc(comparison.summary)}</p>` + comparison.candidates.map((c, i) => `<div class="card soft"><b>${esc(c.name)}</b> <small>${esc(t(c.type))}${!c.source_ids.length ? ' — ' + t('hypothèse à vérifier') : ''}</small>
    ${sourced.has(c) ? `<label class="check"><input type="checkbox" data-pick="${i}" ${pick.includes(i) ? 'checked' : pick.length >= 3 ? 'disabled' : ''}> ${t('Positionner mon offre face à ce concurrent')}</label>` : ''}
    ${[['target', t('Cible')], ['offer', t('Offre / solution')], ['price', t('Prix publié et conditions')], ['difference', t('Différence étayée avec mon offre')], ['question', t('Question à poser au client')]].map(([key, label]) => `<label>${label}<textarea data-candidate="${i}" data-field="${key}">${esc(c[key])}</textarea></label>`).join('')}
    <p class="note">${citations(c.source_ids, m.sources)}</p><button class="btn ghost small" data-remove-candidate="${i}">${t('Retirer ce candidat')}</button></div>`).join('')
    + (sourced.size ? `<div class="actions"><button class="btn" id="market-position" ${pick.length ? '' : 'disabled'}>${t('Positionner mon offre ({n} / 3)', { n: pick.length })}</button></div>` : '')
    + (comparison.positioning ? positioningGrid(comparison.positioning, m.sources) : '');
  out.querySelectorAll('[data-candidate]').forEach(input => input.oninput = () => { comparison.candidates[+input.dataset.candidate][input.dataset.field] = input.value; invalidate(); save(); });
  out.querySelectorAll('[data-remove-candidate]').forEach(button => button.onclick = () => { comparison.candidates.splice(+button.dataset.removeCandidate, 1); comparison.pick = null; comparison.positioning = null; invalidate(); save(); redraw(); });
  out.querySelectorAll('[data-pick]').forEach(input => input.onchange = () => {
    const i = +input.dataset.pick;
    comparison.pick = input.checked ? [...pick, i].slice(0, 3) : pick.filter(x => x !== i);
    comparison.positioning = null; save(); redraw();
  });
  out.querySelector('#market-position')?.addEventListener('click', e => busy(e.currentTarget, async () => {
    const chosen = positioningChoice(pick.map(i => comparison.candidates[i]), m.sources);
    if (!chosen.length) return toast(t('Cochez au moins un concurrent appuyé sur une source.'));
    const fingerprint = JSON.stringify([marketFingerprint(state), m.sources, pick]);
    const result = await chatJSON(positioningMessages({ lang: lang(), product: state.product, competitors: chosen, sources: m.sources }));
    if (!current() || m.comparison !== comparison || JSON.stringify([marketFingerprint(state), m.sources, comparison.pick]) !== fingerprint) return;
    comparison.positioning = sanitizePositioning(result, chosen, m.sources);
    if (!comparison.positioning) toast(t('Pas assez d’éléments documentés pour une grille : ajoutez ou cochez des sources plus détaillées.'));
    save(); redraw(); el.querySelector('.positioning')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }));
}

const MARK_LABEL = { '+': ['plus', '+', t('notre offre plus favorable')], '-': ['minus', '−', t('concurrent plus favorable')], '=': ['eq', '=', t('équivalent')], '?': ['unk', '?', t('non documenté')] };
/** Grille « où se situe mon offre » : critères en lignes, notre offre puis les concurrents choisis en colonnes. */
function positioningGrid(p, sources) {
  const cell = ({ mark, value }) => { const [cls, sym, title] = MARK_LABEL[mark] || MARK_LABEL['?']; return `<td class="mark-${cls}" title="${title}"><b>${sym}</b> ${esc(value || t('Non publié'))}</td>`; };
  return `<div class="positioning"><h3>${t('Où se situe mon offre')}</h3>
    <p class="note">${t('Du point de vue du client.')} <span class="mark-plus">+ ${t('notre offre plus favorable')}</span>, <span class="mark-minus">− ${t('concurrent plus favorable')}</span>, <span class="mark-eq">= ${t('équivalent')}</span>, <span class="mark-unk">? ${t('non documenté')}</span>. ${t('Marques proposées par l’IA : relisez-les, la grille ne vaut que par ses sources.')}</p>
    <div class="table-scroll"><table class="grid-pos"><thead><tr><th>${t('Critère')}</th><th>${t('Notre offre')}</th>${p.columns.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr></thead>
    <tbody>${p.criteria.map((k, j) => `<tr><th>${esc(k.label)}</th><td class="us">${esc(k.us)}</td>${p.columns.map(c => cell(c.cells[j])).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="note">${t('Sources :')} ${p.columns.map(c => `${esc(c.name)} — ${citations(c.source_ids, sources)}`).join(' ; ')}</p>
    ${p.suggestions.length ? `<h3>${t('Pistes pour mieux se positionner')}</h3><ol>${p.suggestions.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}</div>`;
}

export function mountClientResearch(el, getState, { save, invalidate, busy, toast, sourcesChanged }) {
  if (!el) return;
  const state = getState(), r = state.research;
  const current = () => getState() === state && getState().research === r;
  const options = { save, invalidate, busy, toast, sourcesChanged };
  const redraw = () => { if (el.isConnected && current()) mountClientResearch(el, getState, options); };
  const entity = r.entity;
  const queries = clientQueries(state.client, getCountry());
  const C = country();
  el.innerHTML = `<div class="card"><h2>${t('Identifier l’entreprise ou l’établissement')}</h2>
    ${countryPicker('client-country')}
    ${C.officialApi ? `<p class="note">${t('Données officielles françaises, sans clé. Vérifiez la commune, le SIRET et l’état de l’établissement avant de le choisir.')}</p>
    <label>${t('Nom, SIREN ou SIRET')} <input id="company-query" value="${esc(r.query || state.client.company)}"></label>
    <div class="actions"><button class="btn ghost" id="company-search">${t('Rechercher dans l’Annuaire des entreprises')}</button></div>
    <div id="company-candidates" aria-live="polite"></div>
    ${entity ? `<div class="card soft"><b>${esc(entity.name)}</b><p>${esc(entity.address)}<br>SIREN ${esc(entity.siren)}, SIRET ${esc(entity.siret)}</p>
      <dl class="facts">${entityFacts(entity).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <p class="note">${t('Source : Annuaire des entreprises')}${entity.updated ? esc(t(', mis à jour le {date}', { date: entity.updated.slice(0, 10) })) : ''}. ${t('Un mandat public ne prouve pas le pouvoir de décision pour cet achat.')}</p>
      <p>${link(`https://annuaire-entreprises.data.gouv.fr/etablissement/${entity.siret}`, t('Annuaire officiel'))}, ${link(`https://www.pappers.fr/entreprise/${entity.siren}`, t('Consulter Pappers'))}</p>
      <button class="btn ghost small" id="company-refresh">${t('Actualiser les données officielles')}</button>
      <button class="btn ghost small" id="company-notices">${t('Rechercher les annonces BODACC')}</button>
      <p class="note">${t('Les 10 annonces les plus récentes sur 24 mois. Pappers : consultation externe uniquement.')}</p></div>` : ''}
    <p id="official-status" class="note" role="status"></p>
    ${linkList(['avis', 'annuaire', 'emploi'], r.query || state.client.company || '')}` : registryPanel(state, r)}
    </div>
    <div class="card"><h2>${t('Organisation et interlocuteurs / destinataires')}</h2>
    <p class="note">${t('Recherchez les activités, projets, fonctions et publications professionnelles utiles à votre offre. Vérifiez nom, entreprise et rôle avant d’inclure une source. Un mandat public ne prouve pas le pouvoir de décision pour cet achat.')}</p>
    <label>${t('Angle de recherche')} <select id="client-search-angle">${queries.map((q, i) => `<option value="${i}">${esc(q.label)}</option>`).join('')}</select></label>
    <label>${t('Recherche modifiable')} <textarea id="client-search-query">${esc(queries[0]?.query || '')}</textarea></label>
    <button class="btn ghost" id="client-research-search">${t('Rechercher cet angle sur le web')}</button>
    <p class="note">${t('Clé Jina requise. Pour un profil inaccessible, ajoutez un extrait professionnel pertinent dans les notes.')}</p></div>`;
  el.querySelector('#client-country').onchange = e => { setCountry(e.target.value); syncCountrySwitches(); redraw(); };
  el.querySelector('#registry-read')?.addEventListener('click', e => busy(e.currentTarget, async () => {
    const fingerprint = clientFingerprint(state);
    const source = await readUrl(el.querySelector('#registry-url').value, { jinaKey: loadSettings().jinaKey || '' });
    if (!current() || fingerprint !== clientFingerprint(state)) return;
    state.sources = upsertSources(state.sources, [{ ...source, kind: 'registre', subject: 'organisation', included: false }]);
    invalidate(); save(); sourcesChanged(); toast(t('Page ajoutée aux sources : vérifiez-la puis cochez-la.'));
  }));
  if (!C.officialApi) { bindClientSearch(); return; }
  el.querySelector('#company-query').oninput = e => { r.query = e.target.value; save(); };
  el.querySelector('#company-search').onclick = e => busy(e.currentTarget, async () => {
    const fingerprint = clientFingerprint(state);
    const query = el.querySelector('#company-query').value;
    const candidates = await searchCompanies(query, state.client.location || '');
    if (!current() || fingerprint !== clientFingerprint(state) || !el.isConnected) return;
    const out = el.querySelector('#company-candidates');
    out.innerHTML = candidates.length ? candidates.map((c, i) => `<div class="card"><b>${esc(c.name)}</b><p>${esc(c.address)}<br>SIREN ${esc(c.siren)}, SIRET ${esc(c.siret)}. ${c.status === 'A' ? t('Établissement actif.') : t('Fermé ou état à vérifier.')}</p><button class="btn ghost small" data-select-company="${i}">${t('Choisir cet établissement')}</button></div>`).join('') : `<p>${t('Aucun résultat. Vérifiez le nom, la commune ou le numéro. Vous pouvez continuer avec vos notes et des sources web.')}</p>`;
    out.querySelectorAll('[data-select-company]').forEach(button => button.onclick = () => {
      const c = candidates[+button.dataset.selectCompany];
      if (r.entity && r.entity.siret !== c.siret) state.sources.forEach(s => { s.included = false; s.stale = true; });
      r.entity = c;
      state.sources = upsertSources(state.sources.filter(s => !['registre', 'bodacc'].includes(s.kind)), [companySource(c)]);
      invalidate(); save(); sourcesChanged(); redraw();
    });
  });
  el.querySelector('#company-notices')?.addEventListener('click', e => busy(e.currentTarget, async () => {
    const fingerprint = clientFingerprint(state), selected = r.entity;
    const notices = await fetchNotices(selected.siren, { refresh: true });
    if (!current() || fingerprint !== clientFingerprint(state) || r.entity !== selected) return;
    state.sources = upsertSources(state.sources.filter(s => s.kind !== 'bodacc'), notices);
    invalidate(); save(); sourcesChanged();
    if (el.isConnected) el.querySelector('#official-status').textContent = notices.length ? t('{n} annonce(s) collectée(s). Vérifiez leur portée avant le rendez-vous.', { n: notices.length }) : t('Aucune annonce trouvée sur 24 mois. Cela ne prouve ni l’absence de risque ni l’absence d’activité.');
  }));
  el.querySelector('#company-refresh')?.addEventListener('click', e => busy(e.currentTarget, async () => {
    const fingerprint = clientFingerprint(state), selected = r.entity;
    const candidates = await searchCompanies(selected.siret, '', { refresh: true });
    if (!current() || fingerprint !== clientFingerprint(state) || r.entity !== selected) return;
    const c = candidates.find(c => c.siret === selected.siret);
    if (!c) return toast(t('Établissement non retrouvé. La source précédente conserve sa date.'));
    r.entity = c; state.sources = upsertSources(state.sources, [companySource(c)]); invalidate(); save(); sourcesChanged(); redraw();
  }));
  bindClientSearch();
  function bindClientSearch() {
    el.querySelector('#client-search-angle').onchange = e => { el.querySelector('#client-search-query').value = queries[+e.target.value]?.query || ''; };
    el.querySelector('#client-research-search').onclick = e => busy(e.currentTarget, async () => {
      const fingerprint = clientFingerprint(state);
      const query = el.querySelector('#client-search-query').value.trim();
      if (!state.client.company || !query) return toast(t('Indiquez d’abord l’entreprise et les interlocuteurs connus.'));
      const subject = queries[+el.querySelector('#client-search-angle').value]?.subject || 'organisation';
      const sources = await searchWeb(query, { jinaKey: loadSettings().jinaKey || '' });
      if (!current() || fingerprint !== clientFingerprint(state)) return;
      state.sources = upsertSources(state.sources, sources.map(s => ({ ...s, subject })));
      invalidate(); save(); sourcesChanged();
      toast(sources.length ? t('{n} sources à vérifier et à cocher.', { n: sources.length }) : t('Aucun résultat pour cet angle.'));
    });
  }
}

/** Choix du pays : mots des recherches web, domaine national, registres et sites d'avis proposés. Réglage commun à tous les rendez-vous. */
function countryPicker(id) {
  const code = getCountry();
  return `<label>${t('Pays : recherches et sources')} <span class="country-switch"><select id="${id}">${countryOptions(code)}</select></span></label>`;
}
const KIND_LABEL = { registre: 'Registres officiels', avis: 'Avis clients', annuaire: 'Annuaires', emploi: 'Offres d’emploi' };
/** Hors de France : pas d'API officielle ouverte sans clé ; liens à ouvrir (nom pré-rempli quand le site le permet) et lecture d'une page choisie. */
function registryPanel(state, r) {
  const name = r.query || state.client.company || '';
  return `<p class="note">${t('Pas d’API officielle ouverte pour ce pays : ouvrez les registres et sites ci-dessous, vérifiez l’identité de l’entreprise, puis ajoutez la page utile aux sources.')}</p>
    ${linkList(Object.keys(KIND_LABEL), name)}
    <label>${t('Page d’un registre ou d’un annuaire')} <input id="registry-url" placeholder="https://…"></label>
    <div class="actions"><button class="btn ghost small" id="registry-read">${t('Lire cette page')}</button></div>`;
}
/** Liens de consultation du pays, groupés par type ; ouverts par l'utilisateur, jamais collectés automatiquement. */
function linkList(kinds, name) {
  const groups = kinds.map(kind => [KIND_LABEL[kind], country().links.filter(l => l.kind === kind)]).filter(([, l]) => l.length);
  return groups.length ? `<dl class="facts">${groups.map(([label, links]) => `<dt>${esc(t(label))}</dt><dd>${links.map(l => link(l.url(name), l.label)).join(' · ')}</dd>`).join('')}</dl>` : '';
}

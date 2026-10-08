// Recherche publique : identité officielle, événements et pages professionnelles.
// Aucun secret partagé ; les appels sont faits depuis le navigateur.
import { CONFIG } from '../config.js';
const MAX_CHARS = CONFIG.limits?.charsPerSource ?? 6000;
const TOTAL_CHARS = CONFIG.limits?.totalChars ?? 20000;
const cache = new Map();
const TTL = 15 * 60 * 1000;

export function safeUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; }
  catch { return ''; }
}
function normalizeUrl(value) {
  const text = String(value).trim();
  const url = safeUrl(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
  if (!url) throw new Error('Indiquez une URL http ou https valide.');
  return url;
}
export function restrictedSource(url) {
  try { const h = new URL(url).hostname; return h === 'pappers.fr' || h.endsWith('.pappers.fr'); }
  catch { return false; }
}
export function sourceId(s) { return s.id || `${s.kind || 'source'}:${s.source}`; }
export function makeSource(source, kind, text, extra = {}) {
  return { source, kind, text: clean(text).slice(0, MAX_CHARS), retrievedAt: new Date().toISOString(), ...extra, id: extra.id || `${kind}:${source}` };
}
export function activeSources(list) { return list.filter(s => s && s.included !== false && typeof s.text === 'string' && s.text); }
export function upsertSources(list, incoming) {
  const map = new Map(list.map(s => [sourceId(s), s]));
  for (const s of incoming) map.set(sourceId(s), s);
  return [...map.values()].slice(-40);
}
const TIMEOUT_MS = 20000;
const SEARCH_TIMEOUT_MS = 45000; // s.jina.ai lit chaque résultat : 12 à 30 s mesurés
async function request(url, { signal, headers = {}, refresh = false, cached = false, json = true, timeout = TIMEOUT_MS } = {}) {
  const previous = cache.get(url);
  if (cached && !refresh && previous && Date.now() - previous.at < TTL) return structuredClone(previous.data);
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeout);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) {
      if (res.status === 429) throw new Error('Quota de recherche atteint. Réessayez plus tard ; les sources déjà collectées sont conservées.');
      if (res.status === 401 || res.status === 403) throw new Error('Accès refusé. Pour la recherche web, vérifiez votre clé Jina et ses crédits dans Réglages.');
      throw new Error(`Source indisponible (${res.status}). Réessayez plus tard.`);
    }
    const data = json ? await res.json() : await res.text();
    if (cached) { if (cache.size >= 50) cache.delete(cache.keys().next().value); cache.set(url, { at: Date.now(), data }); }
    return data;
  } catch (e) {
    if (controller.signal.aborted) throw new Error(`Recherche interrompue ou délai dépassé (${timeout / 1000} s). Réessayez.`);
    throw e;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export async function readUrl(url, { jinaKey = '', signal } = {}) {
  const u = normalizeUrl(url);
  if (restrictedSource(u)) throw new Error('Pappers : ouvrez la fiche pour consultation. La collecte automatique nécessite une licence adaptée.');
  const headers = { Accept: 'text/plain', 'X-Return-Format': 'text' };
  if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`;
  const text = await request(`https://r.jina.ai/${u}`, { headers, signal, json: false });
  return makeSource(u, 'site', text);
}
/** Date de publication annoncée par la source (formats variés) → AAAA-MM-JJ, ou '' si absente / illisible. */
function isoDate(raw) {
  const d = raw ? new Date(raw) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  if (/\d:\d/.test(raw)) return d.toISOString().slice(0, 10);
  // sans heure (« Sep 14, 2026 ») : lu à minuit local, on garde le jour du calendrier
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}
export async function searchWeb(query, { jinaKey = '', signal } = {}) {
  if (!jinaKey.trim()) throw new Error('La recherche web nécessite une clé Jina dans Réglages (crédits selon votre offre). Les données officielles restent accessibles sans clé.');
  const headers = { Accept: 'application/json', Authorization: `Bearer ${jinaKey}` };
  const q = `${query} -site:pappers.fr`;
  const data = await request(`https://s.jina.ai/${encodeURIComponent(q)}`, { headers, signal, timeout: SEARCH_TIMEOUT_MS });
  return (Array.isArray(data?.data) ? data.data : []).filter(it => safeUrl(it.url) && !restrictedSource(it.url)).slice(0, 5).map(it =>
    makeSource(it.url, 'web', `${it.title || ''}\n${it.description || ''}\n${(it.content || '').slice(0, 2500)}`, { title: it.title || '', query, included: false, publishedAt: isoDate(it.publishedTime || it.date) }));
}
export function notesSource(text, kind = 'notes') { return makeSource(kind, kind, text); }
export function mergeSources(list) {
  return activeSources(list).map(s => `### ${s.kind.toUpperCase()} — ID: ${sourceId(s)}\nURL ou origine: ${s.source}\nPublication/référence: ${s.publishedAt || 'inconnue'} ; consulté: ${s.retrievedAt || 'inconnu'}\n${String(s.text).slice(0, MAX_CHARS)}`).join('\n\n').slice(0, TOTAL_CHARS);
}

const bands = { '00': '0', '01': '1–2', '02': '3–5', '03': '6–9', '11': '10–19', '12': '20–49', '21': '50–99', '22': '100–199', '31': '200–249', '32': '250–499', '41': '500–999', '42': '1 000–1 999', '51': '2 000–4 999', '52': '5 000–9 999', '53': '10 000 et plus' };
export async function searchCompanies(query, location = '', options = {}) {
  const raw = String(query).trim();
  if (!raw) throw new Error('Indiquez un nom, un SIREN ou un SIRET.');
  const digits = raw.replace(/\s/g, '');
  if (/^\d+$/.test(digits) && ![9, 14].includes(digits.length)) throw new Error('Un SIREN comporte 9 chiffres ; un SIRET, 14.');
  const q = /^\d{9}(\d{5})?$/.test(digits) ? digits : `${raw} ${location}`.trim();
  const data = await request(`https://recherche-entreprises.api.gouv.fr/search?${new URLSearchParams({ q, per_page: '5' })}`, { ...options, cached: true });
  return (data.results || []).flatMap(c => {
    const establishments = [...(c.matching_etablissements || []), c.siege].filter(Boolean);
    const unique = [...new Map(establishments.map(e => [e.siret, e])).values()];
    return unique.filter(e => /^\d{14}$/.test(e.siret || '') && (digits.length !== 14 || !/^\d+$/.test(digits) || e.siret === digits)).slice(0, 5).map(e => ({
      siren: c.siren, siret: e.siret, name: c.nom_complet || c.nom_raison_sociale,
      address: e.adresse || '', city: e.libelle_commune || '', naf: e.activite_principale || c.activite_principale || '',
      status: e.etat_administratif || c.etat_administratif, companyStatus: c.etat_administratif,
      created: c.date_creation || '', employees: bands[c.tranche_effectif_salarie] || 'non renseigné', employeesYear: c.annee_tranche_effectif_salarie || '',
      establishments: c.nombre_etablissements_ouverts, category: c.categorie_entreprise || '',
      updated: c.date_mise_a_jour || '', finances: c.finances || {},
      officers: (c.dirigeants || []).slice(0, 8).map(d => ({ name: [d.prenoms, d.nom].filter(Boolean).join(' ') || d.denomination || '', role: d.qualite || '' })),
    }));
  });
}
export function companySource(entity) {
  const finance = Object.entries(entity.finances || {}).sort(([a], [b]) => b.localeCompare(a)).slice(0, 2).map(([year, f]) => `${year} : CA ${f.ca == null ? 'non publié' : f.ca + ' EUR'} ; résultat net ${f.resultat_net == null ? 'non publié' : f.resultat_net + ' EUR'}`).join('\n');
  return makeSource(`https://annuaire-entreprises.data.gouv.fr/etablissement/${entity.siret}`, 'registre',
    `${entity.name}\nSIREN ${entity.siren} ; établissement SIRET ${entity.siret}\nAdresse professionnelle : ${entity.address}\nCode NAF : ${entity.naf}\nÉtat établissement : ${entity.status}; unité légale : ${entity.companyStatus}\nCréation unité légale : ${entity.created}\nEffectif de l'unité légale (pas nécessairement de ce site) : ${entity.employees} ; année ${entity.employeesYear || 'inconnue'}\nÉtablissements ouverts : ${entity.establishments ?? 'inconnu'}\n${finance}\nMandats publics (ne prouvent pas la participation au rendez-vous ni le pouvoir d'achat) : ${entity.officers.map(d => `${d.name} — ${d.role}`).join('; ')}`,
    { title: `${entity.name} — ${entity.siret}`, publishedAt: entity.updated, entitySiren: entity.siren, included: true });
}
export async function fetchNotices(siren, options = {}) {
  if (!/^\d{9}$/.test(siren)) throw new Error('Sélectionnez d’abord une entreprise.');
  const since = new Date(); since.setUTCFullYear(since.getUTCFullYear() - 2);
  const params = new URLSearchParams({ where: `registre="${siren}" AND dateparution >= date'${since.toISOString().slice(0, 10)}'`, order_by: 'dateparution desc', limit: '10' });
  const data = await request(`https://www.bodacc.fr/api/explore/v2.1/catalog/datasets/annonces-commerciales/records?${params}`, { ...options, cached: true });
  return (data.results || []).map(n => makeSource(safeUrl(n.url_complete) || `https://www.bodacc.fr/pages/annonces-commerciales-detail/?q.id=${encodeURIComponent(n.id)}`, 'bodacc',
    `${n.commercant || ''}\nSIREN recherché : ${siren}\n${n.familleavis_lib || ''} — ${n.typeavis_lib || ''}\nDate de publication : ${n.dateparution}\n${JSON.stringify({ acte: n.acte, modifications: n.modificationsgenerales, jugement: n.jugement, radiation: n.radiationaurcs, depot: n.depot })}\nUne annonce passée ne suffit pas à déduire la situation actuelle ni un besoin commercial.`,
    { title: `${n.familleavis_lib || 'Annonce BODACC'} — ${n.dateparution}`, publishedAt: n.dateparution, entitySiren: siren, included: true }));
}
export function clientQueries(client) {
  const company = String(client.company || '').trim();
  if (!company) return [];
  const base = `"${company.replace(/"/g, '')}" ${client.location || ''}`;
  return [
    { label: 'Organisation : projets et actualités', query: `${base} projets actualités activité`, subject: 'organisation' },
    ...(client.contacts || []).filter(c => c.name).slice(0, 3).map(c => ({ label: `${c.name} : rôle et publications professionnelles`, query: `${base} "${c.name.replace(/"/g, '')}" ${c.role || ''} rôle interview publication`, subject: c.name })),
  ];
}
// Recherche concurrents : courte (le moteur noie une longue phrase), la catégorie plutôt que notre marque, sans chiffres
// (« 45 minutes » ramène des vidéos), puis le marché et les mots qui ciblent des prestataires.
const QUERY_MAX = 120;
const FIGURES = /\b\d+(?:[.,]\d+)?\s*(?:minutes?|min|heures?|h|€|euros?|%|séances?|cours|personnes?|pers\.?)?(?=\s|$|[,.;:)])/gi;
export function competitorQuery(product, geography = 'France') {
  const name = String(product.name || '');
  const category = name.includes(' — ') ? name.split(' — ').slice(1).join(' ') : '';
  const core = (category || String(product.oneLiner || '').split(/[,;:.\n]/)[0] || name)
    .replace(FIGURES, ' ').replace(/[()«»"]/g, ' ').replace(/\s+/g, ' ').trim();
  const geo = String(geography || '').trim();
  const words = [core, geo && !normalize(core).includes(normalize(geo)) ? geo : '', 'prestataires tarifs'].filter(Boolean).join(' ');
  return words.length <= QUERY_MAX ? words : `${core.slice(0, QUERY_MAX - geo.length - 22).trim()} ${geo} prestataires tarifs`.replace(/\s+/g, ' ');
}

// Classement des candidats : critères explicites et vérifiables, sans IA — chaque mot utile de la recherche,
// le marché, un prix publié, une page de prestataire (pas une vidéo ni un réseau social).
const normalize = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOPWORDS = new Set('a au aux avec ce ces dans de des du en et la le les leur leurs l d un une pour par sur ou'.split(' '));
const SEARCH_WORDS = new Set('prestataire prestataires concurrent concurrents alternative alternatives tarif tarifs prix cout couts offre offres service services'.split(' '));
const NOT_PROVIDER = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|tiktok\.com|instagram\.com|facebook\.com|linkedin\.com|pinterest\.[a-z]+|x\.com|twitter\.com)$/;
const PRICE = /\d[\d\s.,]*\s?(€|eur\b|euros?\b)|(€|eur)\s?\d/i;
const terms = (text) => [...new Set(normalize(text).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOPWORDS.has(w) && !SEARCH_WORDS.has(w)))];
const hasTerm = (text, term) => new RegExp(`\\b${term.length > 4 ? term.replace(/s$/, '') : term}`).test(text);
const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } };

/** Critères remplis / manqués pour un candidat ; score = nombre de critères remplis. */
export function rankSource(source, { query = '', geography = '' } = {}) {
  const text = normalize(`${source.title || ''} ${source.text || ''}`);
  const words = terms(query);
  const geo = String(geography || '').trim();
  const checks = [
    ...words.map((w) => [w, hasTerm(text, w)]),
    // marché « France » : un domaine .fr suffit (une page française écrit rarement « France »)
    ...(geo && !words.includes(normalize(geo)) ? [[geo, hasTerm(text, normalize(geo)) || (normalize(geo) === 'france' && hostOf(source.source).endsWith('.fr'))]] : []),
    ['prix publié', PRICE.test(source.text || '')],
    ['page de prestataire', !NOT_PROVIDER.test(hostOf(source.source))],
  ];
  const hits = checks.filter(([, ok]) => ok).map(([label]) => label);
  return { hits, misses: checks.filter(([, ok]) => !ok).map(([label]) => label), score: hits.length, total: checks.length };
}
/** Candidats du plus au moins correspondant ; à égalité, l'ordre de la recherche ; index d'origine conservé. */
export function rankSources(sources, criteria) {
  return sources.map((source, index) => ({ source, index, ...rankSource(source, criteria) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}
export function sanitizeComparison(result, sources) {
  const ids = new Set(activeSources(sources).map(sourceId));
  return { summary: String(result.summary || ''), candidates: (Array.isArray(result.candidates) ? result.candidates : []).filter(c => c && typeof c === 'object').slice(0, 6).map(c => ({
    name: String(c.name || ''), type: ['direct', 'indirect', 'alternative'].includes(c.type) ? c.type : 'alternative',
    target: String(c.target || ''), offer: String(c.offer || ''), price: String(c.price || 'Non publié'), difference: String(c.difference || ''), question: String(c.question || ''),
    source_ids: (Array.isArray(c.source_ids) ? c.source_ids : []).filter(id => ids.has(id)),
  })).filter(c => c.source_ids.length || c.type === 'alternative') };
}
// Grille de positionnement : 3 concurrents au plus, choisis par l'utilisateur (3 proposés par défaut).
const POSITION_MAX = 3, CRITERIA_MAX = 5, SUGGESTIONS_MAX = 3;
const MARKS = { '+': '+', '-': '-', '−': '-', '–': '-', '=': '=', '?': '?', nous: '+', eux: '-', 'égal': '=', egal: '=', inconnu: '?' };
const TYPE_ORDER = { direct: 0, indirect: 1, alternative: 2 };
const UNDOCUMENTED = /^(?:$|-$|n\/a$|non publi|à vérifier|a verifier|inconnu|non document)/i;
/** Candidats positionnables : nommés et appuyés sur une source incluse ; directs puis indirects, ordre d'origine sinon. */
export function positionable(candidates, sources) {
  const ids = new Set(activeSources(sources).map(sourceId));
  return (candidates || []).filter(c => c?.name && (c.source_ids || []).some(id => ids.has(id)))
    .map((c, i) => ({ c, i })).sort((a, b) => (TYPE_ORDER[a.c.type] ?? 2) - (TYPE_ORDER[b.c.type] ?? 2) || a.i - b.i).map(x => x.c);
}
/** Choix de l'utilisateur ramené aux candidats positionnables, dans son ordre, 3 au plus. */
export function positioningChoice(chosen, sources) {
  const ok = new Set(positionable(chosen, sources));
  return (chosen || []).filter(c => ok.has(c)).slice(0, POSITION_MAX);
}
/** Grille contrôlée dans l'application : critères bornés, une marque +/−/= exige une valeur concurrente documentée, sinon « ? ». */
export function sanitizePositioning(result, chosen, sources) {
  const criteria = (Array.isArray(result?.criteria) ? result.criteria : []).filter(c => c && String(c.label || '').trim())
    .slice(0, CRITERIA_MAX).map(c => ({ label: String(c.label).trim(), us: String(c.us || '').trim() }));
  const answers = Array.isArray(result?.competitors) ? result.competitors : [];
  // réponses alignées sur la liste réellement envoyée à l'IA (choix positionnables, 3 au plus)
  const columns = positioningChoice(chosen, sources).map((c, i) => ({ c, cells: answers[i]?.cells }))
    .map(({ c, cells }) => ({ name: c.name, source_ids: c.source_ids, cells: criteria.map((_, j) => {
      const cell = Array.isArray(cells) ? cells[j] || {} : {};
      const value = String(cell.value || '').trim();
      // « avantage » (nous / eux / égal / inconnu) : plus fiable que des symboles pour les petits modèles
      const mark = UNDOCUMENTED.test(value) ? '?' : MARKS[normalize(cell.avantage ?? cell.mark).trim()] || MARKS[String(cell.mark || '').trim()] || '?';
      return { mark, value };
    }) }));
  if (criteria.length < 2 || !columns.length) return null;
  const suggestions = (Array.isArray(result.suggestions) ? result.suggestions : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, SUGGESTIONS_MAX);
  return { criteria, columns, suggestions };
}
function clean(t) { return String(t).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }

// La liaison des citations est contrôlée dans l'application, pas laissée au modèle.
export function groundBrief(result, sources, hasHistory = false) {
  if (!result || typeof result !== 'object') throw new Error('Fiche IA invalide. Relancez la préparation.');
  const objects = value => (Array.isArray(value) ? value : []).filter(v => v && typeof v === 'object');
  const strings = value => (Array.isArray(value) ? value : []).filter(v => typeof v === 'string').slice(0, 30);
  const ids = new Set([...activeSources(sources).map(sourceId), 'client', ...(hasHistory ? ['history'] : [])]);
  const refs = item => (Array.isArray(item.source_ids) ? item.source_ids : []).filter(id => ids.has(id));
  const assumptions = strings(result.assumptions);
  const facts = objects(result.facts).slice(0, 30).flatMap(f => {
    const source_ids = refs(f);
    if (!source_ids.length) { assumptions.push(`Non étayé : ${String(f.fact || '')}`); return []; }
    return [{ fact: String(f.fact || ''), source_ids, date: String(f.date || '') }];
  });
  const signals = objects(result.signals).slice(0, 10).filter(s => refs(s).length).map(s => ({ ...s, source_ids: refs(s) }));
  const participants = objects(result.participants).slice(0, 3).map(p => ({ ...p, source_ids: refs(p), documented_role: refs(p).length ? p.documented_role : 'Rôle à confirmer' }));
  return { ...result, facts, signals, participants, assumptions, questions_to_ask: strings(result.questions_to_ask), likely_problems: strings(result.likely_problems), competitive_context: strings(result.competitive_context), preparation: result.preparation && typeof result.preparation === 'object' ? { opening: String(result.preparation.opening || ''), email_subject: String(result.preparation.email_subject || ''), email_body: String(result.preparation.email_body || '') } : null };
}

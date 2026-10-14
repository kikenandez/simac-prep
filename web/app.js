// app.js — SIMAC Prep : préparation de rendez-vous commerciaux pour TPE/PME.
// Statique, sans serveur. L'IA est optionnelle et au choix (fournisseurs gratuits, ou mode démo).

import { PROVIDERS, loadSettings, saveSettings, resolve, chatJSON, listModels } from './lib/llm.js';
import { OFFER_KEY_ORDER, OFFER_ESSENTIAL, blockersFrom, essentialGaps } from './lib/offer.js';
import { clientBriefMessages, soncasMessages, simacMessages, followupMessages, offerExtractMessages, offerQuestionMessages, offerMaturityMessages, regulationProposalMessages, clientExtractMessages, clientQuestionMessages, debriefExtractMessages } from './lib/prompts.js';
import { readUrl, searchWeb, notesSource, mergeSources, activeSources, groundBrief, sourceId, upsertSources, competitorQuery, sanitizeComparison } from './lib/research.js';
import { SONCAS, DEFAULT_SCORES, clampScores, top3, label, packScores, unpackScores, WEIGHTS } from './lib/soncas.js';
import { listMeetings, saveMeeting, deleteMeeting, exportCSV, importCSV, saveDraft, loadDraft, newId, retrieve, COLUMNS } from './lib/store.js';
import { download } from './lib/csv.js';
import { localDay } from './lib/dates.js';
import { icsEvent, icsCalendar, googleCalendarUrl, dueBuckets, ACTION_COLUMNS, actionsOf } from './lib/agenda.js';
import { assistantExport, applyMinutes, minutesList } from './lib/assistant.js';
import { mailLinks } from './lib/safety.js';
import { extractText, ACCEPT } from './lib/files.js';
import { hasAccepted, accept, isEmail, isPending, resend, confirmEmail, getConsent } from './lib/consent.js';
import { CONFIG } from './config.js';
import { mountCountrySwitch, cityExample, getCountry, geoName, marketLabel } from './lib/countries.js';
import { applyRegulation, regulationLinks, regulationQuery, regulationStatus, sanitizeProposal } from './lib/regulation.js';
import { offerLabels, clientLabels, debriefLabels, labelField, labelFields, sourceKind, sourceName } from './lib/fields.js';
import { marketDefaults, researchDefaults, mountMarket, mountClientResearch, renderEvidence, citations, clientFingerprint } from './lib/research-ui.js';
import { t, lang, locale, initI18n } from './lib/i18n.js';

const LANG = lang();
initI18n(); // HTML statique traduit et sélecteur de langue posé avant l'accueil et le premier rendu
mountCountrySwitch(() => renderers[S.step]?.()); // pays : la vue en cours suit (marché, registres)
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ----------------------------------------------------------------------------- état
function blank() {
  return {
    id: newId(), date: localDay(), step: 'offer',
    product: { name: '', oneLiner: '', targets: '', problem: '', who: '', nextStep: '', mechanism: '', advantages: '', proofs: '', price: '', floor: '', delays: '', objections: '', regulation: '', constraints: '' },
    offer: { description: '', website: '', linkedin: '', instagram: '', profileText: '', sources: [], chat: [], pendingField: '', maturity: null, maturityRaw: null, regulationSearch: null, regulationAnswers: {}, blockers: [], reworked: [] },
    market: marketDefaults(), research: researchDefaults(),
    client: { preparationMode: 'meeting', location: '', company: '', sector: '', website: '', contacts: [blankContact('decide')], linkedinUrl: '', notes: '', decisionProcess: '', meetingFormat: '' },
    clientChat: { description: '', chat: [], pendingField: '' },
    sources: [], brief: null,
    persona: { people: [blankPerson()], current: 0, main_message: '', tensions: [], gaps: [] },
    objective: { primary: '', fallback: '' },
    simac: null,
    debrief: { outcome: '', objectionsHeard: '', decisionMaker: '', nextAction: '', nextOwner: 'me', nextDue: '', nextOutput: '', notes: '', description: '', actions: [blankAction()] },
    followup: null,
  };
}
const MAX_CONTACTS = 3;
const MAX_ACTIONS = 3;
const ACTION_STATUS = { todo: t('À lancer'), doing: t('En cours'), done: t('Réalisée') };
function blankAction() { return { action: '', owner: 'me', due: '', output: '', status: 'todo' }; }
/** Actions convenues renseignées, au plus 3 ; la première est le CTA principal (miroir nextAction/… pour le CSV). */
const actions = () => (S.debrief.actions || []).filter((a) => a.action).slice(0, MAX_ACTIONS);
function syncPrimaryAction() { const a = S.debrief.actions?.[0] || blankAction(); Object.assign(S.debrief, { nextAction: a.action, nextOwner: a.owner, nextDue: a.due, nextOutput: a.output }); }
function blankContact(weight = 'influence') { return { name: '', role: '', weight }; }
function blankPerson() { return { scores: { ...DEFAULT_SCORES }, aiScores: null, rationale: {}, arguments: {} }; }
/** Interlocuteurs renseignés (nom ou rôle), au plus 3. */
const contacts = () => (S.client.contacts || []).filter((c) => c.name || c.role).slice(0, MAX_CONTACTS);
const contactLabel = (c, i) => c?.name || c?.role || t('Personne {n}', { n: i + 1 });
const primary = () => S.client.contacts?.[0] || blankContact('decide');
/** Vue compatible pour les prompts et la mémoire : contactName/contactRole = interlocuteur principal. */
const clientView = () => ({ ...S.client, contacts: contacts(), contactName: primary().name, contactRole: primary().role });
let S = loadDraft() || blank();
if (!S.id) S = blank();
// migration : anciens brouillons à un seul interlocuteur / un seul persona
if (!Array.isArray(S.client.contacts)) { S.client.contacts = [{ name: S.client.contactName || '', role: S.client.contactRole || '', weight: 'decide' }]; delete S.client.contactName; delete S.client.contactRole; }
if (!Array.isArray(S.persona.people)) { S.persona = { people: [{ scores: S.persona.scores || { ...DEFAULT_SCORES }, aiScores: S.persona.aiScores || null, rationale: S.persona.rationale || {}, arguments: S.persona.arguments || {} }], current: 0, main_message: S.persona.main_message || '', tensions: [], gaps: S.persona.gaps || [] }; }
while (S.persona.people.length < S.client.contacts.length) S.persona.people.push(blankPerson());
if (!Array.isArray(S.debrief.actions)) S.debrief.actions = [{ action: S.debrief.nextAction || '', owner: S.debrief.nextOwner || 'me', due: S.debrief.nextDue || '', output: S.debrief.nextOutput || '', status: 'todo' }];
if (S.persona.current >= S.client.contacts.length) S.persona.current = 0;
if (!S.offer) S.offer = blank().offer;
if (!S.clientChat) S.clientChat = blank().clientChat;
if (S.client.meetingFormat == null) S.client.meetingFormat = '';
if (S.debrief.description == null) S.debrief.description = '';
S.market = { ...marketDefaults(), ...S.market };
S.research = { ...researchDefaults(), ...S.research };
S.client.preparationMode ||= 'meeting';
S.client.location ||= '';
const persist = () => saveDraft(S);

// ----------------------------------------------------------------------------- mes offres (bibliothèque locale)
// Une offre = fiche produit + description/sources/maturité + recherche marché. Conservée dans ce navigateur,
// pour que chaque nouveau rendez-vous reparte de la même offre — sauf si on en crée une autre.
const OFFERS_KEY = 'simac.offers';
function listOffers() { try { return JSON.parse(localStorage.getItem(OFFERS_KEY) || '[]'); } catch { return []; } }
function offerSlot() { return { product: S.product, offer: S.offer, market: S.market }; }
/** Enregistre l'offre courante sous son nom (remplace si même nom). */
function saveOffer(silent = false) {
  const name = (S.product.name || S.product.oneLiner || '').trim();
  if (!name) { if (!silent) toast(t('Donnez un nom au produit / service avant d’enregistrer l’offre.')); return false; }
  const all = listOffers(); const rec = { id: S.offerId || newId(), name, savedAt: new Date().toISOString(), ...structuredClone(offerSlot()) };
  const i = all.findIndex((o) => o.id === rec.id || o.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) { rec.id = all[i].id; all[i] = rec; } else all.unshift(rec);
  S.offerId = rec.id;
  try { localStorage.setItem(OFFERS_KEY, JSON.stringify(all)); } catch { if (!silent) toast(t('Stockage plein : retirez des sources ou des offres.')); return false; }
  persist(); if (!silent) toast(t('Offre « {name} » enregistrée.', { name })); return true;
}
function loadOffer(id) {
  const o = listOffers().find((x) => x.id === id); if (!o) return;
  Object.assign(S, { product: structuredClone(o.product), offer: structuredClone(o.offer), market: structuredClone(o.market || marketDefaults()), offerId: o.id });
  invalidatePreparation(); persist(); renderers.offer(); toast(t('Offre « {name} » chargée.', { name: o.name }));
}
function deleteOffer(id) {
  localStorage.setItem(OFFERS_KEY, JSON.stringify(listOffers().filter((o) => o.id !== id)));
  if (S.offerId === id) S.offerId = '';
  persist(); renderers.offer();
}
function clearOffer() {
  const b = blank(); Object.assign(S, { product: b.product, offer: b.offer, market: b.market, offerId: '' });
  invalidatePreparation(); persist(); renderers.offer();
}
function newOffer() {
  if (!confirm(t('Nouvelle offre ? L’offre en cours est d’abord enregistrée dans « Mes offres », puis la fiche, ses sources et la recherche marché sont vidées.'))) return;
  saveOffer(true); clearOffer();
}
/** Tout le RDV en cours repart à zéro (offre, client, persona, SIMAC, suivi) ; Mes offres et l'historique ne bougent pas. */
function resetOffer() {
  if (!confirm(t('Tout remettre à blanc ? Offre, client, persona, SIMAC et suivi en cours sont effacés — sans enregistrement. (« Mes offres » et l’historique ne bougent pas.)'))) return;
  S = blank(); persist(); go('offer'); toast(t('Tout est remis à blanc.'));
}
function renderOfferBar() {
  const el = $('#offer-bar'); if (!el) return;
  const all = listOffers();
  el.innerHTML = `
    <label>${t('Mes offres')} <small>— ${t('conservées dans ce navigateur ; un nouveau rendez-vous garde l’offre en cours')}</small></label>
    <div class="actions" style="margin:4px 0 0">
      <select id="offer-pick"><option value="">${all.length ? t('— choisir une offre enregistrée —') : t('— aucune offre enregistrée —')}</option>${all.map((o) => `<option value="${o.id}" ${o.id === S.offerId ? 'selected' : ''}>${esc(o.name)} (${esc(o.savedAt.slice(0, 10))})</option>`).join('')}</select>
      <button class="btn ghost small" id="offer-save">${t('Enregistrer l’offre')}</button>
      <button class="btn ghost small" id="offer-new">${t('Nouvelle offre')}</button>
      <button class="btn ghost small" id="offer-reset" title="${t('Tout effacer (offre, client, persona, SIMAC, suivi), sans enregistrer')}">${t('Remettre à blanc')}</button>
      ${S.offerId && all.some((o) => o.id === S.offerId) ? `<button class="btn danger small" id="offer-del" title="${t('Retirer de Mes offres')}">×</button>` : ''}
    </div>`;
  $('#offer-pick').onchange = (e) => { if (e.target.value) loadOffer(e.target.value); };
  $('#offer-save').onclick = () => { saveOffer(); renderOfferBar(); };
  $('#offer-new').onclick = newOffer;
  $('#offer-reset').onclick = resetOffer;
  $('#offer-del')?.addEventListener('click', () => { if (confirm(t('Retirer cette offre de Mes offres ? (la fiche en cours reste affichée)'))) deleteOffer(S.offerId); });
}
function invalidatePreparation() {
  S.brief = null; S.simac = null; S.followup = null;
  S.persona.main_message = ''; S.persona.tensions = [];
  S.persona.people.forEach(p => { p.aiScores = null; p.rationale = {}; p.arguments = {}; });
  markDone();
  if ($('#brief-out')) renderBrief();
}
function invalidateClientResearch() {
  S.research = researchDefaults();
  S.sources.forEach(s => { s.included = false; s.stale = true; });
  invalidatePreparation();
}
function invalidateContactResearch() {
  S.sources.filter(s => s.subject && s.subject !== 'organisation').forEach(s => {
    s.included = false;
    s.stale = true;
  });
  invalidatePreparation();
}
function mountResearch() {
  mountClientResearch($('#client-research'), () => S, { save: persist, invalidate: invalidatePreparation, busy, toast, sourcesChanged: renderSources });
}

// ----------------------------------------------------------------------------- UI utils
let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), ms);
}
async function busy(btn, fn) {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${old}`;
  try { return await fn(); }
  catch (e) { console.error(e); toast(friendlyError(e), 6000); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}
function friendlyError(e) {
  const m = String(e?.message || e);
  if (m === 'NO_API_KEY') return t('Ajoutez une clé API gratuite dans Réglages (ou choisissez le mode démo).');
  if (m.startsWith('LLM_HTTP_401') || m.startsWith('LLM_HTTP_403')) return t('Clé API refusée. Vérifiez-la dans Réglages.');
  if (m.startsWith('LLM_HTTP_429')) return t('Quota gratuit atteint : patientez une minute ou changez de fournisseur.');
  if (m.startsWith('LLM_HTTP_404') && /model/i.test(m)) return t('Modèle introuvable chez ce fournisseur : dans Réglages, cliquez « Lister les modèles » et choisissez-en un.');
  if (m.includes('Failed to fetch')) return t('Réseau ou CORS bloqué. Pour Ollama : lancez-le avec OLLAMA_ORIGINS="*".');
  if (m.startsWith('LLM_TRUNCATED')) return t('Réponse IA coupée : trop longue. Retirez une source ou relancez.');
  if (e instanceof SyntaxError) return t('Réponse IA illisible (JSON). Relancez, ou changez de modèle.') + (e.raw ? ' ' + t('Début : « {text} »', { text: e.raw.slice(0, 120) }) : '');
  return m.slice(0, 200);
}
function bindInputs(root, obj, prefix) {
  $$(`[data-bind^="${prefix}."]`, root).forEach((el) => {
    const key = el.dataset.bind.slice(prefix.length + 1);
    el.value = obj[key] ?? '';
    el.addEventListener('input', () => {
      const changed = obj[key] !== el.value; obj[key] = el.value;
      if (changed && prefix === 'client') {
        if (['company', 'location'].includes(key)) invalidateClientResearch(); else invalidatePreparation();
        mountResearch(); renderSources();
      }
      if (changed && prefix === 'product') {
        S.market.comparison = null;
        invalidatePreparation();
        const out = $('#market-comparison');
        if (out) out.innerHTML = '';
        if (!S.market.query && $('#market-query')) {
          $('#market-query').value = competitorQuery(S.product, S.market.geography);
        }
      }
      persist();
    });
  });
}
const field = (bind, lbl, { hint = '', type = 'input', full = false, placeholder = '', attrs = '' } = {}) =>
  `<div class="${full ? 'full' : ''}"><label>${lbl} ${hint ? `<small>— ${hint}</small>` : ''}</label>
   ${type === 'textarea' ? `<textarea data-bind="${bind}" placeholder="${esc(placeholder)}"></textarea>` : `<input data-bind="${bind}" placeholder="${esc(placeholder)}" ${attrs}>`}</div>`;

// ----------------------------------------------------------------------------- navigation
function go(step) {
  S.step = step; persist();
  $$('#steps button').forEach((b) => b.classList.toggle('active', b.dataset.step === step));
  markDone();
  renderers[step]();
  window.scrollTo({ top: 0 });
}
function markDone() {
  const done = {
    offer: !!(S.product.name && S.product.oneLiner),
    client: !!(S.client.company && S.brief),
    persona: !!S.persona.main_message,
    simac: !!S.simac,
    followup: !!S.followup,
  };
  $$('#steps button').forEach((b) => b.classList.toggle('done', !!done[b.dataset.step]));
  renderDueBadge();
  const cfg = resolve();
  $('#provider-badge').textContent = cfg.provider === 'mock' ? t('Mode démo (sans IA)') : `${PROVIDERS[cfg.provider]?.label.split(' (')[0]}, ${cfg.model}`;
}
$('#steps').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.step); });
$('#btn-new').addEventListener('click', () => {
  if (!confirm(t('Nouveau rendez-vous ? L’offre est conservée (et enregistrée dans « Mes offres »), le reste est réinitialisé (pensez à enregistrer le RDV dans Suivi).'))) return;
  saveOffer(true);
  const product = S.product, offer = S.offer, market = S.market, offerId = S.offerId; S = blank(); Object.assign(S, { product, offer, market, offerId }); persist(); go('client');
});

// ----------------------------------------------------------------------------- 1. OFFRE
const renderers = {};
const FIELD_LABELS = offerLabels();
const MATURITY = { 1: t('Encore une idée à travailler'), 2: t('Ébauche'), 3: t('Offre définie'), 4: t('Prête à tester'), 5: t('Prête à la présentation') };
// Codes de verdict : restent en français (l'IA les renvoie tels quels) ; affichés via t().
const VERDICT = { 1: 'travailler l’offre', 2: 'travailler l’offre', 3: 'prêt pour des réunions à blanc', 4: 'prêt pour la vente', 5: 'prêt pour la vente' };
function verdictBanner() {
  const M = S.offer?.maturity;
  if (!M) return `<div class="card warn"><b>${t('Maturité de l’offre non évaluée.')}</b> ${t('L’IA n’invente rien : ce que la fiche ne contient pas n’apparaîtra pas. Lancez « Analyser la maturité » à l’étape 1 pour connaître l’avis de l’outil.')}</div>`;
  const v = M.verdict || VERDICT[M.score];
  if (/vente|venta|vender|sell|sale/i.test(v)) return '';
  const hint = /travailler|trabajar|work/i.test(v) ? t('Des trous dans la fiche empêchent d’argumenter sans inventer — complétez l’offre avant un vrai rendez-vous.') : t('Utilisez ce rendez-vous comme un entraînement ; complétez les manques signalés avant de vendre.');
  return `<div class="card${M.score < 3 ? ' warn' : ''}"><b>${t('Avis de l’outil : {verdict}', { verdict: esc(t(v)) })}</b> (${M.score}/5). ${hint}</div>`;
}

renderers.offer = () => {
  const O = S.offer;
  $('#main').innerHTML = `
    <h1>${t('1 · Votre offre')}</h1>
    <p class="lead">${t('Décrivez votre produit ou service avec vos mots ; l’IA remplit la fiche, pose les questions qui manquent et mesure la maturité de l’offre. Ne rien inventer — ce qui manque est un trou à combler.')}</p>
    <div class="card soft" id="offer-bar"></div>

    <div class="card">
      <h2>${t('Décrire')}</h2>
      <div class="grid">
        ${field('offer.description', t('Texte libre'), { hint: t('ce que vous vendez, à qui, comment, à quel prix — comme vous le diriez à un ami'), type: 'textarea', full: true, placeholder: t('Ex. : J’accompagne des artisans pendant 3 mois pour qu’ils signent plus de devis. On commence par…') })}
        ${field('offer.website', t('Site web'), { hint: t('lu automatiquement'), placeholder: t('exemple.fr') })}
        ${field('offer.linkedin', t('Page LinkedIn / Instagram / autre'), { hint: t('URL ; si la lecture échoue, collez le texte ci-dessous'), placeholder: t('linkedin.com/in/… ou instagram.com/…') })}
        ${field('offer.profileText', t('Texte collé'), { hint: t('profil LinkedIn, bio Instagram, plaquette, mail… (LinkedIn et Instagram bloquent la lecture automatique)'), type: 'textarea', full: true })}
      </div>
      <div class="actions">
        <button class="btn ghost" id="offer-fetch">${t('Lire les pages')}</button>
        <label class="btn ghost" style="margin:0">${t('Joindre plaquette / mail / image')} <input type="file" id="offer-files" accept="${ACCEPT}" multiple hidden></label>
        <span class="note" id="offer-src">${t('{n} source(s)', { n: O.sources.length })}</span>
      </div>
      <div id="offer-sources"></div>
      <div class="actions"><button class="btn" id="offer-extract">${t('Analyser et remplir la fiche avec l’IA')}</button></div>
      <div id="offer-notes" class="note"></div>
    </div>

    <h2>${t('Fiche produit')}</h2>
    <div id="offer-gaps" class="gaps"></div>
    <div class="grid">
      ${field('product.name', t('Produit / service'))}
      ${field('product.oneLiner', t('En une phrase, sans jargon'), { placeholder: t('Ex. : un accompagnement de 3 mois pour structurer la prospection') })}
      ${field('product.targets', t('Cibles'), { hint: t('qui achète / qui utilise / qui décide'), type: 'textarea' })}
      ${field('product.problem', t('Problème de chaque cible'), { hint: t('avec ses mots'), type: 'textarea' })}
      ${field('product.who', t('Qui parle'), { hint: t('vous / la marque en une phrase') })}
      ${field('product.nextStep', t('Étape suivante voulue'), { hint: t('le « petit oui » : essai, RDV, devis…') })}
      ${field('product.mechanism', t('Mécanisme'), { hint: t('3 à 5 étapes : qui fait quoi, quand, comment'), type: 'textarea' })}
      ${field('product.advantages', t('Avantages'), { hint: t('≥ 3, tangibles et intangibles'), type: 'textarea' })}
      ${field('product.proofs', t('Preuves'), { hint: t('chiffres, références, témoignages'), type: 'textarea' })}
      ${field('product.objections', t('Objections attendues'), { hint: t('5 à 10'), type: 'textarea' })}
      ${field('product.price', t('Prix'), { hint: t('et unité qui parle au client') })}
      ${field('product.floor', t('Plancher'), { hint: t('limite basse, gratuités max') })}
      ${field('product.delays', t('Délais et conditions'))}
      ${field('product.regulation', t('Réglementation'), { hint: t('activité réglementée dans le pays de vente ? autorisation, diplôme, assurance, normes — ou « non réglementée », vérifié'), type: 'textarea' })}
      ${field('product.constraints', t('Contraintes'), { hint: t('ton, décisions prises') })}
    </div>

    <div id="market-research"></div>

    <div class="card" id="offer-chat-card">
      <h2>${t('Compléter par questions')}</h2>
      <p class="note">${t('L’IA pose une question à la fois sur ce qui manque ; votre réponse remplit le champ correspondant.')}</p>
      <div id="offer-chat"></div>
    </div>

    <div class="card">
      <h2>${t('Maturité de l’offre')}</h2>
      <div class="actions" style="margin-top:0"><button class="btn ghost" id="offer-maturity">${t('Analyser la maturité (1 à 5)')}</button></div>
      <div id="regulation-out"></div>
      <div id="offer-maturity-out"></div>
    </div>

    <div class="actions"><button class="btn" id="next">${t('Passer à l’étape Client')}</button>
      <button class="btn ghost small" id="export-offer">${t('Exporter la fiche (JSON)')}</button>
      <label class="btn ghost small" style="margin:0">${t('Importer')} <input type="file" id="import-offer" accept=".json" hidden></label></div>`;
  bindInputs($('#main'), S.product, 'product');
  bindInputs($('#main'), O, 'offer');
  renderOfferBar();
  renderGaps({ el: $('#offer-gaps'), obj: S.product, keys: OFFER_KEY_ORDER, labels: FIELD_LABELS, chatCard: '#offer-chat', prefix: 'product' });
  renderGuidedChat({ el: $('#offer-chat'), state: O, target: S.product, build: offerQuestionMessages, step: 'offer', onFilled: (key) => { O.reworked = [...new Set([...(O.reworked || []), key])]; O.maturity = null; S.market.comparison = null; invalidatePreparation(); } });
  // le pays a pu changer : le plafond suit les réponses du pays affiché
  if (O.maturityRaw) { O.maturity = withRegulation(O.maturityRaw); O.blockers = blockersFrom(O.maturity); }
  renderMaturity(); renderRegulation();
  mountMarket($('#market-research'), () => S, { save: persist, invalidate: invalidatePreparation, busy, toast });
  renderSourceList($('#offer-sources'), O.sources, () => { persist(); renderers.offer(); });
  $('#offer-files').onchange = (e) => addFiles(e.target.files, O.sources, () => { persist(); renderers.offer(); });

  $('#offer-fetch').onclick = (e) => busy(e.target, async () => {
    const urls = [O.website, O.linkedin].filter(Boolean);
    if (!urls.length) return toast(t('Indiquez au moins une URL.'));
    const jinaKey = loadSettings().jinaKey || '';
    let n = 0;
    for (const u of urls) {
      try { const src = await readUrl(u, { jinaKey }); const fresh = !O.sources.some((x) => x.source === src.source); if (fresh && !roomFor(O.sources)) break; O.sources = O.sources.filter((x) => x.source !== src.source); O.sources.push(src); n++; }
      catch (err) { toast(/linkedin|instagram/i.test(u) ? t('Ce site bloque la lecture automatique : collez le texte du profil dans « Texte collé ».') : friendlyError(err), 6000); }
    }
    persist(); if ($('#offer-src')) $('#offer-src').textContent = t('{n} source(s)', { n: O.sources.length }); renderSourceList($('#offer-sources'), O.sources, () => { persist(); renderers.offer(); });
    if (n) toast(t('{n} page(s) lue(s).', { n }));
  });

  $('#offer-extract').onclick = (e) => busy(e.target, async () => {
    if (!O.description.trim() && !O.sources.length && !O.profileText.trim()) return toast(t('Décrivez votre offre ou ajoutez une source.'));
    const all = [...O.sources]; if (O.profileText.trim()) all.push(notesSource(O.profileText, 'profil'));
    const r = await chatJSON(offerExtractMessages({ lang: LANG, description: O.description, sources: mergeSources(all), current: S.product }));
    const f = r.fields || {}; let filled = 0, kept = 0;
    for (const k of Object.keys(FIELD_LABELS)) {
      const v = String(f[k] || '').trim(); if (!v) continue;
      if (!String(S.product[k] || '').trim()) { S.product[k] = v; filled++; } else if (S.product[k] !== v) kept++;
    }
    if (kept && confirm(t('{n} champ(s) déjà remplis ont une nouvelle proposition. Les remplacer ? (Annuler = garder vos valeurs)', { n: kept }))) {
      for (const k of Object.keys(FIELD_LABELS)) { const v = String(f[k] || '').trim(); if (v) S.product[k] = v; }
      filled += kept;
    }
    O.maturity = null; S.market.comparison = null; invalidatePreparation(); persist(); markDone();
    if (S.step !== 'offer') return;
    renderers.offer();
    const notes = [r.notes, (r.missing || []).length ? t('Manque : {fields} → utilisez « Compléter par questions ».', { fields: labelFields(r.missing, FIELD_LABELS) }) : ''].filter(Boolean).join(' ');
    $('#offer-notes').textContent = notes;
    toast(t('{n} champ(s) rempli(s).', { n: filled }));
  });

  $('#offer-maturity').onclick = (e) => busy(e.target, async () => {
    if (!S.product.oneLiner && !S.product.name) return toast(t('Remplissez au moins le nom et la phrase.'));
    const r = await chatJSON(offerMaturityMessages({ lang: LANG, current: S.product, country: geoName() }));
    O.maturityRaw = r;
    O.maturity = withRegulation(r);
    O.blockers = blockersFrom(O.maturity); // survivent aux réponses suivantes : seule une nouvelle maturité les lève
    O.reworked = []; // … mais un bloquant répondu depuis ne compte plus comme manque
    persist(); if (S.step === 'offer') { renderers.offer(); $('#offer-maturity-out')?.scrollIntoView({ block: 'center' }); }
    // pas encore répondu mais activité probablement réglementée : chercher et proposer tout de suite
    const R = regState(); if (R.status === 'missing' && !S.offer.regulationSearch?.proposal) proposeRegulation($('#regulation-search'));
  });

  $('#next').onclick = () => go('client');
  $('#export-offer').onclick = () => download('fiche-offre.json', JSON.stringify({ version: 2, product: S.product, market: S.market }, null, 2), 'application/json');
  $('#import-offer').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); const product = data.product || data;
      S.product = Object.fromEntries(Object.keys(FIELD_LABELS).map(k => [k, String(product[k] || '')]));
      S.market = restoreMarket(data.market); invalidatePreparation(); persist(); renderers.offer(); toast(t('Fiche importée.')); }
    catch { toast(t('Fichier illisible.')); }
  };
};

/** Version gratuite : au plus N sources par étape ; au-delà, on explique au lieu de couper la réponse IA. */
function roomFor(list, adding = 1) {
  const max = CONFIG.limits?.sourcesPerStep ?? 4;
  if (list.length + adding <= max) return true;
  toast(t('Version gratuite : {max} sources par étape (vous en avez {n}). Retirez-en une, ou choisissez les plus utiles — c’est ce qui garde les réponses complètes.', { max, n: list.length }), 7000);
  return false;
}
async function addFiles(files, list, done) {
  let n = 0;
  for (const f of files) {
    if (!list.some((x) => x.source === f.name) && !roomFor(list)) break;
    try { const src = await extractText(f, (msg) => toast(msg, 20000)); const i = list.findIndex((x) => x.source === src.source); if (i >= 0) list[i] = src; else list.push(src); n++; if (src.ocr) toast(t('{name} : texte reconnu optiquement — relisez-le avant d’analyser.', { name: f.name }), 6000); }
    catch (err) { toast(friendlyError(err), 6000); }
  }
  if (n) toast(t('{n} document(s) lu(s).', { n }));
  done();
}
function renderSourceList(el, list, onChange) {
  if (!el) return;
  el.innerHTML = list.map((s, i) => `<div class="card" style="margin:8px 0;padding:10px 14px"><b>${esc(sourceKind(s.kind))}</b> — ${esc(sourceName(s))}${s.truncated ? ` <small class="muted">${t('(tronqué)')}</small>` : ''}
    <button class="btn ghost small" style="float:right" data-rm="${i}">${t('retirer')}</button><div class="note" style="margin-top:4px">${esc(s.text.slice(0, 200))}…</div></div>`).join('');
  $$('[data-rm]', el).forEach((b) => (b.onclick = () => { list.splice(+b.dataset.rm, 1); onChange(); }));
}

/** Dialogue guidé générique : l'IA pose une question par champ vide ; la réponse remplit le champ. */
/** Indicateur de complétude : X / N remplis, ce qui manque, et un raccourci vers les questions. Se met à jour à la saisie. */
function renderGaps({ el, obj, keys, labels, chatCard, prefix, filled }) {
  if (!el) return;
  const isFilled = filled || ((k) => !!String(obj[k] || '').trim());
  const draw = () => {
    const missing = keys.filter((k) => !isFilled(k));
    // Offre : essentiels vides + champs jugés bloquants par la dernière maturité, même remplis.
    const essential = prefix === 'product' ? essentialGaps(obj, S.offer.blockers, S.offer.reworked) : missing;
    const recheck = prefix === 'product' ? (S.offer.reworked || []).filter((k) => (S.offer.blockers || []).includes(k)) : [];
    const n = keys.length - missing.length;
    el.className = 'gaps ' + (essential.length ? 'warn' : 'ok');
    el.innerHTML = essential.length
      ? `<b>${t('{n} / {total} champs remplis.', { n, total: keys.length })}</b> ${t('Il manque pour vendre :')} ${essential.map((k) => `<span class="gap">${esc(labels[k] || k)}${isFilled(k) ? ' ' + t('(à renforcer)') : ''}</span>`).join(' ')}
         <button class="btn small gaps-go">${t('Compléter par questions')}</button>`
      : `<b>${t('{n} / {total} champs remplis.', { n, total: keys.length })}</b> ${missing.length ? t('L’essentiel y est — reste facultatif : {fields}.', { fields: esc(missing.map((k) => labels[k] || k).join(', ')) }) : t('L’essentiel y est.')}`;
    if (recheck.length) el.innerHTML += ` <span class="note">${t('Répondu depuis la dernière maturité : {fields} — relancez « Analyser la maturité » pour confirmer.', { fields: esc(recheck.map((k) => labels[k] || k).join(', ')) })}</span>`;
    const essentialKeys = prefix === 'product' ? keys.slice(0, OFFER_ESSENTIAL) : keys;
    $$('[data-bind]', $('#main')).forEach((inp) => { const k = inp.dataset.bind.split('.')[1]; if (inp.dataset.bind.startsWith(prefix + '.') && keys.includes(k)) inp.classList.toggle('missing', essentialKeys.includes(k) && !isFilled(k)); });
    $('.gaps-go', el)?.addEventListener('click', () => { const card = $(chatCard); card?.scrollIntoView({ block: 'center', behavior: 'smooth' }); $('.chat-start', card)?.click(); });
  };
  draw();
  $$(`[data-bind^="${prefix}."]`, $('#main')).forEach((inp) => inp.addEventListener('input', draw));
  if (prefix === 'client') $('#contacts')?.addEventListener('input', draw);
}
const CHAT_HINT = { offer: 7, client: 4 }; // pas de limite : au-delà, on signale seulement que l'offre n'est pas mûre
function renderGuidedChat({ el, state, target, build, step, onFilled }) {
  if (!el) return;
  state.skipped ||= [];
  const hintAt = CHAT_HINT[step] || 6;
  const asked = state.chat.filter((m) => m.role === 'ai' && m.field).length;
  const gapCount = step === 'offer' ? essentialGaps(target, state.blockers, state.reworked).length : 0;
  const log = state.chat.map((m) => `<div class="chat-msg ${m.role}"><span>${esc(m.text)}</span></div>`).join('');
  const last = state.chat[state.chat.length - 1];
  const waiting = last && last.role === 'ai' && state.pendingField;
  el.innerHTML = `
    <div class="chat-log">${log || `<div class="note">${t('Aucune question pour l’instant.')}</div>`}</div>
    ${waiting ? `<div class="chat-input"><textarea class="chat-answer" rows="2" placeholder="${t('Votre réponse…')}"></textarea>
      <button class="btn chat-send">${t('Répondre')}</button><button class="btn ghost small chat-skip" title="${t('Je ne sais pas / plus tard')}">${t('Passer')}</button></div>` : ''}
    ${asked >= hintAt && gapCount ? `<div class="card warn" style="margin:8px 0"><b>${t('{asked} questions et il manque encore {n} élément(s) essentiel(s).', { asked, n: gapCount })}</b> ${t('C’est le signe d’une offre pas encore mûre : continuez si les réponses viennent, sinon travaillez-la hors de l’outil (prix, preuves, objections) et revenez — la maturité ne s’atteint pas en répondant vite.')}</div>` : ''}
    <div class="actions" style="margin-bottom:0">
      <button class="btn ghost chat-start">${state.chat.length ? t('Question suivante') : t('Poser la première question')}</button>
      <span class="note">${asked > 1 ? t('{n} questions posées', { n: asked }) : t('{n} question posée', { n: asked })}</span>
      ${state.chat.length ? `<button class="btn ghost small chat-reset">${t('Nouvelle série')}</button>` : ''}
    </div>`;
  const transcript = () => state.chat.map((m) => `${m.role === 'ai' ? t('IA') : t('Vous')} : ${m.text}`).join('\n');
  const finish = (text) => { state.pendingField = ''; state.chat.push({ role: 'ai', text }); };
  const ask = async (btn, lastField, lastAnswer) => busy(btn, async () => {
    const r = await chatJSON(build({ lang: LANG, current: target, transcript: transcript(), lastField, lastAnswer, skipped: state.skipped, asked: state.chat.filter((m) => m.field).map((m) => m.field), blockers: state.blockers || [] }));
    if (lastField && r.field_value) { target[lastField] = r.field_value; onFilled?.(lastField); }
    if (r.done || !r.question) finish(t('La fiche est complète sur l’essentiel.'));
    else { state.pendingField = r.next_field || ''; state.chat.push({ role: 'ai', text: r.question, field: r.next_field }); }
    persist(); markDone();
    if (S.step === step) { renderers[step](); el.closest('.card')?.scrollIntoView({ block: 'center' }); }
  });
  $('.chat-start', el)?.addEventListener('click', (e) => ask(e.target, '', ''));
  $('.chat-reset', el)?.addEventListener('click', () => { state.chat = []; state.pendingField = ''; state.skipped = []; persist(); renderers[step](); });
  $('.chat-send', el)?.addEventListener('click', (e) => {
    const a = $('.chat-answer', el).value.trim(); if (!a) return;
    const f = state.pendingField; state.chat.push({ role: 'user', text: a }); state.pendingField = '';
    ask(e.target, f, a);
  });
  $('.chat-skip', el)?.addEventListener('click', (e) => {
    const f = state.pendingField; if (f && !state.skipped.includes(f)) state.skipped.push(f);
    state.chat.push({ role: 'user', text: t('(passé)') }); state.pendingField = '';
    ask(e.target, '', '');
  });
}

// Réglementation : critère obligatoire de la maturité, en deux questions (réglementée ? documents en main ?).
// On ne cherche que sur « je ne sais pas », sans réponse, ou documents manquants ; sinon une recherche peut confirmer.
const MATURITY_DISCLAIMER = () => `<p class="note disclaimer" data-role="maturity-disclaimer">${t('Avis indicatif, fourni « tel quel » : le niveau de maturité et les informations réglementaires sont produits automatiquement (y compris par l’IA) et peuvent être incomplets, dépassés ou erronés. Faites-les confirmer par l’autorité compétente ou un professionnel, surtout dans un secteur ou un marché réglementé. Aucun engagement ni responsabilité de Guillermo Blanco, adp.avapmo.com ou AVApmo sur ce résultat ni sur son usage.')}</p>`;
const regulationOpts = () => ({ code: getCountry(), geography: geoName(), uiLang: LANG });
// Réponses par pays : une activité réglementée en Colombie ne l'est pas forcément en France.
function regAnswers(code = getCountry()) {
  const all = (S.offer.regulationAnswers && typeof S.offer.regulationAnswers.sector !== 'string') ? S.offer.regulationAnswers : (S.offer.regulationAnswers = {});
  return (all[code] ||= { sector: '', docs: '' });
}
const regSearched = () => Boolean(S.offer.regulationSearch?.results?.length) && S.offer.regulationSearch.country === getCountry();
const regState = () => regulationStatus(S.product, { aiRegulated: S.offer.maturityRaw?.regulation?.regulated === true, searched: regSearched(), answers: regAnswers() });
function withRegulation(raw) {
  const country = marketLabel();
  return applyRegulation({ ...raw }, S.product, { searched: regSearched(), answers: regAnswers(), gaps: {
    missing: { why: t('Activité probablement réglementée : vendre sans connaître la règle expose à une interdiction ou une sanction, et le client posera la question.'), fix: t('Répondez aux questions « Réglementation » ou lancez la recherche ({country}).', { country }) },
    searched: { why: t('Recherche faite, mais vous n’avez pas encore dit si l’activité est réglementée.'), fix: t('Lisez la proposition et répondez aux questions « Réglementation ».') },
    not_ready: { why: t('Activité réglementée sans les documents exigés : impossible de vendre en règle pour l’instant.'), fix: t('Obtenez les documents ou certifications exigés ({country}) avant de vendre.', { country }) },
  } });
}
function radios(name, value, options) {
  return `<div class="reg-q" role="radiogroup">${options.map(([v, label]) => `<label class="reg-opt"><input type="radio" name="${name}" value="${v}"${value === v ? ' checked' : ''}> ${label}</label>`).join(' ')}</div>`;
}
function regulationBlock() {
  const R = regState(), A = regAnswers(), RS = S.offer.regulationSearch?.country === getCountry() ? S.offer.regulationSearch : null;
  const country = esc(marketLabel());
  const head = {
    none: t('Rien n’indique une activité réglementée ; répondez quand même.'),
    missing: t('Activité probablement réglementée : maturité limitée à 3 / 5 tant que vous n’avez pas répondu.'),
    searched: t('Recherche faite : maturité limitée à 4 / 5 tant que vous n’avez pas répondu.'),
    declared_no: R.detected ? t('Déclarée non réglementée. La fiche ou l’IA suggèrent le contraire : vérifiez.') : t('Déclarée non réglementée.'),
    not_ready: t('Sans les documents exigés, la maturité reste à 3 / 5 au plus.'),
    ready: t('Documents déclarés : pas de limite. Une recherche peut le confirmer.'),
  }[R.status];
  const ai = S.offer.maturityRaw?.regulation; const aiText = ai ? [ai.domain, ai.requirements, ai.authority].filter((x) => String(x || '').trim()).map(esc).join(' — ') : '';
  const links = regulationLinks(S.product, regulationOpts()).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(' · ');
  const P = RS?.proposal;
  const proposal = P ? `<div class="reg-proposal"><b>${RS.results?.length ? t('Proposition (d’après la recherche, à vérifier) :') : t('Proposition de l’IA, sans recherche web (à vérifier) :')}</b> ${esc(P.summary)}
      ${P.requirements.length ? `<ul class="plain">${P.requirements.map((r) => `<li>${esc(r.item)}${r.authority ? ` — ${esc(r.authority)}` : ''}${r.source ? ` · <a href="${esc(r.source)}" target="_blank" rel="noopener">${t('source')}</a>` : ''}</li>`).join('')}</ul>` : ''}
      ${P.field_value ? `<button class="btn ghost small" id="regulation-use">${t('Utiliser dans la fiche')}</button>` : ''}</div>` : '';
  const results = RS?.results?.length ? `<details><summary>${t('{n} résultat(s) de recherche', { n: RS.results.length })}</summary><ul class="plain">${RS.results.map((x) => `<li><a href="${esc(x.source)}" target="_blank" rel="noopener">${esc(x.title || x.source)}</a></li>`).join('')}</ul></details>` : '';
  return `<div class="card ${R.cap ? 'warn' : 'soft'}" id="regulation-card" data-status="${esc(R.status)}">
    <b>${t('Réglementation ({country})', { country })}</b> ${head}
    <p style="margin:8px 0 2px">${t('Savez-vous si votre produit ou service relève d’un secteur ou d’un marché réglementé ?')}</p>
    ${radios('reg-sector', A.sector, [['yes', t('Oui')], ['no', t('Non')], ['unknown', t('Je ne sais pas')]])}
    ${A.sector === 'yes' ? `<p style="margin:8px 0 2px">${t('Avez-vous déjà les documents ou certifications que ce secteur exige ?')}</p>
    ${radios('reg-docs', A.docs, [['yes', t('Oui, je les ai')], ['no', t('Non')], ['unsure', t('Pas sûr')]])}` : ''}
    ${aiText ? `<div class="note">${t('Avis de l’IA, à vérifier :')} ${aiText}</div>` : ''}
    ${R.search ? `<div class="actions" style="margin:8px 0 0"><button class="btn ghost small" id="regulation-search">${R.search === 'confirm' ? t('Confirmer par une recherche') : t('Chercher et proposer')}</button></div>` : ''}
    ${proposal}${results}
    <div class="note">${t('Sources officielles :')} ${links}</div>
    ${MATURITY_DISCLAIMER()}
  </div>`;
}
async function proposeRegulation(btn) {
  const run = async () => {
    const query = regulationQuery(S.product, regulationOpts()); const jinaKey = loadSettings().jinaKey || '';
    let results = [];
    if (jinaKey) { try { results = await searchWeb(query, { jinaKey }); } catch (err) { toast(err.message, 6000); } }
    const sources = results.map((x) => `URL: ${x.source}\n${String(x.text || '').slice(0, 1500)}`).join('\n\n');
    const r = await chatJSON(regulationProposalMessages({ lang: LANG, product: S.product, country: geoName() || marketLabel(), sources, answers: regAnswers() }));
    S.offer.regulationSearch = { query, country: getCountry(), at: new Date().toISOString(), results: results.map((x) => ({ source: x.source, title: x.title || '' })), proposal: sanitizeProposal(r, results) };
    rerateRegulation();
  };
  return btn ? busy(btn, run) : run().catch((err) => toast(err.message, 6000));
}
function rerateRegulation(scroll = true) {
  if (S.offer.maturityRaw) { S.offer.maturity = withRegulation(S.offer.maturityRaw); S.offer.blockers = blockersFrom(S.offer.maturity); }
  persist(); if (S.step !== 'offer') return;
  renderers.offer(); if (scroll) $('#regulation-card')?.scrollIntoView({ block: 'center' });
}
function renderRegulation() {
  const el = $('#regulation-out'); if (!el) return;
  el.innerHTML = regulationBlock();
  const A = regAnswers();
  $$('input[name="reg-sector"]', el).forEach((r) => { r.onchange = () => {
    A.sector = r.value; if (r.value !== 'yes') A.docs = '';
    rerateRegulation(); if (r.value === 'unknown') proposeRegulation($('#regulation-search'));
  }; });
  $$('input[name="reg-docs"]', el).forEach((r) => { r.onchange = () => {
    A.docs = r.value; rerateRegulation(); if (r.value === 'no') proposeRegulation($('#regulation-search'));
  }; });
  const search = $('#regulation-search', el); if (search) search.onclick = (e) => proposeRegulation(e.target);
  const use = $('#regulation-use', el);
  if (use) use.onclick = () => { S.product.regulation = S.offer.regulationSearch.proposal.field_value; S.offer.reworked = [...new Set([...(S.offer.reworked || []), 'regulation'])]; rerateRegulation(); toast(t('Champ « Réglementation » rempli : vérifiez-le.')); };
}

function renderMaturity() {
  const el = $('#offer-maturity-out'); if (!el) return;
  const M = S.offer.maturity; if (!M) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="maturity">
      <div class="gauge">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= M.score ? 'on' : ''}"></span>`).join('')}</div>
      <div><b>${M.score} / 5 — ${esc(MATURITY[M.score] || M.label)}</b> <span class="verdict v${M.score}">${esc(t(M.verdict || VERDICT[M.score]))}</span><div class="note">${esc(M.summary)}</div></div>
    </div>
    <div class="grid" style="margin-top:12px">
      <div><h3>${t('Points forts')}</h3><ul class="plain">${(M.strengths || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div><h3>${t('Ce qui bloque la vente')}</h3><ul class="plain">${(M.gaps || []).map((g) => `<li><b>${esc(labelField(g.field, FIELD_LABELS))}</b> — ${esc(g.why)} <i>→ ${esc(g.fix)}</i></li>`).join('')}</ul></div>
    </div>
    <div class="card soft" style="margin-bottom:0"><b>${t('À faire avant le prochain rendez-vous :')}</b> ${esc(M.next_step)}</div>
    ${MATURITY_DISCLAIMER()}`;
}

// ----------------------------------------------------------------------------- 2. CLIENT
const CLIENT_LABELS = clientLabels();
const DEBRIEF_LABELS = debriefLabels();

renderers.client = () => {
  const C = S.clientChat;
  $('#main').innerHTML = `
    <h1>${t('2 · Se renseigner sur le client')}</h1>
    <p class="lead">${t('Qui je vais voir, dans quel cadre, quel est son problème, pourquoi sa décision compte. Décrivez librement ; l’IA remplit la fiche, pose les questions qui manquent, lit les sources et prépare la fiche client.')}</p>

    <div class="card">
      <h2>${t('Décrire')}</h2>
      ${field('clientChat.description', t('Texte libre'), { hint: t('l’interlocuteur, l’établissement, le rendez-vous (mail, visio, sur place, salon…), ce que vous savez déjà'), type: 'textarea', full: true, placeholder: t('Ex. : Rendez-vous jeudi sur place avec la directrice d’un collège privé du 15e, 30 min. Elle veut un projet innovant pour la 3e mais le budget est serré…') })}
      <div class="actions">
        <label class="btn ghost" style="margin:0">${t('Joindre un mail / document')} <input type="file" id="client-files" accept="${ACCEPT}" multiple hidden></label>
        <button class="btn" id="client-extract">${t('Analyser et remplir la fiche client avec l’IA')}</button><span class="note" id="client-notes"></span></div>
    </div>

    <h2>${t('Fiche client')}</h2>
    <div id="client-gaps" class="gaps"></div>
    <div class="grid">
      ${field('client.company', t('Entreprise / établissement'))}
      ${field('client.sector', t('Secteur / activité'))}
      ${field('client.location', t('Commune / pays'), { placeholder: cityExample(), attrs: 'data-city-example' })}
      <div><label>${t('Je prépare')}</label><select data-bind="client.preparationMode"><option value="meeting">${t('Un rendez-vous')}</option><option value="email">${t('Un email (premier destinataire ci-dessous)')}</option></select></div>
      <div class="full"><label>${t('Interlocuteurs / destinataires')} <small>— ${t('jusqu’à {max} ; au-delà, un rendez-vous se prépare autrement (une personne relais, puis un second rendez-vous)', { max: MAX_CONTACTS })}</small></label>
        <div id="contacts"></div></div>
      ${field('client.meetingFormat', t('Format du rendez-vous'), { hint: t('mail, visio, sur place, salon ; date, durée'), full: true })}
      ${field('client.website', t('Site web'), { placeholder: t('exemple.fr') })}
      ${field('client.linkedinUrl', t('Autre URL utile'), { hint: t('page équipe, article, annonce…') })}
      ${field('client.notes', t('Notes collées'), { hint: t('profil LinkedIn, mail reçu, ce que vous savez déjà'), type: 'textarea', full: true })}
      ${field('client.decisionProcess', t('Processus de décision connu'), { hint: t('qui d’autre, quand, budget'), full: true })}
    </div>

    <div class="card">
      <h2>${t('Compléter par questions')}</h2>
      <p class="note">${t('L’IA pose une question à la fois sur ce qui manque ; votre réponse remplit le champ correspondant.')}</p>
      <div id="client-chat"></div>
    </div>

    <div id="client-research"></div>
    <h2>${t('Sources et fiche client')}</h2>
    <p class="note">${t('Seules les sources cochées sont utilisées. Vérifiez leur pertinence pour ce client et chaque interlocuteur.')}</p>
    <div class="actions">
      <button class="btn ghost" id="fetch">${t('Lire les pages')}</button>
      <span class="note" id="src-count">${t('{n} source(s) collectée(s)', { n: S.sources.length })}</span>
    </div>
    <div id="sources"></div>
    <div class="actions"><button class="btn" id="brief">${t('Générer la fiche client')}</button></div>
    <div id="brief-out"></div>`;
  bindInputs($('#main'), S.client, 'client');
  bindInputs($('#main'), C, 'clientChat');
  renderContacts();
  renderGaps({ el: $('#client-gaps'), obj: S.client, keys: ['company', 'sector', 'contacts', 'meetingFormat', 'decisionProcess'], labels: CLIENT_LABELS, chatCard: '#client-chat', prefix: 'client', filled: (k) => k === 'contacts' ? contacts().length > 0 : !!String(S.client[k] || '').trim() });
  renderGuidedChat({ el: $('#client-chat'), state: C, target: S.client, build: clientQuestionMessages, step: 'client', onFilled: (key) => { if (key === 'company') invalidateClientResearch(); else invalidatePreparation(); } });
  renderSources();
  renderBrief();
  mountResearch();
  $('#client-files').onchange = (e) => addFiles(e.target.files, S.sources, () => { invalidatePreparation(); persist(); renderSources(); });

  $('#client-extract').onclick = (e) => busy(e.target, async () => {
    if (!C.description.trim()) return toast(t('Décrivez d’abord l’interlocuteur et le rendez-vous.'));
    const docs = activeSources(S.sources).filter((x) => x.kind === 'document').map((x) => `--- ${x.source}\n${x.text}`).join('\n\n');
    const previousCompany = S.client.company;
    const r = await chatJSON(clientExtractMessages({ lang: LANG, description: [C.description, docs].filter(Boolean).join('\n\nDOCUMENTS JOINTS :\n'), current: S.client }));
    const f = r.fields || {}; let filled = 0;
    for (const k of Object.keys(CLIENT_LABELS)) { if (k === 'contacts') continue; const v = String(f[k] || '').trim(); if (v && !String(S.client[k] || '').trim()) { S.client[k] = v; filled++; } }
    // interlocuteurs : on complète les lignes vides, on n'écrase jamais une saisie
    const found = (Array.isArray(f.contacts) ? f.contacts : []).filter((c) => c && (c.name || c.role)).slice(0, MAX_CONTACTS);
    for (const c of found) {
      const dup = S.client.contacts.find((x) => x.name && c.name && x.name.toLowerCase() === c.name.toLowerCase());
      if (dup) { if (!dup.role && c.role) dup.role = c.role; continue; }
      const empty = S.client.contacts.find((x) => !x.name && !x.role);
      const rec = { name: c.name || '', role: c.role || '', weight: WEIGHTS[c.weight] ? c.weight : 'influence' };
      if (empty) Object.assign(empty, rec); else if (S.client.contacts.length < MAX_CONTACTS) S.client.contacts.push(rec); else continue;
      filled++;
    }
    syncPeople();
    if (previousCompany !== S.client.company) invalidateClientResearch(); else invalidatePreparation();
    persist(); markDone(); if (S.step !== 'client') return;
    renderers.client();
    $('#client-notes').textContent = (r.missing || []).length ? t('Manque : {fields} → « Compléter par questions ».', { fields: labelFields(r.missing, CLIENT_LABELS) }) : '';
    toast(t('{n} champ(s) rempli(s).', { n: filled }));
  });
  $('#fetch').onclick = (e) => busy(e.target, async () => {
    const urls = [S.client.website, S.client.linkedinUrl].filter(Boolean);
    if (!urls.length) return toast(t('Indiquez au moins une URL.'));
    const state = S, fingerprint = clientFingerprint(S);
    const jinaKey = loadSettings().jinaKey || '';
    for (const u of urls) {
      try {
        const src = await readUrl(u, { jinaKey });
        if (S !== state || clientFingerprint(S) !== fingerprint) return;
        if (!S.sources.some((x) => x.source === src.source) && !roomFor(S.sources)) break;
        src.included = false; S.sources = upsertSources(S.sources, [src]);
      } catch (err) { toast(friendlyError(err), 5000); }
    }
    if (S !== state || clientFingerprint(S) !== fingerprint) return;
    invalidatePreparation(); persist(); renderSources();
  });
  $('#brief').onclick = (e) => busy(e.target, async () => {
    if (!S.client.company && !primary().name) return toast(t('Indiquez au moins l’entreprise.'));
    const all = [...S.sources];
    if (S.client.notes) all.push(notesSource(S.client.notes));
    const state = S, history = historyFor();
    const snapshot = () => JSON.stringify([S.client, S.product, S.sources, S.market]);
    const fingerprint = snapshot();
    const market = S.market.comparison ? { ...S.market.comparison, sources: activeSources(S.market.sources).map(s => ({ id: sourceId(s), url: s.source, date: s.publishedAt || '', retrievedAt: s.retrievedAt })) } : null;
    const result = await chatJSON(clientBriefMessages({ lang: LANG, product: S.product, client: clientView(), sources: mergeSources(all), history, market }));
    if (S !== state || snapshot() !== fingerprint) return;
    S.brief = groundBrief(result, all, !!history); persist(); markDone(); if (S.step !== 'client') return;
    renderBrief();
  });
};
/** Mémoire : les RDV proches, sur l'entreprise, le secteur, l'offre et tous les interlocuteurs. */
function historyFor() {
  const cs = contacts();
  return retrieve({ company: S.client.company, sector: S.client.sector, product: S.product.name, contactRole: primary().role, contactName: primary().name, otherContacts: cs.slice(1).map((c) => `${c.name} ${c.role}`).join(' ') });
}
/** Un persona par interlocuteur, dans le même ordre. */
function syncPeople() {
  const n = Math.max(1, S.client.contacts.length);
  while (S.persona.people.length < n) S.persona.people.push(blankPerson());
  S.persona.people.length = n;
  if (S.persona.current >= n) S.persona.current = 0;
}
function renderContacts() {
  const el = $('#contacts'); if (!el) return;
  const list = S.client.contacts;
  el.innerHTML = list.map((c, i) => `
    <div class="contact-row" data-i="${i}">
      <span class="contact-n">${i + 1}</span>
      <input data-ck="name" placeholder="${i === 0 ? t('Nom, ou fonction si inconnu') : t('Nom ou fonction')}" value="${esc(c.name)}">
      <input data-ck="role" placeholder="${t('Fonction / rôle dans la décision')}" value="${esc(c.role)}">
      <select data-ck="weight">${Object.entries(WEIGHTS).map(([k, v]) => `<option value="${k}" ${c.weight === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      ${list.length > 1 ? `<button class="btn ghost small" data-rm-contact="${i}" title="${t('Retirer')}">×</button>` : '<span></span>'}
    </div>`).join('') +
    (list.length < MAX_CONTACTS ? `<button class="btn ghost small" id="add-contact">${t('+ Ajouter une personne ({n}/{max})', { n: list.length, max: MAX_CONTACTS })}</button>` : `<span class="note">${t('{max} personnes : c’est le maximum pour un rendez-vous préparé finement.', { max: MAX_CONTACTS })}</span>`);
  $$('.contact-row', el).forEach((row) => {
    const c = list[+row.dataset.i];
    $$('[data-ck]', row).forEach((inp) => inp.addEventListener('input', () => {
      c[inp.dataset.ck] = inp.value;
      invalidateContactResearch();
      mountResearch(); renderSources(); persist();
    }));
  });
  $$('[data-rm-contact]', el).forEach((b) => (b.onclick = () => {
    list.splice(+b.dataset.rmContact, 1);
    S.persona.people.splice(+b.dataset.rmContact, 1);
    syncPeople(); invalidateContactResearch(); persist();
    renderContacts(); mountResearch(); renderSources();
  }));
  const add = $('#add-contact');
  if (add) add.onclick = () => {
    list.push(blankContact());
    syncPeople(); invalidateContactResearch(); persist();
    renderContacts(); mountResearch(); renderSources();
    $$('.contact-row', el).pop()?.querySelector('input')?.focus();
  };
}
function renderSources() {
  const el = $('#sources'); if (!el) return;
  $('#src-count').textContent = t('{n} / {total} source(s) incluse(s)', { n: activeSources(S.sources).length, total: S.sources.length });
  renderEvidence(el, S.sources, () => { invalidatePreparation(); persist(); renderSources(); });
}
function renderBrief() {
  const el = $('#brief-out'); if (!el) return;
  const b = S.brief; if (!b) { el.innerHTML = ''; return; }
  const evidence = [...S.sources, notesSource(S.client.notes || ''), { id: 'client', source: t('Saisie utilisateur'), kind: 'notes', text: t('Client') }, { id: 'history', source: t('Historique local (à reconfirmer)'), kind: 'history', text: t('Historique') }];
  const li = (arr) => (Array.isArray(arr) ? arr : []).map(x => `<li>${typeof x === 'string' ? esc(x) : `${esc(x.fact)} ${x.date ? esc(x.date) : ''} — ${citations(x.source_ids, evidence)}`}</li>`).join('');
  el.innerHTML = `
    <div class="card">
      <h2>${t('Fiche client')}</h2>
      <p><b>${t('Entreprise.')}</b> ${esc(b.company_summary)}</p>
      <p><b>${contacts().length > 1 ? t('Interlocuteurs.') : t('Interlocuteur·rice.')}</b> ${esc(b.contact_summary)}</p>
      <p><b>${t('Enjeu.')}</b> ${esc(b.stakes)}</p>
      <h3>${t('Problèmes possibles à vérifier')}</h3><ul class="plain">${li(b.likely_problems)}</ul>
      <div class="grid"><div><h3>${t('Faits (sourcés)')}</h3><ul class="plain">${li(b.facts)}</ul></div>
      <div><h3>${t('Hypothèses à vérifier')}</h3><ul class="plain">${li(b.assumptions)}</ul></div></div>
      ${(b.participants || []).map(p => `<div class="card soft"><h3>${esc(p.name)}</h3><p>${esc(p.documented_role)} — ${esc(p.identity_check)}</p><p>${t('À explorer :')} ${esc(p.hypothesis)}</p><p><b>${t('Question :')}</b> ${esc(p.question)}</p><p class="note">${citations(p.source_ids, evidence)}</p></div>`).join('')}
      ${(b.signals || []).map(s => `<p><b>${esc(s.fact)}</b><br>${esc(s.relevance)}<br>${t('Question :')} ${esc(s.question)}<br>${citations(s.source_ids, evidence)}</p>`).join('')}
      ${(b.competitive_context || []).length ? `<h3>${t('Comparaisons à préparer')}</h3><ul>${li(b.competitive_context)}</ul>` : ''}
      ${b.preparation ? `<h3>${S.client.preparationMode === 'email' ? t('Email de prise de contact') : t('Ouverture du rendez-vous')}</h3><p>${esc(b.preparation.opening)}</p>${S.client.preparationMode === 'email' ? `<label>${t('Objet')}<input id="prep-email-subject" value="${esc(b.preparation.email_subject)}"></label><label>${t('Email à relire')}<textarea id="prep-email-body">${esc(b.preparation.email_body)}</textarea></label><button class="btn ghost small" id="copy-prep-email">${t('Copier l’email')}</button><span class="actions" id="prep-email-links" style="display:inline-flex;margin:0 0 0 6px">${composeLinks({ subject: b.preparation.email_subject, body: b.preparation.email_body })}</span>` : ''}` : ''}
      <h3>${t('Questions de découverte')}</h3><ol class="steps-list">${li(b.questions_to_ask)}</ol>
    </div>
    <div class="actions"><button class="btn" id="to-persona">${t('Passer à l’étape Persona')}</button></div>`;
  $('#to-persona').onclick = () => go('persona');
  const refreshPrepLinks = () => { const el = $('#prep-email-links'); if (el) el.innerHTML = composeLinks({ subject: b.preparation.email_subject, body: b.preparation.email_body }); };
  $('#prep-email-subject')?.addEventListener('input', e => { b.preparation.email_subject = e.target.value; persist(); refreshPrepLinks(); });
  $('#prep-email-body')?.addEventListener('input', e => { b.preparation.email_body = e.target.value; persist(); refreshPrepLinks(); });
  $('#copy-prep-email')?.addEventListener('click', e => busy(e.currentTarget, async () => { await navigator.clipboard.writeText(`${b.preparation.email_subject}\n\n${b.preparation.email_body}`); toast(t('Email copié.')); }));
}

// ----------------------------------------------------------------------------- 3. PERSONA SONCAS
const person = () => S.persona.people[S.persona.current] || S.persona.people[0];
renderers.persona = () => {
  const P = S.persona; syncPeople(); const cs = S.client.contacts; const multi = cs.length > 1;
  $('#main').innerHTML = `
    <h1>${t('3 · Persona SONCAS et message principal')}</h1>
    <p class="lead">${multi ? t('Les motivations d’achat à explorer, notées de 1 à 3, pour chacune des personnes présentes.') : t('Les motivations d’achat à explorer, notées de 1 à 3.')} ${t('L’IA propose d’après la fiche client ; vous corrigez.')} ${multi ? t('Un seul message principal pour le rendez-vous, calé sur la personne qui décide.') : t('Le message principal se construit sur les 3 motivations les plus fortes.')}</p>
    ${verdictBanner()}
    <div class="actions">
      <button class="btn" id="ai">${t('Proposer avec l’IA')}</button>
      ${person().aiScores ? `<span class="note">${t('Proposition IA reçue — ajustez les scores si besoin.')}</span>` : `<span class="note">${t('Sans IA : notez à la main, puis rédigez le message.')}</span>`}
    </div>
    ${multi ? `<div class="tabs" id="people-tabs">${cs.map((c, i) => `<button class="${i === P.current ? 'on' : ''}" data-p="${i}"><span>${esc(contactLabel(c, i))} <small>(${WEIGHTS[c.weight] || ''})</small></span>${c.role ? `<em>${esc(c.role)}</em>` : ''}</button>`).join('')}</div>` : ''}
    <div class="persona-grid">
      <div class="card radar-card" id="radar"></div>
      <div class="soncas" id="soncas"></div>
    </div>
    ${(P.tensions || []).length ? `<div class="card warn" style="margin-top:16px"><h3>${t('Tensions entre interlocuteurs')}</h3><ul class="plain">${P.tensions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <div class="card soft" style="margin-top:16px">
      <h3>${t('Message principal')}${multi ? ` <span class="muted">${t('(pour {name}, qui décide)', { name: esc(contactLabel(cs.find((c) => c.weight === 'decide') || cs[0], 0)) })}</span>` : ''} <span class="muted">(${t('top 3 :')} <span id="top3"></span>)</span></h3>
      <textarea data-bind="persona.main_message" class="main-message" placeholder="${multi ? t('1 à 2 phrases, bâties sur les 3 motivations les plus fortes de la personne qui décide, sans contredire les autres') : t('1 à 2 phrases, bâties sur les 3 motivations les plus fortes')}"></textarea>
    </div>
    ${(P.gaps || []).length ? `<div class="card"><h3>${t('Ce qui manque à la fiche offre pour ce client')}</h3><ul class="plain">${P.gaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul><p class="note">${t('Complétez l’offre (étape 1) puis relancez : rien de ceci ne sera inventé.')}</p></div>` : ''}
    <div class="actions"><button class="btn" id="next">${t('Passer à l’étape SIMAC')}</button></div>`;
  bindInputs($('#main'), P, 'persona');
  renderSoncas();
  $$('#people-tabs button').forEach((b) => (b.onclick = () => { P.current = +b.dataset.p; persist(); renderers.persona(); }));
  $('#ai').onclick = (e) => busy(e.target, async () => {
    if (!S.brief) return toast(t('Générez d’abord la fiche client (étape 2).'));
    const r = await chatJSON(soncasMessages({ lang: LANG, product: S.product, client: clientView(), brief: S.brief, history: historyFor() }));
    const people = Array.isArray(r.people) ? r.people : [{ scores: r.scores, rationale: r.rationale, arguments: r.arguments }];
    S.client.contacts.forEach((c, i) => {
      const src = people[i] || people[0] || {};
      const ai = capThrees(clampScores(src.scores));
      P.people[i] = { scores: { ...ai }, aiScores: ai, rationale: src.rationale || {}, arguments: src.arguments || {} };
    });
    P.main_message = r.main_message || ''; P.tensions = r.tensions || []; P.gaps = r.gaps || [];
    persist(); markDone(); if (S.step === 'persona') renderers.persona();
  });
  $('#next').onclick = () => go('simac');
};
/** Toile SONCAS-E : 7 axes, scores 1-3 ; tracé utilisateur par-dessus la proposition IA. */
function soncasRadar(scores, aiScores) {
  const R = 88, cx = 150, cy = 118, n = SONCAS.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; const r = (R * v) / 3; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const ring = (v) => SONCAS.map((_, i) => pt(i, v).join(',')).join(' ');
  const poly = (sc) => SONCAS.map((d, i) => pt(i, sc[d.code] || 0).join(',')).join(' ');
  const labels = SONCAS.map((d, i) => { const [x, y] = pt(i, 3.55); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${label(d.code)}</text>`; }).join('');
  return `<svg class="radar" viewBox="0 0 300 236" role="img" aria-label="${t('Profil SONCAS')}">
    ${[1, 2, 3].map((v) => `<polygon points="${ring(v)}" class="ring"/>`).join('')}
    ${SONCAS.map((_, i) => { const [x, y] = pt(i, 3); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="axis"/>`; }).join('')}
    ${aiScores ? `<polygon points="${poly(aiScores)}" class="ai"/>` : ''}
    <polygon points="${poly(scores)}" class="me"/>
    ${SONCAS.map((d, i) => { const [x, y] = pt(i, scores[d.code] || 0); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" class="dot"/>`; }).join('')}
    ${labels}
  </svg>
  <div class="note radar-legend"><span class="sw me"></span> ${t('vous')} ${aiScores ? `<span class="sw ai"></span> ${t('proposition IA')}` : ''}</div>`;
}

/** Au plus trois dimensions à 3 : au-delà, les dernières dans l'ordre S-O-N-C-A-S-E repassent à 2. */
function capThrees(scores) {
  const out = { ...scores }; let n = 0;
  for (const d of SONCAS) if (out[d.code] === 3) { n++; if (n > 3) out[d.code] = 2; }
  return out;
}
function renderSoncas() {
  const P = person(); const t3 = top3(P.scores);
  $('#top3').textContent = t3.map(label).join(', ');
  if ($('#radar')) $('#radar').innerHTML = soncasRadar(P.scores, P.aiScores);
  $('#soncas').innerHTML = SONCAS.map((d) => `
    <div class="dim ${t3.includes(d.code) ? 'top' : ''}">
      <div><b>${label(d.code)}</b><div class="hint">${d.hint}</div></div>
      <div class="score" data-code="${d.code}">${[1, 2, 3].map((v) => `<button class="${P.scores[d.code] === v ? 'on' : ''}" data-v="${v}">${v}</button>`).join('')}
        ${P.aiScores && P.aiScores[d.code] !== P.scores[d.code] ? `<small class="muted" style="align-self:center">${t('IA : {n}', { n: P.aiScores[d.code] })}</small>` : ''}</div>
      <div>${P.rationale?.[d.code] ? `<div class="note">${esc(P.rationale[d.code])}</div>` : ''}
        ${(P.arguments?.[d.code] || []).length ? `<ul class="args">${P.arguments[d.code].map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</div>
    </div>`).join('');
  $$('.score button').forEach((b) => (b.onclick = () => {
    const code = b.closest('.score').dataset.code; const v = +b.dataset.v;
    if (v === 3) {
      const threes = SONCAS.map((d) => d.code).filter((c) => c !== code && P.scores[c] === 3);
      if (threes.length >= 3) { const demoted = threes[threes.length - 1]; P.scores[demoted] = 2; toast(t('Trois motivations fortes maximum : « {name} » repasse à 2.', { name: label(demoted) })); }
    }
    P.scores[code] = v; persist(); renderSoncas();
  }));
}

// ----------------------------------------------------------------------------- 4. SIMAC
renderers.simac = () => {
  $('#main').innerHTML = `
    <h1>${t('4 · Déroulé SIMAC')}</h1>
    <p class="lead">${t('Situation → Idée → Mécanisme (prix à la fin) → Avantages (chacun reformule un besoin) → Conclusion (une question, deux options, l’étape suivante). Tout est modifiable : c’est votre script.')}</p>
    ${verdictBanner()}
    <div class="grid">
      ${field('objective.primary', t('Objectif du rendez-vous'), { placeholder: t('Ex. : accord pour un essai sur 3 RDV') })}
      ${field('objective.fallback', t('Objectif de repli'), { placeholder: t('Ex. : RDV avec le décideur daté') })}
    </div>
    <div class="actions"><button class="btn" id="ai">${t('Rédiger le SIMAC avec l’IA')}</button></div>
    <div id="simac-out"></div>`;
  bindInputs($('#main'), S.objective, 'objective');
  renderSimac();
  $('#ai').onclick = (e) => busy(e.target, async () => {
    if (!S.brief) return toast(t('Générez d’abord la fiche client (étape 2).'));
    syncPeople();
    const people = S.client.contacts.map((c, i) => { const P = S.persona.people[i]; const t3 = top3(P.scores);
      return { name: contactLabel(c, i), role: c.role, weight: c.weight, scores: P.scores, top3: t3.map(label), arguments: Object.fromEntries(t3.map((k) => [label(k), (P.arguments?.[k] || []).slice(0, 2)])) }; });
    const persona = { people, main_message: S.persona.main_message, tensions: S.persona.tensions || [] };
    const simac = await chatJSON(simacMessages({ lang: LANG, product: S.product, client: clientView(), brief: S.brief, persona, objective: S.objective, market: S.market.comparison ? { comparison: S.market.comparison, sources: mergeSources(S.market.sources) } : null }));
    S.simac = simac; persist(); markDone(); if (S.step === 'simac') renderSimac();
  });
};
function renderSimac() {
  const el = $('#simac-out'); const M = S.simac;
  if (!M) { el.innerHTML = `<p class="note">${t('Aucun déroulé pour l’instant. Sans IA, vous pouvez créer un canevas vide.')}</p><button class="btn ghost small" id="blank-simac">${t('Canevas vide')}</button>`;
    $('#blank-simac').onclick = () => { S.simac = { opening: '', situation: '', idea: '', mechanism: ['', '', ''], advantages: ['', '', ''], conclusion: '', objections: [], mistakes_watch: [] }; persist(); renderSimac(); }; return; }
  const ta = (k, v, rows = 2) => `<textarea data-k="${k}" rows="${rows}">${esc(v)}</textarea>`;
  const list = (k, arr) => `<textarea data-k="${k}" data-list rows="${Math.max(3, (arr || []).length + 1)}">${esc((arr || []).join('\n'))}</textarea><div class="note">${t('Une ligne par élément.')}</div>`;
  el.innerHTML = `
    <div class="card">
      <div class="simac-block"><div class="k">${t('Ouverture (20 premières secondes)')}</div>${ta('opening', M.opening)}</div>
      <div class="simac-block"><div class="k">${t('Situation')}</div>${ta('situation', M.situation)}</div>
      <div class="simac-block"><div class="k">${t('Idée')}</div>${ta('idea', M.idea)}</div>
      <div class="simac-block"><div class="k">${t('Mécanisme — prix en dernier')}</div>${list('mechanism', M.mechanism)}</div>
      <div class="simac-block"><div class="k">${contacts().length > 1 ? t('Avantages — chacun reformule un besoin, avec un « Pour X : … » par interlocuteur') : t('Avantages — chacun reformule un besoin')}</div>${list('advantages', M.advantages)}</div>
      <div class="simac-block"><div class="k">${t('Conclusion — question, deux options, étape suivante')}</div>${ta('conclusion', M.conclusion)}</div>
    </div>
    <div class="card">
      <h2>${t('Objections probables')}</h2>
      <table><thead><tr>${contacts().length > 1 ? `<th style="width:14%">${t('Qui')}</th>` : ''}<th style="width:33%">${t('Objection')}</th><th>${t('Accueillir → creuser → répondre → relancer')}</th></tr></thead>
      <tbody>${(M.objections || []).map((o) => `<tr>${contacts().length > 1 ? `<td><small>${esc(o.who || '')}</small></td>` : ''}<td>${esc(o.objection)}</td><td>${esc(o.response)}</td></tr>`).join('') || `<tr><td colspan="${contacts().length > 1 ? 3 : 2}" class="note">—</td></tr>`}</tbody></table>
      ${(M.mistakes_watch || []).length ? `<h3>${t('Erreurs à surveiller dans ce RDV')}</h3><ul class="plain">${M.mistakes_watch.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    </div>
    ${(M.gaps || []).length ? `<div class="card"><h3>${t('Ce que la fiche offre ne permet pas de dire')}</h3><ul class="plain">${M.gaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul><p class="note">${t('Rien n’a été inventé pour combler ces points : complétez l’offre (étape 1) et relancez.')}</p></div>` : ''}
    <div class="card">${t('Avant d’entrer, connaissez votre plancher et listez les leviers qui ne sont pas des remises. Ne repartez jamais sans <b>une date</b> et <b>le nom du décideur</b>.')}</div>
    <div class="actions">
      <button class="btn ghost" id="print">${t('Imprimer / PDF')}</button>
      <button class="btn ghost" id="copy">${t('Copier le script')}</button>
      <button class="btn" id="next">${t('Passer au suivi du rendez-vous')}</button>
    </div>`;
  $$('textarea[data-k]', el).forEach((area) => area.addEventListener('input', () => {
    M[area.dataset.k] = area.hasAttribute('data-list') ? area.value.split('\n').map((x) => x.trim()).filter(Boolean) : area.value; persist();
  }));
  $('#print').onclick = () => window.print();
  $('#copy').onclick = () => navigator.clipboard.writeText(simacText()).then(() => toast(t('Script copié.')));
  $('#next').onclick = () => go('followup');
}
function simacText() {
  const M = S.simac || {};
  return [`${t('RDV')} ${S.client.company} — ${contacts().map((c, i) => `${contactLabel(c, i)} (${c.role || WEIGHTS[c.weight] || ''})`).join(', ')} — ${S.date}`, t('Objectif : {primary} (repli : {fallback})', { primary: S.objective.primary, fallback: S.objective.fallback }),
    t('Message principal : {message}', { message: S.persona.main_message }), ...((S.persona.tensions || []).length ? [t('Tensions : {list}', { list: S.persona.tensions.join(' / ') })] : []), '', `${t('OUVERTURE')}\n${M.opening || ''}`, `${t('SITUATION')}\n${M.situation || ''}`, `${t('IDÉE')}\n${M.idea || ''}`,
    `${t('MÉCANISME')}\n${(M.mechanism || []).map((x, i) => `${i + 1}. ${x}`).join('\n')}`, `${t('AVANTAGES')}\n${(M.advantages || []).map((x) => `- ${x}`).join('\n')}`,
    `${t('CONCLUSION')}\n${M.conclusion || ''}`, '', t('OBJECTIONS'), ...(M.objections || []).map((o) => `- ${o.who ? `[${o.who}] ` : ''}${o.objection}\n  → ${o.response}`)].join('\n');
}

// ----------------------------------------------------------------------------- 5. SUIVI
renderers.followup = () => {
  const D = S.debrief;
  $('#main').innerHTML = `
    <h1>${t('5 · Suivi rapide — centré sur l’appel à l’action')}</h1>
    <p class="lead">${t('Juste après le rendez-vous : ce qui s’est passé, et surtout l’action convenue (quoi, qui, quand, livrable). Racontez-le librement, l’IA remplit ; puis elle rédige le mail de suivi et vous enregistrez le RDV dans la mémoire.')}</p>
    <div class="card">
      <h2>${t('Raconter')}</h2>
      ${field('debrief.description', t('Texte libre'), { hint: t('comment ça s’est passé, ce qu’il a dit, ce qui a été convenu et pour quand'), type: 'textarea', full: true, placeholder: t('Ex. : Bon accueil, il veut l’avis de sa prof d’histoire avant de décider. Budget déjà engagé cette année. On s’est mis d’accord : je présente 30 min à la prof et à la documentaliste mardi prochain, j’envoie le dossier avant.') })}
      <div class="actions"><button class="btn" id="debrief-extract">${t('Analyser et remplir le débrief avec l’IA')}</button><span class="note" id="debrief-notes"></span></div>
    </div>
    <div class="grid">
      <div><label>${t('Résultat')}</label><select data-bind="debrief.outcome">
        <option value="">—</option><option value="Vente conclue">${t('Vente conclue')}</option><option value="Essai / pilote accepté">${t('Essai / pilote accepté')}</option><option value="Proposition à envoyer">${t('Proposition à envoyer')}</option>
        <option value="RDV décideur à fixer">${t('RDV décideur à fixer')}</option><option value="Réflexion / relance datée">${t('Réflexion / relance datée')}</option><option value="Pas de suite">${t('Pas de suite')}</option></select></div>
      ${field('debrief.decisionMaker', t('Décideur (nom)'))}
      ${field('debrief.objectionsHeard', t('Objections entendues'), { type: 'textarea', full: true })}
      <div class="full"><label>${t('Actions convenues')} <small>— ${t('jusqu’à {max} ; la première est l’appel à l’action principal, le mail est construit autour', { max: MAX_ACTIONS })}</small></label>
        <div id="actions-list"></div><div id="actions-agenda" class="agenda-row"></div></div>
      ${field('debrief.notes', t('Notes / faits nouveaux'), { type: 'textarea', full: true })}
    </div>
    <div class="actions">
      <button class="btn ghost" id="ai">${t('Rédiger le mail de suivi avec l’IA')}</button>
      <button class="btn" id="save">${t('Enregistrer le RDV dans la mémoire')}</button>
    </div>
    <div id="fu-out"></div>`;
  bindInputs($('#main'), D, 'debrief');
  renderActions();
  renderFollowup();
  $('#ai').onclick = (e) => busy(e.target, async () => {
    syncPrimaryAction();
    if (!D.nextAction) return toast(t('Indiquez au moins une action convenue : le mail est construit autour.'));
    const fu = await chatJSON(followupMessages({ lang: LANG, product: S.product, client: clientView(), simac: S.simac || {}, debrief: { ...D, actions: actions().map((a) => ({ ...a, status: ACTION_STATUS[a.status] })) } }));
    S.followup = fu;
    const na = fu.next_action || {};
    if (D.actions[0] && !D.actions[0].due && na.due) D.actions[0].due = na.due;
    syncPrimaryAction(); persist(); markDone(); if (S.step === 'followup') { renderActions(); renderFollowup(); }
  });
  $('#save').onclick = () => { saveMeeting(toRecord()); toast(t('Rendez-vous enregistré. Exportez le CSV depuis Historique.')); markDone(); };
  $('#debrief-extract').onclick = (e) => busy(e.target, async () => {
    if (!D.description.trim()) return toast(t('Racontez d’abord le rendez-vous.'));
    const r = await chatJSON(debriefExtractMessages({ lang: LANG, description: D.description, current: D, today: localDay() }));
    const f = r.fields || {}; let filled = 0;
    for (const k of ['outcome', 'objectionsHeard', 'decisionMaker', 'notes']) {
      const v = String(f[k] || '').trim(); if (v && !String(D[k] || '').trim()) { D[k] = v; filled++; }
    }
    // actions : liste renvoyée par l'IA (ou l'ancienne forme à une action) ; on complète les lignes vides, on n'écrase pas
    const found = (Array.isArray(f.actions) ? f.actions : (f.nextAction ? [{ action: f.nextAction, owner: f.nextOwner, due: f.nextDue, output: f.nextOutput }] : [])).filter((a) => a && a.action).slice(0, MAX_ACTIONS);
    for (const a of found) {
      if (D.actions.some((x) => x.action && x.action.toLowerCase() === String(a.action).toLowerCase())) continue;
      const rec = { action: String(a.action), owner: a.owner === 'client' ? 'client' : 'me', due: /^\d{4}-\d{2}-\d{2}$/.test(a.due || '') ? a.due : '', output: String(a.output || ''), status: 'todo' };
      const empty = D.actions.find((x) => !x.action);
      if (empty) Object.assign(empty, rec); else if (D.actions.length < MAX_ACTIONS) D.actions.push(rec); else continue;
      filled++;
    }
    syncPrimaryAction(); persist(); markDone(); if (S.step !== 'followup') return;
    renderers.followup();
    $('#debrief-notes').textContent = (r.missing || []).length ? t('Manque : {fields} — complétez à la main avant le mail.', { fields: labelFields(r.missing, DEBRIEF_LABELS) }) : '';
    toast(t('{n} champ(s) rempli(s).', { n: filled }));
  });
};
function renderActions() {
  const el = $('#actions-list'); if (!el) return;
  const list = S.debrief.actions;
  el.innerHTML = list.map((a, i) => `
    <div class="action-row" data-i="${i}">
      <span class="contact-n">${i + 1}</span>
      <input data-ak="action" placeholder="${i === 0 ? t('Action convenue — le CTA (ex. : envoyer la proposition)') : t('Autre action convenue')}" value="${esc(a.action)}">
      <select data-ak="owner"><option value="me" ${a.owner !== 'client' ? 'selected' : ''}>${t('Moi')}</option><option value="client" ${a.owner === 'client' ? 'selected' : ''}>${t('Le client')}</option></select>
      <input type="date" data-ak="due" value="${esc(a.due)}" title="${t('Échéance')}">
      <input data-ak="output" placeholder="${t('Livrable attendu')}" value="${esc(a.output)}">
      <select data-ak="status" class="st-${a.status || 'todo'}">${Object.entries(ACTION_STATUS).map(([k, v]) => `<option value="${k}" ${(a.status || 'todo') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      ${list.length > 1 ? `<button class="btn ghost small" data-rm-action="${i}" title="${t('Retirer')}">×</button>` : '<span></span>'}
    </div>`).join('') +
    (list.length < MAX_ACTIONS ? `<button class="btn ghost small" id="add-action">${t('+ Ajouter une action ({n}/{max})', { n: list.length, max: MAX_ACTIONS })}</button>` : `<span class="note">${t('{max} actions : au-delà, un rendez-vous n’a plus d’appel à l’action, il a une liste de tâches.', { max: MAX_ACTIONS })}</span>`);
  $$('.action-row', el).forEach((row) => { const a = list[+row.dataset.i];
    $$('[data-ak]', row).forEach((inp) => inp.addEventListener('input', () => { a[inp.dataset.ak] = inp.value; if (inp.dataset.ak === 'status') inp.className = 'st-' + inp.value; syncPrimaryAction(); persist(); if (['due', 'action', 'output'].includes(inp.dataset.ak)) renderActionsAgenda(); })); });
  renderActionsAgenda();
  $$('[data-rm-action]', el).forEach((b) => (b.onclick = () => { list.splice(+b.dataset.rmAction, 1); syncPrimaryAction(); persist(); renderActions(); }));
  $('#add-action')?.addEventListener('click', () => { list.push(blankAction()); persist(); renderActions(); $$('.action-row', el).pop()?.querySelector('input')?.focus(); });
}
// ----------------------------------------------------------------------------- agenda (.ics, Google) et relances
/** Événement d'agenda pour une action convenue : titre = action et client, description = livrable, qui, date du RDV. */
function actionEvent(a, { company, date, id }, i) {
  const who = a.owner === 'client' ? t('le client') : t('moi');
  const title = [a.action, company].filter(Boolean).join(' — ');
  const description = [a.output ? t('Livrable : {output}', { output: a.output }) : '', company ? t('Client : {company}', { company }) : '', t('Qui : {who}', { who }), date ? t('Rendez-vous du {date}', { date }) : '', t('Préparé avec SIMAC Prep (simac.avapmo.com)')].filter(Boolean).join('\n');
  return { uid: `${id || 'draft'}-${i}`, date: a.due, title, description };
}
function downloadIcs(events, name) {
  const evs = events.map((e) => icsEvent(e)).filter(Boolean);
  if (!evs.length) return toast(t('Indiquez une échéance pour ajouter l’action à l’agenda.'));
  download(name, icsCalendar(evs), 'text/calendar;charset=utf-8');
}
const agendaLinks = (ev, cls = 'btn ghost small') => ev.date ? `<button class="${cls}" data-ics="${esc(ev.uid)}" title="${t('Fichier .ics : s’ouvre dans Apple Calendar, Outlook, Thunderbird… avec un rappel la veille')}">${t('+ Agenda (.ics)')}</button> <a class="${cls}" href="${esc(googleCalendarUrl(ev))}" target="_blank" rel="noopener" aria-label="${t('Google Agenda (nouvel onglet)')}">Google</a>` : '';
/** Relances datées à faire : compteur sur le bouton Historique. */
function renderDueBadge() {
  const b = $('#steps [data-step="history"]'); if (!b) return;
  const { overdue, week } = dueBuckets(listMeetings(), localDay());
  let el = $('.nav-badge', b);
  if (!overdue.length && !week.length) { el?.remove(); return; }
  if (!el) { el = document.createElement('span'); el.className = 'nav-badge'; b.appendChild(el); }
  el.textContent = overdue.length + week.length; el.classList.toggle('late', overdue.length > 0);
  el.title = t('{late} en retard, {week} cette semaine', { late: overdue.length, week: week.length });
}
function renderActionsAgenda() {
  const el = $('#actions-agenda'); if (!el) return;
  const meeting = { company: S.client.company, date: S.date, id: S.id };
  const dated = S.debrief.actions.map((a, i) => ({ a, i })).filter(({ a }) => a.action && a.due);
  if (!dated.length) { el.innerHTML = `<span class="note">${t('Une action avec une échéance peut être ajoutée à votre agenda (rappel la veille).')}</span>`; return; }
  const events = dated.map(({ a, i }) => actionEvent(a, meeting, i));
  el.innerHTML = `<span class="note">${t('Ajouter à mon agenda :')}</span> ` + dated.map(({ a, i }, k) => `<span class="agenda-item"><b>${i + 1}</b> ${agendaLinks(events[k])}</span>`).join(' ')
    + (dated.length > 1 ? ` <button class="btn ghost small" id="ics-all">${t('Toutes (.ics)')}</button>` : '');
  $$('[data-ics]', el).forEach((b) => (b.onclick = () => downloadIcs([events.find((e) => e.uid === b.dataset.ics)], `simac-relance-${localDay()}.ics`)));
  $('#ics-all')?.addEventListener('click', () => downloadIcs(events, `simac-relances-${localDay()}.ics`));
}
/** Ouvrir un mail prérempli : messagerie locale (mailto:), ou Gmail / Outlook web quand aucune n'est configurée. */
function composeLinks({ subject, body }) {
  const l = mailLinks({ subject: subject || '', body: body || '' });
  const ext = (href, label) => `<a class="btn ghost small" href="${esc(href)}" target="_blank" rel="noopener" aria-label="${t('{site} (nouvel onglet)', { site: label })}">${label}</a>`;
  return `<a class="btn ghost small" href="${esc(l.mailto)}">${t('Ouvrir dans ma messagerie')}</a> ${ext(l.gmail, 'Gmail')} ${ext(l.outlook, 'Outlook')}`;
}
function renderFollowup() {
  const el = $('#fu-out'); const F = S.followup; if (!F) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="card"><h2>${t('Mail de suivi')}</h2>
      <p><b>${t('Objet :')}</b> ${esc(F.email_subject)}</p>
      <pre class="email" id="email">${esc(F.email_body)}</pre>
      <div class="actions"><button class="btn ghost small" id="copy-mail">${t('Copier')}</button>${composeLinks({ subject: F.email_subject, body: F.email_body })}</div>
      ${(F.lessons || []).length ? `<h3>${t('Leçons pour la prochaine fois')}</h3><ul class="plain">${F.lessons.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    </div>`;
  $('#copy-mail').onclick = () => navigator.clipboard.writeText(`${F.email_subject}\n\n${F.email_body}`).then(() => toast(t('Mail copié.')));
}
function toRecord() {
  syncPeople();
  const cs = S.client.contacts; const pp = S.persona.people;
  const sc = pp[0].scores; const M = S.simac || {}; const D = S.debrief; syncPrimaryAction(); const A = actions();
  const c2 = cs[1] || {}, c3 = cs[2] || {};
  return {
    id: S.id, date: S.date, company: S.client.company, sector: S.client.sector, website: S.client.website,
    contact_name: cs[0].name, contact_role: cs[0].role, contact_weight: cs[0].weight,
    contact2_name: c2.name || '', contact2_role: c2.role || '', contact2_weight: c2.name || c2.role ? c2.weight : '', soncas_2: cs[1] ? packScores(pp[1].scores) : '', top3_2: cs[1] ? top3(pp[1].scores).map(label).join('|') : '',
    contact3_name: c3.name || '', contact3_role: c3.role || '', contact3_weight: c3.name || c3.role ? c3.weight : '', soncas_3: cs[2] ? packScores(pp[2].scores) : '', top3_3: cs[2] ? top3(pp[2].scores).map(label).join('|') : '',
    research_json: JSON.stringify({ version: 1, product: S.product, market: S.market, research: S.research, client: S.client, sources: S.sources }),
    product: S.product.name,
    objective: S.objective.primary, fallback: S.objective.fallback,
    soncas_S: sc.S, soncas_O: sc.O, soncas_N: sc.N, soncas_C: sc.C, soncas_A: sc.A, soncas_Y: sc.Y, soncas_E: sc.E,
    top3: top3(sc).map(label).join('|'), main_message: S.persona.main_message, tensions: (S.persona.tensions || []).join(' | '), idea: M.idea || '', conclusion: M.conclusion || '',
    objections_prepared: (M.objections || []).map((o) => o.objection).join(' | '),
    outcome: D.outcome, objections_heard: D.objectionsHeard, decision_maker: D.decisionMaker,
    next_action: D.nextAction, next_owner: D.nextOwner, next_due: D.nextDue, next_output: D.nextOutput, next_status: A[0]?.status || 'todo',
    action2: A[1]?.action || '', action2_owner: A[1]?.owner || '', action2_due: A[1]?.due || '', action2_output: A[1]?.output || '', action2_status: A[1]?.status || '',
    action3: A[2]?.action || '', action3_owner: A[2]?.owner || '', action3_due: A[2]?.due || '', action3_output: A[2]?.output || '', action3_status: A[2]?.status || '',
    lessons: (S.followup?.lessons || []).join(' | '), notes: D.notes,
  };
}

// ----------------------------------------------------------------------------- HISTORIQUE / RAG
renderers.history = () => {
  const all = listMeetings();
  $('#main').innerHTML = `
    <h1>${t('Historique — la mémoire de vos rendez-vous')}</h1>
    <p class="lead">${t('Chaque RDV enregistré nourrit les prochains : l’IA relit les rendez-vous proches (même client, secteur, offre) avant de rédiger. Le CSV exporté est cette base ; réimportez-le sur un autre poste ou dans un autre outil.')}</p>
    <div class="actions">
      <button class="btn" id="export" ${all.length ? '' : 'disabled'}>${t('Exporter CSV ({n})', { n: all.length })}</button>
      <label class="btn ghost" style="margin:0">${t('Importer CSV')} <input type="file" id="import" accept=".csv,text/csv" hidden></label>
      <button class="btn ghost small" id="template">${t('Modèle CSV vide')}</button>
    </div>
    <div class="actions">
      <button class="btn ghost small" id="export-assistant" ${all.length ? '' : 'disabled'}>${t('Exporter pour mon assistant (JSON)')}</button>
      <label class="btn ghost small" style="margin:0">${t('Importer un compte rendu (JSON)')} <input type="file" id="import-minutes" accept=".json,application/json" hidden></label>
      <span class="note">${t('Pour un assistant qui lit vos fichiers : rendez-vous, actions et relances en JSON ; le compte rendu revient avec les décisions et les actions.')}</span>
    </div>
    <div id="due-list"></div>
    <div class="card">
      <table><thead><tr><th>${t('Date')}</th><th>${t('Entreprise / contact')}</th><th>${t('Offre')}</th><th>${t('Top SONCAS')}</th><th>${t('Résultat')}</th><th>${t('Suite')}</th><th></th></tr></thead>
      <tbody>${all.map((m) => `<tr data-row="${esc(m.id)}"><td>${esc(m.date)}</td><td><b>${esc(m.company)}</b><br><small>${[[m.contact_name, m.contact_role], [m.contact2_name, m.contact2_role], [m.contact3_name, m.contact3_role]].filter((c) => c[0] || c[1]).map((c) => esc(`${c[0]}${c[1] ? ' — ' + c[1] : ''}`)).join('<br>')}</small></td>
        <td>${esc(m.product)}</td><td>${esc(m.top3)}</td><td>${esc(m.outcome ? t(m.outcome) : '')}</td>
        <td>${[[m.next_action, m.next_owner, m.next_due, m.next_status], [m.action2, m.action2_owner, m.action2_due, m.action2_status], [m.action3, m.action3_owner, m.action3_due, m.action3_status]].filter((a) => a[0]).map((a) => `<span class="st-dot st-${esc(a[3] || 'todo')}" title="${esc(ACTION_STATUS[a[3]] || t('À lancer'))}"></span>${esc(a[0])}<br><small>${esc(a[1] === 'me' ? t('moi') : a[1] === 'client' ? t('le client') : a[1] || '')}${a[2] ? `, ${esc(a[2])}` : ''}</small>`).join('<br>')}</td>
        <td><button class="btn ghost small" data-load="${m.id}">${t('Ouvrir')}</button> <button class="btn danger small" data-del="${m.id}">×</button></td></tr>`).join('')
        || `<tr><td colspan="7" class="note">${t('Aucun rendez-vous enregistré.')}</td></tr>`}</tbody></table>
    </div>`;
  renderDueList(all); renderDueBadge();
  $('#export').onclick = () => download(`simac-rdv-${localDay()}.csv`, exportCSV());
  $('#template').onclick = () => download('simac-modele.csv', exportCSV([]));
  $('#export-assistant').onclick = () => download(`simac-assistant-${localDay()}.json`, JSON.stringify(assistantExport(listMeetings(), { base: appBase(), today: localDay() }), null, 2), 'application/json');
  $('#import-minutes').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importMinutes(await f.text()); };
  $('#import').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const n = importCSV(await f.text()); toast(t('{n} rendez-vous importé(s).', { n })); renderers.history(); };
  $$('[data-del]').forEach((b) => (b.onclick = () => { if (confirm(t('Supprimer ce rendez-vous ?'))) { deleteMeeting(b.dataset.del); renderers.history(); } }));
  $$('[data-load]').forEach((b) => (b.onclick = () => {
    const m = all.find((x) => x.id === b.dataset.load); if (!m) return;
    const product = S.product, offer = S.offer, market = S.market, offerId = S.offerId; S = blank(); Object.assign(S, { product, offer, market, offerId }); S.id = m.id; S.date = m.date;
    const cs = [{ name: m.contact_name || '', role: m.contact_role || '', weight: WEIGHTS[m.contact_weight] ? m.contact_weight : 'decide' }];
    if (m.contact2_name || m.contact2_role) cs.push({ name: m.contact2_name || '', role: m.contact2_role || '', weight: WEIGHTS[m.contact2_weight] ? m.contact2_weight : 'influence' });
    if (m.contact3_name || m.contact3_role) cs.push({ name: m.contact3_name || '', role: m.contact3_role || '', weight: WEIGHTS[m.contact3_weight] ? m.contact3_weight : 'influence' });
    Object.assign(S.client, { company: m.company, sector: m.sector, website: m.website, contacts: cs, notes: m.notes });
    Object.assign(S.objective, { primary: m.objective, fallback: m.fallback });
    syncPeople();
    S.persona.people[0].scores = capThrees(clampScores({ S: m.soncas_S, O: m.soncas_O, N: m.soncas_N, C: m.soncas_C, A: m.soncas_A, Y: m.soncas_Y, E: m.soncas_E }));
    if (cs[1]) S.persona.people[1].scores = capThrees(unpackScores(m.soncas_2));
    if (cs[2]) S.persona.people[2].scores = capThrees(unpackScores(m.soncas_3));
    S.persona.main_message = m.main_message; S.persona.tensions = m.tensions ? m.tensions.split(' | ') : [];
    const acts = [{ action: m.next_action || '', owner: m.next_owner || 'me', due: m.next_due || '', output: m.next_output || '', status: ACTION_STATUS[m.next_status] ? m.next_status : 'todo' }];
    if (m.action2) acts.push({ action: m.action2, owner: m.action2_owner || 'me', due: m.action2_due || '', output: m.action2_output || '', status: ACTION_STATUS[m.action2_status] ? m.action2_status : 'todo' });
    if (m.action3) acts.push({ action: m.action3, owner: m.action3_owner || 'me', due: m.action3_due || '', output: m.action3_output || '', status: ACTION_STATUS[m.action3_status] ? m.action3_status : 'todo' });
    Object.assign(S.debrief, { outcome: m.outcome, objectionsHeard: m.objections_heard, decisionMaker: m.decision_maker, nextAction: m.next_action, nextOwner: m.next_owner || 'me', nextDue: m.next_due, nextOutput: m.next_output, notes: m.notes, actions: acts });
    restoreResearch(m.research_json);
    persist(); go('client'); toast(t('Rendez-vous rechargé (la fiche client et le SIMAC sont à regénérer).'));
  }));
};

// ----------------------------------------------------------------------------- échange avec l'assistant du dirigeant
const appBase = () => location.origin + location.pathname;
const MINUTES_ERRORS = {
  invalid: t('fichier illisible'), format: t('ce n’est pas un compte rendu SIMAC (format simac-prep/minutes, version 1)'),
  key: t('clé d’idempotence manquante'), meeting: t('rendez-vous introuvable dans ce navigateur'),
};
/** Applique un ou plusieurs comptes rendus JSON aux rendez-vous enregistrés (une fois par clé). */
function importMinutes(text) {
  let data; try { data = JSON.parse(text); } catch { return toast(t('Compte rendu refusé : {why}.', { why: MINUTES_ERRORS.invalid }), 5000); }
  const list = minutesList(data);
  if (!list.length) return toast(t('Compte rendu refusé : {why}.', { why: MINUTES_ERRORS.invalid }), 5000);
  const labels = { header: t('Compte rendu de l’assistant'), summary: t('Résumé'), decisions: t('Décisions') };
  let applied = 0, dup = 0, firstError = '', truncated = false;
  for (const mn of list) {
    const id = mn && typeof mn.meeting_id === 'string' ? mn.meeting_id : '';
    // Le rendez-vous ouvert mais pas encore enregistré : on l'enregistre d'abord.
    if (id && id === S.id && !listMeetings().some((m) => m.id === id)) saveMeeting(toRecord());
    const r = applyMinutes(listMeetings().find((m) => m.id === id), mn, { today: localDay(), labels });
    if (r.status === 'duplicate') { dup++; continue; }
    if (r.status === 'error') { firstError ||= MINUTES_ERRORS[r.code] || MINUTES_ERRORS.invalid; continue; }
    saveMeeting(r.record); applied++; truncated ||= r.warnings.includes('actions_truncated');
    if (S.id === id) {
      S.debrief.notes = r.record.notes;
      const acts = actionsOf(r.record);
      if (acts.length) { S.debrief.actions = acts.map(({ action, owner, due, output, status }) => ({ action, owner, due, output, status })); syncPrimaryAction(); }
      persist();
    }
  }
  const parts = [t('{n} compte(s) rendu(s) importé(s)', { n: applied })];
  if (dup) parts.push(t('{n} déjà importé(s)', { n: dup }));
  if (truncated) parts.push(t('3 actions gardées au plus'));
  if (firstError) parts.push(t('refusé : {why}', { why: firstError }));
  toast(parts.join(', ') + '.', 5000);
  if (S.step === 'history') renderers.history(); else renderDueBadge();
}
/** Lien de retour depuis l'export (?rdv=<id>) : ouvre l'Historique sur ce rendez-vous. */
function openLinkedMeeting() {
  const params = new URLSearchParams(location.search); const id = params.get('rdv'); if (!id) return;
  params.delete('rdv'); const q = params.toString();
  history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  go('history');
  const row = $$('[data-row]').find((r) => r.dataset.row === id);
  if (!row) return toast(t('Rendez-vous introuvable dans ce navigateur.'), 5000);
  row.classList.add('flash'); row.scrollIntoView({ block: 'center' });
}

/** Relances à faire, en tête de l'Historique : en retard, puis cette semaine ; statut modifiable sur place, agenda. */
function renderDueList(all) {
  const el = $('#due-list'); if (!el) return;
  const today = localDay();
  const { overdue, week } = dueBuckets(all, today);
  if (!overdue.length && !week.length) { el.innerHTML = all.length ? `<p class="note">${t('Aucune relance en retard ni prévue cette semaine.')}</p>` : ''; return; }
  const events = [...overdue, ...week].map((x) => actionEvent(x, x.meeting, x.i));
  const row = (x, late) => { const ev = actionEvent(x, x.meeting, x.i); return `<tr class="${late ? 'late' : ''}" data-mid="${esc(x.meeting.id)}" data-i="${x.i}">
    <td><b>${esc(x.due)}</b></td><td><b>${esc(x.meeting.company)}</b><br><small>${esc(x.meeting.contact_name || '')}</small></td>
    <td>${esc(x.action)}${x.output ? `<br><small>${esc(x.output)}</small>` : ''}</td><td>${x.owner === 'client' ? t('le client') : t('moi')}</td>
    <td><select class="due-status st-${x.status}">${Object.entries(ACTION_STATUS).map(([k, v]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
    <td class="agenda-cell">${agendaLinks(ev)} <button class="btn ghost small" data-load="${esc(x.meeting.id)}">${t('Ouvrir')}</button></td></tr>`; };
  el.innerHTML = `<div class="card due-card"><h2>${t('Relances à faire')} <small>${t('{late} en retard, {week} cette semaine', { late: overdue.length, week: week.length })}</small>
      ${events.length > 1 ? `<button class="btn ghost small" id="ics-due" style="float:right">${t('Toutes dans l’agenda (.ics)')}</button>` : ''}</h2>
    <table><thead><tr><th>${t('Échéance')}</th><th>${t('Entreprise / contact')}</th><th>${t('Action')}</th><th>${t('Qui')}</th><th>${t('Statut')}</th><th></th></tr></thead>
    <tbody>${overdue.map((x) => row(x, true)).join('')}${week.map((x) => row(x, false)).join('')}</tbody></table></div>`;
  $$('[data-ics]', el).forEach((b) => (b.onclick = () => downloadIcs([events.find((e) => e.uid === b.dataset.ics)], `simac-relance-${localDay()}.ics`)));
  $('#ics-due')?.addEventListener('click', () => downloadIcs(events, `simac-relances-${localDay()}.ics`));
  $$('.due-status', el).forEach((sel) => sel.addEventListener('change', () => {
    const tr = sel.closest('tr'); const m = all.find((x) => x.id === tr.dataset.mid); if (!m) return;
    m[ACTION_COLUMNS[+tr.dataset.i].status] = sel.value; saveMeeting(m);
    if (S.id === m.id && S.debrief.actions[+tr.dataset.i]) { S.debrief.actions[+tr.dataset.i].status = sel.value; persist(); }
    renderers.history(); toast(t('Statut enregistré.'));
  }));
}

// ----------------------------------------------------------------------------- RÉGLAGES
renderers.settings = () => {
  const s = loadSettings();
  $('#main').innerHTML = `
    <h1>${t('Réglages — IA gratuite, au choix')}</h1>
    <p class="lead">${t('Aucun serveur : votre clé reste dans ce navigateur et n’est envoyée qu’au fournisseur choisi. Tous ceux listés ont une offre gratuite, ou tournent sur votre machine.')}</p>
    <div class="card warn">${t('Une clé gratuite sert à tester et à traiter des données publiques (sites web, plaquettes, informations d’entreprise publiques). Avec une offre gratuite, le fournisseur peut réutiliser ce que vous envoyez : nous déconseillons d’y mettre des données non publiques — mails reçus, devis, notes internes, coordonnées personnelles. Pour ces données, collez ici une clé d’une <b>offre payante souscrite chez votre fournisseur d’IA</b> (pas chez AVApmo : l’outil reste gratuit) dont les conditions excluent l’usage de vos données — l’outil fonctionne à l’identique — ou choisissez <b>Ollama</b> pour traiter l’IA localement. Les recherches web et officielles contactent toujours leurs fournisseurs.')}</div>
    <div class="card"><div class="grid">
      <div><label>${t('Fournisseur')}</label><select id="provider">${Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}" ${s.provider === k ? 'selected' : ''}>${p.label}</option>`).join('')}</select></div>
      <div><label>${t('Clé API')} <small id="keyhelp"></small></label><input id="apiKey" type="password" value="${esc(s.apiKey)}" autocomplete="off"></div>
      <div><label>${t('Modèle')} <small>— ${t('vide = défaut')}</small></label><input id="model" list="model-list" value="${esc(s.model)}" placeholder="${esc(PROVIDERS[s.provider]?.model || '')}"><datalist id="model-list"></datalist>
        <button class="btn ghost small" id="models" style="margin-top:6px">${t('Lister les modèles')}</button> <small class="muted" id="models-note">${t('les noms changent souvent : vérifiez ici en cas d\'erreur « modèle introuvable »')}</small></div>
      <div><label>${t('URL de base')} <small>— ${t('vide = défaut')}</small></label><input id="baseUrl" value="${esc(s.baseUrl)}" placeholder="${esc(PROVIDERS[s.provider]?.baseUrl || '')}"></div>
      <div class="full"><label>${t('Clé Jina (requise pour la recherche web)')} <small>— ${t('lecture de pages sans clé à faible volume ; recherche avec clé et crédits sur')} <a href="https://jina.ai/reader" target="_blank" rel="noopener" aria-label="${t('{site} (nouvel onglet)', { site: 'jina.ai' })}">jina.ai</a></small></label><input id="jinaKey" type="password" value="${esc(s.jinaKey || '')}" autocomplete="off"></div>
    </div>
    <div class="actions"><button class="btn" id="save">${t('Enregistrer')}</button><button class="btn ghost" id="test">${t('Tester')}</button></div></div>
    <div class="card">
      <h2>${t('Comment obtenir une clé gratuite')}</h2>
      <ul class="plain">
        <li><b>Groq</b> — ${t('rapide, Llama 3.3 70B, quota gratuit généreux :')} <a href="https://console.groq.com/keys" target="_blank" rel="noopener" aria-label="${t('{site} (nouvel onglet)', { site: 'console.groq.com/keys' })}">console.groq.com/keys</a></li>
        <li><b>Google Gemini</b> — ${t('Gemini Flash, gratuit :')} <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" aria-label="${t('{site} (nouvel onglet)', { site: 'aistudio.google.com/apikey' })}">aistudio.google.com/apikey</a></li>
        <li><b>Mistral</b> — ${t('plan « Experiment » gratuit, modèles français :')} <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noopener" aria-label="${t('{site} (nouvel onglet)', { site: 'console.mistral.ai' })}">console.mistral.ai</a></li>
        <li><b>OpenRouter</b> — ${t('modèles suffixés <code>:free</code> :')} <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" aria-label="${t('{site} (nouvel onglet)', { site: 'openrouter.ai/keys' })}">openrouter.ai/keys</a></li>
        <li><b>Claude (Anthropic)</b> — ${t('payant, à l’usage (quelques centimes par rendez-vous), données non utilisées pour l’entraînement :')} <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" aria-label="${t('{site} (nouvel onglet)', { site: 'console.anthropic.com' })}">console.anthropic.com</a> — ${t('le choix « Travailler » ci-dessous.')}</li>
        <li><b>Ollama</b> — ${t('100 % local, sans clé. Lancez <code>OLLAMA_ORIGINS="*" ollama serve</code> puis <code>ollama pull llama3.1</code>.')}</li>
        <li><b>${t('Mode démo')}</b> — ${t('génération IA sans réseau ; les boutons de recherche contactent les sources publiques.')}</li>
      </ul>
      <h3>${t('Limites de la version gratuite')}</h3>
      <p class="note">${t('{sources} sources par étape, {chars} caractères conservés par source, {total} caractères envoyés à l’IA par analyse, pour que les réponses restent complètes.', { sources: CONFIG.limits.sourcesPerStep, chars: CONFIG.limits.charsPerSource.toLocaleString(locale()), total: CONFIG.limits.totalChars.toLocaleString(locale()) })}</p>
      <div class="card soft" id="managed-interest"></div>
      <h3>${t('Données sensibles : trois niveaux')}</h3>
      <ul class="plain">
        <li><b>${t('Tester')}</b> — ${t('clé gratuite : données fictives ou <b>publiques</b> (site web, plaquette, fiche d’entreprise, profil public), utilisables en l’état. Déconseillé pour tout ce qui n’est pas public.')}</li>
        <li><b>${t('Travailler')}</b> — ${t('clé d’une offre payante <b>chez le fournisseur d’IA</b> (Claude, ou l’offre payante de Groq, Gemini, Mistral, OpenRouter : même champ, même usage ; vous payez le fournisseur, jamais AVApmo) ; vérifiez dans ses conditions que vos données ne servent pas à entraîner ses modèles.')}</li>
        <li><b>${t('Confidentiel')}</b> — ${t('Ollama en local : le modèle tourne sur votre machine ; les recherches web et officielles restent des appels externes, uniquement à votre demande.')}</li>
      </ul>
      <p class="note">${t('Les quotas gratuits évoluent ; en cas d’erreur 429, changez de fournisseur. Vos données de rendez-vous restent dans ce navigateur (voir Historique pour l’export CSV).')}</p>
    </div>`;
  const keyhelp = () => { const p = PROVIDERS[$('#provider').value]; $('#keyhelp').innerHTML = p.needsKey ? `— <a href="${p.keyUrl}" target="_blank" rel="noopener" aria-label="${t('Obtenir une clé (nouvel onglet)')}">${t('obtenir')}</a>` : `— ${t('non requise')}`; $('#model').placeholder = p.model; $('#baseUrl').placeholder = p.baseUrl; };
  keyhelp(); $('#provider').onchange = keyhelp;
  renderManagedInterest();
  const read = () => ({ provider: $('#provider').value, apiKey: $('#apiKey').value.trim(), model: $('#model').value.trim(), baseUrl: $('#baseUrl').value.trim(), jinaKey: $('#jinaKey').value.trim() });
  $('#save').onclick = () => { saveSettings(read()); markDone(); toast(t('Réglages enregistrés.')); };
  $('#models').onclick = (e) => busy(e.target, async () => {
    saveSettings(read());
    const ids = await listModels();
    $('#model-list').innerHTML = ids.map((id) => `<option value="${esc(id)}">`).join('');
    $('#models-note').textContent = ids.length ? t('{n} modèle(s) : {list} — cliquez dans le champ Modèle pour choisir.', { n: ids.length, list: ids.slice(0, 8).join(', ') + (ids.length > 8 ? '…' : '') }) : t('Aucun modèle renvoyé.');
    const cur = $('#model').value.trim() || PROVIDERS[$('#provider').value]?.model;
    if (ids.length && !ids.includes(cur)) { $('#model').value = ids.find((i) => /haiku|gpt-oss-120b|llama.*70b|gemini.*flash|mistral-small|:free/i.test(i)) || ids[0]; toast(t('Modèle « {missing} » absent : « {picked} » sélectionné. Enregistrez.', { missing: cur, picked: $('#model').value }), 5000); }
  });
  $('#test').onclick = (e) => busy(e.target, async () => {
    saveSettings(read()); markDone();
    const r = await chatJSON([{ role: 'system', content: 'TASK:ping LANG:fr Réponds uniquement en JSON.' }, { role: 'user', content: 'Réponds {"ok":true}' }]);
    toast(r && (r.ok || r.text) ? t('Connexion OK ✔') : t('Réponse inattendue : {text}', { text: JSON.stringify(r).slice(0, 80) }));
  });
};

// ----------------------------------------------------------------------------- intention : version gérée
// Pas de version payante tant que la demande n'est pas là : on la mesure. Zéro serveur → un mail pré-rempli,
// compté dans la boîte contact@ ; le clic est mémorisé localement pour ne pas redemander.
const INTEREST_KEY = 'simac.interest.managed';
// Fonctions candidates de la version gérée, à cocher dans le mail : c'est la mesure de ce qui est réellement demandé.
// Codes stables (comptés dans la boîte contact@) ; libellés traduits à l'affichage.
const INTEREST_FEATURES = [
  ['keys', t('IA et recherche incluses, sans clé à configurer')],
  ['backup', t('Dossiers sauvegardés et chiffrés, retrouvés sur tous mes postes')],
  ['reminders', t('Rappel par email des relances à faire')],
  ['calendar', t('Mes relances dans mon agenda (flux abonnable)')],
  ['data', t('Données officielles et financières des entreprises incluses')],
  ['mcp', t('Préparer un rendez-vous depuis Claude ou ChatGPT')],
];
const INTEREST_USAGE = [
  ['multi', t('J’utilise SIMAC Prep sur plusieurs postes')],
  ['lost', t('J’ai déjà perdu des dossiers (navigateur vidé, autre poste)')],
];
function renderManagedInterest() {
  const el = $('#managed-interest'); if (!el) return;
  let done = null; try { done = JSON.parse(localStorage.getItem(INTEREST_KEY) || 'null'); } catch {}
  if (done) {
    el.innerHTML = `<span class="note">${done.at ? t('Merci, votre intérêt pour une version gérée est noté ({date}). Elle existera si la demande est là, et nous vous écrirons.', { date: done.at.slice(0, 10) }) : t('Merci, votre intérêt pour une version gérée est noté. Elle existera si la demande est là, et nous vous écrirons.')}</span>`;
    return;
  }
  const email = getConsent()?.email || '';
  const box = (code, label, name) => `<label class="check"><input type="checkbox" name="${name}" value="${code}"> <span>${label}</span></label>`;
  el.innerHTML = `<b>${t('Une version gérée vous intéresserait ?')}</b> <span class="note">${t('Les clés et les appels IA y seraient pris en charge, avec des plafonds plus larges. Elle n’existe pas encore et nous la construirons si la demande est là.')}</span>
     <p class="note" style="margin:8px 0 2px">${t('Cochez ce qui vous serait utile — c’est ce que nous construirons en premier :')}</p>
     <div class="check-list" id="interest-features">${INTEREST_FEATURES.map(([c, l]) => box(c, l, 'feature')).join('')}</div>
     <div class="check-list" id="interest-usage">${INTEREST_USAGE.map(([c, l]) => box(c, l, 'usage')).join('')}</div>
     <div class="actions" style="margin:8px 0 0"><a class="btn ghost small" id="interest-yes" href="#">${t('Écrire pour dire que ça m’intéresse')}</a></div>`;
  const link = $('#interest-yes');
  const build = () => {
    const picked = (name) => $$(`input[name="${name}"]:checked`, el).map((i) => i.value);
    const features = picked('feature'), usage = picked('usage');
    const lines = [t('Bonjour,'), '', t('Une version de SIMAC Prep où les clés et les appels IA sont pris en charge (sans plafonds, sans clé à gérer) m’intéresserait.'), ''];
    lines.push(t('Ce qui me serait utile :'));
    for (const [c, l] of INTEREST_FEATURES) lines.push(`[${features.includes(c) ? 'x' : ' '}] ${l}`);
    lines.push('', t('Mon usage :'));
    for (const [c, l] of INTEREST_USAGE) lines.push(`[${usage.includes(c) ? 'x' : ' '}] ${l}`);
    lines.push(`[ ] ${t('Combien de rendez-vous par mois, quel type de clients : …')}`, '');
    if (email) lines.push(t('Adresse : {email}', { email }));
    lines.push('', `Fonctions: ${features.join(',') || '-'} | Usage: ${usage.join(',') || '-'} | Lang: ${LANG}`);
    link.href = `mailto:${CONFIG.contact}?subject=${encodeURIComponent(t('SIMAC Prep — version gérée : ça m’intéresse'))}&body=${encodeURIComponent(lines.join('\n'))}`;
  };
  build();
  $$('input[type="checkbox"]', el).forEach((i) => i.addEventListener('change', build));
  link.addEventListener('click', () => { try { localStorage.setItem(INTEREST_KEY, JSON.stringify({ at: new Date().toISOString(), features: $$('input[name="feature"]:checked', el).map((i) => i.value) })); } catch {} setTimeout(renderManagedInterest, 500); });
}

// ----------------------------------------------------------------------------- impression / PDF
const STEP_TITLES = { offer: t('Offre'), client: t('Client'), persona: t('Persona SONCAS'), simac: t('Déroulé SIMAC'), followup: t('Suivi'), history: t('Historique'), settings: t('Réglages') };
const STEP_SLUG = { offer: 'offre', client: 'client', persona: 'persona', simac: 'simac', followup: 'suivi', history: 'historique', settings: 'reglages' };
// Choix du document avant d'imprimer : l'étape affichée, une fiche d'une page à emporter, ou le dossier complet.
const PRINT_KEY = 'simac.print';
const PRINT_SECTIONS = ['offer', 'client', 'persona', 'simac', 'followup'];
function printPrefs() {
  const d = { mode: 'step', sections: PRINT_SECTIONS, sources: true };
  try { const p = JSON.parse(localStorage.getItem(PRINT_KEY) || '{}'); return { ...d, ...p, sections: Array.isArray(p.sections) ? p.sections.filter((k) => PRINT_SECTIONS.includes(k)) : d.sections }; } catch { return d; }
}
let printMode = null; // choix pour l'impression en cours ; null (Ctrl+P, tests) = étape affichée
$('#btn-print').onclick = () => openPrintDialog();
function openPrintDialog() {
  let d = $('#print-dialog');
  if (!d) { d = document.createElement('dialog'); d.id = 'print-dialog'; document.body.appendChild(d); }
  const p = printPrefs(); const mode = p.mode === 'sheet' && !(S.client.company || S.simac) ? 'step' : p.mode;
  const radio = (v, title, hint) => `<label class="check"><input type="radio" name="mode" value="${v}" ${mode === v ? 'checked' : ''}> <span><b>${title}</b> <small>— ${hint}</small></span></label>`;
  d.innerHTML = `<form method="dialog">
    <h2>${t('Imprimer / enregistrer en PDF')}</h2>
    <div class="check-list">
      ${radio('step', t('Cette étape'), t('la vue affichée : {step}', { step: esc(STEP_TITLES[printViews[S.step] ? S.step : 'offer']) }))}
      ${radio('sheet', t('Fiche 1 page'), t('à emporter au rendez-vous : interlocuteurs, message, ouverture, questions, objections, conclusion'))}
      ${radio('full', t('Dossier complet'), t('les étapes choisies, avec les sources consultées'))}
    </div>
    <div class="check-list print-sections">
      ${PRINT_SECTIONS.map((k) => `<label class="check"><input type="checkbox" name="s" value="${k}" ${p.sections.includes(k) ? 'checked' : ''}> <span>${esc(STEP_TITLES[k])}</span></label>`).join('')}
      <label class="check"><input type="checkbox" name="sources" ${p.sources ? 'checked' : ''}> <span>${t('Sources consultées')}</span></label>
    </div>
    <div class="actions"><button class="btn" value="print">${t('Imprimer / PDF')}</button> <button class="btn ghost" value="cancel">${t('Annuler')}</button></div></form>`;
  const sync = () => { $('.print-sections', d).hidden = $('input[name="mode"]:checked', d).value !== 'full'; };
  $$('input[name="mode"]', d).forEach((r) => (r.onchange = sync)); sync();
  d.onclose = () => {
    if (d.returnValue !== 'print') return;
    const prefs = { mode: $('input[name="mode"]:checked', d).value, sections: $$('input[name="s"]:checked', d).map((i) => i.value), sources: $('input[name="sources"]', d).checked };
    try { localStorage.setItem(PRINT_KEY, JSON.stringify(prefs)); } catch {}
    printMode = prefs; window.print();
  };
  d.showModal();
}

// ----------------------------------------------------------------------------- impression / PDF
// Une vue dédiée, construite depuis l'état (pas depuis le formulaire) : pas de zone de texte, pas de panneau
// collant ni de recherche brute → nombre de pages prévisible. Nom de fichier proposé par le navigateur = titre.
const P = {
  text: (v) => esc(String(v ?? '')).replace(/\n/g, '<br>'),
  row: (label, v) => (String(v ?? '').trim() ? `<div class="pf"><b>${esc(label)}</b><div>${P.text(v)}</div></div>` : ''),
  ul: (arr, f = (x) => esc(typeof x === 'string' ? x : x.fact || JSON.stringify(x))) => (Array.isArray(arr) && arr.length ? `<ul>${arr.map((x) => `<li>${f(x)}</li>`).join('')}</ul>` : ''),
};
const printViews = {
  offer() {
    const M = S.offer?.maturity; const m = S.market?.comparison;
    return `<h1>${t('Offre')} — ${esc(S.product.name || '')}</h1>
      <div class="pgrid">${OFFER_KEY_ORDER.map((k) => P.row(FIELD_LABELS[k] || k, S.product[k])).join('')}</div>
      ${M ? `<h2>${t('Maturité : {score} / 5', { score: M.score })} — ${esc(MATURITY[M.score] || M.label)}</h2><p>${t('Avis de l’outil : {verdict}', { verdict: esc(t(M.verdict || VERDICT[M.score])) })}.</p><p>${esc(M.summary || '')}</p>
        <div class="pgrid"><div><b>${t('Points forts')}</b>${P.ul(M.strengths)}</div><div><b>${t('Ce qui bloque la vente')}</b>${P.ul(M.gaps, (g) => `<b>${esc(labelField(g.field, FIELD_LABELS))}</b> — ${esc(g.why)} → ${esc(g.fix)}`)}</div></div>
        ${M.next_step ? `<p><b>${t('À faire avant le prochain rendez-vous :')}</b> ${esc(M.next_step)}</p>` : ''}
        <p><small>${t('Avis indicatif, fourni « tel quel » : le niveau de maturité et les informations réglementaires sont produits automatiquement (y compris par l’IA) et peuvent être incomplets, dépassés ou erronés. Faites-les confirmer par l’autorité compétente ou un professionnel, surtout dans un secteur ou un marché réglementé. Aucun engagement ni responsabilité de Guillermo Blanco, adp.avapmo.com ou AVApmo sur ce résultat ni sur son usage.')}</small></p>` : ''}
      ${m && (m.summary || m.alternatives) ? `<h2>${t('Concurrents et alternatives (candidats à vérifier)')}</h2><p>${esc(m.summary || '')}</p>${P.ul(m.alternatives || m.items, (a) => `<b>${esc(a.name || '')}</b> — ${esc(a.positioning || a.summary || '')}`)}` : ''}`;
  },
  client() {
    const b = S.brief; const C = S.client;
    return `<h1>${t('Client')} — ${esc(C.company || '')}</h1>
      <div class="pgrid">${P.row(t('Entreprise'), C.company)}${P.row(t('Secteur'), C.sector)}${P.row(t('Commune / pays'), C.location)}${P.row(t('Format du rendez-vous'), C.meetingFormat)}
        ${P.row(t('Interlocuteurs'), contacts().map((c, i) => `${contactLabel(c, i)} — ${c.role || ''} (${WEIGHTS[c.weight] || ''})`).join('\n'))}${P.row(t('Processus de décision'), C.decisionProcess)}${P.row(t('Site web'), C.website)}</div>
      ${b ? `<h2>${t('Fiche client')}</h2><p><b>${t('Entreprise.')}</b> ${esc(b.company_summary || '')}</p><p><b>${t('Interlocuteurs.')}</b> ${esc(b.contact_summary || '')}</p><p><b>${t('Enjeu.')}</b> ${esc(b.stakes || '')}</p>
        <div class="pgrid"><div><b>${t('Problèmes possibles à vérifier')}</b>${P.ul(b.likely_problems)}</div><div><b>${t('Faits (sourcés)')}</b>${P.ul(b.facts)}</div><div><b>${t('Hypothèses à vérifier')}</b>${P.ul(b.assumptions)}</div><div><b>${t('Questions de découverte')}</b>${P.ul(b.questions_to_ask)}</div></div>
        ${(b.participants || []).map((p) => `<p><b>${esc(p.name)}</b> — ${esc(p.documented_role || '')}. ${t('À explorer :')} ${esc(p.hypothesis || '')}. <i>${t('Question :')} ${esc(p.question || '')}</i></p>`).join('')}
        ${b.preparation ? `<h3>${C.preparationMode === 'email' ? t('Email de prise de contact') : t('Ouverture du rendez-vous')}</h3><p>${P.text(b.preparation.opening)}</p>${C.preparationMode === 'email' ? `<p><b>${t('Objet :')}</b> ${esc(b.preparation.email_subject || '')}</p><p>${P.text(b.preparation.email_body)}</p>` : ''}` : ''}` : `<p class="note">${t('Fiche client non générée.')}</p>`}`;
  },
  persona() {
    syncPeople();
    const blocks = S.client.contacts.map((c, i) => { const pp = S.persona.people[i]; const t3 = top3(pp.scores);
      return `<h2>${esc(contactLabel(c, i))} <small>(${[c.role, WEIGHTS[c.weight]].filter(Boolean).map(esc).join(', ')})</small> — ${t('top 3 :')} ${t3.map(label).join(', ')}</h2>
        <table class="ptable"><thead><tr><th>${t('Motivation')}</th><th>${t('Score')}</th><th>${t('Pourquoi')}</th><th>${t('Arguments')}</th></tr></thead><tbody>
        ${SONCAS.map((d) => `<tr class="${t3.includes(d.code) ? 'top' : ''}"><td>${label(d.code)}</td><td>${pp.scores[d.code]}</td><td>${esc(pp.rationale?.[d.code] || '')}</td><td>${P.ul(pp.arguments?.[d.code])}</td></tr>`).join('')}</tbody></table>`; }).join('');
    return `<h1>${t('Persona SONCAS')} — ${esc(S.client.company || '')}</h1>${blocks}
      ${(S.persona.tensions || []).length ? `<h3>${t('Tensions entre interlocuteurs')}</h3>${P.ul(S.persona.tensions)}` : ''}
      <div class="pbox"><b>${t('Message principal')}</b><br>${P.text(S.persona.main_message)}</div>`;
  },
  simac() {
    const M = S.simac || {}; const multi = contacts().length > 1;
    return `<h1>${t('Déroulé SIMAC')} — ${esc(S.client.company || '')} / ${esc(contacts().map((c, i) => contactLabel(c, i)).join(', '))}</h1>
      <p><b>${t('Objectif :')}</b> ${esc(S.objective.primary || '')}<br><b>${t('Repli :')}</b> ${esc(S.objective.fallback || '')}</p>
      <div class="pbox"><b>${t('Message principal')}</b><br>${P.text(S.persona.main_message)}</div>
      ${P.row(t('Ouverture (20 premières secondes)'), M.opening)}${P.row(t('Situation'), M.situation)}${P.row(t('Idée'), M.idea)}
      ${P.row(t('Mécanisme — prix en dernier'), (M.mechanism || []).map((x, i) => `${i + 1}. ${x}`).join('\n'))}
      ${P.row(t('Avantages — chacun reformule un besoin'), (M.advantages || []).map((x) => `– ${x}`).join('\n'))}
      ${P.row(t('Conclusion — question, deux options, étape suivante'), M.conclusion)}
      ${(M.objections || []).length ? `<h2>${t('Objections probables')}</h2><table class="ptable"><thead><tr>${multi ? `<th>${t('Qui')}</th>` : ''}<th>${t('Objection')}</th><th>${t('Accueillir → creuser → répondre → relancer')}</th></tr></thead><tbody>${M.objections.map((o) => `<tr>${multi ? `<td>${esc(o.who || '')}</td>` : ''}<td>${esc(o.objection)}</td><td>${esc(o.response)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${(M.mistakes_watch || []).length ? `<h3>${t('Erreurs à surveiller')}</h3>${P.ul(M.mistakes_watch)}` : ''}
      <p class="note">${t('Avant d’entrer, connaissez votre plancher et listez les leviers qui ne sont pas des remises. Ne repartez jamais sans une date et le nom du décideur.')}</p>`;
  },
  followup() {
    const D = S.debrief; const F = S.followup;
    return `<h1>${t('Suivi')} — ${esc(S.client.company || '')}</h1>
      <div class="pgrid">${P.row(t('Résultat'), D.outcome ? t(D.outcome) : '')}${P.row(t('Décideur'), D.decisionMaker)}${P.row(t('Objections entendues'), D.objectionsHeard)}${P.row(t('Notes'), D.notes)}</div>
      ${actions().length ? `<h2>${t('Actions convenues')}</h2><table class="ptable"><thead><tr><th>#</th><th>${t('Action')}</th><th>${t('Qui')}</th><th>${t('Échéance')}</th><th>${t('Livrable')}</th><th>${t('Statut')}</th></tr></thead><tbody>${actions().map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.action)}</td><td>${a.owner === 'client' ? t('Le client') : t('Moi')}</td><td>${esc(a.due)}</td><td>${esc(a.output)}</td><td>${ACTION_STATUS[a.status] || t('À lancer')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${F ? `<h2>${t('Mail de suivi')}</h2><p><b>${t('Objet :')}</b> ${esc(F.email_subject || '')}</p><div class="pbox">${P.text(F.email_body)}</div>${(F.lessons || []).length ? `<h3>${t('Leçons pour la prochaine fois')}</h3>${P.ul(F.lessons)}` : ''}` : ''}`;
  },
  history() {
    const all = listMeetings();
    return `<h1>${t('Historique — {n} rendez-vous', { n: all.length })}</h1><table class="ptable"><thead><tr><th>${t('Date')}</th><th>${t('Entreprise / contact')}</th><th>${t('Offre')}</th><th>${t('Top SONCAS')}</th><th>${t('Résultat')}</th><th>${t('Suite')}</th></tr></thead><tbody>
      ${all.map((m) => `<tr><td>${esc(m.date)}</td><td>${esc(m.company)}<br><small>${esc(m.contact_name)}</small></td><td>${esc(m.product)}</td><td>${esc(m.top3)}</td><td>${esc(m.outcome ? t(m.outcome) : '')}</td><td>${[[m.next_action, m.next_due, m.next_status], [m.action2, m.action2_due, m.action2_status], [m.action3, m.action3_due, m.action3_status]].filter((a) => a[0]).map((a) => `${esc(a[0])} — ${esc(a[1] || '')} (${ACTION_STATUS[a[2]] || t('À lancer')})`).join('<br>')}</td></tr>`).join('')}</tbody></table>`;
  },
};
/** Fiche d'une page à emporter : l'essentiel pour tenir le rendez-vous, sans les sources ni les hypothèses. */
function printSheet() {
  const b = S.brief || {}; const M = S.simac || {}; syncPeople();
  const people = S.client.contacts.map((c, i) => { const pp = S.persona.people[i]; return `<li><b>${esc(contactLabel(c, i))}</b>${c.role ? ' — ' + esc(c.role) : ''} (${esc(WEIGHTS[c.weight] || '')}) · ${top3(pp.scores).map(label).join(', ')}</li>`; }).join('');
  const objections = (M.objections || []).slice(0, 6);
  return `<h1>${esc(S.client.company || t('Client'))} — ${esc(S.product.name || '')}</h1>
    <div class="pgrid">
      <div>${P.row(t('Objectif'), S.objective.primary)}${P.row(t('Repli'), S.objective.fallback)}<b>${t('Interlocuteurs')}</b><ul>${people}</ul>${(S.persona.tensions || []).length ? `<b>${t('Tensions entre interlocuteurs')}</b>${P.ul(S.persona.tensions)}` : ''}</div>
      <div><div class="pbox"><b>${t('Message principal')}</b><br>${P.text(S.persona.main_message)}</div>${P.row(t('Ouverture (20 premières secondes)'), M.opening)}</div>
    </div>
    <div class="pgrid"><div><b>${t('Questions de découverte')}</b>${P.ul((b.questions_to_ask || []).slice(0, 8))}</div><div><b>${t('Avantages — chacun reformule un besoin')}</b>${P.ul(M.advantages)}</div></div>
    ${objections.length ? `<table class="ptable"><thead><tr><th>${t('Objection')}</th><th>${t('Accueillir → creuser → répondre → relancer')}</th></tr></thead><tbody>${objections.map((o) => `<tr><td>${o.who ? `<i>${esc(o.who)}</i> ` : ''}${esc(o.objection)}</td><td>${esc(o.response)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${P.row(t('Conclusion — question, deux options, étape suivante'), M.conclusion)}
    <p class="note">${t('Ne repartez jamais sans une date et le nom du décideur.')} ${t('Action convenue : ____________________ · Qui : ________ · Quand : ________')}</p>`;
}
/** Dossier complet : les étapes choisies, une par page, puis la liste des sources consultées. */
function printFull({ sections, sources }) {
  const parts = PRINT_SECTIONS.filter((k) => sections.includes(k)).map((k) => `<section class="print-section">${printViews[k]()}</section>`);
  if (sources) parts.push(`<section class="print-section"><h1>${t('Sources consultées')}</h1>${printSources()}</section>`);
  return parts.join('') || `<p class="note">${t('Aucune étape choisie.')}</p>`;
}
function printSources() {
  const groups = [[t('Offre'), S.offer?.sources || []], [t('Marché'), S.market?.sources || []], [t('Client'), S.sources || []]];
  const rows = groups.flatMap(([g, list]) => activeSources(list).map((x) => `<tr><td>${esc(g)}</td><td>${esc(sourceName(x))}</td><td>${/^https?:/.test(x.source) ? `<a href="${esc(x.source)}">${esc(x.source)}</a>` : esc(sourceKind(x.kind))}</td><td>${esc(localDay(x.retrievedAt) || '')}</td></tr>`));
  return rows.length ? `<table class="ptable"><thead><tr><th>${t('Étape')}</th><th>${t('Source')}</th><th>${t('Adresse / type')}</th><th>${t('Consultée le')}</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : `<p class="note">${t('Aucune source conservée.')}</p>`;
}
let savedTitle = document.title, printing = false;
window.addEventListener('beforeprint', () => {
  const step = printViews[S.step] ? S.step : 'offer';
  const mode = printMode?.mode === 'sheet' || printMode?.mode === 'full' ? printMode.mode : 'step';
  if (!printing) { savedTitle = document.title; printing = true; } // l'événement peut être émis deux fois
  document.title = `${S.date}_simac_prep_${mode === 'sheet' ? 'fiche' : mode === 'full' ? 'dossier' : STEP_SLUG[step]}`; // nom de fichier proposé par « Enregistrer en PDF »
  $('#print-view')?.remove();
  const who = [S.client.company, contacts().map((c, i) => contactLabel(c, i)).join(', ')].filter(Boolean).join(' — ');
  const v = document.createElement('div'); v.id = 'print-view'; v.className = 'print-' + mode;
  const docTitle = mode === 'sheet' ? t('Fiche 1 page') : mode === 'full' ? t('Dossier complet') : STEP_TITLES[step];
  v.innerHTML = `<div class="print-head"><b>SIMAC Prep, ${esc(docTitle)}.</b> ${[S.product.name, who, S.date].filter(Boolean).map(esc).join(', ')}</div>
    ${mode === 'sheet' ? printSheet() : mode === 'full' ? printFull(printMode) : printViews[step]()}
    <div class="print-foot"><p class="print-credit">${t('Ce document a été préparé avec <b>SIMAC Prep</b> (simac.avapmo.com), un outil AVApmo (adp.avapmo.com). Contact : {contact}.', { contact: esc(CONFIG.contact) })}</p>
      <p>${t('Outil fourni « tel quel », sans garantie ni responsabilité sur les informations produites (y compris par l’IA) : à utiliser sous votre propre responsabilité.')}</p></div>`;
  document.body.appendChild(v);
});
window.addEventListener('afterprint', () => { $('#print-view')?.remove(); document.title = savedTitle; printing = false; printMode = null; });

// ----------------------------------------------------------------------------- accueil + conditions
function showGate(readOnly = false) {
  const g = $('#gate'); g.hidden = false;
  $('#gate-form').hidden = readOnly; $('#gate-wait').hidden = true;
  if (readOnly) { const close = document.createElement('button'); close.className = 'btn ghost'; close.textContent = t('Fermer'); close.onclick = () => (g.hidden = true); $('#gate-form').after(close); }
  $('#gate-email').required = !!CONFIG.emailRequired;
  $('#gate-email').closest('label').querySelector('input').placeholder = CONFIG.emailRequired ? t('vous@entreprise.fr') : t('vous@entreprise.fr (facultatif)');
}
// Attente de confirmation : la page d'accueil reste fermée tant que le lien du mail n'a pas été ouvert ici.
let resendTimer = null;
function showWaiting(rec, sentAt = Date.now()) {
  $('#gate').hidden = false; $('#gate-form').hidden = true; $('#gate-wait').hidden = false;
  $('#gate-wait-email').textContent = rec.email;
  $('#gate-wait-status').textContent = rec.sent ? '' : t('L’envoi n’a pas pu être vérifié (connexion ?) : utilisez « Renvoyer le mail » si rien n’arrive.');
  $('#gate-already-help').hidden = true;
  throttleResend(sentAt);
}
function throttleResend(sentAt) {
  const btn = $('#gate-resend'); clearInterval(resendTimer);
  const tick = () => {
    const left = Math.ceil((sentAt + 60000 - Date.now()) / 1000);
    if (left > 0) { btn.disabled = true; btn.textContent = t('Renvoyer le mail ({n} s)', { n: left }); }
    else { btn.disabled = false; btn.textContent = t('Renvoyer le mail'); clearInterval(resendTimer); }
  };
  tick(); resendTimer = setInterval(tick, 1000);
}
$('#gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#gate-email').value.trim();
  if (!$('#gate-accept').checked) return ($('#gate-error').textContent = t('Cochez la case pour accepter les conditions.'));
  if ((CONFIG.emailRequired || email) && !isEmail(email)) return ($('#gate-error').textContent = t('Adresse email invalide.'));
  $('#gate-error').textContent = '';
  const btn = $('#gate-form .btn'); btn.disabled = true;
  const rec = await accept({ email });
  btn.disabled = false;
  if (rec.confirmed) $('#gate').hidden = true; else showWaiting(rec);
});
$('#gate-resend').addEventListener('click', async () => {
  const btn = $('#gate-resend'); btn.disabled = true;
  const sent = await resend();
  $('#gate-wait-status').textContent = sent ? t('Mail renvoyé.') : t('L’envoi n’a pas pu être vérifié (connexion ?). Réessayez dans un instant.');
  throttleResend(Date.now());
});
$('#gate-change').addEventListener('click', () => {
  clearInterval(resendTimer);
  const c = getConsent(); $('#gate-email').value = c?.email || '';
  $('#gate-wait').hidden = true; $('#gate-form').hidden = false; $('#gate-email').focus();
});
// Lien de confirmation ouvert dans un autre onglet (webmail) : cet onglet s'ouvre dès que l'accès est enregistré.
// (Pas quand l'accueil n'affiche que les conditions en lecture : formulaire et attente masqués.)
function unlockIfConfirmed(message = t('Adresse confirmée — bienvenue.')) {
  const gateShowsAccess = !$('#gate').hidden && (!$('#gate-wait').hidden || !$('#gate-form').hidden);
  if (!gateShowsAccess || !hasAccepted()) return false;
  clearInterval(resendTimer); $('#gate').hidden = true; toast(message, 4000); return true;
}
window.addEventListener('storage', (e) => { if (e.key === 'simac.consent') unlockIfConfirmed(); });
window.addEventListener('focus', () => unlockIfConfirmed());
$('#gate-already').addEventListener('click', (e) => { e.preventDefault(); if (!unlockIfConfirmed()) $('#gate-already-help').hidden = false; });
$('#show-terms').addEventListener('click', (e) => { e.preventDefault(); showGate(true); });
{
  // Retour du lien de confirmation Buttondown : ?ok=1 (alias ?confirmed=1).
  const params = new URLSearchParams(location.search);
  if (params.has('ok') || params.has('confirmed')) {
    const hadPending = confirmEmail();
    params.delete('ok'); params.delete('confirmed');
    const q = params.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
    toast(hadPending ? t('Adresse confirmée — bienvenue.') : t('Adresse confirmée sur ce navigateur.'), 4000);
  }
  if (hasAccepted()) $('#gate').hidden = true;
  else if (isPending()) { const c = getConsent(); showWaiting(c, Date.parse(c.resentAt || c.at) || 0); }
  else showGate(false);
}

// ----------------------------------------------------------------------------- démarrage
go(S.step || 'offer');
openLinkedMeeting();

function restoreMarket(value) {
  const m = marketDefaults();
  if (!value || typeof value !== 'object') return m;
  for (const k of ['geography', 'query', 'url']) if (typeof value[k] === 'string') m[k] = value[k];
  m.sources = restoreSources(value.sources);
  if (value.comparison && Array.isArray(value.comparison.candidates)) m.comparison = sanitizeComparison(value.comparison, m.sources);
  return m;
}
function restoreSources(value) {
  return (Array.isArray(value) ? value : []).filter(s => s && typeof s.source === 'string' && typeof s.kind === 'string' && typeof s.text === 'string').slice(0, 40).map(s => ({ ...s, text: s.text.slice(0, 6000) }));
}
function restoreResearch(json) {
  if (!json) return;
  try {
    const data = JSON.parse(json); if (data.version !== 1) return;
    if (data.product) S.product = Object.fromEntries(Object.keys(FIELD_LABELS).map(k => [k, String(data.product[k] || '')]));
    S.market = restoreMarket(data.market); S.sources = restoreSources(data.sources);
    if (data.research?.entity && /^\d{9}$/.test(data.research.entity.siren) && /^\d{14}$/.test(data.research.entity.siret)) S.research.entity = data.research.entity;
    for (const k of ['notes', 'meetingFormat', 'decisionProcess', 'location', 'linkedinUrl']) if (typeof data.client?.[k] === 'string') S.client[k] = data.client[k];
    S.client.preparationMode = data.client?.preparationMode === 'email' ? 'email' : 'meeting';
  } catch { /* anciens exports ou recherche illisible : conserver la fiche du CSV */ }
}

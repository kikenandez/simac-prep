// app.js — SIMAC Prep : préparation de rendez-vous commerciaux pour TPE/PME.
// Statique, sans serveur. L'IA est optionnelle et au choix (fournisseurs gratuits, ou mode démo).

import { PROVIDERS, loadSettings, saveSettings, resolve, chatJSON, listModels } from './lib/llm.js';
import { clientBriefMessages, soncasMessages, simacMessages, followupMessages, offerExtractMessages, offerQuestionMessages, offerMaturityMessages, clientExtractMessages, clientQuestionMessages, debriefExtractMessages } from './lib/prompts.js';
import { readUrl, notesSource, mergeSources, activeSources, groundBrief, sourceId, upsertSources, competitorQuery, sanitizeComparison } from './lib/research.js';
import { SONCAS, DEFAULT_SCORES, clampScores, top3, label, packScores, unpackScores, WEIGHTS } from './lib/soncas.js';
import { listMeetings, saveMeeting, deleteMeeting, exportCSV, importCSV, saveDraft, loadDraft, newId, retrieve, COLUMNS } from './lib/store.js';
import { download } from './lib/csv.js';
import { extractText, ACCEPT } from './lib/files.js';
import { hasAccepted, accept, isEmail } from './lib/consent.js';
import { CONFIG } from './config.js';
import { marketDefaults, researchDefaults, mountMarket, mountClientResearch, renderEvidence, citations, clientFingerprint } from './lib/research-ui.js';

const LANG = 'fr';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ----------------------------------------------------------------------------- état
function blank() {
  return {
    id: newId(), date: new Date().toISOString().slice(0, 10), step: 'offer',
    product: { name: '', oneLiner: '', targets: '', problem: '', who: '', nextStep: '', mechanism: '', advantages: '', proofs: '', price: '', floor: '', delays: '', objections: '', constraints: '' },
    offer: { description: '', website: '', linkedin: '', instagram: '', profileText: '', sources: [], chat: [], pendingField: '', maturity: null },
    market: marketDefaults(), research: researchDefaults(),
    client: { preparationMode: 'meeting', location: '', company: '', sector: '', website: '', contacts: [blankContact('decide')], linkedinUrl: '', notes: '', decisionProcess: '', meetingFormat: '' },
    clientChat: { description: '', chat: [], pendingField: '' },
    sources: [], brief: null,
    persona: { people: [blankPerson()], current: 0, main_message: '', tensions: [], gaps: [] },
    objective: { primary: '', fallback: '' },
    simac: null,
    debrief: { outcome: '', objectionsHeard: '', decisionMaker: '', nextAction: '', nextOwner: 'me', nextDue: '', nextOutput: '', notes: '', description: '' },
    followup: null,
  };
}
const MAX_CONTACTS = 3;
function blankContact(weight = 'influence') { return { name: '', role: '', weight }; }
function blankPerson() { return { scores: { ...DEFAULT_SCORES }, aiScores: null, rationale: {}, arguments: {} }; }
/** Interlocuteurs renseignés (nom ou rôle), au plus 3. */
const contacts = () => (S.client.contacts || []).filter((c) => c.name || c.role).slice(0, MAX_CONTACTS);
const contactLabel = (c, i) => c?.name || c?.role || `Personne ${i + 1}`;
const primary = () => S.client.contacts?.[0] || blankContact('decide');
/** Vue compatible pour les prompts et la mémoire : contactName/contactRole = interlocuteur principal. */
const clientView = () => ({ ...S.client, contacts: contacts(), contactName: primary().name, contactRole: primary().role });
let S = loadDraft() || blank();
if (!S.id) S = blank();
// migration : anciens brouillons à un seul interlocuteur / un seul persona
if (!Array.isArray(S.client.contacts)) { S.client.contacts = [{ name: S.client.contactName || '', role: S.client.contactRole || '', weight: 'decide' }]; delete S.client.contactName; delete S.client.contactRole; }
if (!Array.isArray(S.persona.people)) { S.persona = { people: [{ scores: S.persona.scores || { ...DEFAULT_SCORES }, aiScores: S.persona.aiScores || null, rationale: S.persona.rationale || {}, arguments: S.persona.arguments || {} }], current: 0, main_message: S.persona.main_message || '', tensions: [], gaps: S.persona.gaps || [] }; }
while (S.persona.people.length < S.client.contacts.length) S.persona.people.push(blankPerson());
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
  if (!name) { if (!silent) toast('Donnez un nom au produit / service avant d’enregistrer l’offre.'); return false; }
  const all = listOffers(); const rec = { id: S.offerId || newId(), name, savedAt: new Date().toISOString(), ...structuredClone(offerSlot()) };
  const i = all.findIndex((o) => o.id === rec.id || o.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) { rec.id = all[i].id; all[i] = rec; } else all.unshift(rec);
  S.offerId = rec.id;
  try { localStorage.setItem(OFFERS_KEY, JSON.stringify(all)); } catch { if (!silent) toast('Stockage plein : retirez des sources ou des offres.'); return false; }
  persist(); if (!silent) toast(`Offre « ${name} » enregistrée.`); return true;
}
function loadOffer(id) {
  const o = listOffers().find((x) => x.id === id); if (!o) return;
  Object.assign(S, { product: structuredClone(o.product), offer: structuredClone(o.offer), market: structuredClone(o.market || marketDefaults()), offerId: o.id });
  invalidatePreparation(); persist(); renderers.offer(); toast(`Offre « ${o.name} » chargée.`);
}
function deleteOffer(id) {
  localStorage.setItem(OFFERS_KEY, JSON.stringify(listOffers().filter((o) => o.id !== id)));
  if (S.offerId === id) S.offerId = '';
  persist(); renderers.offer();
}
function newOffer() {
  if (!confirm('Nouvelle offre ? La fiche produit, ses sources et la recherche marché sont vidées (l’offre actuelle reste dans « Mes offres » si elle est enregistrée).')) return;
  saveOffer(true);
  const b = blank(); Object.assign(S, { product: b.product, offer: b.offer, market: b.market, offerId: '' });
  invalidatePreparation(); persist(); renderers.offer();
}
function renderOfferBar() {
  const el = $('#offer-bar'); if (!el) return;
  const all = listOffers();
  el.innerHTML = `
    <label>Mes offres <small>— conservées dans ce navigateur ; un nouveau rendez-vous garde l’offre en cours</small></label>
    <div class="actions" style="margin:4px 0 0">
      <select id="offer-pick"><option value="">${all.length ? '— choisir une offre enregistrée —' : '— aucune offre enregistrée —'}</option>${all.map((o) => `<option value="${o.id}" ${o.id === S.offerId ? 'selected' : ''}>${esc(o.name)} · ${esc(o.savedAt.slice(0, 10))}</option>`).join('')}</select>
      <button class="btn ghost small" id="offer-save">Enregistrer l’offre</button>
      <button class="btn ghost small" id="offer-new">Nouvelle offre</button>
      ${S.offerId && all.some((o) => o.id === S.offerId) ? '<button class="btn danger small" id="offer-del" title="Retirer de Mes offres">×</button>' : ''}
    </div>`;
  $('#offer-pick').onchange = (e) => { if (e.target.value) loadOffer(e.target.value); };
  $('#offer-save').onclick = () => { saveOffer(); renderOfferBar(); };
  $('#offer-new').onclick = newOffer;
  $('#offer-del')?.addEventListener('click', () => { if (confirm('Retirer cette offre de Mes offres ? (la fiche en cours reste affichée)')) deleteOffer(S.offerId); });
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
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
}
async function busy(btn, fn) {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${old}`;
  try { return await fn(); }
  catch (e) { console.error(e); toast(friendlyError(e), 6000); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}
function friendlyError(e) {
  const m = String(e?.message || e);
  if (m === 'NO_API_KEY') return 'Ajoutez une clé API gratuite dans Réglages (ou choisissez le mode démo).';
  if (m.startsWith('LLM_HTTP_401') || m.startsWith('LLM_HTTP_403')) return 'Clé API refusée. Vérifiez-la dans Réglages.';
  if (m.startsWith('LLM_HTTP_429')) return 'Quota gratuit atteint : patientez une minute ou changez de fournisseur.';
  if (m.startsWith('LLM_HTTP_404') && /model/i.test(m)) return 'Modèle introuvable chez ce fournisseur : dans Réglages, cliquez « Lister les modèles » et choisissez-en un.';
  if (m.includes('Failed to fetch')) return 'Réseau ou CORS bloqué. Pour Ollama : lancez-le avec OLLAMA_ORIGINS="*".';
  if (e instanceof SyntaxError) return 'Réponse IA illisible (JSON). Relancez, ou changez de modèle.';
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
const field = (bind, lbl, { hint = '', type = 'input', full = false, placeholder = '' } = {}) =>
  `<div class="${full ? 'full' : ''}"><label>${lbl} ${hint ? `<small>— ${hint}</small>` : ''}</label>
   ${type === 'textarea' ? `<textarea data-bind="${bind}" placeholder="${esc(placeholder)}"></textarea>` : `<input data-bind="${bind}" placeholder="${esc(placeholder)}">`}</div>`;

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
  const cfg = resolve();
  $('#provider-badge').textContent = cfg.provider === 'mock' ? 'Mode démo (sans IA)' : `${PROVIDERS[cfg.provider]?.label.split(' (')[0]} · ${cfg.model}`;
}
$('#steps').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.step); });
$('#btn-new').addEventListener('click', () => {
  if (!confirm('Nouveau rendez-vous ? L’offre est conservée (et enregistrée dans « Mes offres »), le reste est réinitialisé (pensez à enregistrer le RDV dans Suivi).')) return;
  saveOffer(true);
  const product = S.product, offer = S.offer, market = S.market, offerId = S.offerId; S = blank(); Object.assign(S, { product, offer, market, offerId }); persist(); go('client');
});

// ----------------------------------------------------------------------------- 1. OFFRE
const renderers = {};
const FIELD_LABELS = { name: 'Produit / service', oneLiner: 'En une phrase', targets: 'Cibles', problem: 'Problème de chaque cible', who: 'Qui parle', nextStep: 'Étape suivante voulue', mechanism: 'Mécanisme', advantages: 'Avantages', proofs: 'Preuves', price: 'Prix', floor: 'Plancher', delays: 'Délais et conditions', objections: 'Objections attendues', constraints: 'Contraintes' };
const MATURITY = { 1: 'Encore une idée à travailler', 2: 'Ébauche', 3: 'Offre définie', 4: 'Prête à tester', 5: 'Prête à la présentation' };
const VERDICT = { 1: 'travailler l’offre', 2: 'travailler l’offre', 3: 'prêt pour des réunions à blanc', 4: 'prêt pour la vente', 5: 'prêt pour la vente' };
function verdictBanner() {
  const M = S.offer?.maturity;
  if (!M) return '<div class="card warn"><b>Maturité de l’offre non évaluée.</b> L’IA n’invente rien : ce que la fiche ne contient pas n’apparaîtra pas. Lancez « Analyser la maturité » à l’étape 1 pour connaître l’avis de l’outil.</div>';
  const v = M.verdict || VERDICT[M.score];
  if (/vente/.test(v)) return '';
  const hint = /travailler/.test(v) ? 'Des trous dans la fiche empêchent d’argumenter sans inventer — complétez l’offre avant un vrai rendez-vous.' : 'Utilisez ce rendez-vous comme un entraînement ; complétez les manques signalés avant de vendre.';
  return `<div class="card warn"><b>Avis de l’outil : ${esc(v)}</b> (${M.score}/5). ${hint}</div>`;
}

renderers.offer = () => {
  const O = S.offer;
  $('#main').innerHTML = `
    <h1>1 · Votre offre</h1>
    <p class="lead">Décrivez votre produit ou service avec vos mots ; l’IA remplit la fiche, pose les questions qui manquent et mesure la maturité de l’offre. Ne rien inventer — ce qui manque est un trou à combler.</p>
    <div class="card soft" id="offer-bar"></div>

    <div class="card">
      <h2>Décrire</h2>
      <div class="grid">
        ${field('offer.description', 'Texte libre', { hint: 'ce que vous vendez, à qui, comment, à quel prix — comme vous le diriez à un ami', type: 'textarea', full: true, placeholder: 'Ex. : J’accompagne des artisans pendant 3 mois pour qu’ils signent plus de devis. On commence par…' })}
        ${field('offer.website', 'Site web', { hint: 'lu automatiquement', placeholder: 'exemple.fr' })}
        ${field('offer.linkedin', 'Page LinkedIn / Instagram / autre', { hint: 'URL ; si la lecture échoue, collez le texte ci-dessous', placeholder: 'linkedin.com/in/… ou instagram.com/…' })}
        ${field('offer.profileText', 'Texte collé', { hint: 'profil LinkedIn, bio Instagram, plaquette, mail… (LinkedIn et Instagram bloquent la lecture automatique)', type: 'textarea', full: true })}
      </div>
      <div class="actions">
        <button class="btn ghost" id="offer-fetch">Lire les pages</button>
        <label class="btn ghost" style="margin:0">Joindre plaquette / mail / image <input type="file" id="offer-files" accept="${ACCEPT}" multiple hidden></label>
        <span class="note" id="offer-src">${O.sources.length} source(s)</span>
      </div>
      <div id="offer-sources"></div>
      <div class="actions"><button class="btn" id="offer-extract">Analyser avec l’IA → remplir la fiche</button></div>
      <div id="offer-notes" class="note"></div>
    </div>

    <h2>Fiche produit</h2>
    <div id="offer-gaps" class="gaps"></div>
    <div class="grid">
      ${field('product.name', 'Produit / service')}
      ${field('product.oneLiner', 'En une phrase, sans jargon', { placeholder: 'Ex. : un accompagnement de 3 mois pour structurer la prospection' })}
      ${field('product.targets', 'Cibles', { hint: 'qui achète / qui utilise / qui décide', type: 'textarea' })}
      ${field('product.problem', 'Problème de chaque cible', { hint: 'avec ses mots', type: 'textarea' })}
      ${field('product.who', 'Qui parle', { hint: 'vous / la marque en une phrase' })}
      ${field('product.nextStep', 'Étape suivante voulue', { hint: 'le « petit oui » : essai, RDV, devis…' })}
      ${field('product.mechanism', 'Mécanisme', { hint: '3 à 5 étapes : qui fait quoi, quand, comment', type: 'textarea' })}
      ${field('product.advantages', 'Avantages', { hint: '≥ 3, tangibles et intangibles', type: 'textarea' })}
      ${field('product.proofs', 'Preuves', { hint: 'chiffres, références, témoignages', type: 'textarea' })}
      ${field('product.objections', 'Objections attendues', { hint: '5 à 10', type: 'textarea' })}
      ${field('product.price', 'Prix', { hint: 'et unité qui parle au client' })}
      ${field('product.floor', 'Plancher', { hint: 'limite basse, gratuités max' })}
      ${field('product.delays', 'Délais et conditions')}
      ${field('product.constraints', 'Contraintes', { hint: 'réglementation, ton, décisions prises' })}
    </div>

    <div id="market-research"></div>

    <div class="card" id="offer-chat-card">
      <h2>Compléter par questions</h2>
      <p class="note">L’IA pose une question à la fois sur ce qui manque ; votre réponse remplit le champ correspondant.</p>
      <div id="offer-chat"></div>
    </div>

    <div class="card">
      <h2>Maturité de l’offre</h2>
      <div class="actions" style="margin-top:0"><button class="btn ghost" id="offer-maturity">Analyser la maturité (1 à 5)</button></div>
      <div id="offer-maturity-out"></div>
    </div>

    <div class="actions"><button class="btn" id="next">Continuer → Client</button>
      <button class="btn ghost small" id="export-offer">Exporter la fiche (JSON)</button>
      <label class="btn ghost small" style="margin:0">Importer <input type="file" id="import-offer" accept=".json" hidden></label></div>`;
  bindInputs($('#main'), S.product, 'product');
  bindInputs($('#main'), O, 'offer');
  renderOfferBar();
  renderGaps({ el: $('#offer-gaps'), obj: S.product, keys: OFFER_KEY_ORDER, labels: FIELD_LABELS, chatCard: '#offer-chat', prefix: 'product' });
  renderGuidedChat({ el: $('#offer-chat'), state: O, target: S.product, build: offerQuestionMessages, step: 'offer', onFilled: () => { O.maturity = null; S.market.comparison = null; invalidatePreparation(); } });
  renderMaturity();
  mountMarket($('#market-research'), () => S, { save: persist, invalidate: invalidatePreparation, busy, toast });
  renderSourceList($('#offer-sources'), O.sources, () => { persist(); renderers.offer(); });
  $('#offer-files').onchange = (e) => addFiles(e.target.files, O.sources, () => { persist(); renderers.offer(); });

  $('#offer-fetch').onclick = (e) => busy(e.target, async () => {
    const urls = [O.website, O.linkedin].filter(Boolean);
    if (!urls.length) return toast('Indiquez au moins une URL.');
    const jinaKey = loadSettings().jinaKey || '';
    let n = 0;
    for (const u of urls) {
      try { const src = await readUrl(u, { jinaKey }); O.sources = O.sources.filter((x) => x.source !== src.source); O.sources.push(src); n++; }
      catch (err) { toast(/linkedin|instagram/i.test(u) ? 'Ce site bloque la lecture automatique : collez le texte du profil dans « Texte collé ».' : friendlyError(err), 6000); }
    }
    persist(); if ($('#offer-src')) $('#offer-src').textContent = `${O.sources.length} source(s)`; renderSourceList($('#offer-sources'), O.sources, () => { persist(); renderers.offer(); });
    if (n) toast(`${n} page(s) lue(s).`);
  });

  $('#offer-extract').onclick = (e) => busy(e.target, async () => {
    if (!O.description.trim() && !O.sources.length && !O.profileText.trim()) return toast('Décrivez votre offre ou ajoutez une source.');
    const all = [...O.sources]; if (O.profileText.trim()) all.push(notesSource(O.profileText, 'profil'));
    const r = await chatJSON(offerExtractMessages({ lang: LANG, description: O.description, sources: mergeSources(all), current: S.product }));
    const f = r.fields || {}; let filled = 0, kept = 0;
    for (const k of Object.keys(FIELD_LABELS)) {
      const v = String(f[k] || '').trim(); if (!v) continue;
      if (!String(S.product[k] || '').trim()) { S.product[k] = v; filled++; } else if (S.product[k] !== v) kept++;
    }
    if (kept && confirm(`${kept} champ(s) déjà remplis ont une nouvelle proposition. Les remplacer ? (Annuler = garder vos valeurs)`)) {
      for (const k of Object.keys(FIELD_LABELS)) { const v = String(f[k] || '').trim(); if (v) S.product[k] = v; }
      filled += kept;
    }
    O.maturity = null; S.market.comparison = null; invalidatePreparation(); persist(); markDone();
    if (S.step !== 'offer') return;
    renderers.offer();
    const notes = [r.notes, (r.missing || []).length ? 'Manque : ' + r.missing.map((k) => FIELD_LABELS[k] || k).join(', ') + ' → utilisez « Compléter par questions ».' : ''].filter(Boolean).join(' ');
    $('#offer-notes').textContent = notes;
    toast(`${filled} champ(s) rempli(s).`);
  });

  $('#offer-maturity').onclick = (e) => busy(e.target, async () => {
    if (!S.product.oneLiner && !S.product.name) return toast('Remplissez au moins le nom et la phrase.');
    const r = await chatJSON(offerMaturityMessages({ lang: LANG, current: S.product }));
    O.maturity = { ...r, score: Math.min(5, Math.max(1, Number(r.score) || 1)) };
    persist(); if (S.step === 'offer') renderMaturity();
  });

  $('#next').onclick = () => go('client');
  $('#export-offer').onclick = () => download('fiche-offre.json', JSON.stringify({ version: 2, product: S.product, market: S.market }, null, 2), 'application/json');
  $('#import-offer').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const data = JSON.parse(await f.text()); const product = data.product || data;
      S.product = Object.fromEntries(Object.keys(FIELD_LABELS).map(k => [k, String(product[k] || '')]));
      S.market = restoreMarket(data.market); invalidatePreparation(); persist(); renderers.offer(); toast('Fiche importée.'); }
    catch { toast('Fichier illisible.'); }
  };
};

async function addFiles(files, list, done) {
  let n = 0;
  for (const f of files) {
    try { const src = await extractText(f, (msg) => toast(msg, 20000)); const i = list.findIndex((x) => x.source === src.source); if (i >= 0) list[i] = src; else list.push(src); n++; if (src.ocr) toast(`${f.name} : texte reconnu optiquement — relisez-le avant d’analyser.`, 6000); }
    catch (err) { toast(friendlyError(err), 6000); }
  }
  if (n) toast(`${n} document(s) lu(s).`);
  done();
}
function renderSourceList(el, list, onChange) {
  if (!el) return;
  el.innerHTML = list.map((s, i) => `<div class="card" style="margin:8px 0;padding:10px 14px"><b>${esc(s.kind)}</b> — ${esc(s.title || s.source)}${s.truncated ? ' <small class="muted">(tronqué)</small>' : ''}
    <button class="btn ghost small" style="float:right" data-rm="${i}">retirer</button><div class="note" style="margin-top:4px">${esc(s.text.slice(0, 200))}…</div></div>`).join('');
  $$('[data-rm]', el).forEach((b) => (b.onclick = () => { list.splice(+b.dataset.rm, 1); onChange(); }));
}

/** Dialogue guidé générique : l'IA pose une question par champ vide ; la réponse remplit le champ. */
// Ordre d'importance pour vendre (le même que les questions guidées) ; les 7 premiers sont « essentiels ».
const OFFER_KEY_ORDER = ['oneLiner', 'targets', 'problem', 'nextStep', 'mechanism', 'advantages', 'proofs', 'price', 'objections', 'name', 'who', 'floor', 'delays', 'constraints'];
const OFFER_ESSENTIAL = 9;
/** Indicateur de complétude : X / N remplis, ce qui manque, et un raccourci vers les questions. Se met à jour à la saisie. */
function renderGaps({ el, obj, keys, labels, chatCard, prefix, filled }) {
  if (!el) return;
  const isFilled = filled || ((k) => !!String(obj[k] || '').trim());
  const draw = () => {
    const missing = keys.filter((k) => !isFilled(k));
    const essential = prefix === 'product' ? keys.slice(0, OFFER_ESSENTIAL).filter((k) => !isFilled(k)) : missing;
    const n = keys.length - missing.length;
    el.className = 'gaps ' + (essential.length ? 'warn' : 'ok');
    el.innerHTML = essential.length
      ? `<b>${n} / ${keys.length} champs remplis.</b> Il manque pour vendre : ${essential.map((k) => `<span class="gap">${esc(labels[k] || k)}</span>`).join(' ')}
         <button class="btn small gaps-go">Compléter par questions ↓</button>`
      : `<b>${n} / ${keys.length} champs remplis.</b> L’essentiel y est${missing.length ? ` — reste facultatif : ${missing.map((k) => labels[k] || k).join(', ')}` : ''}.`;
    $$('[data-bind]', $('#main')).forEach((inp) => { const k = inp.dataset.bind.split('.')[1]; if (inp.dataset.bind.startsWith(prefix + '.') && keys.includes(k)) inp.classList.toggle('empty', !isFilled(k)); });
    $('.gaps-go', el)?.addEventListener('click', () => { const card = $(chatCard); card?.scrollIntoView({ block: 'center', behavior: 'smooth' }); $('.chat-start', card)?.click(); });
  };
  draw();
  $$(`[data-bind^="${prefix}."]`, $('#main')).forEach((inp) => inp.addEventListener('input', draw));
  if (prefix === 'client') $('#contacts')?.addEventListener('input', draw);
}
const CHAT_MAX = { offer: 7, client: 4 }; // questions par série : au-delà, on s'arrête — le reste se remplit à la main
function renderGuidedChat({ el, state, target, build, step, onFilled }) {
  if (!el) return;
  state.skipped ||= [];
  const max = CHAT_MAX[step] || 6;
  const asked = state.chat.filter((m) => m.role === 'ai' && m.field).length;
  const log = state.chat.map((m) => `<div class="chat-msg ${m.role}"><span>${esc(m.text)}</span></div>`).join('');
  const last = state.chat[state.chat.length - 1];
  const waiting = last && last.role === 'ai' && state.pendingField;
  const over = asked >= max && !waiting;
  el.innerHTML = `
    <div class="chat-log">${log || '<div class="note">Aucune question pour l’instant.</div>'}</div>
    ${waiting ? `<div class="chat-input"><textarea class="chat-answer" rows="2" placeholder="Votre réponse…"></textarea>
      <button class="btn chat-send">Répondre</button><button class="btn ghost small chat-skip" title="Je ne sais pas / plus tard">Passer</button></div>` : ''}
    <div class="actions" style="margin-bottom:0">
      ${over ? '<span class="note">Série terminée : le reste se complète à la main dans la fiche, ou relancez une série.</span>' : `<button class="btn ghost chat-start">${state.chat.length ? 'Question suivante' : 'Commencer les questions'}</button>`}
      <span class="note">${asked} / ${max} question${max > 1 ? 's' : ''}</span>
      ${state.chat.length ? '<button class="btn ghost small chat-reset">Nouvelle série</button>' : ''}
    </div>`;
  const transcript = () => state.chat.map((m) => `${m.role === 'ai' ? 'IA' : 'Vous'} : ${m.text}`).join('\n');
  const finish = (text) => { state.pendingField = ''; state.chat.push({ role: 'ai', text }); };
  const ask = async (btn, lastField, lastAnswer) => busy(btn, async () => {
    const r = await chatJSON(build({ lang: LANG, current: target, transcript: transcript(), lastField, lastAnswer, skipped: state.skipped }));
    if (lastField && r.field_value) { target[lastField] = r.field_value; onFilled?.(lastField); }
    const n = state.chat.filter((m) => m.role === 'ai' && m.field).length;
    if (r.done || !r.question) finish('La fiche est complète sur l’essentiel.');
    else if (n >= max) finish(`${max} questions : on s’arrête là. Complétez le reste directement dans la fiche.`);
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
    state.chat.push({ role: 'user', text: '(passé)' }); state.pendingField = '';
    ask(e.target, '', '');
  });
}

function renderMaturity() {
  const el = $('#offer-maturity-out'); if (!el) return;
  const M = S.offer.maturity; if (!M) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="maturity">
      <div class="gauge">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= M.score ? 'on' : ''}"></span>`).join('')}</div>
      <div><b>${M.score} / 5 — ${esc(M.label || MATURITY[M.score])}</b> <span class="verdict v${M.score}">${esc(M.verdict || VERDICT[M.score])}</span><div class="note">${esc(M.summary)}</div></div>
    </div>
    <div class="grid" style="margin-top:12px">
      <div><h3>Points forts</h3><ul class="plain">${(M.strengths || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div><h3>Ce qui bloque la vente</h3><ul class="plain">${(M.gaps || []).map((g) => `<li><b>${esc(FIELD_LABELS[g.field] || g.field)}</b> — ${esc(g.why)} <i>→ ${esc(g.fix)}</i></li>`).join('')}</ul></div>
    </div>
    <div class="card soft" style="margin-bottom:0"><b>À faire avant le prochain rendez-vous :</b> ${esc(M.next_step)}</div>`;
}

// ----------------------------------------------------------------------------- 2. CLIENT
const CLIENT_LABELS = { company: 'Entreprise / établissement', sector: 'Secteur', website: 'Site web', contacts: 'Interlocuteurs', meetingFormat: 'Format du rendez-vous', decisionProcess: 'Processus de décision', notes: 'Notes' };

renderers.client = () => {
  const C = S.clientChat;
  $('#main').innerHTML = `
    <h1>2 · Se renseigner sur le client</h1>
    <p class="lead">Qui je vais voir, dans quel cadre, quel est son problème, pourquoi sa décision compte. Décrivez librement ; l’IA remplit la fiche, pose les questions qui manquent, lit les sources et prépare la fiche client.</p>

    <div class="card">
      <h2>Décrire</h2>
      ${field('clientChat.description', 'Texte libre', { hint: 'l’interlocuteur, l’établissement, le rendez-vous (mail, visio, sur place, salon…), ce que vous savez déjà', type: 'textarea', full: true, placeholder: 'Ex. : Rendez-vous jeudi sur place avec la directrice d’un collège privé du 15e, 30 min. Elle veut un projet innovant pour la 3e mais le budget est serré…' })}
      <div class="actions">
        <label class="btn ghost" style="margin:0">Joindre un mail / document <input type="file" id="client-files" accept="${ACCEPT}" multiple hidden></label>
        <button class="btn" id="client-extract">Analyser avec l’IA → remplir la fiche</button><span class="note" id="client-notes"></span></div>
    </div>

    <h2>Fiche client</h2>
    <div id="client-gaps" class="gaps"></div>
    <div class="grid">
      ${field('client.company', 'Entreprise / établissement')}
      ${field('client.sector', 'Secteur / activité')}
      ${field('client.location', 'Commune / pays', { placeholder: 'Paris, France' })}
      <div><label>Je prépare</label><select data-bind="client.preparationMode"><option value="meeting">Un rendez-vous</option><option value="email">Un email (premier destinataire ci-dessous)</option></select></div>
      <div class="full"><label>Interlocuteurs / destinataires <small>— jusqu’à ${MAX_CONTACTS} ; au-delà, un rendez-vous se prépare autrement (une personne relais, puis un second rendez-vous)</small></label>
        <div id="contacts"></div></div>
      ${field('client.meetingFormat', 'Format du rendez-vous', { hint: 'mail, visio, sur place, salon ; date, durée', full: true })}
      ${field('client.website', 'Site web', { placeholder: 'exemple.fr' })}
      ${field('client.linkedinUrl', 'Autre URL utile', { hint: 'page équipe, article, annonce…' })}
      ${field('client.notes', 'Notes collées', { hint: 'profil LinkedIn, mail reçu, ce que vous savez déjà', type: 'textarea', full: true })}
      ${field('client.decisionProcess', 'Processus de décision connu', { hint: 'qui d’autre, quand, budget', full: true })}
    </div>

    <div class="card">
      <h2>Compléter par questions</h2>
      <p class="note">L’IA pose une question à la fois sur ce qui manque ; votre réponse remplit le champ correspondant.</p>
      <div id="client-chat"></div>
    </div>

    <div id="client-research"></div>
    <h2>Sources et fiche client</h2>
    <p class="note">Seules les sources cochées sont utilisées. Vérifiez leur pertinence pour ce client et chaque interlocuteur.</p>
    <div class="actions">
      <button class="btn ghost" id="fetch">Lire les pages</button>
      <span class="note" id="src-count">${S.sources.length} source(s) collectée(s)</span>
    </div>
    <div id="sources"></div>
    <div class="actions"><button class="btn" id="brief">Préparer ce rendez-vous / cet email avec l’IA</button></div>
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
    if (!C.description.trim()) return toast('Décrivez d’abord l’interlocuteur et le rendez-vous.');
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
    $('#client-notes').textContent = (r.missing || []).length ? 'Manque : ' + r.missing.map((k) => CLIENT_LABELS[k] || k).join(', ') + ' → « Compléter par questions ».' : '';
    toast(`${filled} champ(s) rempli(s).`);
  });
  $('#fetch').onclick = (e) => busy(e.target, async () => {
    const urls = [S.client.website, S.client.linkedinUrl].filter(Boolean);
    if (!urls.length) return toast('Indiquez au moins une URL.');
    const state = S, fingerprint = clientFingerprint(S);
    const jinaKey = loadSettings().jinaKey || '';
    for (const u of urls) {
      try {
        const src = await readUrl(u, { jinaKey });
        if (S !== state || clientFingerprint(S) !== fingerprint) return;
        src.included = false; S.sources = upsertSources(S.sources, [src]);
      } catch (err) { toast(friendlyError(err), 5000); }
    }
    if (S !== state || clientFingerprint(S) !== fingerprint) return;
    invalidatePreparation(); persist(); renderSources();
  });
  $('#brief').onclick = (e) => busy(e.target, async () => {
    if (!S.client.company && !primary().name) return toast('Indiquez au moins l’entreprise.');
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
      <input data-ck="name" placeholder="${i === 0 ? 'Nom, ou fonction si inconnu' : 'Nom ou fonction'}" value="${esc(c.name)}">
      <input data-ck="role" placeholder="Fonction / rôle dans la décision" value="${esc(c.role)}">
      <select data-ck="weight">${Object.entries(WEIGHTS).map(([k, v]) => `<option value="${k}" ${c.weight === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      ${list.length > 1 ? `<button class="btn ghost small" data-rm-contact="${i}" title="Retirer">×</button>` : '<span></span>'}
    </div>`).join('') +
    (list.length < MAX_CONTACTS ? `<button class="btn ghost small" id="add-contact">+ Ajouter une personne (${list.length}/${MAX_CONTACTS})</button>` : `<span class="note">${MAX_CONTACTS} personnes : c’est le maximum pour un rendez-vous préparé finement.</span>`);
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
  $('#src-count').textContent = `${activeSources(S.sources).length} / ${S.sources.length} source(s) incluse(s)`;
  renderEvidence(el, S.sources, () => { invalidatePreparation(); persist(); renderSources(); });
}
function renderBrief() {
  const el = $('#brief-out'); if (!el) return;
  const b = S.brief; if (!b) { el.innerHTML = ''; return; }
  const evidence = [...S.sources, notesSource(S.client.notes || ''), { id: 'client', source: 'Saisie utilisateur', kind: 'notes', text: 'Client' }, { id: 'history', source: 'Historique local (à reconfirmer)', kind: 'history', text: 'Historique' }];
  const li = (arr) => (Array.isArray(arr) ? arr : []).map(x => `<li>${typeof x === 'string' ? esc(x) : `${esc(x.fact)} ${x.date ? esc(x.date) : ''} — ${citations(x.source_ids, evidence)}`}</li>`).join('');
  el.innerHTML = `
    <div class="card">
      <h2>Fiche client</h2>
      <p><b>Entreprise.</b> ${esc(b.company_summary)}</p>
      <p><b>${contacts().length > 1 ? 'Interlocuteurs' : 'Interlocuteur·rice'}.</b> ${esc(b.contact_summary)}</p>
      <p><b>Enjeu.</b> ${esc(b.stakes)}</p>
      <h3>Problèmes possibles à vérifier</h3><ul class="plain">${li(b.likely_problems)}</ul>
      <div class="grid"><div><h3>Faits (sourcés)</h3><ul class="plain">${li(b.facts)}</ul></div>
      <div><h3>Hypothèses à vérifier</h3><ul class="plain">${li(b.assumptions)}</ul></div></div>
      ${(b.participants || []).map(p => `<div class="card soft"><h3>${esc(p.name)}</h3><p>${esc(p.documented_role)} — ${esc(p.identity_check)}</p><p>À explorer : ${esc(p.hypothesis)}</p><p><b>Question :</b> ${esc(p.question)}</p><p class="note">${citations(p.source_ids, evidence)}</p></div>`).join('')}
      ${(b.signals || []).map(s => `<p><b>${esc(s.fact)}</b><br>${esc(s.relevance)}<br>Question : ${esc(s.question)}<br>${citations(s.source_ids, evidence)}</p>`).join('')}
      ${(b.competitive_context || []).length ? `<h3>Comparaisons à préparer</h3><ul>${li(b.competitive_context)}</ul>` : ''}
      ${b.preparation ? `<h3>${S.client.preparationMode === 'email' ? 'Email de prise de contact' : 'Ouverture du rendez-vous'}</h3><p>${esc(b.preparation.opening)}</p>${S.client.preparationMode === 'email' ? `<label>Objet<input id="prep-email-subject" value="${esc(b.preparation.email_subject)}"></label><label>Email à relire<textarea id="prep-email-body">${esc(b.preparation.email_body)}</textarea></label><button class="btn ghost small" id="copy-prep-email">Copier l’email</button>` : ''}` : ''}
      <h3>Questions de découverte</h3><ol class="steps-list">${li(b.questions_to_ask)}</ol>
    </div>
    <div class="actions"><button class="btn" id="to-persona">Continuer → Persona</button></div>`;
  $('#to-persona').onclick = () => go('persona');
  $('#prep-email-subject')?.addEventListener('input', e => { b.preparation.email_subject = e.target.value; persist(); });
  $('#prep-email-body')?.addEventListener('input', e => { b.preparation.email_body = e.target.value; persist(); });
  $('#copy-prep-email')?.addEventListener('click', e => busy(e.currentTarget, async () => { await navigator.clipboard.writeText(`${b.preparation.email_subject}\n\n${b.preparation.email_body}`); toast('Email copié.'); }));
}

// ----------------------------------------------------------------------------- 3. PERSONA SONCAS
const person = () => S.persona.people[S.persona.current] || S.persona.people[0];
renderers.persona = () => {
  const P = S.persona; syncPeople(); const cs = S.client.contacts; const multi = cs.length > 1;
  $('#main').innerHTML = `
    <h1>3 · Persona SONCAS et message principal</h1>
    <p class="lead">Les motivations d’achat à explorer, notées de 1 à 3${multi ? ', pour chacune des personnes présentes' : ''}. L’IA propose d’après la fiche client ; vous corrigez. ${multi ? 'Un seul message principal pour le rendez-vous, calé sur la personne qui décide.' : 'Le message principal se construit sur les 3 motivations les plus fortes.'}</p>
    ${verdictBanner()}
    <div class="actions">
      <button class="btn" id="ai">Proposer avec l’IA</button>
      ${person().aiScores ? '<span class="note">Proposition IA reçue — ajustez les scores si besoin.</span>' : '<span class="note">Sans IA : notez à la main, puis rédigez le message.</span>'}
    </div>
    ${multi ? `<div class="tabs" id="people-tabs">${cs.map((c, i) => `<button class="${i === P.current ? 'on' : ''}" data-p="${i}">${esc(contactLabel(c, i))} <small>· ${WEIGHTS[c.weight] || ''}</small></button>`).join('')}</div>` : ''}
    <div class="persona-grid">
      <div class="card radar-card" id="radar"></div>
      <div class="soncas" id="soncas"></div>
    </div>
    ${(P.tensions || []).length ? `<div class="card warn" style="margin-top:16px"><h3>Tensions entre interlocuteurs</h3><ul class="plain">${P.tensions.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    <div class="card soft" style="margin-top:16px">
      <h3>Message principal${multi ? ` <span class="muted">(pour ${esc(contactLabel(cs.find((c) => c.weight === 'decide') || cs[0], 0))}, qui décide)</span>` : ''} <span class="muted">(top 3 : <span id="top3"></span>)</span></h3>
      <textarea data-bind="persona.main_message" class="main-message" placeholder="1 à 2 phrases, bâties sur les 3 motivations les plus fortes${multi ? ' de la personne qui décide, sans contredire les autres' : ''}"></textarea>
    </div>
    ${(P.gaps || []).length ? `<div class="card"><h3>Ce qui manque à la fiche offre pour ce client</h3><ul class="plain">${P.gaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul><p class="note">Complétez l’offre (étape 1) puis relancez : rien de ceci ne sera inventé.</p></div>` : ''}
    <div class="actions"><button class="btn" id="next">Continuer → SIMAC</button></div>`;
  bindInputs($('#main'), P, 'persona');
  renderSoncas();
  $$('#people-tabs button').forEach((b) => (b.onclick = () => { P.current = +b.dataset.p; persist(); renderers.persona(); }));
  $('#ai').onclick = (e) => busy(e.target, async () => {
    if (!S.brief) return toast('Générez d’abord la fiche client (étape 2).');
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
  const labels = SONCAS.map((d, i) => { const [x, y] = pt(i, 3.55); return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle">${d.label}</text>`; }).join('');
  return `<svg class="radar" viewBox="0 0 300 236" role="img" aria-label="Profil SONCAS">
    ${[1, 2, 3].map((v) => `<polygon points="${ring(v)}" class="ring"/>`).join('')}
    ${SONCAS.map((_, i) => { const [x, y] = pt(i, 3); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="axis"/>`; }).join('')}
    ${aiScores ? `<polygon points="${poly(aiScores)}" class="ai"/>` : ''}
    <polygon points="${poly(scores)}" class="me"/>
    ${SONCAS.map((d, i) => { const [x, y] = pt(i, scores[d.code] || 0); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" class="dot"/>`; }).join('')}
    ${labels}
  </svg>
  <div class="note radar-legend"><span class="sw me"></span> vous ${aiScores ? '<span class="sw ai"></span> proposition IA' : ''}</div>`;
}

/** Au plus trois dimensions à 3 : au-delà, les dernières dans l'ordre S-O-N-C-A-S-E repassent à 2. */
function capThrees(scores) {
  const out = { ...scores }; let n = 0;
  for (const d of SONCAS) if (out[d.code] === 3) { n++; if (n > 3) out[d.code] = 2; }
  return out;
}
function renderSoncas() {
  const P = person(); const t3 = top3(P.scores);
  $('#top3').textContent = t3.map(label).join(' · ');
  if ($('#radar')) $('#radar').innerHTML = soncasRadar(P.scores, P.aiScores);
  $('#soncas').innerHTML = SONCAS.map((d) => `
    <div class="dim ${t3.includes(d.code) ? 'top' : ''}">
      <div><b>${d.label}</b><div class="hint">${d.hint}</div></div>
      <div class="score" data-code="${d.code}">${[1, 2, 3].map((v) => `<button class="${P.scores[d.code] === v ? 'on' : ''}" data-v="${v}">${v}</button>`).join('')}
        ${P.aiScores && P.aiScores[d.code] !== P.scores[d.code] ? `<small class="muted" style="align-self:center">IA : ${P.aiScores[d.code]}</small>` : ''}</div>
      <div>${P.rationale?.[d.code] ? `<div class="note">${esc(P.rationale[d.code])}</div>` : ''}
        ${(P.arguments?.[d.code] || []).length ? `<ul class="args">${P.arguments[d.code].map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}</div>
    </div>`).join('');
  $$('.score button').forEach((b) => (b.onclick = () => {
    const code = b.closest('.score').dataset.code; const v = +b.dataset.v;
    if (v === 3) {
      const threes = SONCAS.map((d) => d.code).filter((c) => c !== code && P.scores[c] === 3);
      if (threes.length >= 3) { const demoted = threes[threes.length - 1]; P.scores[demoted] = 2; toast(`Trois motivations fortes maximum : « ${label(demoted)} » repasse à 2.`); }
    }
    P.scores[code] = v; persist(); renderSoncas();
  }));
}

// ----------------------------------------------------------------------------- 4. SIMAC
renderers.simac = () => {
  $('#main').innerHTML = `
    <h1>4 · Déroulé SIMAC</h1>
    <p class="lead">Situation → Idée → Mécanisme (prix à la fin) → Avantages (chacun reformule un besoin) → Conclusion (une question, deux options, l’étape suivante). Tout est modifiable : c’est votre script.</p>
    ${verdictBanner()}
    <div class="grid">
      ${field('objective.primary', 'Objectif du rendez-vous', { placeholder: 'Ex. : accord pour un essai sur 3 RDV' })}
      ${field('objective.fallback', 'Objectif de repli', { placeholder: 'Ex. : RDV avec le décideur daté' })}
    </div>
    <div class="actions"><button class="btn" id="ai">Rédiger le SIMAC avec l’IA</button></div>
    <div id="simac-out"></div>`;
  bindInputs($('#main'), S.objective, 'objective');
  renderSimac();
  $('#ai').onclick = (e) => busy(e.target, async () => {
    if (!S.brief) return toast('Générez d’abord la fiche client (étape 2).');
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
  if (!M) { el.innerHTML = '<p class="note">Aucun déroulé pour l’instant. Sans IA, vous pouvez créer un canevas vide.</p><button class="btn ghost small" id="blank-simac">Canevas vide</button>';
    $('#blank-simac').onclick = () => { S.simac = { opening: '', situation: '', idea: '', mechanism: ['', '', ''], advantages: ['', '', ''], conclusion: '', objections: [], mistakes_watch: [] }; persist(); renderSimac(); }; return; }
  const ta = (k, v, rows = 2) => `<textarea data-k="${k}" rows="${rows}">${esc(v)}</textarea>`;
  const list = (k, arr) => `<textarea data-k="${k}" data-list rows="${Math.max(3, (arr || []).length + 1)}">${esc((arr || []).join('\n'))}</textarea><div class="note">Une ligne par élément.</div>`;
  el.innerHTML = `
    <div class="card">
      <div class="simac-block"><div class="k">Ouverture (20 premières secondes)</div>${ta('opening', M.opening)}</div>
      <div class="simac-block"><div class="k">Situation</div>${ta('situation', M.situation)}</div>
      <div class="simac-block"><div class="k">Idée</div>${ta('idea', M.idea)}</div>
      <div class="simac-block"><div class="k">Mécanisme — prix en dernier</div>${list('mechanism', M.mechanism)}</div>
      <div class="simac-block"><div class="k">Avantages — chacun reformule un besoin${contacts().length > 1 ? ' · « Pour X : … » par interlocuteur' : ''}</div>${list('advantages', M.advantages)}</div>
      <div class="simac-block"><div class="k">Conclusion — question, deux options, étape suivante</div>${ta('conclusion', M.conclusion)}</div>
    </div>
    <div class="card">
      <h2>Objections probables</h2>
      <table><thead><tr>${contacts().length > 1 ? '<th style="width:14%">Qui</th>' : ''}<th style="width:33%">Objection</th><th>Accueillir → creuser → répondre → relancer</th></tr></thead>
      <tbody>${(M.objections || []).map((o) => `<tr>${contacts().length > 1 ? `<td><small>${esc(o.who || '')}</small></td>` : ''}<td>${esc(o.objection)}</td><td>${esc(o.response)}</td></tr>`).join('') || `<tr><td colspan="${contacts().length > 1 ? 3 : 2}" class="note">—</td></tr>`}</tbody></table>
      ${(M.mistakes_watch || []).length ? `<h3>Erreurs à surveiller dans ce RDV</h3><ul class="plain">${M.mistakes_watch.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    </div>
    ${(M.gaps || []).length ? `<div class="card"><h3>Ce que la fiche offre ne permet pas de dire</h3><ul class="plain">${M.gaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul><p class="note">Rien n’a été inventé pour combler ces points : complétez l’offre (étape 1) et relancez.</p></div>` : ''}
    <div class="card warn"><b>Avant d’entrer :</b> plancher connu · leviers sans remise listés · on ne repart jamais sans <b>une date</b> et <b>le nom du décideur</b>.</div>
    <div class="actions">
      <button class="btn ghost" id="print">Imprimer / PDF</button>
      <button class="btn ghost" id="copy">Copier le script</button>
      <button class="btn" id="next">Après le RDV → Suivi</button>
    </div>`;
  $$('textarea[data-k]', el).forEach((t) => t.addEventListener('input', () => {
    M[t.dataset.k] = t.hasAttribute('data-list') ? t.value.split('\n').map((x) => x.trim()).filter(Boolean) : t.value; persist();
  }));
  $('#print').onclick = () => window.print();
  $('#copy').onclick = () => navigator.clipboard.writeText(simacText()).then(() => toast('Script copié.'));
  $('#next').onclick = () => go('followup');
}
function simacText() {
  const M = S.simac || {};
  return [`RDV ${S.client.company} — ${contacts().map((c, i) => `${contactLabel(c, i)} (${c.role || WEIGHTS[c.weight] || ''})`).join(', ')} — ${S.date}`, `Objectif : ${S.objective.primary} (repli : ${S.objective.fallback})`,
    `Message principal : ${S.persona.main_message}`, ...((S.persona.tensions || []).length ? [`Tensions : ${S.persona.tensions.join(' / ')}`] : []), '', `OUVERTURE\n${M.opening || ''}`, `SITUATION\n${M.situation || ''}`, `IDÉE\n${M.idea || ''}`,
    `MÉCANISME\n${(M.mechanism || []).map((x, i) => `${i + 1}. ${x}`).join('\n')}`, `AVANTAGES\n${(M.advantages || []).map((x) => `- ${x}`).join('\n')}`,
    `CONCLUSION\n${M.conclusion || ''}`, '', 'OBJECTIONS', ...(M.objections || []).map((o) => `- ${o.who ? `[${o.who}] ` : ''}${o.objection}\n  → ${o.response}`)].join('\n');
}

// ----------------------------------------------------------------------------- 5. SUIVI
renderers.followup = () => {
  const D = S.debrief;
  $('#main').innerHTML = `
    <h1>5 · Suivi rapide — centré sur l’appel à l’action</h1>
    <p class="lead">Juste après le rendez-vous : ce qui s’est passé, et surtout l’action convenue (quoi, qui, quand, livrable). Racontez-le librement, l’IA remplit ; puis elle rédige le mail de suivi et vous enregistrez le RDV dans la mémoire.</p>
    <div class="card">
      <h2>Raconter</h2>
      ${field('debrief.description', 'Texte libre', { hint: 'comment ça s’est passé, ce qu’il a dit, ce qui a été convenu et pour quand', type: 'textarea', full: true, placeholder: 'Ex. : Bon accueil, il veut l’avis de sa prof d’histoire avant de décider. Budget déjà engagé cette année. On s’est mis d’accord : je présente 30 min à la prof et à la documentaliste mardi prochain, j’envoie le dossier avant.' })}
      <div class="actions"><button class="btn" id="debrief-extract">Analyser avec l’IA → remplir le débrief</button><span class="note" id="debrief-notes"></span></div>
    </div>
    <div class="grid">
      <div><label>Résultat</label><select data-bind="debrief.outcome">
        <option value="">—</option><option>Vente conclue</option><option>Essai / pilote accepté</option><option>Proposition à envoyer</option>
        <option>RDV décideur à fixer</option><option>Réflexion / relance datée</option><option>Pas de suite</option></select></div>
      ${field('debrief.decisionMaker', 'Décideur (nom)')}
      ${field('debrief.objectionsHeard', 'Objections entendues', { type: 'textarea', full: true })}
      ${field('debrief.nextAction', 'Action convenue', { hint: 'le CTA', placeholder: 'Ex. : envoyer la proposition 2 pages' })}
      <div><label>Responsable</label><select data-bind="debrief.nextOwner"><option value="me">Moi</option><option value="client">Le client</option></select></div>
      <div><label>Échéance</label><input type="date" data-bind="debrief.nextDue"></div>
      ${field('debrief.nextOutput', 'Livrable attendu')}
      ${field('debrief.notes', 'Notes / faits nouveaux', { type: 'textarea', full: true })}
    </div>
    <div class="actions">
      <button class="btn ghost" id="ai">Rédiger le mail de suivi avec l’IA</button>
      <button class="btn" id="save">Enregistrer le RDV dans la mémoire</button>
    </div>
    <div id="fu-out"></div>`;
  bindInputs($('#main'), D, 'debrief');
  renderFollowup();
  $('#ai').onclick = (e) => busy(e.target, async () => {
    if (!D.nextAction) return toast('Indiquez l’action convenue : le mail est construit autour.');
    const fu = await chatJSON(followupMessages({ lang: LANG, product: S.product, client: clientView(), simac: S.simac || {}, debrief: D }));
    S.followup = fu;
    const na = fu.next_action || {};
    if (!D.nextDue && na.due) D.nextDue = na.due;
    persist(); markDone(); if (S.step === 'followup') renderFollowup();
  });
  $('#save').onclick = () => { saveMeeting(toRecord()); toast('Rendez-vous enregistré. Exportez le CSV depuis Historique.'); markDone(); };
  $('#debrief-extract').onclick = (e) => busy(e.target, async () => {
    if (!D.description.trim()) return toast('Racontez d’abord le rendez-vous.');
    const r = await chatJSON(debriefExtractMessages({ lang: LANG, description: D.description, current: D, today: new Date().toISOString().slice(0, 10) }));
    const f = r.fields || {}; let filled = 0;
    for (const k of ['outcome', 'objectionsHeard', 'decisionMaker', 'nextAction', 'nextOwner', 'nextDue', 'nextOutput', 'notes']) {
      const v = String(f[k] || '').trim(); if (v && !String(D[k] || '').trim() || (k === 'nextOwner' && v && D.nextOwner === 'me' && v === 'client')) { D[k] = v; filled++; }
    }
    persist(); markDone(); if (S.step !== 'followup') return;
    renderers.followup();
    $('#debrief-notes').textContent = (r.missing || []).length ? 'Manque : ' + r.missing.join(', ') + ' — complétez à la main avant le mail.' : '';
    toast(`${filled} champ(s) rempli(s).`);
  });
};
function renderFollowup() {
  const el = $('#fu-out'); const F = S.followup; if (!F) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="card"><h2>Mail de suivi</h2>
      <p><b>Objet :</b> ${esc(F.email_subject)}</p>
      <pre class="email" id="email">${esc(F.email_body)}</pre>
      <div class="actions"><button class="btn ghost small" id="copy-mail">Copier</button>
        <a class="btn ghost small" href="mailto:?subject=${encodeURIComponent(F.email_subject || '')}&body=${encodeURIComponent(F.email_body || '')}">Ouvrir dans ma messagerie</a></div>
      ${(F.lessons || []).length ? `<h3>Leçons pour la prochaine fois</h3><ul class="plain">${F.lessons.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
    </div>`;
  $('#copy-mail').onclick = () => navigator.clipboard.writeText(`${F.email_subject}\n\n${F.email_body}`).then(() => toast('Mail copié.'));
}
function toRecord() {
  syncPeople();
  const cs = S.client.contacts; const pp = S.persona.people;
  const sc = pp[0].scores; const M = S.simac || {}; const D = S.debrief;
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
    next_action: D.nextAction, next_owner: D.nextOwner, next_due: D.nextDue, next_output: D.nextOutput,
    lessons: (S.followup?.lessons || []).join(' | '), notes: D.notes,
  };
}

// ----------------------------------------------------------------------------- HISTORIQUE / RAG
renderers.history = () => {
  const all = listMeetings();
  $('#main').innerHTML = `
    <h1>Historique — la mémoire de vos rendez-vous</h1>
    <p class="lead">Chaque RDV enregistré nourrit les prochains : l’IA relit les rendez-vous proches (même client, secteur, offre) avant de rédiger. Le CSV exporté est cette base ; réimportez-le sur un autre poste ou dans un autre outil.</p>
    <div class="actions">
      <button class="btn" id="export" ${all.length ? '' : 'disabled'}>Exporter CSV (${all.length})</button>
      <label class="btn ghost" style="margin:0">Importer CSV <input type="file" id="import" accept=".csv,text/csv" hidden></label>
      <button class="btn ghost small" id="template">Modèle CSV vide</button>
    </div>
    <div class="card">
      <table><thead><tr><th>Date</th><th>Entreprise / contact</th><th>Offre</th><th>Top SONCAS</th><th>Résultat</th><th>Suite</th><th></th></tr></thead>
      <tbody>${all.map((m) => `<tr><td>${esc(m.date)}</td><td><b>${esc(m.company)}</b><br><small>${[[m.contact_name, m.contact_role], [m.contact2_name, m.contact2_role], [m.contact3_name, m.contact3_role]].filter((c) => c[0] || c[1]).map((c) => esc(`${c[0]}${c[1] ? ' — ' + c[1] : ''}`)).join('<br>')}</small></td>
        <td>${esc(m.product)}</td><td>${esc(m.top3)}</td><td>${esc(m.outcome)}</td>
        <td>${esc(m.next_action)}<br><small>${esc(m.next_owner === 'me' ? 'moi' : m.next_owner)} · ${esc(m.next_due)}</small></td>
        <td><button class="btn ghost small" data-load="${m.id}">Ouvrir</button> <button class="btn danger small" data-del="${m.id}">×</button></td></tr>`).join('')
        || '<tr><td colspan="7" class="note">Aucun rendez-vous enregistré.</td></tr>'}</tbody></table>
    </div>`;
  $('#export').onclick = () => download(`simac-rdv-${new Date().toISOString().slice(0, 10)}.csv`, exportCSV());
  $('#template').onclick = () => download('simac-modele.csv', exportCSV([]));
  $('#import').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const n = importCSV(await f.text()); toast(`${n} rendez-vous importé(s).`); renderers.history(); };
  $$('[data-del]').forEach((b) => (b.onclick = () => { if (confirm('Supprimer ce rendez-vous ?')) { deleteMeeting(b.dataset.del); renderers.history(); } }));
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
    Object.assign(S.debrief, { outcome: m.outcome, objectionsHeard: m.objections_heard, decisionMaker: m.decision_maker, nextAction: m.next_action, nextOwner: m.next_owner || 'me', nextDue: m.next_due, nextOutput: m.next_output, notes: m.notes });
    restoreResearch(m.research_json);
    persist(); go('client'); toast('Rendez-vous rechargé (la fiche client et le SIMAC sont à regénérer).');
  }));
};

// ----------------------------------------------------------------------------- RÉGLAGES
renderers.settings = () => {
  const s = loadSettings();
  $('#main').innerHTML = `
    <h1>Réglages — IA gratuite, au choix</h1>
    <p class="lead">Aucun serveur : votre clé reste dans ce navigateur et n’est envoyée qu’au fournisseur choisi. Tous ceux listés ont une offre gratuite, ou tournent sur votre machine.</p>
    <div class="card warn"><b>Clé gratuite = pour tester et pour les données publiques</b> (sites web, plaquettes, informations d’entreprise publiques). Avec une offre gratuite, le fournisseur peut réutiliser ce que vous envoyez : nous déconseillons d’y mettre des données non publiques — mails reçus, devis, notes internes, coordonnées personnelles. Pour ces données, collez ici une clé d’une <b>offre payante souscrite chez votre fournisseur d’IA</b> (pas chez AVApmo : l’outil reste gratuit) dont les conditions excluent l’usage de vos données — l’outil fonctionne à l’identique — ou choisissez <b>Ollama</b> pour traiter l’IA localement. Les recherches web et officielles contactent toujours leurs fournisseurs.</div>
    <div class="card"><div class="grid">
      <div><label>Fournisseur</label><select id="provider">${Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}" ${s.provider === k ? 'selected' : ''}>${p.label}</option>`).join('')}</select></div>
      <div><label>Clé API <small id="keyhelp"></small></label><input id="apiKey" type="password" value="${esc(s.apiKey)}" autocomplete="off"></div>
      <div><label>Modèle <small>— vide = défaut</small></label><input id="model" list="model-list" value="${esc(s.model)}" placeholder="${esc(PROVIDERS[s.provider]?.model || '')}"><datalist id="model-list"></datalist>
        <button class="btn ghost small" id="models" style="margin-top:6px">Lister les modèles</button> <small class="muted" id="models-note">les noms changent souvent : vérifiez ici en cas d'erreur « modèle introuvable »</small></div>
      <div><label>URL de base <small>— vide = défaut</small></label><input id="baseUrl" value="${esc(s.baseUrl)}" placeholder="${esc(PROVIDERS[s.provider]?.baseUrl || '')}"></div>
      <div class="full"><label>Clé Jina (requise pour la recherche web) <small>— lecture de pages sans clé à faible volume ; recherche avec clé et crédits sur <a href="https://jina.ai/reader" target="_blank" rel="noopener">jina.ai</a></small></label><input id="jinaKey" type="password" value="${esc(s.jinaKey || '')}" autocomplete="off"></div>
    </div>
    <div class="actions"><button class="btn" id="save">Enregistrer</button><button class="btn ghost" id="test">Tester</button></div></div>
    <div class="card">
      <h2>Comment obtenir une clé gratuite</h2>
      <ul class="plain">
        <li><b>Groq</b> — rapide, Llama 3.3 70B, quota gratuit généreux : <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a></li>
        <li><b>Google Gemini</b> — Gemini Flash, gratuit : <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a></li>
        <li><b>Mistral</b> — plan « Experiment » gratuit, modèles français : <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noopener">console.mistral.ai</a></li>
        <li><b>OpenRouter</b> — modèles suffixés <code>:free</code> : <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a></li>
        <li><b>Claude (Anthropic)</b> — payant, à l’usage (quelques centimes par rendez-vous), données non utilisées pour l’entraînement : <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a> — le choix « Travailler » ci-dessous.</li>
        <li><b>Ollama</b> — 100 % local, sans clé. Lancez <code>OLLAMA_ORIGINS="*" ollama serve</code> puis <code>ollama pull llama3.1</code>.</li>
        <li><b>Mode démo</b> — génération IA sans réseau ; les boutons de recherche contactent les sources publiques.</li>
      </ul>
      <h3>Données sensibles : trois niveaux</h3>
      <ul class="plain">
        <li><b>Tester</b> — clé gratuite : données fictives ou <b>publiques</b> (site web, plaquette, fiche d’entreprise, profil public), utilisables en l’état. Déconseillé pour tout ce qui n’est pas public.</li>
        <li><b>Travailler</b> — clé d’une offre payante <b>chez le fournisseur d’IA</b> (Claude, ou l’offre payante de Groq, Gemini, Mistral, OpenRouter : même champ, même usage ; vous payez le fournisseur, jamais AVApmo) ; vérifiez dans ses conditions que vos données ne servent pas à entraîner ses modèles.</li>
        <li><b>Confidentiel</b> — Ollama en local : le modèle tourne sur votre machine ; les recherches web et officielles restent des appels externes, uniquement à votre demande.</li>
      </ul>
      <p class="note">Les quotas gratuits évoluent ; en cas d’erreur 429, changez de fournisseur. Vos données de rendez-vous restent dans ce navigateur (voir Historique pour l’export CSV).</p>
    </div>`;
  const keyhelp = () => { const p = PROVIDERS[$('#provider').value]; $('#keyhelp').innerHTML = p.needsKey ? `— <a href="${p.keyUrl}" target="_blank" rel="noopener">obtenir</a>` : '— non requise'; $('#model').placeholder = p.model; $('#baseUrl').placeholder = p.baseUrl; };
  keyhelp(); $('#provider').onchange = keyhelp;
  const read = () => ({ provider: $('#provider').value, apiKey: $('#apiKey').value.trim(), model: $('#model').value.trim(), baseUrl: $('#baseUrl').value.trim(), jinaKey: $('#jinaKey').value.trim() });
  $('#save').onclick = () => { saveSettings(read()); markDone(); toast('Réglages enregistrés.'); };
  $('#models').onclick = (e) => busy(e.target, async () => {
    saveSettings(read());
    const ids = await listModels();
    $('#model-list').innerHTML = ids.map((id) => `<option value="${esc(id)}">`).join('');
    $('#models-note').textContent = ids.length ? `${ids.length} modèle(s) : ${ids.slice(0, 8).join(', ')}${ids.length > 8 ? '…' : ''} — cliquez dans le champ Modèle pour choisir.` : 'Aucun modèle renvoyé.';
    const cur = $('#model').value.trim() || PROVIDERS[$('#provider').value]?.model;
    if (ids.length && !ids.includes(cur)) { $('#model').value = ids.find((i) => /haiku|gpt-oss-120b|llama.*70b|gemini.*flash|mistral-small|:free/i.test(i)) || ids[0]; toast(`Modèle « ${cur} » absent : « ${$('#model').value} » sélectionné. Enregistrez.`, 5000); }
  });
  $('#test').onclick = (e) => busy(e.target, async () => {
    saveSettings(read()); markDone();
    const r = await chatJSON([{ role: 'system', content: 'TASK:ping LANG:fr Réponds uniquement en JSON.' }, { role: 'user', content: 'Réponds {"ok":true}' }]);
    toast(r && (r.ok || r.text) ? 'Connexion OK ✔' : 'Réponse inattendue : ' + JSON.stringify(r).slice(0, 80));
  });
};

// ----------------------------------------------------------------------------- impression / PDF
const STEP_TITLES = { offer: 'Offre', client: 'Client', persona: 'Persona SONCAS', simac: 'Déroulé SIMAC', followup: 'Suivi', history: 'Historique', settings: 'Réglages' };
$('#btn-print').onclick = () => window.print();
window.addEventListener('beforeprint', () => {
  const who = [S.client.company, contacts().map((c, i) => contactLabel(c, i)).join(', ')].filter(Boolean).join(' — ');
  $('#print-head')?.remove();
  const head = document.createElement('div'); head.id = 'print-head'; head.className = 'print-head';
  head.innerHTML = `<b>SIMAC Prep · ${esc(STEP_TITLES[S.step] || '')}</b> · ${esc(S.product.name || '')}${who ? ' · ' + esc(who) : ''} · ${esc(S.date)}`;
  $('#main').prepend(head);
  // hauteur = contenu, bornée : un scrollHeight aberrant (élément masqué, police non chargée) ne doit pas produire des pages vides
  $$('textarea').forEach((t) => { t.dataset.h = t.style.height; t.style.height = 'auto'; const h = t.scrollHeight; t.style.height = (h > 0 && h < 1400 ? h + 2 : 72) + 'px'; });
});
window.addEventListener('afterprint', () => {
  $('#print-head')?.remove();
  $$('textarea').forEach((t) => { t.style.height = t.dataset.h || ''; });
});

// ----------------------------------------------------------------------------- accueil + conditions
function showGate(readOnly = false) {
  const g = $('#gate'); g.hidden = false;
  $('#gate-form').hidden = readOnly;
  if (readOnly) { const close = document.createElement('button'); close.className = 'btn ghost'; close.textContent = 'Fermer'; close.onclick = () => (g.hidden = true); $('#gate-form').after(close); }
  $('#gate-email').required = !!CONFIG.emailRequired;
  $('#gate-email').closest('label').querySelector('input').placeholder = CONFIG.emailRequired ? 'vous@entreprise.fr' : 'vous@entreprise.fr (facultatif)';
}
$('#gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#gate-email').value.trim();
  if (!$('#gate-accept').checked) return ($('#gate-error').textContent = 'Cochez la case pour accepter les conditions.');
  if ((CONFIG.emailRequired || email) && !isEmail(email)) return ($('#gate-error').textContent = 'Adresse email invalide.');
  const btn = $('#gate-form .btn'); btn.disabled = true;
  await accept({ email });
  btn.disabled = false; $('#gate').hidden = true;
});
$('#show-terms').addEventListener('click', (e) => { e.preventDefault(); showGate(true); });
if (!hasAccepted()) showGate(false);

// ----------------------------------------------------------------------------- démarrage
go(S.step || 'offer');

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

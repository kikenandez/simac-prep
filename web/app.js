// app.js — SIMAC Prep : préparation de rendez-vous commerciaux pour TPE/PME.
// Statique, sans serveur. L'IA est optionnelle et au choix (fournisseurs gratuits, ou mode démo).

import { PROVIDERS, loadSettings, saveSettings, resolve, chatJSON, listModels } from './lib/llm.js';
import { clientBriefMessages, soncasMessages, simacMessages, followupMessages, offerExtractMessages, offerQuestionMessages, offerMaturityMessages, clientExtractMessages, clientQuestionMessages, debriefExtractMessages } from './lib/prompts.js';
import { readUrl, searchWeb, notesSource, mergeSources } from './lib/research.js';
import { SONCAS, DEFAULT_SCORES, clampScores, top3, label } from './lib/soncas.js';
import { listMeetings, saveMeeting, deleteMeeting, exportCSV, importCSV, saveDraft, loadDraft, newId, retrieve, COLUMNS } from './lib/store.js';
import { download } from './lib/csv.js';
import { extractText, ACCEPT } from './lib/files.js';

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
    client: { company: '', sector: '', website: '', contactName: '', contactRole: '', linkedinUrl: '', notes: '', decisionProcess: '', meetingFormat: '' },
    clientChat: { description: '', chat: [], pendingField: '' },
    sources: [], brief: null,
    persona: { scores: { ...DEFAULT_SCORES }, aiScores: null, rationale: {}, arguments: {}, main_message: '' },
    objective: { primary: '', fallback: '' },
    simac: null,
    debrief: { outcome: '', objectionsHeard: '', decisionMaker: '', nextAction: '', nextOwner: 'me', nextDue: '', nextOutput: '', notes: '', description: '' },
    followup: null,
  };
}
let S = loadDraft() || blank();
if (!S.id) S = blank();
if (!S.offer) S.offer = blank().offer;
if (!S.clientChat) S.clientChat = blank().clientChat;
if (S.client.meetingFormat == null) S.client.meetingFormat = '';
if (S.debrief.description == null) S.debrief.description = '';
const persist = () => saveDraft(S);

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
    el.addEventListener('input', () => { obj[key] = el.value; persist(); });
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
  if (!confirm('Nouveau rendez-vous ? L’offre est conservée, le reste est réinitialisé (pensez à enregistrer dans Suivi).')) return;
  const product = S.product; S = blank(); S.product = product; persist(); go('client');
});

// ----------------------------------------------------------------------------- 1. OFFRE
const renderers = {};
const FIELD_LABELS = { name: 'Produit / service', oneLiner: 'En une phrase', targets: 'Cibles', problem: 'Problème de chaque cible', who: 'Qui parle', nextStep: 'Étape suivante voulue', mechanism: 'Mécanisme', advantages: 'Avantages', proofs: 'Preuves', price: 'Prix', floor: 'Plancher', delays: 'Délais et conditions', objections: 'Objections attendues', constraints: 'Contraintes' };
const MATURITY = { 1: 'Encore une idée à travailler', 2: 'Ébauche', 3: 'Offre définie', 4: 'Prête à tester', 5: 'Prête à la présentation' };

renderers.offer = () => {
  const O = S.offer;
  $('#main').innerHTML = `
    <h1>1 · Votre offre</h1>
    <p class="lead">Décrivez votre produit ou service avec vos mots ; l’IA remplit la fiche, pose les questions qui manquent et mesure la maturité de l’offre. Ne rien inventer — ce qui manque est un trou à combler.</p>

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
        <label class="btn ghost" style="margin:0">Joindre plaquette / mail / texte <input type="file" id="offer-files" accept="${ACCEPT}" multiple hidden></label>
        <span class="note" id="offer-src">${O.sources.length} source(s)</span>
      </div>
      <div id="offer-sources"></div>
      <div class="actions"><button class="btn" id="offer-extract">Analyser avec l’IA → remplir la fiche</button></div>
      <div id="offer-notes" class="note"></div>
    </div>

    <h2>Fiche produit</h2>
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
  renderGuidedChat({ el: $('#offer-chat'), state: O, target: S.product, build: offerQuestionMessages, step: 'offer', onFilled: () => { O.maturity = null; } });
  renderMaturity();
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
    persist(); $('#offer-src').textContent = `${O.sources.length} source(s)`;
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
    O.maturity = null; persist(); markDone();
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
  $('#export-offer').onclick = () => download('fiche-offre.json', JSON.stringify(S.product, null, 2), 'application/json');
  $('#import-offer').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { S.product = { ...S.product, ...JSON.parse(await f.text()) }; persist(); renderers.offer(); toast('Fiche importée.'); }
    catch { toast('Fichier illisible.'); }
  };
};

async function addFiles(files, list, done) {
  let n = 0;
  for (const f of files) {
    try { const src = await extractText(f); const i = list.findIndex((x) => x.source === src.source); if (i >= 0) list[i] = src; else list.push(src); n++; }
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
function renderGuidedChat({ el, state, target, build, step, onFilled }) {
  if (!el) return;
  const log = state.chat.map((m) => `<div class="chat-msg ${m.role}"><span>${esc(m.text)}</span></div>`).join('');
  const last = state.chat[state.chat.length - 1];
  const waiting = last && last.role === 'ai' && state.pendingField;
  el.innerHTML = `
    <div class="chat-log">${log || '<div class="note">Aucune question pour l’instant.</div>'}</div>
    ${waiting ? `<div class="chat-input"><textarea class="chat-answer" rows="2" placeholder="Votre réponse…"></textarea>
      <button class="btn chat-send">Répondre</button></div>` : ''}
    <div class="actions" style="margin-bottom:0">
      <button class="btn ghost chat-start">${state.chat.length ? 'Question suivante' : 'Commencer les questions'}</button>
      ${state.chat.length ? '<button class="btn ghost small chat-reset">Effacer le dialogue</button>' : ''}
    </div>`;
  const transcript = () => state.chat.map((m) => `${m.role === 'ai' ? 'IA' : 'Vous'} : ${m.text}`).join('\n');
  const ask = async (btn, lastField, lastAnswer) => busy(btn, async () => {
    const r = await chatJSON(build({ lang: LANG, current: target, transcript: transcript(), lastField, lastAnswer }));
    if (lastField && r.field_value) { target[lastField] = r.field_value; onFilled?.(); }
    if (r.done || !r.question) { state.pendingField = ''; state.chat.push({ role: 'ai', text: 'La fiche est complète sur l’essentiel.' }); }
    else { state.pendingField = r.next_field || ''; state.chat.push({ role: 'ai', text: r.question, field: r.next_field }); }
    persist(); markDone();
    if (S.step === step) { renderers[step](); el.closest('.card')?.scrollIntoView({ block: 'center' }); }
  });
  $('.chat-start', el).onclick = (e) => ask(e.target, '', '');
  $('.chat-reset', el)?.addEventListener('click', () => { state.chat = []; state.pendingField = ''; persist(); renderers[step](); });
  $('.chat-send', el)?.addEventListener('click', (e) => {
    const a = $('.chat-answer', el).value.trim(); if (!a) return;
    const f = state.pendingField; state.chat.push({ role: 'user', text: a }); state.pendingField = '';
    ask(e.target, f, a);
  });
}

function renderMaturity() {
  const el = $('#offer-maturity-out'); if (!el) return;
  const M = S.offer.maturity; if (!M) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="maturity">
      <div class="gauge">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= M.score ? 'on' : ''}"></span>`).join('')}</div>
      <div><b>${M.score} / 5 — ${esc(M.label || MATURITY[M.score])}</b><div class="note">${esc(M.summary)}</div></div>
    </div>
    <div class="grid" style="margin-top:12px">
      <div><h3>Points forts</h3><ul class="plain">${(M.strengths || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div><h3>Ce qui bloque la vente</h3><ul class="plain">${(M.gaps || []).map((g) => `<li><b>${esc(FIELD_LABELS[g.field] || g.field)}</b> — ${esc(g.why)} <i>→ ${esc(g.fix)}</i></li>`).join('')}</ul></div>
    </div>
    <div class="card soft" style="margin-bottom:0"><b>À faire avant le prochain rendez-vous :</b> ${esc(M.next_step)}</div>`;
}

// ----------------------------------------------------------------------------- 2. CLIENT
const CLIENT_LABELS = { company: 'Entreprise / établissement', sector: 'Secteur', website: 'Site web', contactName: 'Interlocuteur·rice', contactRole: 'Fonction / rôle', meetingFormat: 'Format du rendez-vous', decisionProcess: 'Processus de décision', notes: 'Notes' };

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
    <div class="grid">
      ${field('client.company', 'Entreprise / établissement')}
      ${field('client.sector', 'Secteur / activité')}
      ${field('client.contactName', 'Interlocuteur·rice', { hint: 'nom, ou fonction si inconnu' })}
      ${field('client.contactRole', 'Fonction / rôle dans la décision')}
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

    <h2>Sources et fiche client</h2>
    <div class="actions">
      <button class="btn ghost" id="fetch">Lire les pages</button>
      <button class="btn ghost" id="search">Rechercher sur le web</button>
      <span class="note" id="src-count">${S.sources.length} source(s) collectée(s)</span>
    </div>
    <div id="sources"></div>
    <div class="actions"><button class="btn" id="brief">Générer la fiche client avec l’IA</button></div>
    <div id="brief-out"></div>`;
  bindInputs($('#main'), S.client, 'client');
  bindInputs($('#main'), C, 'clientChat');
  renderGuidedChat({ el: $('#client-chat'), state: C, target: S.client, build: clientQuestionMessages, step: 'client' });
  renderSources();
  renderBrief();
  $('#client-files').onchange = (e) => addFiles(e.target.files, S.sources, () => { persist(); renderSources(); });

  $('#client-extract').onclick = (e) => busy(e.target, async () => {
    if (!C.description.trim()) return toast('Décrivez d’abord l’interlocuteur et le rendez-vous.');
    const docs = S.sources.filter((x) => x.kind === 'document').map((x) => `--- ${x.source}\n${x.text}`).join('\n\n');
    const r = await chatJSON(clientExtractMessages({ lang: LANG, description: [C.description, docs].filter(Boolean).join('\n\nDOCUMENTS JOINTS :\n'), current: S.client }));
    const f = r.fields || {}; let filled = 0;
    for (const k of Object.keys(CLIENT_LABELS)) { const v = String(f[k] || '').trim(); if (v && !String(S.client[k] || '').trim()) { S.client[k] = v; filled++; } }
    persist(); markDone(); if (S.step !== 'client') return;
    renderers.client();
    $('#client-notes').textContent = (r.missing || []).length ? 'Manque : ' + r.missing.map((k) => CLIENT_LABELS[k] || k).join(', ') + ' → « Compléter par questions ».' : '';
    toast(`${filled} champ(s) rempli(s).`);
  });
  $('#fetch').onclick = (e) => busy(e.target, async () => {
    const urls = [S.client.website, S.client.linkedinUrl].filter(Boolean);
    if (!urls.length) return toast('Indiquez au moins une URL.');
    const jinaKey = loadSettings().jinaKey || '';
    for (const u of urls) {
      try { const src = await readUrl(u, { jinaKey }); S.sources = S.sources.filter((s) => s.source !== src.source); S.sources.push(src); }
      catch (err) { toast(friendlyError(err), 5000); }
    }
    persist(); renderSources();
  });
  $('#search').onclick = (e) => busy(e.target, async () => {
    const q = [S.client.company, S.client.contactName, S.client.sector].filter(Boolean).join(' ');
    if (!q) return toast('Indiquez l’entreprise ou le contact.');
    const res = await searchWeb(q, { jinaKey: loadSettings().jinaKey || '' });
    S.sources = S.sources.filter((s) => s.kind !== 'web').concat(res);
    persist(); renderSources(); toast(`${res.length} résultat(s) ajouté(s).`);
  });
  $('#brief').onclick = (e) => busy(e.target, async () => {
    if (!S.client.company && !S.client.contactName) return toast('Indiquez au moins l’entreprise.');
    const all = [...S.sources];
    if (S.client.notes) all.push(notesSource(S.client.notes));
    const history = retrieve({ company: S.client.company, sector: S.client.sector, product: S.product.name, contactRole: S.client.contactRole, contactName: S.client.contactName });
    const brief = await chatJSON(clientBriefMessages({ lang: LANG, product: S.product, client: S.client, sources: mergeSources(all), history }));
    S.brief = brief; persist(); markDone(); if (S.step !== 'client') return;
    renderBrief();
  });
};
function renderSources() {
  const el = $('#sources'); if (!el) return;
  $('#src-count').textContent = `${S.sources.length} source(s) collectée(s)`;
  el.innerHTML = S.sources.map((s, i) => `
    <div class="card"><b>${esc(s.kind)}</b> — <a href="${esc(s.source)}" target="_blank" rel="noopener">${esc(s.title || s.source)}</a>
      <button class="btn ghost small" style="float:right" data-rm="${i}">retirer</button>
      <div class="note" style="margin-top:6px">${esc(s.text.slice(0, 280))}…</div></div>`).join('');
  $$('[data-rm]', el).forEach((b) => (b.onclick = () => { S.sources.splice(+b.dataset.rm, 1); persist(); renderSources(); }));
}
function renderBrief() {
  const el = $('#brief-out'); if (!el) return;
  const b = S.brief; if (!b) { el.innerHTML = ''; return; }
  const li = (arr) => (arr || []).map((x) => `<li>${esc(typeof x === 'string' ? x : `${x.fact} (${x.source})`)}</li>`).join('');
  el.innerHTML = `
    <div class="card">
      <h2>Fiche client</h2>
      <p><b>Entreprise.</b> ${esc(b.company_summary)}</p>
      <p><b>Interlocuteur·rice.</b> ${esc(b.contact_summary)}</p>
      <p><b>Enjeu.</b> ${esc(b.stakes)}</p>
      <h3>Problèmes probables (ses mots)</h3><ul class="plain">${li(b.likely_problems)}</ul>
      <div class="grid"><div><h3>Faits (sourcés)</h3><ul class="plain">${li(b.facts)}</ul></div>
      <div><h3>Hypothèses à vérifier</h3><ul class="plain">${li(b.assumptions)}</ul></div></div>
      <h3>Questions de découverte</h3><ol class="steps-list">${li(b.questions_to_ask)}</ol>
    </div>
    <div class="actions"><button class="btn" id="to-persona">Continuer → Persona</button></div>`;
  $('#to-persona').onclick = () => go('persona');
}

// ----------------------------------------------------------------------------- 3. PERSONA SONCAS
renderers.persona = () => {
  const P = S.persona;
  $('#main').innerHTML = `
    <h1>3 · Persona SONCAS et message principal</h1>
    <p class="lead">Les motivations d’achat à explorer, notées de 1 à 3. L’IA propose d’après la fiche client ; vous corrigez. Le message principal se construit sur les 3 motivations les plus fortes.</p>
    <div class="actions">
      <button class="btn" id="ai">Proposer avec l’IA</button>
      ${P.aiScores ? '<span class="note">Proposition IA reçue — ajustez les scores si besoin.</span>' : '<span class="note">Sans IA : notez à la main, puis rédigez le message.</span>'}
    </div>
    <div class="soncas" id="soncas"></div>
    <div class="card soft" style="margin-top:16px">
      <h3>Message principal <span class="muted">(top 3 : <span id="top3"></span>)</span></h3>
      <textarea data-bind="persona.main_message" class="main-message" placeholder="1 à 2 phrases, bâties sur les 3 motivations les plus fortes"></textarea>
    </div>
    <div class="actions"><button class="btn" id="next">Continuer → SIMAC</button></div>`;
  bindInputs($('#main'), P, 'persona');
  renderSoncas();
  $('#ai').onclick = (e) => busy(e.target, async () => {
    if (!S.brief) return toast('Générez d’abord la fiche client (étape 2).');
    const history = retrieve({ company: S.client.company, sector: S.client.sector, product: S.product.name, contactRole: S.client.contactRole });
    const r = await chatJSON(soncasMessages({ lang: LANG, product: S.product, client: S.client, brief: S.brief, history }));
    P.aiScores = capThrees(clampScores(r.scores)); P.scores = { ...P.aiScores };
    P.rationale = r.rationale || {}; P.arguments = r.arguments || {}; P.main_message = r.main_message || '';
    persist(); markDone(); if (S.step === 'persona') renderers.persona();
  });
  $('#next').onclick = () => go('simac');
};
/** Au plus trois dimensions à 3 : au-delà, les dernières dans l'ordre S-O-N-C-A-S-E repassent à 2. */
function capThrees(scores) {
  const out = { ...scores }; let n = 0;
  for (const d of SONCAS) if (out[d.code] === 3) { n++; if (n > 3) out[d.code] = 2; }
  return out;
}
function renderSoncas() {
  const P = S.persona; const t3 = top3(P.scores);
  $('#top3').textContent = t3.map(label).join(' · ');
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
    const t3 = top3(S.persona.scores);
    const persona = { scores: S.persona.scores, top3: t3.map(label), main_message: S.persona.main_message, arguments: Object.fromEntries(t3.map((c) => [label(c), (S.persona.arguments?.[c] || []).slice(0, 2)])) };
    const simac = await chatJSON(simacMessages({ lang: LANG, product: S.product, client: S.client, brief: S.brief, persona, objective: S.objective }));
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
      <div class="simac-block"><div class="k">Avantages — chacun reformule un besoin</div>${list('advantages', M.advantages)}</div>
      <div class="simac-block"><div class="k">Conclusion — question, deux options, étape suivante</div>${ta('conclusion', M.conclusion)}</div>
    </div>
    <div class="card">
      <h2>Objections probables</h2>
      <table><thead><tr><th style="width:35%">Objection</th><th>Accueillir → creuser → répondre → relancer</th></tr></thead>
      <tbody>${(M.objections || []).map((o) => `<tr><td>${esc(o.objection)}</td><td>${esc(o.response)}</td></tr>`).join('') || '<tr><td colspan="2" class="note">—</td></tr>'}</tbody></table>
      ${(M.mistakes_watch || []).length ? `<h3>Erreurs à surveiller dans ce RDV</h3><ul class="plain">${M.mistakes_watch.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    </div>
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
  return [`RDV ${S.client.company} — ${S.client.contactName} — ${S.date}`, `Objectif : ${S.objective.primary} (repli : ${S.objective.fallback})`,
    `Message principal : ${S.persona.main_message}`, '', `OUVERTURE\n${M.opening || ''}`, `SITUATION\n${M.situation || ''}`, `IDÉE\n${M.idea || ''}`,
    `MÉCANISME\n${(M.mechanism || []).map((x, i) => `${i + 1}. ${x}`).join('\n')}`, `AVANTAGES\n${(M.advantages || []).map((x) => `- ${x}`).join('\n')}`,
    `CONCLUSION\n${M.conclusion || ''}`, '', 'OBJECTIONS', ...(M.objections || []).map((o) => `- ${o.objection}\n  → ${o.response}`)].join('\n');
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
    const fu = await chatJSON(followupMessages({ lang: LANG, product: S.product, client: S.client, simac: S.simac || {}, debrief: D }));
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
  const sc = S.persona.scores; const M = S.simac || {}; const D = S.debrief;
  return {
    id: S.id, date: S.date, company: S.client.company, sector: S.client.sector, website: S.client.website,
    contact_name: S.client.contactName, contact_role: S.client.contactRole, product: S.product.name,
    objective: S.objective.primary, fallback: S.objective.fallback,
    soncas_S: sc.S, soncas_O: sc.O, soncas_N: sc.N, soncas_C: sc.C, soncas_A: sc.A, soncas_Y: sc.Y, soncas_E: sc.E,
    top3: top3(sc).map(label).join('|'), main_message: S.persona.main_message, idea: M.idea || '', conclusion: M.conclusion || '',
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
      <tbody>${all.map((m) => `<tr><td>${esc(m.date)}</td><td><b>${esc(m.company)}</b><br><small>${esc(m.contact_name)} — ${esc(m.contact_role)}</small></td>
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
    const product = S.product; S = blank(); S.product = product; S.id = m.id; S.date = m.date;
    Object.assign(S.client, { company: m.company, sector: m.sector, website: m.website, contactName: m.contact_name, contactRole: m.contact_role, notes: m.notes });
    Object.assign(S.objective, { primary: m.objective, fallback: m.fallback });
    S.persona.scores = capThrees(clampScores({ S: m.soncas_S, O: m.soncas_O, N: m.soncas_N, C: m.soncas_C, A: m.soncas_A, Y: m.soncas_Y, E: m.soncas_E }));
    S.persona.main_message = m.main_message;
    Object.assign(S.debrief, { outcome: m.outcome, objectionsHeard: m.objections_heard, decisionMaker: m.decision_maker, nextAction: m.next_action, nextOwner: m.next_owner || 'me', nextDue: m.next_due, nextOutput: m.next_output, notes: m.notes });
    persist(); go('client'); toast('Rendez-vous rechargé (la fiche client et le SIMAC sont à regénérer).');
  }));
};

// ----------------------------------------------------------------------------- RÉGLAGES
renderers.settings = () => {
  const s = loadSettings();
  $('#main').innerHTML = `
    <h1>Réglages — IA gratuite, au choix</h1>
    <p class="lead">Aucun serveur : votre clé reste dans ce navigateur et n’est envoyée qu’au fournisseur choisi. Tous ceux listés ont une offre gratuite, ou tournent sur votre machine.</p>
    <div class="card"><div class="grid">
      <div><label>Fournisseur</label><select id="provider">${Object.entries(PROVIDERS).map(([k, p]) => `<option value="${k}" ${s.provider === k ? 'selected' : ''}>${p.label}</option>`).join('')}</select></div>
      <div><label>Clé API <small id="keyhelp"></small></label><input id="apiKey" type="password" value="${esc(s.apiKey)}" autocomplete="off"></div>
      <div><label>Modèle <small>— vide = défaut</small></label><input id="model" list="model-list" value="${esc(s.model)}" placeholder="${esc(PROVIDERS[s.provider]?.model || '')}"><datalist id="model-list"></datalist>
        <button class="btn ghost small" id="models" style="margin-top:6px">Lister les modèles</button> <small class="muted" id="models-note">les noms changent souvent : vérifiez ici en cas d'erreur « modèle introuvable »</small></div>
      <div><label>URL de base <small>— vide = défaut</small></label><input id="baseUrl" value="${esc(s.baseUrl)}" placeholder="${esc(PROVIDERS[s.provider]?.baseUrl || '')}"></div>
      <div class="full"><label>Clé Jina (optionnelle) <small>— lecture/recherche web ; gratuite sur <a href="https://jina.ai/reader" target="_blank" rel="noopener">jina.ai</a>, utile si la limite sans clé est atteinte</small></label><input id="jinaKey" type="password" value="${esc(s.jinaKey || '')}" autocomplete="off"></div>
    </div>
    <div class="actions"><button class="btn" id="save">Enregistrer</button><button class="btn ghost" id="test">Tester</button></div></div>
    <div class="card">
      <h2>Comment obtenir une clé gratuite</h2>
      <ul class="plain">
        <li><b>Groq</b> — rapide, Llama 3.3 70B, quota gratuit généreux : <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a></li>
        <li><b>Google Gemini</b> — Gemini Flash, gratuit : <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a></li>
        <li><b>Mistral</b> — plan « Experiment » gratuit, modèles français : <a href="https://console.mistral.ai/api-keys" target="_blank" rel="noopener">console.mistral.ai</a></li>
        <li><b>OpenRouter</b> — modèles suffixés <code>:free</code> : <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a></li>
        <li><b>Ollama</b> — 100 % local, sans clé. Lancez <code>OLLAMA_ORIGINS="*" ollama serve</code> puis <code>ollama pull llama3.1</code>.</li>
        <li><b>Mode démo</b> — aucun appel réseau ; montre le parcours avec des contenus d’exemple.</li>
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
    if (ids.length && !ids.includes(cur)) { $('#model').value = ids.find((i) => /gpt-oss-120b|llama.*70b|gemini.*flash|mistral-small|:free/i.test(i)) || ids[0]; toast(`Modèle « ${cur} » absent : « ${$('#model').value} » sélectionné. Enregistrez.`, 5000); }
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
  const who = [S.client.company, S.client.contactName].filter(Boolean).join(' — ');
  const head = document.createElement('div'); head.id = 'print-head'; head.className = 'print-head';
  head.innerHTML = `<b>SIMAC Prep · ${esc(STEP_TITLES[S.step] || '')}</b> · ${esc(S.product.name || '')}${who ? ' · ' + esc(who) : ''} · ${esc(S.date)}`;
  $('#main').prepend(head);
  $$('textarea').forEach((t) => { t.dataset.h = t.style.height; t.style.height = 'auto'; t.style.height = t.scrollHeight + 2 + 'px'; });
});
window.addEventListener('afterprint', () => {
  $('#print-head')?.remove();
  $$('textarea').forEach((t) => { t.style.height = t.dataset.h || ''; });
});

// ----------------------------------------------------------------------------- démarrage
go(S.step || 'offer');

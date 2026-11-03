// lib/consent.js — acceptation des conditions d'utilisation et collecte de l'email (sans serveur).
// Avec CONFIG.confirmToUnlock, l'accès n'est ouvert qu'après confirmation de l'adresse (double opt-in Buttondown,
// redirection vers ?ok=1). Barrière « douce » : sans serveur, rien n'empêche de taper ?ok=1 à la main.
import { CONFIG } from '../config.js';

const KEY = 'simac.consent';

export function getConsent() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function save(rec) {
  try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* navigation privée */ }
  return rec;
}

// Consentements antérieurs à la confirmation : pas de champ `confirmed` -> accès conservé.
export function hasAccepted() {
  const c = getConsent();
  return !!(c && c.accepted && c.version === CONFIG.termsVersion && (c.confirmed === undefined || c.confirmed === true));
}

// Acceptation enregistrée, adresse en attente de confirmation (page « Vérifiez votre boîte mail »).
export function isPending() {
  const c = getConsent();
  return !!(c && c.accepted && c.version === CONFIG.termsVersion && c.confirmed === false);
}

// Cookie « confirmation SIMAC en attente », lisible par adp.avapmo.com/merci/ (même domaine parent).
function pendingCookie(on) {
  const c = CONFIG.pendingCookie;
  if (!c || !globalThis.location?.hostname?.endsWith(c.domain)) return;
  document.cookie = `${c.name}=${on ? 1 : ''}; Domain=${c.domain}; Path=/; Max-Age=${on ? c.maxAge : 0}; SameSite=Lax; Secure`;
}

// Deux modes d'envoi vers Buttondown :
// - accès direct (confirmToUnlock false, par défaut) : POST en arrière-plan, aucun onglet ouvert. Si le pare-feu
//   Buttondown exige sa vérification anti-spam (Cloudflare Turnstile), l'inscription est perdue sans bruit,
//   mais l'outil reste ouvert : rien ne bloque une démo ou un atelier.
// - accès après confirmation (confirmToUnlock true) : formulaire soumis dans un nouvel onglet, comme l'embed officiel,
//   pour que la personne voie et valide la vérification. À appeler pendant le clic (sinon bloqueur de pop-up).
async function subscribe(email) {
  if (!email || !CONFIG.emailEndpoint) return false;
  pendingCookie(true);
  const fields = [[CONFIG.emailFields.email, email], [CONFIG.emailFields.source, CONFIG.emailSource || 'simac-prep'], [CONFIG.emailFields.version, CONFIG.termsVersion]].filter(([name]) => name);
  try {
    if (!CONFIG.confirmToUnlock) {
      const fd = new FormData();
      for (const [name, value] of fields) fd.append(name, value);
      fetch(CONFIG.emailEndpoint, { method: 'POST', mode: 'no-cors', body: fd }).catch(() => {});
      return true;
    }
    const form = document.createElement('form');
    Object.assign(form, { action: CONFIG.emailEndpoint, method: 'post', target: '_blank', hidden: true });
    form.setAttribute('rel', 'noopener');
    for (const [name, value] of fields) { const i = document.createElement('input'); Object.assign(i, { type: 'hidden', name, value }); form.append(i); }
    document.body.append(form); form.submit(); form.remove();
    return true;
  } catch { return false; }
}

export async function accept({ email }) {
  email = email || '';
  // Confirmation exigée seulement si un mail de confirmation peut partir (adresse donnée + endpoint configuré).
  const needsConfirm = !!(CONFIG.confirmToUnlock && email && CONFIG.emailEndpoint);
  // Déjà confirmé sur ce navigateur (par ex. lien ouvert dans un autre onglet) : l'accès n'est jamais refermé.
  const rec = { accepted: true, version: CONFIG.termsVersion, email, at: new Date().toISOString(), sent: false, confirmed: hasAccepted() || !needsConfirm };
  rec.sent = await subscribe(email);
  return save(rec);
}

// « Renvoyer le mail » : nouveau POST pour l'adresse en attente.
export async function resend() {
  const c = getConsent(); if (!c || !c.email) return false;
  c.sent = await subscribe(c.email); c.resentAt = new Date().toISOString();
  save(c); return c.sent;
}

// Retour du lien de confirmation (?ok=1) : ouvre l'accès sur ce navigateur.
// Renvoie true si une acceptation en attente existait, false si elle a été créée ici (lien ouvert ailleurs).
export function confirmEmail() {
  pendingCookie(false);
  const c = getConsent();
  const now = new Date().toISOString();
  if (c && c.accepted && c.version === CONFIG.termsVersion) { save({ ...c, confirmed: true, confirmedAt: now }); return true; }
  save({ accepted: true, version: CONFIG.termsVersion, email: '', at: now, sent: false, confirmed: true, confirmedAt: now });
  return false;
}

export function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
}

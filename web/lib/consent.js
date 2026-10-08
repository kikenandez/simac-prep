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

async function subscribe(email) {
  if (!email || !CONFIG.emailEndpoint) return false;
  try {
    const fd = new FormData();
    fd.append(CONFIG.emailFields.email, email);
    if (CONFIG.emailFields.source) fd.append(CONFIG.emailFields.source, CONFIG.emailSource || 'simac-prep');
    if (CONFIG.emailFields.version) fd.append(CONFIG.emailFields.version, CONFIG.termsVersion);
    // no-cors : la requête part, la réponse est opaque (Buttondown envoie ensuite le mail de confirmation).
    await fetch(CONFIG.emailEndpoint, { method: 'POST', mode: 'no-cors', body: fd });
    return true;
  } catch { return false; }
}

export async function accept({ email }) {
  email = email || '';
  // Confirmation exigée seulement si un mail de confirmation peut partir (adresse donnée + endpoint configuré).
  const needsConfirm = !!(CONFIG.confirmToUnlock && email && CONFIG.emailEndpoint);
  const rec = { accepted: true, version: CONFIG.termsVersion, email, at: new Date().toISOString(), sent: false, confirmed: !needsConfirm };
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
  const c = getConsent();
  const now = new Date().toISOString();
  if (c && c.accepted && c.version === CONFIG.termsVersion) { save({ ...c, confirmed: true, confirmedAt: now }); return true; }
  save({ accepted: true, version: CONFIG.termsVersion, email: '', at: now, sent: false, confirmed: true, confirmedAt: now });
  return false;
}

export function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
}

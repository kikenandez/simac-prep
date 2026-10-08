// lib/consent.js — acceptation des conditions d'utilisation et collecte de l'email (sans serveur).
import { CONFIG } from '../config.js';

const KEY = 'simac.consent';

export function getConsent() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function hasAccepted() {
  const c = getConsent();
  return !!(c && c.accepted && c.version === CONFIG.termsVersion);
}

export async function accept({ email }) {
  const rec = { accepted: true, version: CONFIG.termsVersion, email: email || '', at: new Date().toISOString(), sent: false };
  if (email && CONFIG.emailEndpoint) {
    try {
      const fd = new FormData();
      fd.append(CONFIG.emailFields.email, email);
      fd.append(CONFIG.emailFields.accepted, rec.at);
      fd.append(CONFIG.emailFields.version, CONFIG.termsVersion);
      // no-cors : Google Forms ne renvoie pas de CORS ; la requête part, la réponse est opaque.
      await fetch(CONFIG.emailEndpoint, { method: 'POST', mode: 'no-cors', body: fd });
      rec.sent = true;
    } catch { rec.sent = false; }
  }
  try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { /* navigation privée */ }
  return rec;
}

export function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
}

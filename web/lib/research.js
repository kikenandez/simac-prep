// lib/research.js — collecte d'informations sur le client, 100 % gratuit.
// 1) Jina Reader (https://r.jina.ai/<url>) : rend n'importe quelle page en texte, sans clé, CORS ouvert.
// 2) Jina Search (https://s.jina.ai/<requête>) : recherche web → extraits ; sans clé à faible volume, clé gratuite sinon.
// 3) Notes collées par l'utilisateur (profil LinkedIn, mail, brochure…) : toujours disponibles.

const MAX_CHARS = 6000; // par source, pour rester dans le contexte des modèles gratuits

export async function readUrl(url, { jinaKey = '', signal } = {}) {
  const u = normalizeUrl(url);
  const headers = { Accept: 'text/plain', 'X-Return-Format': 'text' };
  if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`;
  const res = await fetch(`https://r.jina.ai/${u}`, { headers, signal });
  if (!res.ok) throw new Error(`Lecture impossible (${res.status}) : ${u}`);
  const txt = await res.text();
  return { source: u, kind: 'site', text: clean(txt).slice(0, MAX_CHARS) };
}

export async function searchWeb(query, { jinaKey = '', signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`;
  const res = await fetch(`https://s.jina.ai/${encodeURIComponent(query)}`, { headers, signal });
  if (!res.ok) throw new Error(`Recherche impossible (${res.status}). Ajoutez une clé Jina gratuite dans Réglages si la limite est atteinte.`);
  const data = await res.json();
  const items = (data?.data || []).slice(0, 5);
  return items.map((it) => ({
    source: it.url, kind: 'web', title: it.title || '',
    text: clean(`${it.title || ''}\n${it.description || ''}\n${(it.content || '').slice(0, 1500)}`),
  }));
}

export function notesSource(text, kind = 'notes') {
  return { source: kind, kind, text: clean(text).slice(0, MAX_CHARS) };
}

export function mergeSources(list) {
  return list.filter((s) => s && s.text)
    .map((s) => `### ${s.kind.toUpperCase()} — ${s.source}\n${s.text}`)
    .join('\n\n');
}

function normalizeUrl(url) {
  let u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

function clean(t) {
  return String(t).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

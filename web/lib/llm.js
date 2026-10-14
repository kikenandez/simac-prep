// lib/llm.js — provider-agnostic chat completion over OpenAI-compatible endpoints.
// Every provider listed here has a free tier (or runs locally). Keys live in the
// browser (localStorage) and are sent only to the provider the user picked.
import { t } from './i18n.js';
import { fixOutput } from './glossary.js';

export const PROVIDERS = {
  groq: {
    label: t('Groq (free tier)'),
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    keyUrl: 'https://console.groq.com/keys',
    needsKey: true,
  },
  gemini: {
    label: t('Google Gemini (free tier)'),
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    needsKey: true,
  },
  mistral: {
    label: t('Mistral (free "experiment" plan)'),
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    keyUrl: 'https://console.mistral.ai/api-keys',
    needsKey: true,
  },
  openrouter: {
    label: t('OpenRouter (":free" models)'),
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    keyUrl: 'https://openrouter.ai/keys',
    needsKey: true,
  },
  anthropic: {
    label: t('Claude — Anthropic (payant, données non utilisées pour l’entraînement)'),
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-5-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    needsKey: true,
    native: 'anthropic', // API Messages native : pas de /chat/completions
  },
  ollama: {
    label: t('Ollama (local, no key)'),
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    keyUrl: 'https://ollama.com/download',
    needsKey: false,
  },
  mock: {
    label: t('Mock (offline demo, no AI)'),
    baseUrl: '',
    model: 'mock',
    keyUrl: '',
    needsKey: false,
  },
};

const SETTINGS_KEY = 'simac.llm.settings';

export function loadSettings() {
  try {
    return { provider: 'groq', apiKey: '', model: '', baseUrl: '', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch { return { provider: 'groq', apiKey: '', model: '', baseUrl: '' }; }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

/** Liste les modèles disponibles chez le fournisseur courant (GET /models, OpenAI-compatible). */
export async function listModels(settings = loadSettings()) {
  const cfg = resolve(settings);
  if (cfg.provider === 'mock') return ['mock'];
  const headers = cfg.native === 'anthropic' ? anthropicHeaders(cfg) : {};
  if (cfg.apiKey && cfg.native !== 'anthropic') headers.Authorization = `Bearer ${cfg.apiKey}`;
  const res = await fetch(`${cfg.baseUrl}/models`, { headers });
  if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
  const data = await res.json();
  const ids = (data?.data || data?.models || []).map((m) => m.id || m.name).filter(Boolean);
  // on écarte les modèles audio / modération, inutiles ici
  return ids.filter((id) => !/whisper|tts|orpheus|guard|embed|moderation|safeguard|image|vision-only/i.test(id)).sort();
}

export function resolve(settings = loadSettings()) {
  const p = PROVIDERS[settings.provider] || PROVIDERS.groq;
  return {
    provider: settings.provider,
    baseUrl: (settings.baseUrl || p.baseUrl).replace(/\/$/, ''),
    model: settings.model || p.model,
    apiKey: settings.apiKey || '',
    needsKey: p.needsKey,
    native: p.native || '',
  };
}

function anthropicHeaders(cfg) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': cfg.apiKey,
    'anthropic-version': '2023-06-01',
    // Appel direct depuis le navigateur, assumé : la clé est celle de l'utilisateur, dans SON navigateur (BYOK).
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

/** API Messages d'Anthropic : system à part, réponse dans content[].text. */
async function anthropicChat(cfg, messages, opts) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const rest = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }));
  // Pas de `temperature` : les modèles Claude récents refusent le paramètre (400 « deprecated »).
  // `thinking: disabled` : sinon la réflexion interne du modèle consomme le plafond de sortie (vu : 6 900 tokens
  // de réflexion sur 8 192, texte coupé). Nos prompts sont des extractions structurées : pas besoin de réflexion longue.
  const body = { model: cfg.model, max_tokens: 16384, thinking: { type: 'disabled' }, messages: rest };
  if (system) body.system = system;
  let res = await fetch(`${cfg.baseUrl}/messages`, { method: 'POST', headers: anthropicHeaders(cfg), body: JSON.stringify(body), signal: opts.signal });
  if (res.status === 400) {
    // modèle qui ne connaît pas `thinking` ou plafonne max_tokens plus bas : on réessaie sans
    const txt = await res.text().catch(() => '');
    if (/thinking|max_tokens/i.test(txt)) { delete body.thinking; body.max_tokens = 8192; res = await fetch(`${cfg.baseUrl}/messages`, { method: 'POST', headers: anthropicHeaders(cfg), body: JSON.stringify(body), signal: opts.signal }); }
    else throw new Error(`LLM_HTTP_400: ${txt.slice(0, 300)}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`LLM_HTTP_${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data?.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  if (data?.stop_reason === 'max_tokens') throw new Error('LLM_TRUNCATED: ' + t('réponse coupée (trop longue). Réduisez les sources ou relancez.'));
  return text;
}

/**
 * chat(messages, {json, temperature, signal}) → string
 * messages: [{role:'system'|'user'|'assistant', content}]
 */
export async function chat(messages, opts = {}) {
  const cfg = resolve(opts.settings);
  if (cfg.provider === 'mock') return mockChat(messages, opts);
  if (cfg.needsKey && !cfg.apiKey) throw new Error('NO_API_KEY');
  if (cfg.native === 'anthropic') return anthropicChat(cfg, messages, opts);

  const body = {
    model: cfg.model,
    messages,
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.json && cfg.provider !== 'ollama') body.response_format = { type: 'json_object' };

  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  if (cfg.provider === 'openrouter') {
    headers['HTTP-Referer'] = location.origin;
    headers['X-Title'] = 'SIMAC Prep';
  }

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`LLM_HTTP_${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? '';
  return content;
}

/** Ask for JSON and parse it defensively (strips code fences, finds first {...}). */
export async function chatJSON(messages, opts = {}) {
  const raw = await chat(messages, { ...opts, json: true });
  // Filet de sécurité : termes français connus recopiés dans une réponse en/es (LANG: du prompt système).
  const lang = /\bLANG:(\w+)/.exec(messages?.[0]?.content || '')?.[1];
  return fixOutput(parseJSON(raw), lang);
}

export function parseJSON(raw) {
  let s = String(raw).trim();
  // clôtures ```json … ``` n'importe où dans le texte (certains modèles commentent avant/après)
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s); if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try { return JSON.parse(s); } catch (e) {
    // 1) retours à la ligne bruts dans les chaînes (fréquent sur de longs textes) → échappés
    const fixed = s.replace(/"(?:[^"\\]|\\.)*"/g, (m) => m.replace(/\n/g, '\\n').replace(/\t/g, '\\t'));
    try { return JSON.parse(fixed); } catch {}
    // 2) accolades / crochets non refermés (le modèle a oublié la fermeture finale) → on complète
    try { return JSON.parse(closeBrackets(fixed)); } catch {}
    console.error('Réponse IA non JSON :', String(raw).slice(0, 2000));
    const err = new SyntaxError(t('JSON illisible')); err.raw = String(raw).slice(0, 300); throw err;
  }
}
/** Ajoute les } et ] manquants en fin de texte (hors chaînes). */
function closeBrackets(s) {
  const stack = []; let inStr = false, esc = false;
  for (const c of s) {
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') stack.push('}'); else if (c === '[') stack.push(']'); else if (c === '}' || c === ']') stack.pop();
  }
  return s.replace(/,\s*$/, '') + stack.reverse().join('');
}

// ---------------------------------------------------------------------------
// Mock provider: lets the whole flow run offline (demos, tests, no key yet).
// It returns plausible, clearly-labelled placeholder output, in the language requested by the
// prompt (LANG:fr|en|es). Enumerated values compared by the app stay French codes in every language.
function mockChat(messages, opts) {
  const last = messages[messages.length - 1]?.content || '';
  const sys = messages[0]?.content || '';
  const task = /TASK:(\w+)/.exec(sys)?.[1] || 'generic';
  const lang = /LANG:(\w+)/.exec(sys)?.[1] || 'fr';
  /** Texte de démo dans la langue demandée : L({ fr, en, es }). */
  const L = (o) => o[lang] ?? o.en ?? o.fr;
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 400));

  if (task === 'offer_extract') {
    return delay(JSON.stringify({
      fields: { ...L({
        fr: {
          name: 'Coaching prospection 3 mois', oneLiner: 'Un accompagnement de 3 mois pour structurer la prospection d’une petite entreprise.',
          targets: 'Achète : le dirigeant\nUtilise : le dirigeant ou son commercial\nDécide : le dirigeant', problem: '« Je n’ai pas le temps de prospecter »\n« Je perds des ventes faute de préparation »',
          who: 'Consultant indépendant, 7 ans de direction commerciale en PME', nextStep: 'Un essai sur les 3 prochains rendez-vous',
          mechanism: 'Diagnostic de l’offre (semaine 1)\nFiche client et persona avant chaque RDV\nDébrief et mail de suivi à J+1', advantages: 'Gain de temps de préparation\nPlus de rendez-vous conclus\nTranquillité : une méthode, pas de nouvel outil',
        },
        en: {
          name: '3-month prospecting coaching', oneLiner: 'A 3-month programme to structure a small business’s prospecting.',
          targets: 'Buys: the owner\nUses: the owner or their salesperson\nDecides: the owner', problem: '“I don’t have time to prospect”\n“I lose sales because I’m not prepared”',
          who: 'Independent consultant, 7 years as sales director in SMBs', nextStep: 'A trial on the next 3 meetings',
          mechanism: 'Offer diagnosis (week 1)\nClient sheet and persona before each meeting\nDebrief and follow-up email at D+1', advantages: 'Less prep time\nMore meetings closed\nPeace of mind: a method, not a new tool',
        },
        es: {
          name: 'Coaching de prospección de 3 meses', oneLiner: 'Un acompañamiento de 3 meses para estructurar la prospección de una pequeña empresa.',
          targets: 'Compra: el director\nUsa: el director o su comercial\nDecide: el director', problem: '«No tengo tiempo para prospectar»\n«Pierdo ventas por falta de preparación»',
          who: 'Consultor independiente, 7 años como director comercial en pymes', nextStep: 'Una prueba en las 3 próximas reuniones',
          mechanism: 'Diagnóstico de la oferta (semana 1)\nFicha de cliente y persona antes de cada reunión\nDebrief y correo de seguimiento al día siguiente', advantages: 'Menos tiempo de preparación\nMás reuniones cerradas\nTranquilidad: un método, no una herramienta nueva',
        },
      }), proofs: '', price: '', floor: '', delays: '', objections: '', constraints: '' },
      missing: ['price', 'proofs', 'objections', 'floor', 'delays'],
      notes: L({ fr: '[DEMO] Le prix et les preuves ne sont pas dans la description.', en: '[DEMO] Price and proof are not in the description.', es: '[DEMO] El precio y las pruebas no están en la descripción.' }),
    }));
  }
  if (task === 'offer_question') {
    const m = /DERNIÈRE RÉPONSE \(pour le champ "(\w+)"\) : ([\s\S]*?)\n\nRègles/.exec(last);
    const cur = /FICHE ACTUELLE :\n([\s\S]*?)\n\nDIALOGUE/.exec(last);
    let fiche = {}; try { fiche = JSON.parse(cur?.[1] || '{}'); } catch {}
    if (m) fiche[m[1]] = m[2].trim();
    const order = ['oneLiner', 'targets', 'problem', 'nextStep', 'price', 'proofs', 'objections'];
    const qs = L({
      fr: { oneLiner: 'En une phrase, sans jargon : que vendez-vous, à qui, pour quel résultat ?', targets: 'Qui achète, qui utilise, qui décide ? (souvent trois personnes différentes)', problem: 'Quel problème chaque cible a-t-elle, avec ses propres mots ?', nextStep: 'Quel « petit oui » voulez-vous obtenir en fin de rendez-vous : un essai, un devis, un second RDV ?', price: 'Quel est votre prix, et dans quelle unité parle-t-il au client (par mois, par RDV, par élève…) ?', proofs: 'Quelles preuves pouvez-vous montrer : chiffres, références, témoignages ?', objections: 'Quelles objections entendez-vous le plus souvent ? Citez-en 5.' },
      en: { oneLiner: 'In one sentence, no jargon: what do you sell, to whom, for what result?', targets: 'Who buys, who uses, who decides? (often three different people)', problem: 'What problem does each target have, in their own words?', nextStep: 'What “small yes” do you want at the end of the meeting: a trial, a quote, a second meeting?', price: 'What is your price, and in which unit does it make sense to the client (per month, per meeting, per pupil…)?', proofs: 'What proof can you show: figures, references, testimonials?', objections: 'Which objections do you hear most often? Name 5.' },
      es: { oneLiner: 'En una frase, sin jerga: ¿qué vendes, a quién y para qué resultado?', targets: '¿Quién compra, quién usa, quién decide? (a menudo son tres personas distintas)', problem: '¿Qué problema tiene cada perfil, con sus propias palabras?', nextStep: '¿Qué «pequeño sí» quieres obtener al final de la reunión: una prueba, un presupuesto, una segunda reunión?', price: '¿Cuál es tu precio y en qué unidad le habla al cliente (al mes, por reunión, por alumno…)?', proofs: '¿Qué pruebas puedes mostrar: cifras, referencias, testimonios?', objections: '¿Qué objeciones oyes con más frecuencia? Cita 5.' },
    });
    const next = order.find((k) => !String(fiche[k] || '').trim());
    return delay(JSON.stringify({ field_value: m ? m[2].trim() : '', next_field: next || '', question: next ? qs[next] : '', done: !next }));
  }
  if (task === 'regulation') {
    const url = /https?:\/\/[^\s)"]+/.exec(last)?.[0] || '';
    return delay(JSON.stringify({ regulated: 'yes', ...L({
      fr: { summary: '[DEMO] Activité probablement réglementée : vérifiez l’autorisation d’exercer et l’assurance obligatoire.', requirements: [{ item: 'Autorisation ou diplôme exigé pour exercer', authority: 'Autorité du secteur (à vérifier)', source: url }], field_value: '[DEMO] Autorisation d’exercer et assurance professionnelle — à vérifier auprès de l’autorité du secteur.' },
      en: { summary: '[DEMO] Probably a regulated activity: check the licence to operate and mandatory insurance.', requirements: [{ item: 'Licence or qualification required to operate', authority: 'Sector authority (to be checked)', source: url }], field_value: '[DEMO] Licence to operate and professional insurance — to be checked with the sector authority.' },
      es: { summary: '[DEMO] Actividad probablemente regulada: verifica la habilitación para ejercer y el seguro obligatorio.', requirements: [{ item: 'Licencia o título exigido para ejercer', authority: 'Autoridad del sector (por verificar)', source: url }], field_value: '[DEMO] Habilitación para ejercer y seguro profesional — por verificar con la autoridad del sector.' },
    }) }));
  }
  if (task === 'maturity') {
    return delay(JSON.stringify({
      score: 3, verdict: 'prêt pour des réunions à blanc', // code comparé par l'app : reste en français
      ...L({
        fr: {
          label: 'Offre définie', summary: '[DEMO] La cible, le problème et le mécanisme sont clairs. Sans preuve ni prix ramené à l’unité du client, l’argumentaire reste fragile face à « c’est trop cher ».',
          strengths: ['Problème formulé avec les mots du client', 'Mécanisme en 3 étapes lisible', 'Petit oui identifié (essai sur 3 RDV)'],
          gaps: [{ field: 'proofs', why: 'Sans preuve, chaque avantage est une promesse.', fix: 'Collecter 2 témoignages et 1 chiffre de résultat.' }, { field: 'price', why: 'Le prix arrive sans unité qui parle au client.', fix: 'Exprimer le prix par rendez-vous gagné ou par mois.' }, { field: 'objections', why: 'Aucune réponse préparée.', fix: 'Lister 5 objections et une réponse en 4 temps pour chacune.' }],
          next_step: 'Obtenir deux témoignages écrits avant le prochain rendez-vous.',
        },
        en: {
          label: 'Offer defined', summary: '[DEMO] The target, problem and mechanism are clear. Without proof or a price expressed in the client’s unit, the pitch stays weak against “it’s too expensive”.',
          strengths: ['Problem stated in the client’s words', 'Clear 3-step mechanism', 'Small yes identified (trial on 3 meetings)'],
          gaps: [{ field: 'proofs', why: 'Without proof, every benefit is a promise.', fix: 'Collect 2 testimonials and 1 result figure.' }, { field: 'price', why: 'The price comes without a unit that makes sense to the client.', fix: 'Express the price per meeting won or per month.' }, { field: 'objections', why: 'No prepared answers.', fix: 'List 5 objections and a 4-step answer for each.' }],
          next_step: 'Get two written testimonials before the next meeting.',
        },
        es: {
          label: 'Oferta definida', summary: '[DEMO] El perfil, el problema y el mecanismo están claros. Sin pruebas ni un precio expresado en la unidad del cliente, el argumentario sigue siendo frágil ante «es demasiado caro».',
          strengths: ['Problema formulado con las palabras del cliente', 'Mecanismo claro en 3 pasos', 'Pequeño sí identificado (prueba en 3 reuniones)'],
          gaps: [{ field: 'proofs', why: 'Sin pruebas, cada ventaja es una promesa.', fix: 'Reunir 2 testimonios y 1 cifra de resultados.' }, { field: 'price', why: 'El precio llega sin una unidad que le hable al cliente.', fix: 'Expresar el precio por reunión ganada o por mes.' }, { field: 'objections', why: 'Ninguna respuesta preparada.', fix: 'Enumerar 5 objeciones y una respuesta en 4 pasos para cada una.' }],
          next_step: 'Conseguir dos testimonios por escrito antes de la próxima reunión.',
        },
      }),
    }));
  }
  if (task === 'client_extract') {
    const f = L({
      fr: { company: 'Collège privé, Paris', sector: 'Enseignement secondaire', c1: 'Le directeur', r1: 'Directeur — décide des achats pédagogiques', c2: 'La professeure d’histoire', r2: 'Utilisera le support en classe', meetingFormat: 'Rendez-vous sur place, 30 minutes', notes: '[DEMO] Les professeurs se plaignent que les élèves ne lisent plus.' },
      en: { company: 'Private secondary school, Paris', sector: 'Secondary education', c1: 'The head teacher', r1: 'Head teacher — decides on teaching purchases', c2: 'The history teacher', r2: 'Will use the material in class', meetingFormat: 'On-site meeting, 30 minutes', notes: '[DEMO] Teachers complain that pupils no longer read.' },
      es: { company: 'Colegio privado, París', sector: 'Educación secundaria', c1: 'El director', r1: 'Director — decide las compras pedagógicas', c2: 'La profesora de historia', r2: 'Usará el material en clase', meetingFormat: 'Reunión presencial, 30 minutos', notes: '[DEMO] Los profesores se quejan de que los alumnos ya no leen.' },
    });
    return delay(JSON.stringify({ fields: { company: f.company, sector: f.sector, website: '', contacts: [{ name: f.c1, role: f.r1, weight: 'decide' }, { name: f.c2, role: f.r2, weight: 'use' }], meetingFormat: f.meetingFormat, decisionProcess: '', notes: f.notes }, missing: ['decisionProcess', 'website'] }));
  }
  if (task === 'client_question') {
    const m = /DERNIÈRE RÉPONSE \(pour le champ "(\w+)"\) : ([\s\S]*?)\n\nRègles/.exec(last);
    const cur = /FICHE ACTUELLE :\n([\s\S]*?)\n\nDIALOGUE/.exec(last);
    let fiche = {}; try { fiche = JSON.parse(cur?.[1] || '{}'); } catch {}
    if (m) fiche[m[1]] = m[2].trim();
    const order = ['meetingFormat', 'company', 'decisionProcess'];
    const qs = L({
      fr: { meetingFormat: 'Sous quelle forme a lieu le rendez-vous : mail, visio, sur place, salon ? Quand, et combien de temps ?', company: 'Quel est l’établissement ou l’entreprise ?', decisionProcess: 'Qui d’autre participe à la décision, et à quelle échéance ?' },
      en: { meetingFormat: 'What form does the meeting take: email, video call, on site, trade show? When, and for how long?', company: 'Which organisation or company is it?', decisionProcess: 'Who else is involved in the decision, and by when?' },
      es: { meetingFormat: '¿Qué formato tiene la reunión: correo, videollamada, presencial, feria? ¿Cuándo y cuánto dura?', company: '¿De qué centro o empresa se trata?', decisionProcess: '¿Quién más participa en la decisión y con qué plazo?' },
    });
    const next = order.find((k) => !String(fiche[k] || '').trim());
    return delay(JSON.stringify({ field_value: m ? m[2].trim() : '', next_field: next || '', question: next ? qs[next] : '', done: !next }));
  }
  if (task === 'debrief_extract') {
    const f = L({
      fr: { objectionsHeard: 'Budget déjà engagé cette année\nVeut l’avis du professeur d’histoire', decisionMaker: 'Le directeur', a1: 'Présentation de 30 min au professeur d’histoire', o1: 'Date confirmée + dossier enseignant envoyé', a2: 'Envoyer le devis pour 4 classes', o2: 'Devis Chorus Pro', notes: '[DEMO] 4 classes de 3e ; décision avant la Toussaint.' },
      en: { objectionsHeard: 'Budget already committed this year\nWants the history teacher’s opinion', decisionMaker: 'The head teacher', a1: '30-min presentation to the history teacher', o1: 'Date confirmed + teacher pack sent', a2: 'Send the quote for 4 classes', o2: 'Quote via Chorus Pro', notes: '[DEMO] 4 Year 10 classes; decision before the autumn half-term.' },
      es: { objectionsHeard: 'Presupuesto ya comprometido este año\nQuiere la opinión del profesor de historia', decisionMaker: 'El director', a1: 'Presentación de 30 min al profesor de historia', o1: 'Fecha confirmada + dosier para el docente enviado', a2: 'Enviar el presupuesto para 4 clases', o2: 'Presupuesto vía Chorus Pro', notes: '[DEMO] 4 clases de 3.º de ESO; decisión antes de las vacaciones de otoño.' },
    });
    return delay(JSON.stringify({ fields: { outcome: 'RDV décideur à fixer', objectionsHeard: f.objectionsHeard, decisionMaker: f.decisionMaker, actions: [{ action: f.a1, owner: 'me', due: '2026-10-15', output: f.o1 }, { action: f.a2, owner: 'me', due: '2026-10-17', output: f.o2 }], notes: f.notes }, missing: [] }));
  }
  if (task === 'competition') {
    const f = L({
      fr: { summary: '[DEMO] Exemple fictif de comparaison : aucune recherche ni vérification par le modèle.', name: '[DEMO] Réaliser en interne', target: 'Même besoin à confirmer', offer: 'Mobiliser une personne en interne', difference: 'À vérifier : temps disponible et compétences', question: 'Comment traitez-vous ce besoin aujourd’hui ?' },
      en: { summary: '[DEMO] Fictional comparison example: no research or verification by the model.', name: '[DEMO] Do it in-house', target: 'Same need, to be confirmed', offer: 'Assign someone in-house', difference: 'To check: available time and skills', question: 'How do you handle this need today?' },
      es: { summary: '[DEMO] Ejemplo ficticio de comparación: el modelo no ha investigado ni verificado nada.', name: '[DEMO] Hacerlo internamente', target: 'Misma necesidad, por confirmar', offer: 'Asignar a una persona interna', difference: 'Por verificar: tiempo disponible y competencias', question: '¿Cómo resuelves esta necesidad hoy?' },
    });
    return delay(JSON.stringify({ summary: f.summary, candidates: [{ name: f.name, type: 'alternative', target: f.target, offer: f.offer, price: 'Non publié', difference: f.difference, question: f.question, source_ids: [] }] }));
  }
  if (task === 'positioning') {
    const f = L({
      fr: { price: '[DEMO] Prix', priceUs: 'Publié, par cycle', format: 'Format', onSite: 'Sur site', suggestion: '[DEMO] Exemple fictif : appuyer chaque piste sur un écart de la grille.' },
      en: { price: '[DEMO] Price', priceUs: 'Published, per cycle', format: 'Format', onSite: 'On site', suggestion: '[DEMO] Fictional example: base each idea on a gap in the grid.' },
      es: { price: '[DEMO] Precio', priceUs: 'Publicado, por ciclo', format: 'Formato', onSite: 'Presencial', suggestion: '[DEMO] Ejemplo ficticio: apoya cada línea en una diferencia de la tabla.' },
    });
    return delay(JSON.stringify({ criteria: [{ label: f.price, us: f.priceUs }, { label: f.format, us: f.onSite }], competitors: [{ cells: [{ avantage: 'inconnu', value: 'Non publié' }, { avantage: 'égal', value: f.onSite }] }], suggestions: [f.suggestion] }));
  }
  if (task === 'client_brief') {
    let client = {}; try { client = JSON.parse(/typed by user\):\n([^\n]+)/.exec(last)?.[1] || '{}'); } catch {}
    const email = client.preparationMode === 'email';
    const first = client.contacts?.[0]?.name || '';
    const f = L({
      fr: {
        company_summary: '[DEMO] PME de services, 40 salariés, en croissance, cherche à structurer sa prospection.',
        contact_summary: '[DEMO] Dirigeant·e fondateur·rice, décide seul·e, sensible au temps et au retour sur investissement.',
        likely_problems: ['Pas de process commercial formalisé', 'Peu de temps pour prospecter', 'Difficulté à conclure'],
        stakes: 'Atteindre l’objectif de CA sur 6 mois sans recruter.',
        role: 'À confirmer', identity: '[DEMO] Saisie utilisateur, identité publique à confirmer', hypothesis: '[DEMO] Besoin à explorer', pq: '[DEMO] Quel résultat attendez-vous de cet échange ?',
        competitive: '[DEMO] Comparer avec une réalisation en interne, sans supposer que le client l’envisage.',
        opening: '[DEMO] Quel résultat souhaitez-vous obtenir de cet échange ?', subject: '[DEMO] Un échange sur vos priorités',
        body: `[DEMO] Bonjour ${first},\nJe vous propose un échange pour comprendre vos priorités et voir si mon offre peut vous être utile. Quel créneau vous conviendrait ?`,
        assumptions: ['Budget limité', 'Décision rapide possible'],
        questions: ['Comment gérez-vous la prospection aujourd’hui ?', 'Quel résultat voulez-vous dans 6 mois ?', 'Qui d’autre participe à la décision ?'],
      },
      en: {
        company_summary: '[DEMO] Service SMB, 40 staff, growing, wants to structure its prospecting.',
        contact_summary: '[DEMO] Founder-CEO, sole decision maker, time- and ROI-sensitive.',
        likely_problems: ['No formal sales process', 'Little time to prospect', 'Hard to close'],
        stakes: 'Hit the 6-month revenue target without hiring.',
        role: 'To be confirmed', identity: '[DEMO] Entered by the user, public identity to be confirmed', hypothesis: '[DEMO] Need to explore', pq: '[DEMO] What result do you expect from this conversation?',
        competitive: '[DEMO] Compare with doing it in-house, without assuming the client is considering it.',
        opening: '[DEMO] What result would you like to get from this conversation?', subject: '[DEMO] A conversation about your priorities',
        body: `[DEMO] Hello ${first},\nI suggest a short conversation to understand your priorities and see whether my offer could be useful to you. What time would suit you?`,
        assumptions: ['Limited budget', 'Can decide quickly'],
        questions: ['How do you prospect today?', 'What result do you want in 6 months?', 'Who else is part of the decision?'],
      },
      es: {
        company_summary: '[DEMO] Pyme de servicios, 40 empleados, en crecimiento, quiere estructurar su prospección.',
        contact_summary: '[DEMO] Fundador/a y director/a, decide solo/a, sensible al tiempo y al retorno de la inversión.',
        likely_problems: ['Sin proceso comercial formalizado', 'Poco tiempo para prospectar', 'Dificultad para cerrar'],
        stakes: 'Alcanzar el objetivo de facturación a 6 meses sin contratar.',
        role: 'Por confirmar', identity: '[DEMO] Dato introducido por el usuario, identidad pública por confirmar', hypothesis: '[DEMO] Necesidad por explorar', pq: '[DEMO] ¿Qué resultado esperas de esta conversación?',
        competitive: '[DEMO] Comparar con hacerlo internamente, sin suponer que el cliente lo esté planteando.',
        opening: '[DEMO] ¿Qué resultado te gustaría obtener de esta conversación?', subject: '[DEMO] Una conversación sobre tus prioridades',
        body: `[DEMO] Hola ${first}:\nTe propongo una breve conversación para entender tus prioridades y ver si mi oferta te puede ser útil. ¿Qué horario te vendría bien?`,
        assumptions: ['Presupuesto limitado', 'Decisión rápida posible'],
        questions: ['¿Cómo gestionas hoy la prospección?', '¿Qué resultado quieres dentro de 6 meses?', '¿Quién más participa en la decisión?'],
      },
    });
    return delay(JSON.stringify({
      company_summary: f.company_summary,
      contact_summary: f.contact_summary,
      likely_problems: f.likely_problems,
      stakes: f.stakes,
      facts: [],
      participants: (client.contacts || []).map(p => ({ name: p.name || p.role, documented_role: p.role || f.role, identity_check: f.identity, hypothesis: f.hypothesis, question: f.pq, source_ids: ['client'] })),
      signals: [], competitive_context: [f.competitive],
      preparation: { opening: f.opening, email_subject: email ? f.subject : '', email_body: email ? f.body : '' },
      assumptions: f.assumptions,
      questions_to_ask: f.questions,
    }));
  }
  if (task === 'soncas') {
    const m = /INTERLOCUTEURS PRÉSENTS AU RENDEZ-VOUS[^\n]*\n(\[[\s\S]*?\])\nFICHE CLIENT/.exec(last);
    let people = []; try { people = JSON.parse(m?.[1] || '[]'); } catch {}
    const f = L({
      fr: {
        contact: 'Interlocuteur', person: 'Personne',
        rationale: [
          { S: 'Veut être sûr que ça marche avant d’investir.', O: 'Peu de signaux de prestige.', N: 'Curieux des outils IA.', C: 'Manque de temps : simplicité attendue.', A: 'ROI et coût au centre.', Y: 'Relation directe.', E: 'Non mentionné.' },
          { S: 'Peu concerné par le risque financier.', O: 'Aime être moteur d’un projet.', N: 'Cherche du neuf pour ses classes.', C: 'Veut zéro préparation en plus.', A: 'Le budget n’est pas son sujet.', Y: 'Sensible à l’accompagnement humain.', E: 'Valeurs importantes.' },
          { S: 'Veut des garanties.', O: '—', N: 'Méfiant envers la nouveauté.', C: '—', A: 'Tient les cordons de la bourse.', Y: '—', E: '—' },
        ],
        arguments: [
          { S: ['Cadre clair, étapes définies, essai limité avant engagement.'], O: ['Vous serez cité comme référence pilote.'], N: ['Une méthode que vos concurrents n’utilisent pas encore.'], C: ['Mise en place en une semaine, sans changer vos outils.'], A: ['Prix ramené par rendez-vous gagné ; pas de coût caché.'], Y: ['Un interlocuteur unique, joignable.'], E: ['Outils sobres, pas de déplacement.'] },
          { S: ['Un cadre testé, rien à inventer.'], O: ['Vous portez le projet pilote.'], N: ['Un support que les élèves n’ont jamais vu.'], C: ['Prêt à l’emploi, séance clé en main.'], A: ['Rien à avancer.'], Y: ['Un échange direct avec l’auteur.'], E: ['Papier recyclé, impression locale.'] },
          { S: ['Références vérifiables.'], O: ['—'], N: ['Rien de risqué : un essai limité.'], C: ['—'], A: ['Coût par élève connu d’avance.'], Y: ['—'], E: ['—'] },
        ],
        main_message: '[DEMO] Sécurisez la décision avec un essai limité, rentable dès la première classe — sans travail en plus pour l’équipe.',
        tension: '[DEMO] Argent fort chez le décideur, Nouveauté forte chez l’utilisatrice : présenter la nouveauté comme un essai gratuit pour une classe, donc sans risque financier.',
        gap: 'Aucun témoignage client dans la fiche',
      },
      en: {
        contact: 'Contact', person: 'Person',
        rationale: [
          { S: 'Wants to be sure it works before investing.', O: 'Few prestige signals.', N: 'Curious about AI tools.', C: 'Short on time: expects simplicity.', A: 'ROI and cost come first.', Y: 'Direct relationship.', E: 'Not mentioned.' },
          { S: 'Not very concerned by financial risk.', O: 'Likes to drive a project.', N: 'Looking for something new for their classes.', C: 'Wants zero extra preparation.', A: 'Budget is not their concern.', Y: 'Values human support.', E: 'Values matter.' },
          { S: 'Wants guarantees.', O: '—', N: 'Wary of novelty.', C: '—', A: 'Holds the purse strings.', Y: '—', E: '—' },
        ],
        arguments: [
          { S: ['Clear framework, defined steps, limited trial before any commitment.'], O: ['You will be named as a pilot reference.'], N: ['A method your competitors don’t use yet.'], C: ['Set up in one week, without changing your tools.'], A: ['Price per meeting won; no hidden costs.'], Y: ['One single, reachable contact.'], E: ['Lightweight tools, no travel.'] },
          { S: ['A tested framework, nothing to invent.'], O: ['You lead the pilot project.'], N: ['Material the pupils have never seen.'], C: ['Ready to use, turnkey session.'], A: ['Nothing to pay upfront.'], Y: ['Direct contact with the author.'], E: ['Recycled paper, local printing.'] },
          { S: ['Verifiable references.'], O: ['—'], N: ['Nothing risky: a limited trial.'], C: ['—'], A: ['Cost per pupil known in advance.'], Y: ['—'], E: ['—'] },
        ],
        main_message: '[DEMO] Secure the decision with a limited trial that pays off from the first class — with no extra work for the team.',
        tension: '[DEMO] Money is strong for the decision maker, Novelty is strong for the user: present the novelty as a free trial for one class, so with no financial risk.',
        gap: 'No client testimonial in the sheet',
      },
      es: {
        contact: 'Interlocutor', person: 'Persona',
        rationale: [
          { S: 'Quiere estar seguro de que funciona antes de invertir.', O: 'Pocas señales de prestigio.', N: 'Curioso por las herramientas de IA.', C: 'Falta de tiempo: espera sencillez.', A: 'El ROI y el coste son lo primero.', Y: 'Relación directa.', E: 'No mencionado.' },
          { S: 'Le preocupa poco el riesgo financiero.', O: 'Le gusta impulsar proyectos.', N: 'Busca novedades para sus clases.', C: 'No quiere ninguna preparación extra.', A: 'El presupuesto no es su tema.', Y: 'Valora el acompañamiento humano.', E: 'Los valores son importantes.' },
          { S: 'Quiere garantías.', O: '—', N: 'Desconfía de la novedad.', C: '—', A: 'Controla el presupuesto.', Y: '—', E: '—' },
        ],
        arguments: [
          { S: ['Marco claro, pasos definidos, prueba limitada antes de comprometerte.'], O: ['Aparecerás como referencia piloto.'], N: ['Un método que tus competidores aún no usan.'], C: ['Puesta en marcha en una semana, sin cambiar tus herramientas.'], A: ['Precio por reunión ganada; sin costes ocultos.'], Y: ['Un único interlocutor, siempre localizable.'], E: ['Herramientas sencillas, sin desplazamientos.'] },
          { S: ['Un marco probado, nada que inventar.'], O: ['Tú lideras el proyecto piloto.'], N: ['Un material que los alumnos nunca han visto.'], C: ['Listo para usar, sesión llave en mano.'], A: ['Nada que adelantar.'], Y: ['Contacto directo con el autor.'], E: ['Papel reciclado, impresión local.'] },
          { S: ['Referencias verificables.'], O: ['—'], N: ['Nada arriesgado: una prueba limitada.'], C: ['—'], A: ['Coste por alumno conocido de antemano.'], Y: ['—'], E: ['—'] },
        ],
        main_message: '[DEMO] Asegura la decisión con una prueba limitada, rentable desde la primera clase, sin trabajo extra para el equipo.',
        tension: '[DEMO] Dinero fuerte en quien decide, Novedad fuerte en la usuaria: presentar la novedad como una prueba gratuita para una clase, es decir, sin riesgo financiero.',
        gap: 'Ningún testimonio de cliente en la ficha',
      },
    });
    if (!people.length) people = [{ name: f.contact, weight: 'decide' }];
    const scores = [{ S: 3, O: 1, N: 2, C: 3, A: 3, Y: 2, E: 1 }, { S: 2, O: 2, N: 3, C: 3, A: 1, Y: 3, E: 2 }, { S: 3, O: 2, N: 1, C: 2, A: 3, Y: 2, E: 2 }];
    return delay(JSON.stringify({
      people: people.slice(0, 3).map((p, i) => ({ name: p.name || p.role || `${f.person} ${i + 1}`, weight: p.weight || 'influence', scores: scores[i], rationale: f.rationale[i], arguments: f.arguments[i] })),
      main_message: f.main_message,
      tensions: people.length > 1 ? [f.tension] : [],
      gaps: [f.gap],
    }));
  }
  if (task === 'simac') {
    const f = L({
      fr: {
        situation: '[DEMO] Vous m’avez dit que vous perdez des ventes faute de préparation et que vous visez +20 % de CA en 6 mois.',
        idea: 'Préparer chaque rendez-vous en 20 minutes avec une méthode guidée.',
        mechanism: ['Diagnostic de votre offre (semaine 1)', 'Fiche client et persona avant chaque RDV', 'Déroulé SIMAC et réponses aux objections', 'Suivi J+1 avec appel à l’action', 'Prix : forfait mensuel, sans engagement'],
        advantages: ['Pour le directeur : vous gagnez du temps de préparation (besoin : manque de temps)', 'Pour le directeur : vous concluez plus souvent (besoin : taux de closing)', 'Pour la professeure : vous gardez la main, rien de nouveau à apprendre (besoin : zéro friction)'],
        conclusion: 'Préférez-vous démarrer par un essai sur vos 3 prochains rendez-vous, ou par le diagnostic complet de votre offre ? Dès votre choix, je vous envoie le calendrier mardi.',
        who: 'Le directeur',
        o1: 'Je dois réfléchir', r1: 'Bien sûr. Quel point précis mérite réflexion : le prix, le timing ou le résultat attendu ?',
        o2: 'C’est trop cher', r2: 'Par rapport à quoi ? Ramené au rendez-vous gagné, qu’est-ce qui serait acceptable ?',
        gap: 'La fiche ne précise pas les conditions de résiliation',
        opening: 'Bonjour, je suis [Nom], j’aide les PME à conclure plus de ventes. Nous avions convenu de parler de votre prospection. Avant de commencer : quel est le point le plus important pour vous aujourd’hui ?',
      },
      en: {
        situation: '[DEMO] You told me you lose sales for lack of preparation and target +20% revenue in 6 months.',
        idea: 'Prepare each meeting in 20 minutes with a guided method.',
        mechanism: ['Offer diagnosis (week 1)', 'Client sheet and persona before each meeting', 'SIMAC script and objection answers', 'D+1 follow-up with call to action', 'Price: monthly flat fee, no lock-in'],
        advantages: ['For the head teacher: you save prep time (need: lack of time)', 'For the head teacher: you close more often (need: closing rate)', 'For the teacher: you stay in control, nothing new to learn (need: zero friction)'],
        conclusion: 'Would you rather start with a trial on your next 3 meetings, or with the full offer diagnosis? Once you choose, I’ll send you the schedule on Tuesday.',
        who: 'The head teacher',
        o1: 'I need to think about it', r1: 'Of course. Which point needs more thought: price, timing or the expected result?',
        o2: 'It’s too expensive', r2: 'Compared with what? Per meeting won, what would be acceptable?',
        gap: 'The sheet does not state the cancellation terms',
        opening: 'Hello, I’m [Name], I help SMBs close more sales. We agreed to talk about your prospecting. Before we start: what matters most to you today?',
      },
      es: {
        situation: '[DEMO] Me dijiste que pierdes ventas por falta de preparación y que buscas +20 % de facturación en 6 meses.',
        idea: 'Preparar cada reunión en 20 minutos con un método guiado.',
        mechanism: ['Diagnóstico de tu oferta (semana 1)', 'Ficha de cliente y persona antes de cada reunión', 'Guion SIMAC y respuestas a las objeciones', 'Seguimiento al día siguiente con llamada a la acción', 'Precio: tarifa mensual fija, sin permanencia'],
        advantages: ['Para el director: ganas tiempo de preparación (necesidad: falta de tiempo)', 'Para el director: cierras más a menudo (necesidad: tasa de cierre)', 'Para la profesora: mantienes el control, nada nuevo que aprender (necesidad: cero fricción)'],
        conclusion: '¿Prefieres empezar con una prueba en tus 3 próximas reuniones o con el diagnóstico completo de tu oferta? En cuanto elijas, te envío el calendario el martes.',
        who: 'El director',
        o1: 'Tengo que pensarlo', r1: 'Claro. ¿Qué punto concreto necesitas pensar: el precio, el momento o el resultado esperado?',
        o2: 'Es demasiado caro', r2: '¿Comparado con qué? Por reunión ganada, ¿qué te parecería aceptable?',
        gap: 'La ficha no indica las condiciones de cancelación',
        opening: 'Hola, soy [Nombre], ayudo a las pymes a cerrar más ventas. Quedamos en hablar de tu prospección. Antes de empezar: ¿qué es lo más importante para ti hoy?',
      },
    });
    return delay(JSON.stringify({
      situation: f.situation,
      idea: f.idea,
      mechanism: f.mechanism,
      advantages: f.advantages,
      conclusion: f.conclusion,
      objections: [
        { who: f.who, objection: f.o1, response: f.r1 },
        { who: f.who, objection: f.o2, response: f.r2 },
      ],
      gaps: [f.gap],
      opening: f.opening,
    }));
  }
  if (task === 'followup') {
    const f = L({
      fr: {
        subject: 'Suite à notre échange — prochaines étapes',
        body: '[DEMO] Bonjour [Prénom],\n\nMerci pour notre échange. Votre priorité : [résultat], dans [contraintes]. Nous avons discuté de [option].\n\nJe vous envoie [document] d’ici [date] ; vous le relisez avec [personne] et nous décidons [question] le [date].\n\nDites-moi si j’ai oublié quelque chose.\n\n[Nom]',
        lessons: ['Donner le prix seulement après la valeur', 'Nommer le décideur dès l’ouverture'],
        action: 'Envoyer la proposition', output: 'Proposition 2 pages',
      },
      en: {
        subject: 'Following our conversation — next steps',
        body: '[DEMO] Hello [First name],\n\nThank you for our conversation. Your priority: [result], within [constraints]. We discussed [option].\n\nI will send you [document] by [date]; you review it with [person] and we decide on [question] on [date].\n\nLet me know if I missed anything.\n\n[Name]',
        lessons: ['Give the price only after the value', 'Name the decision maker from the opening'],
        action: 'Send the proposal', output: '2-page proposal',
      },
      es: {
        subject: 'Tras nuestra conversación: próximos pasos',
        body: '[DEMO] Hola, [Nombre]:\n\nGracias por la conversación. Tu prioridad: [resultado], dentro de [limitaciones]. Hablamos de [opción].\n\nTe envío [documento] antes del [fecha]; lo revisas con [persona] y decidimos [cuestión] el [fecha].\n\nDime si se me ha pasado algo.\n\n[Nombre]',
        lessons: ['Dar el precio solo después del valor', 'Identificar a quien decide desde la apertura'],
        action: 'Enviar la propuesta', output: 'Propuesta de 2 páginas',
      },
    });
    return delay(JSON.stringify({
      email_subject: f.subject,
      email_body: f.body,
      lessons: f.lessons,
      next_action: { action: f.action, owner: 'me', due: '', output: f.output },
    }));
  }
  return delay(JSON.stringify({ text: '[DEMO] ' + last.slice(0, 200) }));
}

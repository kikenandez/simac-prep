// lib/llm.js — provider-agnostic chat completion over OpenAI-compatible endpoints.
// Every provider listed here has a free tier (or runs locally). Keys live in the
// browser (localStorage) and are sent only to the provider the user picked.

export const PROVIDERS = {
  groq: {
    label: 'Groq (free tier)',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    keyUrl: 'https://console.groq.com/keys',
    needsKey: true,
  },
  gemini: {
    label: 'Google Gemini (free tier)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    needsKey: true,
  },
  mistral: {
    label: 'Mistral (free "experiment" plan)',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    keyUrl: 'https://console.mistral.ai/api-keys',
    needsKey: true,
  },
  openrouter: {
    label: 'OpenRouter (":free" models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    keyUrl: 'https://openrouter.ai/keys',
    needsKey: true,
  },
  anthropic: {
    label: 'Claude — Anthropic (payant, données non utilisées pour l’entraînement)',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-5-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    needsKey: true,
    native: 'anthropic', // API Messages native : pas de /chat/completions
  },
  ollama: {
    label: 'Ollama (local, no key)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    keyUrl: 'https://ollama.com/download',
    needsKey: false,
  },
  mock: {
    label: 'Mock (offline demo, no AI)',
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
  if (data?.stop_reason === 'max_tokens') throw new Error('LLM_TRUNCATED: réponse coupée (trop longue). Réduisez les sources ou relancez.');
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
  return parseJSON(raw);
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
    const err = new SyntaxError('JSON illisible'); err.raw = String(raw).slice(0, 300); throw err;
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
// It returns plausible, clearly-labelled placeholder output.
function mockChat(messages, opts) {
  const last = messages[messages.length - 1]?.content || '';
  const sys = messages[0]?.content || '';
  const task = /TASK:(\w+)/.exec(sys)?.[1] || 'generic';
  const lang = /LANG:(\w+)/.exec(sys)?.[1] || 'fr';
  const fr = lang === 'fr';
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 400));

  if (task === 'offer_extract') {
    return delay(JSON.stringify({
      fields: {
        name: 'Coaching prospection 3 mois', oneLiner: 'Un accompagnement de 3 mois pour structurer la prospection d’une petite entreprise.',
        targets: 'Achète : le dirigeant\nUtilise : le dirigeant ou son commercial\nDécide : le dirigeant', problem: '« Je n’ai pas le temps de prospecter »\n« Je perds des ventes faute de préparation »',
        who: 'Consultant indépendant, 7 ans de direction commerciale en PME', nextStep: 'Un essai sur les 3 prochains rendez-vous',
        mechanism: 'Diagnostic de l’offre (semaine 1)\nFiche client et persona avant chaque RDV\nDébrief et mail de suivi à J+1', advantages: 'Gain de temps de préparation\nPlus de rendez-vous conclus\nTranquillité : une méthode, pas de nouvel outil',
        proofs: '', price: '', floor: '', delays: '', objections: '', constraints: '',
      },
      missing: ['price', 'proofs', 'objections', 'floor', 'delays'],
      notes: '[DEMO] Le prix et les preuves ne sont pas dans la description.',
    }));
  }
  if (task === 'offer_question') {
    const m = /DERNIÈRE RÉPONSE \(pour le champ "(\w+)"\) : ([\s\S]*?)\n\nRègles/.exec(last);
    const cur = /FICHE ACTUELLE :\n([\s\S]*?)\n\nDIALOGUE/.exec(last);
    let fiche = {}; try { fiche = JSON.parse(cur?.[1] || '{}'); } catch {}
    if (m) fiche[m[1]] = m[2].trim();
    const order = ['oneLiner', 'targets', 'problem', 'nextStep', 'price', 'proofs', 'objections'];
    const qs = { oneLiner: 'En une phrase, sans jargon : que vendez-vous, à qui, pour quel résultat ?', targets: 'Qui achète, qui utilise, qui décide ? (souvent trois personnes différentes)', problem: 'Quel problème chaque cible a-t-elle, avec ses propres mots ?', nextStep: 'Quel « petit oui » voulez-vous obtenir en fin de rendez-vous : un essai, un devis, un second RDV ?', price: 'Quel est votre prix, et dans quelle unité parle-t-il au client (par mois, par RDV, par élève…) ?', proofs: 'Quelles preuves pouvez-vous montrer : chiffres, références, témoignages ?', objections: 'Quelles objections entendez-vous le plus souvent ? Citez-en 5.' };
    const next = order.find((k) => !String(fiche[k] || '').trim());
    return delay(JSON.stringify({ field_value: m ? m[2].trim() : '', next_field: next || '', question: next ? qs[next] : '', done: !next }));
  }
  if (task === 'maturity') {
    return delay(JSON.stringify({
      score: 3, verdict: 'prêt pour des réunions à blanc', label: 'Offre définie', summary: '[DEMO] La cible, le problème et le mécanisme sont clairs. Sans preuve ni prix ramené à l’unité du client, l’argumentaire reste fragile face à « c’est trop cher ».',
      strengths: ['Problème formulé avec les mots du client', 'Mécanisme en 3 étapes lisible', 'Petit oui identifié (essai sur 3 RDV)'],
      gaps: [{ field: 'proofs', why: 'Sans preuve, chaque avantage est une promesse.', fix: 'Collecter 2 témoignages et 1 chiffre de résultat.' }, { field: 'price', why: 'Le prix arrive sans unité qui parle au client.', fix: 'Exprimer le prix par rendez-vous gagné ou par mois.' }, { field: 'objections', why: 'Aucune réponse préparée.', fix: 'Lister 5 objections et une réponse en 4 temps pour chacune.' }],
      next_step: 'Obtenir deux témoignages écrits avant le prochain rendez-vous.',
    }));
  }
  if (task === 'client_extract') {
    return delay(JSON.stringify({ fields: { company: 'Collège privé, Paris', sector: 'Enseignement secondaire', website: '', contacts: [{ name: 'Le directeur', role: 'Directeur — décide des achats pédagogiques', weight: 'decide' }, { name: 'La professeure d’histoire', role: 'Utilisera le support en classe', weight: 'use' }], meetingFormat: 'Rendez-vous sur place, 30 minutes', decisionProcess: '', notes: '[DEMO] Les professeurs se plaignent que les élèves ne lisent plus.' }, missing: ['decisionProcess', 'website'] }));
  }
  if (task === 'client_question') {
    const m = /DERNIÈRE RÉPONSE \(pour le champ "(\w+)"\) : ([\s\S]*?)\n\nRègles/.exec(last);
    const cur = /FICHE ACTUELLE :\n([\s\S]*?)\n\nDIALOGUE/.exec(last);
    let fiche = {}; try { fiche = JSON.parse(cur?.[1] || '{}'); } catch {}
    if (m) fiche[m[1]] = m[2].trim();
    const order = ['meetingFormat', 'company', 'decisionProcess'];
    const qs = { meetingFormat: 'Sous quelle forme a lieu le rendez-vous : mail, visio, sur place, salon ? Quand, et combien de temps ?', company: 'Quel est l’établissement ou l’entreprise ?', decisionProcess: 'Qui d’autre participe à la décision, et à quelle échéance ?' };
    const next = order.find((k) => !String(fiche[k] || '').trim());
    return delay(JSON.stringify({ field_value: m ? m[2].trim() : '', next_field: next || '', question: next ? qs[next] : '', done: !next }));
  }
  if (task === 'debrief_extract') {
    return delay(JSON.stringify({ fields: { outcome: 'RDV décideur à fixer', objectionsHeard: 'Budget déjà engagé cette année\nVeut l’avis du professeur d’histoire', decisionMaker: 'Le directeur', actions: [{ action: 'Présentation de 30 min au professeur d’histoire', owner: 'me', due: '2026-10-15', output: 'Date confirmée + dossier enseignant envoyé' }, { action: 'Envoyer le devis pour 4 classes', owner: 'me', due: '2026-10-17', output: 'Devis Chorus Pro' }], notes: '[DEMO] 4 classes de 3e ; décision avant la Toussaint.' }, missing: [] }));
  }
  if (task === 'competition') {
    return delay(JSON.stringify({ summary: '[DEMO] Exemple fictif de comparaison : aucune recherche ni vérification par le modèle.', candidates: [{ name: '[DEMO] Réaliser en interne', type: 'alternative', target: 'Même besoin à confirmer', offer: 'Mobiliser une personne en interne', price: 'Non publié', difference: 'À vérifier : temps disponible et compétences', question: 'Comment traitez-vous ce besoin aujourd’hui ?', source_ids: [] }] }));
  }
  if (task === 'positioning') {
    return delay(JSON.stringify({ criteria: [{ label: '[DEMO] Prix', us: 'Publié, par cycle' }, { label: 'Format', us: 'Sur site' }], competitors: [{ cells: [{ mark: '?', value: 'Non publié' }, { mark: '=', value: 'Sur site' }] }], suggestions: ['[DEMO] Exemple fictif : appuyer chaque piste sur un écart de la grille.'] }));
  }
  if (task === 'client_brief') {
    let client = {}; try { client = JSON.parse(/typed by user\):\n([^\n]+)/.exec(last)?.[1] || '{}'); } catch {}

    return delay(JSON.stringify({
      company_summary: fr ? '[DEMO] PME de services, 40 salariés, en croissance, cherche à structurer sa prospection.' : '[DEMO] Service SMB, 40 staff, growing, wants to structure its prospecting.',
      contact_summary: fr ? '[DEMO] Dirigeant·e fondateur·rice, décide seul·e, sensible au temps et au retour sur investissement.' : '[DEMO] Founder-CEO, sole decision maker, time- and ROI-sensitive.',
      likely_problems: fr ? ['Pas de process commercial formalisé', 'Peu de temps pour prospecter', 'Difficulté à conclure'] : ['No formal sales process', 'Little time to prospect', 'Hard to close'],
      stakes: fr ? 'Atteindre l’objectif de CA sur 6 mois sans recruter.' : 'Hit the 6-month revenue target without hiring.',
      facts: [],
      participants: (client.contacts || []).map(p => ({ name: p.name || p.role, documented_role: p.role || 'À confirmer', identity_check: '[DEMO] Saisie utilisateur, identité publique à confirmer', hypothesis: '[DEMO] Besoin à explorer', question: '[DEMO] Quel résultat attendez-vous de cet échange ?', source_ids: ['client'] })),
      signals: [], competitive_context: ['[DEMO] Comparer avec une réalisation en interne, sans supposer que le client l’envisage.'],
      preparation: { opening: '[DEMO] Quel résultat souhaitez-vous obtenir de cet échange ?', email_subject: client.preparationMode === 'email' ? '[DEMO] Un échange sur vos priorités' : '', email_body: client.preparationMode === 'email' ? `[DEMO] Bonjour ${client.contacts?.[0]?.name || ''},\nJe vous propose un échange pour comprendre vos priorités et voir si mon offre peut vous être utile. Quel créneau vous conviendrait ?` : '' },
      assumptions: fr ? ['Budget limité', 'Décision rapide possible'] : ['Limited budget', 'Can decide quickly'],
      questions_to_ask: fr ? ['Comment gérez-vous la prospection aujourd’hui ?', 'Quel résultat voulez-vous dans 6 mois ?', 'Qui d’autre participe à la décision ?'] : ['How do you prospect today?', 'What result do you want in 6 months?', 'Who else is part of the decision?'],
    }));
  }
  if (task === 'soncas') {
    const m = /INTERLOCUTEURS PRÉSENTS AU RENDEZ-VOUS[^\n]*\n(\[[\s\S]*?\])\nFICHE CLIENT/.exec(last);
    let people = []; try { people = JSON.parse(m?.[1] || '[]'); } catch {}
    if (!people.length) people = [{ name: 'Interlocuteur', weight: 'decide' }];
    const profiles = [
      { scores: { S: 3, O: 1, N: 2, C: 3, A: 3, Y: 2, E: 1 }, rationale: { S: 'Veut être sûr que ça marche avant d’investir.', O: 'Peu de signaux de prestige.', N: 'Curieux des outils IA.', C: 'Manque de temps : simplicité attendue.', A: 'ROI et coût au centre.', Y: 'Relation directe.', E: 'Non mentionné.' },
        arguments: { S: ['Cadre clair, étapes définies, essai limité avant engagement.'], O: ['Vous serez cité comme référence pilote.'], N: ['Une méthode que vos concurrents n’utilisent pas encore.'], C: ['Mise en place en une semaine, sans changer vos outils.'], A: ['Prix ramené par rendez-vous gagné ; pas de coût caché.'], Y: ['Un interlocuteur unique, joignable.'], E: ['Outils sobres, pas de déplacement.'] } },
      { scores: { S: 2, O: 2, N: 3, C: 3, A: 1, Y: 3, E: 2 }, rationale: { S: 'Peu concerné par le risque financier.', O: 'Aime être moteur d’un projet.', N: 'Cherche du neuf pour ses classes.', C: 'Veut zéro préparation en plus.', A: 'Le budget n’est pas son sujet.', Y: 'Sensible à l’accompagnement humain.', E: 'Valeurs importantes.' },
        arguments: { S: ['Un cadre testé, rien à inventer.'], O: ['Vous portez le projet pilote.'], N: ['Un support que les élèves n’ont jamais vu.'], C: ['Prêt à l’emploi, séance clé en main.'], A: ['Rien à avancer.'], Y: ['Un échange direct avec l’auteur.'], E: ['Papier recyclé, impression locale.'] } },
      { scores: { S: 3, O: 2, N: 1, C: 2, A: 3, Y: 2, E: 2 }, rationale: { S: 'Veut des garanties.', O: '—', N: 'Méfiant envers la nouveauté.', C: '—', A: 'Tient les cordons de la bourse.', Y: '—', E: '—' },
        arguments: { S: ['Références vérifiables.'], O: ['—'], N: ['Rien de risqué : un essai limité.'], C: ['—'], A: ['Coût par élève connu d’avance.'], Y: ['—'], E: ['—'] } },
    ];
    return delay(JSON.stringify({
      people: people.slice(0, 3).map((p, i) => ({ name: p.name || p.role || `Personne ${i + 1}`, weight: p.weight || 'influence', ...profiles[i] })),
      main_message: '[DEMO] Sécurisez la décision avec un essai limité, rentable dès la première classe — sans travail en plus pour l’équipe.',
      tensions: people.length > 1 ? ['[DEMO] Argent fort chez le décideur, Nouveauté forte chez l’utilisatrice : présenter la nouveauté comme un essai gratuit pour une classe, donc sans risque financier.'] : [],
      gaps: ['Aucun témoignage client dans la fiche'],
    }));
  }
  if (task === 'simac') {
    return delay(JSON.stringify({
      situation: fr ? '[DEMO] Vous m’avez dit que vous perdez des ventes faute de préparation et que vous visez +20 % de CA en 6 mois.' : '[DEMO] You told me you lose sales for lack of preparation and target +20% revenue in 6 months.',
      idea: fr ? 'Préparer chaque rendez-vous en 20 minutes avec une méthode guidée.' : 'Prepare each meeting in 20 minutes with a guided method.',
      mechanism: fr ? ['Diagnostic de votre offre (semaine 1)', 'Fiche client et persona avant chaque RDV', 'Déroulé SIMAC et réponses aux objections', 'Suivi J+1 avec appel à l’action', 'Prix : forfait mensuel, sans engagement'] : ['Offer diagnosis (week 1)', 'Client sheet and persona before each meeting', 'SIMAC script and objection answers', 'D+1 follow-up with call to action', 'Price: monthly flat fee, no lock-in'],
      advantages: fr ? ['Pour le directeur : vous gagnez du temps de préparation (besoin : manque de temps)', 'Pour le directeur : vous concluez plus souvent (besoin : taux de closing)', 'Pour la professeure : vous gardez la main, rien de nouveau à apprendre (besoin : zéro friction)'] : ['You save prep time (need: lack of time)', 'You close more often (need: closing rate)', 'You stay in control: no new tool imposed'],
      conclusion: fr ? 'Préférez-vous démarrer par un essai sur vos 3 prochains rendez-vous, ou par le diagnostic complet de votre offre ? Dès votre choix, je vous envoie le calendrier mardi.' : 'Would you rather start with a trial on your next 3 meetings, or with the full offer diagnosis? Once you choose, I send the schedule on Tuesday.',
      objections: [
        { who: 'Le directeur', objection: fr ? 'Je dois réfléchir' : 'I need to think', response: fr ? 'Bien sûr. Quel point précis mérite réflexion : le prix, le timing ou le résultat attendu ?' : 'Of course. Which point needs thought: price, timing, or expected result?' },
        { who: 'Le directeur', objection: fr ? 'C’est trop cher' : 'Too expensive', response: fr ? 'Par rapport à quoi ? Ramené au rendez-vous gagné, qu’est-ce qui serait acceptable ?' : 'Compared with what? Per won meeting, what would be acceptable?' },
      ],
      gaps: [fr ? 'La fiche ne précise pas les conditions de résiliation' : 'The sheet does not state cancellation terms'],
      opening: fr ? 'Bonjour, je suis [Nom], j’aide les PME à conclure plus de ventes. Nous avions convenu de parler de votre prospection. Avant de commencer : quel est le point le plus important pour vous aujourd’hui ?' : 'Hello, I’m [Name], I help SMBs close more sales. We agreed to talk about your prospecting. Before we start: what matters most to you today?',
    }));
  }
  if (task === 'followup') {
    return delay(JSON.stringify({
      email_subject: fr ? 'Suite à notre échange — prochaines étapes' : 'Next steps from our meeting',
      email_body: fr ? '[DEMO] Bonjour [Prénom],\n\nMerci pour notre échange. Votre priorité : [résultat], dans [contraintes]. Nous avons discuté de [option].\n\nJe vous envoie [document] d’ici [date] ; vous le relisez avec [personne] et nous décidons [question] le [date].\n\nDites-moi si j’ai oublié quelque chose.\n\n[Nom]' : '[DEMO] Hello [First name],\n\nThank you for our discussion. Your priority: [result], within [constraints]. We discussed [option].\n\nI will send [document] by [date]; you review it with [person] and we decide [question] on [date].\n\nLet me know if I missed anything.\n\n[Name]',
      lessons: fr ? ['Donner le prix seulement après la valeur', 'Nommer le décideur dès l’ouverture'] : ['Give price only after value', 'Name the decision maker at the opening'],
      next_action: { action: fr ? 'Envoyer la proposition' : 'Send proposal', owner: 'me', due: '', output: fr ? 'Proposition 2 pages' : '2-page proposal' },
    }));
  }
  return delay(JSON.stringify({ text: '[DEMO] ' + last.slice(0, 200) }));
}

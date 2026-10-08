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
  const headers = {};
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
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
  };
}

/**
 * chat(messages, {json, temperature, signal}) → string
 * messages: [{role:'system'|'user'|'assistant', content}]
 */
export async function chat(messages, opts = {}) {
  const cfg = resolve(opts.settings);
  if (cfg.provider === 'mock') return mockChat(messages, opts);
  if (cfg.needsKey && !cfg.apiKey) throw new Error('NO_API_KEY');

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
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
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
      score: 3, label: 'Offre définie', summary: '[DEMO] La cible, le problème et le mécanisme sont clairs. Sans preuve ni prix ramené à l’unité du client, l’argumentaire reste fragile face à « c’est trop cher ».',
      strengths: ['Problème formulé avec les mots du client', 'Mécanisme en 3 étapes lisible', 'Petit oui identifié (essai sur 3 RDV)'],
      gaps: [{ field: 'proofs', why: 'Sans preuve, chaque avantage est une promesse.', fix: 'Collecter 2 témoignages et 1 chiffre de résultat.' }, { field: 'price', why: 'Le prix arrive sans unité qui parle au client.', fix: 'Exprimer le prix par rendez-vous gagné ou par mois.' }, { field: 'objections', why: 'Aucune réponse préparée.', fix: 'Lister 5 objections et une réponse en 4 temps pour chacune.' }],
      next_step: 'Obtenir deux témoignages écrits avant le prochain rendez-vous.',
    }));
  }
  if (task === 'client_extract') {
    return delay(JSON.stringify({ fields: { company: 'Collège privé, Paris', sector: 'Enseignement secondaire', website: '', contactName: 'Le directeur', contactRole: 'Directeur — décide des achats pédagogiques', meetingFormat: 'Rendez-vous sur place, 30 minutes', decisionProcess: '', notes: '[DEMO] Les professeurs se plaignent que les élèves ne lisent plus.' }, missing: ['decisionProcess', 'website'] }));
  }
  if (task === 'client_question') {
    const m = /DERNIÈRE RÉPONSE \(pour le champ "(\w+)"\) : ([\s\S]*?)\n\nRègles/.exec(last);
    const cur = /FICHE ACTUELLE :\n([\s\S]*?)\n\nDIALOGUE/.exec(last);
    let fiche = {}; try { fiche = JSON.parse(cur?.[1] || '{}'); } catch {}
    if (m) fiche[m[1]] = m[2].trim();
    const order = ['contactRole', 'meetingFormat', 'company', 'decisionProcess'];
    const qs = { contactRole: 'Quelle est la fonction de votre interlocuteur, et quel est son rôle dans la décision ?', meetingFormat: 'Sous quelle forme a lieu le rendez-vous : mail, visio, sur place, salon ? Quand, et combien de temps ?', company: 'Quel est l’établissement ou l’entreprise ?', decisionProcess: 'Qui d’autre participe à la décision, et à quelle échéance ?' };
    const next = order.find((k) => !String(fiche[k] || '').trim());
    return delay(JSON.stringify({ field_value: m ? m[2].trim() : '', next_field: next || '', question: next ? qs[next] : '', done: !next }));
  }
  if (task === 'debrief_extract') {
    return delay(JSON.stringify({ fields: { outcome: 'RDV décideur à fixer', objectionsHeard: 'Budget déjà engagé cette année\nVeut l’avis du professeur d’histoire', decisionMaker: 'Le directeur', nextAction: 'Présentation de 30 min au professeur d’histoire', nextOwner: 'me', nextDue: '2026-10-15', nextOutput: 'Date confirmée + dossier enseignant envoyé', notes: '[DEMO] 4 classes de 3e ; décision avant la Toussaint.' }, missing: [] }));
  }
  if (task === 'client_brief') {
    return delay(JSON.stringify({
      company_summary: fr ? '[DEMO] PME de services, 40 salariés, en croissance, cherche à structurer sa prospection.' : '[DEMO] Service SMB, 40 staff, growing, wants to structure its prospecting.',
      contact_summary: fr ? '[DEMO] Dirigeant·e fondateur·rice, décide seul·e, sensible au temps et au retour sur investissement.' : '[DEMO] Founder-CEO, sole decision maker, time- and ROI-sensitive.',
      likely_problems: fr ? ['Pas de process commercial formalisé', 'Peu de temps pour prospecter', 'Difficulté à conclure'] : ['No formal sales process', 'Little time to prospect', 'Hard to close'],
      stakes: fr ? 'Atteindre l’objectif de CA sur 6 mois sans recruter.' : 'Hit the 6-month revenue target without hiring.',
      facts: [{ fact: fr ? 'Site web mentionne 3 offres' : 'Website lists 3 offers', source: 'site' }],
      assumptions: fr ? ['Budget limité', 'Décision rapide possible'] : ['Limited budget', 'Can decide quickly'],
      questions_to_ask: fr ? ['Comment gérez-vous la prospection aujourd’hui ?', 'Quel résultat voulez-vous dans 6 mois ?', 'Qui d’autre participe à la décision ?'] : ['How do you prospect today?', 'What result do you want in 6 months?', 'Who else is part of the decision?'],
    }));
  }
  if (task === 'soncas') {
    return delay(JSON.stringify({
      scores: { S: 3, O: 1, N: 2, C: 3, A: 3, Y: 2, E: 1 },
      rationale: {
        S: fr ? 'Veut être sûr que ça marche avant d’investir.' : 'Wants proof it works before investing.',
        O: fr ? 'Peu de signaux de prestige.' : 'Few prestige signals.',
        N: fr ? 'Curieux des outils IA.' : 'Curious about AI tools.',
        C: fr ? 'Manque de temps : simplicité attendue.' : 'Short on time: expects simplicity.',
        A: fr ? 'ROI et coût au centre.' : 'ROI and cost are central.',
        Y: fr ? 'Relation directe fondateur-prestataire.' : 'Direct founder-vendor relationship.',
        E: fr ? 'Non mentionné.' : 'Not mentioned.',
      },
      arguments: {
        S: [fr ? 'Cadre clair, étapes définies, essai limité avant engagement.' : 'Clear frame, defined steps, limited trial before commitment.'],
        O: [fr ? 'Vous serez cité comme référence pilote.' : 'You would be cited as a pilot reference.'],
        N: [fr ? 'Une méthode outillée par l’IA que vos concurrents n’utilisent pas encore.' : 'An AI-assisted method your competitors don’t use yet.'],
        C: [fr ? 'Mise en place en une semaine, sans changer vos outils.' : 'Set up in one week, no tool change.'],
        A: [fr ? 'Prix ramené par rendez-vous gagné ; pas de coût caché.' : 'Price per won meeting; no hidden cost.'],
        Y: [fr ? 'Un interlocuteur unique, joignable.' : 'One named contact, reachable.'],
        E: [fr ? 'Outils sobres, pas de déplacement.' : 'Lightweight tools, no travel.'],
      },
      main_message: fr ? '[DEMO] Sécurisez vos ventes des 6 prochains mois avec une méthode simple, rentable dès le premier client signé.' : '[DEMO] Secure your next 6 months of sales with a simple method that pays for itself at the first signed client.',
    }));
  }
  if (task === 'simac') {
    return delay(JSON.stringify({
      situation: fr ? '[DEMO] Vous m’avez dit que vous perdez des ventes faute de préparation et que vous visez +20 % de CA en 6 mois.' : '[DEMO] You told me you lose sales for lack of preparation and target +20% revenue in 6 months.',
      idea: fr ? 'Préparer chaque rendez-vous en 20 minutes avec une méthode guidée.' : 'Prepare each meeting in 20 minutes with a guided method.',
      mechanism: fr ? ['Diagnostic de votre offre (semaine 1)', 'Fiche client et persona avant chaque RDV', 'Déroulé SIMAC et réponses aux objections', 'Suivi J+1 avec appel à l’action', 'Prix : forfait mensuel, sans engagement'] : ['Offer diagnosis (week 1)', 'Client sheet and persona before each meeting', 'SIMAC script and objection answers', 'D+1 follow-up with call to action', 'Price: monthly flat fee, no lock-in'],
      advantages: fr ? ['Vous gagnez du temps de préparation (besoin : manque de temps)', 'Vous concluez plus souvent (besoin : taux de closing)', 'Vous gardez la main : pas de nouvel outil imposé'] : ['You save prep time (need: lack of time)', 'You close more often (need: closing rate)', 'You stay in control: no new tool imposed'],
      conclusion: fr ? 'Préférez-vous démarrer par un essai sur vos 3 prochains rendez-vous, ou par le diagnostic complet de votre offre ? Dès votre choix, je vous envoie le calendrier mardi.' : 'Would you rather start with a trial on your next 3 meetings, or with the full offer diagnosis? Once you choose, I send the schedule on Tuesday.',
      objections: [
        { objection: fr ? 'Je dois réfléchir' : 'I need to think', response: fr ? 'Bien sûr. Quel point précis mérite réflexion : le prix, le timing ou le résultat attendu ?' : 'Of course. Which point needs thought: price, timing, or expected result?' },
        { objection: fr ? 'C’est trop cher' : 'Too expensive', response: fr ? 'Par rapport à quoi ? Ramené au rendez-vous gagné, qu’est-ce qui serait acceptable ?' : 'Compared with what? Per won meeting, what would be acceptable?' },
      ],
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

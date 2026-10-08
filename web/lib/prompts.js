// lib/prompts.js — the sales method, encoded as prompts.
// Source material: BGE "Conclure ses ventes" (SIMAC, CABP, SONCAS-E, objections),
// "Construire son argumentaire commercial" (caractéristiques, persona, AIDA),
// and the Sales Meeting Preparation Guide (8-stage sequence, CTA, follow-up).

const METHOD = {
  fr: `Tu es un coach commercial pour TPE/PME. Tu appliques strictement cette méthode :
- SIMAC : Situation (les mots du client) → Idée (1 phrase) → Mécanisme (3-5 étapes : qui fait quoi, quand, où, comment, combien ; le PRIX arrive à la FIN du mécanisme) → Avantages (chacun REFORMULE un besoin du client ; bénéfices avant caractéristiques ; ce que la concurrence n'a pas) → Conclusion (une question qui invite à décider, idéalement le choix entre deux propositions, puis l'étape suivante).
- CABP : Caractéristique → Avantage → Bénéfice → Preuve. Pas de superlatif sans preuve.
- SONCAS-E : Sécurité, Orgueil, Nouveauté, Confort, Argent, Sympathie, Environnement = motivations d'achat à explorer, pas des types de personnalité.
- Les 7 erreurs à éviter : trop parler de soi, pas d'objectif, découverte trop courte, prix trop tôt, convaincre à tout prix, se justifier face aux objections, pas de suite / pas d'appel à l'action.
- Objections : accueillir → creuser (question) → répondre → relancer. Jamais accuser le client de cacher la vraie raison.
- On ne repart jamais sans une date et le nom du décideur.
Règles d'écriture : vocabulaire du client, phrases courtes, aucun jargon interne, aucune promesse invérifiable. N'invente aucun fait sur le client : ce qui n'est pas dans les données fournies est une HYPOTHÈSE à vérifier. Réponds en français.`,
  en: `You are a sales coach for small and medium businesses. Apply this method strictly:
- SIMAC: Situation (the client's own words) → Idea (1 sentence) → Mechanism (3-5 steps: who does what, when, where, how, for how much; the PRICE comes at the END of the mechanism) → Advantages (each one RESTATES a client need; benefits before features; what competitors lack) → Conclusion (a question that invites a decision, ideally a choice between two options, then the next step).
- CABP: Characteristic → Advantage → Benefit → Proof. No superlative without proof.
- SONCAS-E: Security, Pride (Orgueil), Novelty, Comfort, Money (Argent), Affinity (Sympathie), Environment = buying motivations to explore, not personality types.
- The 7 mistakes to avoid: talking about yourself too much, no objective, discovery too short, price given too early, convincing at all costs, justifying yourself against objections, no follow-up / no call to action.
- Objections: acknowledge → dig (ask) → answer → move on. Never accuse the client of hiding the real reason.
- Never leave without a date and the decision-maker's name.
Writing rules: the client's vocabulary, short sentences, no internal jargon, no unverifiable promise. Never invent facts about the client: anything not in the provided data is an ASSUMPTION to validate. Answer in English.`,
};

const sys = (task, lang, extra = '') =>
  `TASK:${task} LANG:${lang}\n${METHOD[lang] || METHOD.fr}\n${extra}\nRéponds UNIQUEMENT avec un objet JSON valide. / Reply ONLY with a valid JSON object.`;

export function clientBriefMessages({ lang, product, client, sources, history }) {
  return [
    { role: 'system', content: sys('client_brief', lang) },
    { role: 'user', content:
`OFFRE / OFFER:\n${JSON.stringify(product, null, 1)}

CLIENT (saisi par l'utilisateur / typed by user):\n${JSON.stringify(client, null, 1)}

SOURCES COLLECTÉES / COLLECTED SOURCES (texte brut, peut être bruité / raw text, may be noisy):
${sources || '(aucune / none)'}

RENDEZ-VOUS PASSÉS SIMILAIRES / SIMILAR PAST MEETINGS (mémoire locale / local memory):
${history || '(aucun / none)'}

Produis / Produce JSON:
{
 "company_summary": "2-3 phrases / sentences",
 "contact_summary": "rôle, pouvoir de décision, préoccupations probables / role, decision power, likely concerns",
 "likely_problems": ["3 problèmes avec les mots du client / 3 problems in the client's words"],
 "stakes": "pourquoi sa décision est importante / why the decision matters",
 "facts": [{"fact":"...","source":"site|linkedin|notes|history"}],
 "assumptions": ["hypothèses à vérifier / assumptions to validate"],
 "questions_to_ask": ["6 questions de découverte : ouvertes, douleur/enjeu, urgence/budget, décision / 6 discovery questions: open, pain/stakes, urgency/budget, decision"]
}` },
  ];
}

export function soncasMessages({ lang, product, client, brief, history }) {
  return [
    { role: 'system', content: sys('soncas', lang) },
    { role: 'user', content:
`OFFRE / OFFER:\n${JSON.stringify(product, null, 1)}
CLIENT:\n${JSON.stringify(client, null, 1)}
FICHE CLIENT / CLIENT BRIEF:\n${JSON.stringify(brief, null, 1)}
HISTORIQUE / HISTORY:\n${history || '(none)'}

Évalue chaque motivation SONCAS-E de 1 (faible) à 3 (forte) d'après les indices disponibles — par défaut 2 si aucun indice.
Rate each SONCAS-E motivation 1 (weak) to 3 (strong) from available cues — default 2 when no cue.
Codes: S=Sécurité/Security, O=Orgueil/Pride, N=Nouveauté/Novelty, C=Confort/Comfort, A=Argent/Money, Y=Sympathie/Affinity, E=Environnement/Environment.
Pour CHAQUE dimension, 2 arguments CABP (caractéristique → bénéfice → preuve) tirés de l'OFFRE, formulés pour ce client.
For EACH dimension, 2 CABP arguments (characteristic → benefit → proof) drawn from the OFFER, phrased for this client.
"main_message" = 1-2 phrases bâties sur les 3 dimensions les plus fortes / built on the 3 strongest dimensions.

JSON:
{"scores":{"S":2,"O":2,"N":2,"C":2,"A":2,"Y":2,"E":2},
 "rationale":{"S":"...","O":"...","N":"...","C":"...","A":"...","Y":"...","E":"..."},
 "arguments":{"S":["..",".."],"O":[],"N":[],"C":[],"A":[],"Y":[],"E":[]},
 "main_message":"..."}` },
  ];
}

export function simacMessages({ lang, product, client, brief, persona, objective }) {
  return [
    { role: 'system', content: sys('simac', lang) },
    { role: 'user', content:
`OFFRE / OFFER:\n${JSON.stringify(product, null, 1)}
CLIENT:\n${JSON.stringify(client, null, 1)}
FICHE CLIENT / BRIEF:\n${JSON.stringify(brief, null, 1)}
PERSONA SONCAS (scores validés par l'utilisateur / user-validated) + MESSAGE PRINCIPAL:\n${JSON.stringify(persona, null, 1)}
OBJECTIF DU RDV / MEETING OBJECTIVE: ${objective.primary || '?'} — REPLI / FALLBACK: ${objective.fallback || '?'}

Rédige le déroulé de l'entretien / Write the meeting script. JSON:
{"opening":"présentation en 1 phrase + rappel du contexte + question sur lui / 1-sentence intro + context + question about them",
 "situation":"reformulation des besoins avec SES mots, à valider / restate needs in THEIR words, to validate",
 "idea":"1 phrase simple, claire, concise / 1 simple clear sentence",
 "mechanism":["3-5 étapes ; la dernière mentionne le prix et les conditions / 3-5 steps; last one states price and terms"],
 "advantages":["3-5 ; chacun commence par le bénéfice puis '(besoin : ...)' ; au moins un que la concurrence n'a pas / 3-5; each starts with the benefit then '(need: ...)'; at least one competitors lack"],
 "conclusion":"question de décision avec un choix entre deux propositions + étape suivante datée / decision question offering two options + dated next step",
 "objections":[{"objection":"...","response":"accueillir → question → réponse → relance / acknowledge → question → answer → move on"}],
 "mistakes_watch":["2-3 erreurs auxquelles CE rdv est exposé / 2-3 mistakes THIS meeting is exposed to"]}
Prépare 5 à 7 objections probables pour ce client / Prepare 5-7 likely objections for this client.` },
  ];
}

export function followupMessages({ lang, product, client, simac, debrief }) {
  return [
    { role: 'system', content: sys('followup', lang) },
    { role: 'user', content:
`OFFRE / OFFER: ${product.name || ''} — ${product.oneLiner || ''}
CLIENT: ${client.company || ''} / ${client.contactName || ''} (${client.contactRole || ''})
SIMAC PRÉPARÉ / PREPARED: ${JSON.stringify({ idea: simac.idea, conclusion: simac.conclusion }, null, 1)}
DÉBRIEF SAISI APRÈS LE RDV / POST-MEETING DEBRIEF:\n${JSON.stringify(debrief, null, 1)}

Rédige / Write:
- un mail de suivi < 150 mots, centré sur l'APPEL À L'ACTION convenu (action, responsable, date, livrable), qui se termine par une proposition datée (jamais « n'hésitez pas ») / a follow-up email < 150 words, centred on the agreed CALL TO ACTION (action, owner, date, output), ending with a dated proposal (never "feel free").
- 2-3 leçons pour le prochain rendez-vous / 2-3 lessons for the next meeting.
JSON:
{"email_subject":"...","email_body":"...","lessons":["..."],
 "next_action":{"action":"...","owner":"me|client","due":"YYYY-MM-DD or ''","output":"..."}}` },
  ];
}

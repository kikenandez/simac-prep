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
Règles d'écriture : vocabulaire du client, phrases courtes, aucun jargon interne, aucune promesse invérifiable. N'invente aucun fait sur le client : ce qui n'est pas dans les données fournies est une HYPOTHÈSE à vérifier. RÈGLE STRICTE : n'attribue JAMAIS à l'offre une caractéristique, un chiffre, un délai, un format, une preuve ou un service absent de la fiche OFFRE. Pas de « (à confirmer) », pas de placeholder : si la fiche ne permet pas de dire quelque chose, ne le dis pas, et signale le manque dans le champ prévu (missing / gaps). Réponds en français.`,
  en: `You are a sales coach for small and medium businesses. Apply this method strictly:
- SIMAC: Situation (the client's own words) → Idea (1 sentence) → Mechanism (3-5 steps: who does what, when, where, how, for how much; the PRICE comes at the END of the mechanism) → Advantages (each one RESTATES a client need; benefits before features; what competitors lack) → Conclusion (a question that invites a decision, ideally a choice between two options, then the next step).
- CABP: Characteristic → Advantage → Benefit → Proof. No superlative without proof.
- SONCAS-E: Security, Pride (Orgueil), Novelty, Comfort, Money (Argent), Affinity (Sympathie), Environment = buying motivations to explore, not personality types.
- The 7 mistakes to avoid: talking about yourself too much, no objective, discovery too short, price given too early, convincing at all costs, justifying yourself against objections, no follow-up / no call to action.
- Objections: acknowledge → dig (ask) → answer → move on. Never accuse the client of hiding the real reason.
- Never leave without a date and the decision-maker's name.
Writing rules: the client's vocabulary, short sentences, no internal jargon, no unverifiable promise. Never invent facts about the client: anything not in the provided data is an ASSUMPTION to validate. STRICT RULE: NEVER attribute to the offer a feature, figure, delay, format, proof or service absent from the OFFER sheet. No placeholders: if the sheet does not support a statement, leave it out and report the gap in the field provided (missing / gaps). Answer in English.`,
};

const sys = (task, lang, extra = '') =>
  `TASK:${task} LANG:${lang}\n${METHOD[lang] || METHOD.fr}\n${extra}\nRéponds UNIQUEMENT avec un objet JSON valide. / Reply ONLY with a valid JSON object.`;

export function clientBriefMessages({ lang, product, client, sources, history }) {
  return [
    { role: 'system', content: sys('client_brief', lang) },
    { role: 'user', content:
`OFFRE / OFFER:\n${JSON.stringify(product)}

CLIENT (saisi par l'utilisateur / typed by user):\n${JSON.stringify(client)}

SOURCES COLLECTÉES / COLLECTED SOURCES (texte brut, peut être bruité / raw text, may be noisy):
${sources || '(aucune / none)'}

RENDEZ-VOUS PASSÉS SIMILAIRES / SIMILAR PAST MEETINGS (mémoire locale / local memory):
${history || '(aucun / none)'}

Produis / Produce JSON:
{
 "company_summary": "2-3 phrases / sentences",
 "contact_summary": "pour CHAQUE interlocuteur (jusqu'à 3) : rôle, pouvoir de décision, préoccupations probables — une phrase par personne, nommée / for EACH contact (up to 3): role, decision power, likely concerns — one named sentence each",
 "likely_problems": ["3 problèmes avec les mots du client / 3 problems in the client's words"],
 "stakes": "pourquoi sa décision est importante / why the decision matters",
 "facts": [{"fact":"...","source":"site|linkedin|notes|history"}],
 "assumptions": ["hypothèses à vérifier / assumptions to validate"],
 "questions_to_ask": ["6 questions de découverte : ouvertes, douleur/enjeu, urgence/budget, décision / 6 discovery questions: open, pain/stakes, urgency/budget, decision"]
}` },
  ];
}

export function soncasMessages({ lang, product, client, brief, history }) {
  const contacts = (client.contacts || []).filter((c) => c.name || c.role);
  return [
    { role: 'system', content: sys('soncas', lang) },
    { role: 'user', content:
`OFFRE / OFFER:\n${JSON.stringify(product)}
CLIENT:\n${JSON.stringify(client)}
INTERLOCUTEURS PRÉSENTS AU RENDEZ-VOUS / PEOPLE IN THE MEETING (${contacts.length || 1}) :\n${JSON.stringify(contacts.length ? contacts : [{ name: client.contactName || 'Interlocuteur', role: client.contactRole || '', weight: 'decide' }])}
FICHE CLIENT / CLIENT BRIEF:\n${JSON.stringify(brief)}
HISTORIQUE / HISTORY:\n${history || '(none)'}

Pour CHAQUE interlocuteur, évalue chaque motivation SONCAS-E de 1 (faible) à 3 (forte) d'après les indices disponibles — par défaut 2 si aucun indice. AU PLUS TROIS dimensions à 3 par personne : ce sont ses motivations dominantes. weight = decide (décide) | influence | use (utilise).
For EACH person, rate each SONCAS-E motivation 1 (weak) to 3 (strong) from available cues — default 2 when no cue.
Codes: S=Sécurité/Security, O=Orgueil/Pride, N=Nouveauté/Novelty, C=Confort/Comfort, A=Argent/Money, Y=Sympathie/Affinity, E=Environnement/Environment.
Pour chaque dimension de chaque personne, 2 arguments CABP (caractéristique → bénéfice → preuve) tirés de l'OFFRE, formulés pour CETTE personne.
"main_message" = UN SEUL message principal pour le rendez-vous : 1-2 phrases bâties sur les 3 motivations les plus fortes de la personne qui DÉCIDE, et qui ne contredit pas les motivations fortes des autres / ONE main message for the meeting, built on the decision-maker's 3 strongest motivations, compatible with the others.
"tensions" = si plusieurs personnes : les motivations qui s'opposent entre elles (ex. Argent fort chez l'un, Nouveauté chez l'autre) et comment les concilier en une phrase ; [] si une seule personne.
PREUVES : uniquement celles présentes dans l'OFFRE (champ proofs) ou la FICHE CLIENT. Un argument sans preuve se formule sans preuve (caractéristique → bénéfice), jamais avec une preuve inventée. Liste dans "gaps" les preuves ou caractéristiques qui manquent à la fiche pour mieux convaincre.

JSON (people dans le MÊME ORDRE que la liste des interlocuteurs / same order as the list):
{"people":[{"name":"...","weight":"decide|influence|use",
   "scores":{"S":2,"O":2,"N":2,"C":2,"A":2,"Y":2,"E":2},
   "rationale":{"S":"...","O":"...","N":"...","C":"...","A":"...","Y":"...","E":"..."},
   "arguments":{"S":["..",".."],"O":[],"N":[],"C":[],"A":[],"Y":[],"E":[]}}],
 "main_message":"...",
 "tensions":["..."],
 "gaps":["ce qui manque à la fiche offre pour ce client (preuve, chiffre, condition…)"]}` },
  ];
}

export function simacMessages({ lang, product, client, brief, persona, objective }) {
  return [
    { role: 'system', content: sys('simac', lang) },
    { role: 'user', content:
`OFFRE / OFFER:\n${JSON.stringify(product)}
CLIENT:\n${JSON.stringify(client)}
FICHE CLIENT / BRIEF:\n${JSON.stringify(brief)}
INTERLOCUTEURS PRÉSENTS / PEOPLE IN THE MEETING: ${JSON.stringify((client.contacts || []).filter((c) => c.name || c.role))}
PERSONA SONCAS PAR PERSONNE (scores validés par l'utilisateur / user-validated) + MESSAGE PRINCIPAL UNIQUE + TENSIONS:\n${JSON.stringify(persona)}
OBJECTIF DU RDV / MEETING OBJECTIVE: ${objective.primary || '?'} — REPLI / FALLBACK: ${objective.fallback || '?'}

Rédige le déroulé de l'entretien / Write the meeting script. JSON:
{"opening":"présentation en 1 phrase + rappel du contexte + question sur lui / 1-sentence intro + context + question about them",
 "situation":"reformulation des besoins avec SES mots, à valider / restate needs in THEIR words, to validate",
 "idea":"1 phrase simple, claire, concise / 1 simple clear sentence",
 "mechanism":["3-5 étapes ; la dernière mentionne le prix et les conditions / 3-5 steps; last one states price and terms"],
 "advantages":["3-5 ; chacun commence par le bénéfice puis '(besoin : ...)' ; au moins un que la concurrence n'a pas ; S'IL Y A PLUSIEURS INTERLOCUTEURS, chaque avantage commence par 'Pour <prénom ou rôle> : ' et chaque personne en reçoit au moins un, bâti sur SES motivations fortes / 3-5; each starts with the benefit then '(need: ...)'; with several people, prefix each with 'For <name or role>: ' and give each person at least one"],
 "conclusion":"question de décision adressée à la personne qui DÉCIDE, avec un choix entre deux propositions + étape suivante datée / decision question addressed to the decision-maker, offering two options + dated next step",
 "objections":[{"who":"prénom ou rôle de la personne qui l'émettra probablement ('' si une seule personne) / likely speaker ('' if one person)","objection":"...","response":"accueillir → question → réponse → relance / acknowledge → question → answer → move on"}],
 "mistakes_watch":["2-3 erreurs auxquelles CE rdv est exposé / 2-3 mistakes THIS meeting is exposed to"],
 "gaps":["ce que la fiche offre ne permet pas de dire ou de répondre dans ce rendez-vous — à travailler avant / what the offer sheet cannot support in this meeting — to work on before"]}
Prépare 5 à 7 objections probables pour ce client ; avec plusieurs interlocuteurs, répartis-les selon qui les portera probablement (le DAF parle d'argent, l'utilisateur de confort…) / Prepare 5-7 likely objections; with several people, attribute each to its likely speaker.
PREUVES et CHIFFRES : uniquement ceux de l'OFFRE ou de la FICHE CLIENT. Rien d'inventé. Si la fiche ne permet pas de répondre à une objection, la réponse se limite à accueillir et à poser la question qui creuse, et l'objection est reportée dans "gaps".` },
  ];
}

export function followupMessages({ lang, product, client, simac, debrief }) {
  return [
    { role: 'system', content: sys('followup', lang) },
    { role: 'user', content:
`OFFRE / OFFER: ${product.name || ''} — ${product.oneLiner || ''}
CLIENT: ${client.company || ''} / ${(client.contacts || []).filter((c) => c.name || c.role).map((c) => `${c.name || c.role} (${c.role || '?'}, ${c.weight || '?'})`).join(', ') || `${client.contactName || ''} (${client.contactRole || ''})`}
SIMAC PRÉPARÉ / PREPARED: ${JSON.stringify({ idea: simac.idea, conclusion: simac.conclusion }, null, 1)}
DÉBRIEF SAISI APRÈS LE RDV / POST-MEETING DEBRIEF:\n${JSON.stringify(debrief)}

Rédige / Write:
- un mail de suivi < 150 mots, centré sur l'APPEL À L'ACTION convenu (action, responsable, date, livrable), qui se termine par une proposition datée (jamais « n'hésitez pas ») / a follow-up email < 150 words, centred on the agreed CALL TO ACTION (action, owner, date, output), ending with a dated proposal (never "feel free").
- 2-3 leçons pour le prochain rendez-vous / 2-3 lessons for the next meeting.
JSON:
{"email_subject":"...","email_body":"...","lessons":["..."],
 "next_action":{"action":"...","owner":"me|client","due":"YYYY-MM-DD or ''","output":"..."}}` },
  ];
}

// ---------------------------------------------------------------------------
// Étape 1 — définir l'offre : extraction depuis un texte libre, questions guidées, maturité.

const PRODUCT_FIELDS = `Champs de la fiche (clé → sens) :
name = nom du produit/service ; oneLiner = en une phrase sans jargon ; targets = cibles (qui achète / qui utilise / qui décide) ;
problem = problème de chaque cible, avec ses mots ; who = qui parle (la personne / la marque en une phrase) ; nextStep = étape suivante voulue (le « petit oui ») ;
mechanism = mécanisme en 3 à 5 étapes (qui fait quoi, quand, comment) ; advantages = ≥ 3 avantages tangibles et intangibles ; proofs = preuves (chiffres, références, témoignages) ;
price = prix et unité qui parle au client ; floor = plancher (limite basse, gratuités max) ; delays = délais et conditions ; objections = 5 à 10 objections attendues ; constraints = contraintes (réglementation, ton, décisions prises).`;

export function offerExtractMessages({ lang, description, sources, current }) {
  return [
    { role: 'system', content: sys('offer_extract', lang) },
    { role: 'user', content:
`DESCRIPTION LIBRE DE L'OFFRE (par la personne qui vend) :
${description || '(vide)'}

SOURCES (site web, profils collés — texte brut, peut être bruité) :
${sources || '(aucune)'}

FICHE ACTUELLE (ne pas contredire ce qui est déjà rempli ; proposer seulement pour les champs vides ou à améliorer) :
${JSON.stringify(current)}

${PRODUCT_FIELDS}

Remplis chaque champ UNIQUEMENT à partir de ce qui est dit ou lisible dans les sources. Si l'information n'existe pas, laisse la chaîne vide "" — n'invente rien.
Pour les listes (targets, problem, mechanism, advantages, proofs, objections), une ligne par élément, séparées par "\\n".
JSON : {"fields":{"name":"","oneLiner":"","targets":"","problem":"","who":"","nextStep":"","mechanism":"","advantages":"","proofs":"","price":"","floor":"","delays":"","objections":"","constraints":""},
 "missing":["clés restées vides, par ordre d'importance pour vendre"],
 "notes":"1-2 phrases : ce qui est flou ou contradictoire dans la description"}` },
  ];
}

export function offerQuestionMessages({ lang, current, transcript, lastField, lastAnswer }) {
  return [
    { role: 'system', content: sys('offer_question', lang) },
    { role: 'user', content:
`Tu aides la personne à compléter sa fiche offre par un dialogue, UNE question à la fois, avec des mots simples.
${PRODUCT_FIELDS}

FICHE ACTUELLE :
${JSON.stringify(current)}

DIALOGUE JUSQU'ICI :
${transcript || '(début)'}

${lastField ? `DERNIÈRE RÉPONSE (pour le champ "${lastField}") : ${lastAnswer}` : 'Aucune réponse encore : pose la première question.'}

Règles : si une dernière réponse existe, reformule-la en valeur propre pour ce champ (fidèle, sans ajout ; listes = une ligne par élément). Ne redemande JAMAIS un champ déjà abordé dans le dialogue, même si la réponse est courte : une réponse courte est une réponse. Puis choisis le champ encore VIDE le plus important pour VENDRE (ordre conseillé : oneLiner, targets, problem, nextStep, mechanism, advantages, proofs, price, objections, who, floor, delays, constraints) et pose UNE question concrète, avec un exemple court si utile. Quand tous les champs importants sont remplis, done = true et pose aucune question.
JSON : {"field_value":"valeur propre pour le dernier champ, ou \\"\\"","next_field":"clé ou \\"\\"","question":"la question, ou \\"\\"","done":false}` },
  ];
}

export function offerMaturityMessages({ lang, current }) {
  return [
    { role: 'system', content: sys('maturity', lang) },
    { role: 'user', content:
`Évalue la maturité commerciale de cette offre, de 1 à 5 :
1 = encore une idée à travailler (cible floue, problème non formulé, pas de mécanisme ni de prix) ;
2 = ébauche (cible et problème esquissés, mécanisme ou prix absents) ;
3 = offre définie (cible, problème, mécanisme, prix), mais preuves et objections faibles ;
4 = prête à tester (preuves, objections, étape suivante claires ; quelques trous) ;
5 = prête à la présentation (tout est clair, chiffré, prouvé, avec plancher et objections préparées).
Critères de la checklist : accroche sur le problème du client ; qui parle en 1 phrase ; cibles distinguées (achète/utilise/décide) ; bénéfices avant caractéristiques ; ≥ 1 preuve ; prix après la valeur et ramené à l'unité du client ; plancher connu ; 5-10 objections ; un seul petit oui.

FICHE :
${JSON.stringify(current)}

Donne aussi un avis de l'outil, "verdict", parmi exactement : "travailler l'offre" (score 1-2 : des trous empêchent d'argumenter sans inventer) | "prêt pour des réunions à blanc" (score 3 : on peut s'entraîner, pas encore vendre) | "prêt pour la vente" (score 4-5).
JSON : {"score":3,"verdict":"prêt pour des réunions à blanc","label":"libellé court du niveau","summary":"2 phrases, directes, sans flatterie",
 "strengths":["2-4 points forts, citant la fiche"],
 "gaps":[{"field":"clé","why":"pourquoi ça bloque la vente","fix":"action concrète en 1 phrase"}],
 "next_step":"LA chose à faire avant le prochain rendez-vous"}` },
  ];
}

// ---------------------------------------------------------------------------
// Étape 2 — décrire le client / le rendez-vous en texte libre, puis compléter par questions.

const CLIENT_FIELDS = `Champs de la fiche client (clé → sens) :
company = entreprise / établissement ; sector = secteur ou activité ; website = site web ;
contacts = les personnes présentes au rendez-vous, AU PLUS 3, chacune { name (nom, ou fonction si le nom est inconnu), role (fonction et rôle dans la décision), weight ∈ decide | influence | use } — au moins une ; la première est l'interlocuteur principal ; meetingFormat = format et contexte du rendez-vous (mail, visio, sur place, salon, téléphone ; date ; durée ; qui a pris l'initiative) ;
decisionProcess = processus de décision connu (qui d'autre, quand, budget) ; notes = tout ce qu'on sait d'autre (historique, contexte, ce qui a été dit).`;

export function clientExtractMessages({ lang, description, current }) {
  return [
    { role: 'system', content: sys('client_extract', lang) },
    { role: 'user', content:
`DESCRIPTION LIBRE DU CLIENT ET DU RENDEZ-VOUS :
${description || '(vide)'}

FICHE CLIENT ACTUELLE (ne pas contredire ce qui est rempli) :
${JSON.stringify(current)}

${CLIENT_FIELDS}

Remplis chaque champ UNIQUEMENT à partir de la description. Information absente → "" (rien d'inventé, aucun nom supposé).
JSON : {"fields":{"company":"","sector":"","website":"","contacts":[{"name":"","role":"","weight":"decide"}],"meetingFormat":"","decisionProcess":"","notes":""},
 "missing":["clés vides, par ordre d'importance pour préparer le rendez-vous"]}` },
  ];
}

export function clientQuestionMessages({ lang, current, transcript, lastField, lastAnswer }) {
  return [
    { role: 'system', content: sys('client_question', lang) },
    { role: 'user', content:
`Tu aides la personne à compléter sa fiche client par un dialogue, UNE question à la fois, avec des mots simples.
${CLIENT_FIELDS}

FICHE ACTUELLE :
${JSON.stringify(current)}

DIALOGUE JUSQU'ICI :
${transcript || '(début)'}

${lastField ? `DERNIÈRE RÉPONSE (pour le champ "${lastField}") : ${lastAnswer}` : 'Aucune réponse encore : pose la première question.'}

Règles : si une dernière réponse existe, reformule-la en valeur propre pour ce champ (fidèle, sans ajout). Ne redemande JAMAIS un champ déjà abordé : une réponse courte est une réponse. Puis choisis le champ encore VIDE le plus utile pour préparer le rendez-vous (ordre conseillé : meetingFormat, company, decisionProcess, sector, website, notes ; les interlocuteurs se saisissent dans le formulaire, ne les demande pas) et pose UNE question concrète. Quand les champs utiles sont remplis, done = true.
JSON : {"field_value":"","next_field":"","question":"","done":false}` },
  ];
}

// ---------------------------------------------------------------------------
// Étape 5 — débrief en texte libre → champs structurés (centrés sur l'appel à l'action).
export function debriefExtractMessages({ lang, description, current, today }) {
  return [
    { role: 'system', content: sys('debrief_extract', lang) },
    { role: 'user', content:
`DÉBRIEF LIBRE APRÈS LE RENDEZ-VOUS (par la personne qui vend) :
${description || '(vide)'}

CHAMPS ACTUELS (ne pas contredire ce qui est rempli) :
${JSON.stringify(current)}
DATE DU JOUR : ${today}

Champs : outcome = résultat parmi exactement [Vente conclue | Essai / pilote accepté | Proposition à envoyer | RDV décideur à fixer | Réflexion / relance datée | Pas de suite] ;
objectionsHeard = objections entendues (une ligne par objection, avec les mots du client) ; decisionMaker = nom ou fonction du décideur ;
nextAction = L'action convenue (le CTA), une phrase ; nextOwner = "me" si c'est le vendeur qui agit, "client" sinon ; nextDue = date YYYY-MM-DD déduite du texte (« mardi prochain », « sous 8 jours »… par rapport à la date du jour), sinon "" ;
nextOutput = livrable attendu ; notes = faits nouveaux appris (budget, calendrier, personnes, préférences).
Rien d'inventé : information absente → "". Si aucune action ni date n'a été convenue, nextAction = "" et notes doit le dire (« aucune suite datée »).
JSON : {"fields":{"outcome":"","objectionsHeard":"","decisionMaker":"","nextAction":"","nextOwner":"","nextDue":"","nextOutput":"","notes":""},"missing":["clés vides importantes : nextAction, nextDue, decisionMaker…"]}` },
  ];
}

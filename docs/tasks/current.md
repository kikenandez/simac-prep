# Active Tasks

**All sessions read this file on startup.** The Dispatch block below tells each session what to pick up next. See `docs/prompts/process.md` for the full protocol (§3 task dispatch, §3a Dispatch block, §4a commit hygiene, §5a Gate 0, §9 session lifecycle, §10 archive convention).

---

## Dispatch — architect-maintained (updated 2026-10-08 13:10)

### Status snapshot
- Publié : https://kikenandez.github.io/simac-prep/ (Pages via Actions). Charte adp.avapmo.com + crédit + clause de non-responsabilité.
- Étape 1 enrichie (texte libre → fiche, questions guidées, maturité 1-5) ; `npm test` vert.
- T1 fait avec Groq (`openai/gpt-oss-120b`) sur une offre réelle (nom retiré) × directeur de collège privé : 5 étapes OK de bout en bout, RDV enregistré, CSV et récupération vérifiés. Constats : 429 sur prompts > ~10 k caractères (corrigé : JSON compact, persona top 3) ; preuves et caractéristiques inventées (corrigé par règles de prompt, à re-vérifier) ; modèle par défaut retiré (corrigé). Gemini non testé → T4.
- T2 fait : Pages actif, Groq OK en CORS depuis l'origine publiée ; Gemini/Mistral/OpenRouter à vérifier en CORS (T4).
- Nouveau : étape 2 en texte libre + questions, pièces jointes PDF/Word/texte, 3 motivations fortes max.
- Architect inbox : vide.

### Developer session (next)
- **Pick up:** T4 — Vérifier Gemini, Mistral, OpenRouter (CORS + JSON + noms de modèles) et re-tester l'anti-invention sur le SIMAC
- **After T4:** —
- **Do not start:** T3 (designer) ; aucune refonte de `web/app.js` sans tâche
- **Context budget:** end session at ≤30% remaining
- **Standing reminders:** Gate 0 on every bug. Stage by exact path; `git status --short` before every commit. Serveur `:8765` requis pour `npm test`.

### Designer session (next)
- **Pick up:** T3 — Revue design mobile / impression / états vides (après T1)
- **After:** —
- **Context budget:** end session at ≤30% remaining
- **Standing reminders:** Préserver les sélecteurs utilisés par `tests/e2e.mjs` (`data-step`, `data-bind`, `#ai`, `#next`, `#copy`, `#copy-mail`, `#to-persona`, `.score`, `.dim.top`). Toute chaîne UI reste en français pour ce cas d'usage.

### Reviewer queue
- (vide)

### User actions pending (no session needed)
- DNS `simac-prep.avapmo.com` (CNAME → kikenandez.github.io) puis me le dire pour poser `web/CNAME`.
- Lien vers l'app depuis adp.avapmo.com.
- Clé Gemini pour T4.

---

## Architecture rules ratified
- 2026-10-08 : Zéro backend, zéro dépendance runtime. Raison : contrainte « gratuit pour toujours » du cas d'usage.
- 2026-10-08 : Un seul protocole LLM (`/chat/completions` OpenAI-compatible) ; un fournisseur = une entrée `PROVIDERS`. Raison : interchangeabilité quand un quota gratuit tombe.
- 2026-10-08 : Toute sortie IA est du JSON par schéma dans le prompt. Raison : l'UI rend des champs éditables, pas du texte libre.
- 2026-10-08 : `docs/METHODE.md` ⇄ `web/lib/prompts.js` évoluent ensemble. Raison : la méthode est le produit.
- 2026-10-08 : Le CSV (`COLUMNS`) est le contrat de données. Raison : le CSV est l'amorce RAG et le seul mécanisme de partage.
- 2026-10-08 : Les rendus asynchrones vérifient `S.step` avant de toucher au DOM. Raison : miss du 2026-10-08 (ci-dessous).

---

## Process misses log
- MISS 2026-10-08 : nom de modèle codé en dur (`llama-3.3-70b-versatile`) retiré par Groq → 404 au premier test réel → règle : jamais de nom de modèle sans moyen de lister les modèles du fournisseur (bouton Réglages).
- MISS 2026-10-08 : réponse IA arrivée après un changement d'étape → re-rendu de l'étape précédente, test e2e bloqué ~10 min → règle « garde `S.step` avant tout rendu asynchrone » (ratifiée ci-dessus) ; le test e2e attend désormais un signal de fin de génération, pas un sélecteur déjà présent.

---

## Active tasks

### T1: Valider le parcours avec Groq et Gemini sur une offre réelle
- **Agent:** developer
- **Status:** DONE
- **Plan:** docs/plans/2026-10-08-mvp.md
- **Priority:** P1
- **Created:** 2026-10-08

**Instruction:**
Avec une clé Groq puis une clé Gemini (Réglages), dérouler les 5 étapes sur une fiche offre réelle et un client réel (site web lisible). Pour chaque étape, noter : JSON parsé sans erreur ? respect de `docs/METHODE.md` (prix en dernier du mécanisme ; chaque avantage contient « (besoin : …) » ; fiche client sépare faits sourcés et hypothèses ; conclusion = question à deux options + étape datée) ? Si un fournisseur renvoie du JSON invalide, durcir `parseJSON` dans `web/lib/llm.js` ou le prompt dans `web/lib/prompts.js` — pas l'UI. Consigner les constats dans `docs/ARCHITECTURE.md` § Limites connues.

**What NOT to change:**
`web/app.js`, `web/index.html`, `web/styles.css` (lane designer) ; `COLUMNS` de `store.js` sans tâche dédiée.

**Acceptance criteria:**
- [ ] Parcours complet réussi avec Groq et avec Gemini, sans erreur console
- [ ] 4 règles de méthode vérifiées et notées (OK / corrigé / limite) pour chaque fournisseur
- [ ] `npm test` toujours vert

**Result:**
2026-10-08 — Groq OK sur les 5 étapes (offre réelle une offre réelle (nom retiré), client type directeur de collège privé). Règles de méthode : prix en dernier ✅, avantages avec besoin ✅, faits/hypothèses séparés ✅, conclusion deux options datées ✅. Limites : 429 sur gros prompts (corrigé), inventions de preuves/caractéristiques (règles ajoutées), Gemini non testé (→ T4).

### T2: Publier sur GitHub Pages et vérifier le CORS depuis l'origine publiée
- **Agent:** developer
- **Status:** DONE
- **Plan:** docs/plans/2026-10-08-mvp.md
- **Priority:** P1
- **Created:** 2026-10-08

**Instruction:**
Après push sur `main` (action utilisateur), vérifier que `.github/workflows/pages.yml` publie `web/`. Depuis l'URL publique, tester « Réglages → Tester » avec Groq, Gemini, Mistral, OpenRouter. Documenter dans README l'URL publique et tout fournisseur bloqué par CORS (le retirer de `PROVIDERS` ou l'annoter « Ollama / local uniquement »).

**What NOT to change:**
Lane designer ; le workflow Pages sauf si le déploiement échoue.

**Acceptance criteria:**
- [ ] URL publique active, parcours démo fonctionnel
- [ ] Tableau fournisseur → OK/CORS dans README
- [ ] `npm test` vert

**Result:**
2026-10-08 — https://kikenandez.github.io/simac-prep/ actif (Source : GitHub Actions, activé à la main : le token du workflow ne peut pas créer le site). Groq OK en CORS. Autres fournisseurs → T4.

### T3: Revue design — mobile, impression, états vides et erreurs
- **Agent:** designer
- **Status:** NEW
- **Plan:** docs/plans/2026-10-08-mvp.md
- **Priority:** P2
- **Created:** 2026-10-08

**Instruction:**
Sur 390 px : navigation des étapes, grille SONCAS, tableau des objections. Impression du SIMAC (`@media print`) : une page lisible, textarea sans bordure, objections visibles. États vides (aucune source, aucun RDV) et toasts d'erreur : message actionnable. Rester dans `web/index.html`, `web/styles.css`, `web/app.js` ; ne pas renommer les sélecteurs de test.

**What NOT to change:**
`web/lib/`, `tests/`, les prompts.

**Acceptance criteria:**
- [ ] Captures 390 px et impression jointes au résultat
- [ ] `npm test` vert

**Result:**
(à remplir)

---

### T4: Vérifier Gemini, Mistral, OpenRouter et l'anti-invention
- **Agent:** developer
- **Status:** NEW
- **Plan:** docs/plans/2026-10-08-mvp.md
- **Priority:** P1
- **Created:** 2026-10-08

**Instruction:**
Depuis l'origine publiée : Réglages → chaque fournisseur → « Lister les modèles » puis « Tester » (CORS, 401, noms). Dérouler Persona + SIMAC avec un fournisseur autre que Groq et relire : aucune preuve, chiffre, délai ou caractéristique absents de la fiche Offre (règle ajoutée dans `METHOD` de `web/lib/prompts.js`). Si un fournisseur bloque le CORS, l'annoter dans `PROVIDERS` et dans README.

**What NOT to change:**
Lane designer ; `COLUMNS`.

**Acceptance criteria:**
- [ ] Tableau fournisseur → OK / CORS / JSON dans README
- [ ] Un SIMAC relu sans invention, ou règle de prompt renforcée
- [ ] `npm test` vert

**Result:**
(à remplir)

---

## Archive index (last 10 closed tasks — free lookup)

- T1 — Validation Groq sur offre réelle (DONE 2026-10-08)
- T2 — Publication GitHub Pages (DONE 2026-10-08)

---

*End of current.md.*

# SIMAC Prep — préparer ses rendez-vous commerciaux (TPE / PME)

Une application web **gratuite, sans serveur**, qui guide un indépendant ou une petite entreprise
dans la préparation d'un rendez-vous de vente avec la méthode **SIMAC** et le profil **SONCAS-E**,
puis dans le suivi centré sur l'appel à l'action.

**Application en ligne : https://kikenandez.github.io/simac-prep/**

Premier cas d'usage construit avec l'**Agentic Development Protocol** — [adp.avapmo.com](https://adp.avapmo.com).

## Ce que fait l'application

| Étape | Ce que vous faites | Ce que fait l'IA |
|---|---|---|
| **1 · Offre** | Texte libre + site web + profils collés (LinkedIn, Instagram…) ; fiche produit éditable, export/import JSON | Remplit la fiche depuis la description (rien d'inventé : les champs sans information restent vides), pose **une question à la fois** pour les trous, et note la **maturité de l'offre de 1 à 5** (idée → prête à présenter) avec points forts, blocages et l'action prioritaire |
| **2 · Client** | Entreprise, contact, URLs, notes collées (LinkedIn, mail…) ; lecture des pages et recherche web gratuites | Fiche client : résumé, enjeu, 3 problèmes *avec ses mots*, **faits sourcés vs hypothèses**, 6 questions de découverte |
| **3 · Persona** | Scores SONCAS-E de 1 à 3, **modifiables** | Scores proposés d'après la fiche, 2 arguments CABP par motivation, **message principal bâti sur le top 3** |
| **4 · SIMAC** | Objectif + repli ; script entièrement éditable, impression / copie | Ouverture (20 s), Situation, Idée, Mécanisme (**prix en dernier**), Avantages (**chacun reformule un besoin**), Conclusion (**question, deux options, étape suivante**), 5-7 objections avec réponse « accueillir → creuser → répondre → relancer » |
| **5 · Suivi** | Débrief en 1 minute : résultat, objections entendues, décideur, **action / responsable / date / livrable** | Mail de suivi < 150 mots centré sur le CTA, terminé par une proposition datée ; leçons |
| **Historique** | Mémoire locale des RDV ; **export / import CSV** | Les RDV proches (même client, secteur, offre) sont relus avant chaque génération (RAG léger) |

Le CSV exporté est la base de connaissance : réimportez-le sur un autre poste, partagez-le,
ou servez-vous-en comme amorce RAG dans un autre outil. Colonnes dans [`web/lib/store.js`](web/lib/store.js).

## 100 % gratuit — comment

- **Hébergement** : fichiers statiques (`web/`). GitHub Pages via [`.github/workflows/pages.yml`](.github/workflows/pages.yml), ou n'importe quel hébergeur statique. Aucun backend, aucune base de données.
- **IA** : vous apportez une clé **gratuite** — Groq, Google Gemini, Mistral (plan Experiment), OpenRouter (modèles `:free`) — ou **Ollama** en local. La clé reste dans votre navigateur. Un **mode démo** sans IA montre le parcours.
- **Recherche client** : [Jina Reader](https://jina.ai/reader) (`r.jina.ai`, `s.jina.ai`) — sans clé à faible volume, clé gratuite sinon.
- **Données** : `localStorage` du navigateur + CSV. Rien ne quitte votre poste sauf vers le fournisseur d'IA que vous avez choisi.

## Lancer

```bash
# aucune dépendance : un serveur statique suffit
python3 -m http.server 8765 --directory web
# puis http://localhost:8765 → Réglages → choisir un fournisseur (ou « Mode démo »)
```

Test de bout en bout (navigateur, mode démo) :

```bash
npm install && npm test
```

## Structure

```
web/
  index.html, styles.css, app.js   # l'application (ES modules, sans build)
  lib/llm.js        # fournisseurs OpenAI-compatibles + mode démo
  lib/prompts.js    # la méthode (SIMAC, CABP, SONCAS-E, 7 erreurs) encodée en prompts
  lib/research.js   # lecture d'URL et recherche web gratuites (Jina)
  lib/soncas.js     # dimensions, scores 1-3, top 3
  lib/store.js      # mémoire des RDV, CSV, récupération (RAG léger)
  lib/csv.js        # CSV RFC 4180 + téléchargement
docs/
  METHODE.md        # la méthode de vente, source de vérité pour les prompts
  ARCHITECTURE.md   # choix techniques et limites
  prompts/, tasks/, plans/, skills/   # Agentic Development Protocol (rôles, dispatch, plans)
tests/e2e.mjs       # parcours complet en mode démo (Playwright)
```

## Méthode

Issue des formations BGE « Conclure ses ventes » et « Construire son argumentaire commercial »
et du *Sales Meeting Preparation Guide*. Résumé dans [`docs/METHODE.md`](docs/METHODE.md).

## Crédit et responsabilité

Créé par Guillermo Blanco — [adp.avapmo.com](https://adp.avapmo.com) — utilisation gratuite.

Outil fourni « tel quel », sans garantie ni responsabilité sur les informations produites (y compris par l'IA) :
chaque utilisateur l'emploie sous sa propre responsabilité. Aucun engagement ni responsabilité de Guillermo Blanco,
adp.avapmo.com ou AVApmo. Les clés d'API et les données de rendez-vous restent dans le navigateur de l'utilisateur.

## Licence

Code : MIT. © 2026 Guillermo Blanco.

# SIMAC Prep — préparer ses rendez-vous commerciaux (TPE / PME)

Une application web **gratuite, sans serveur**, qui guide un indépendant ou une petite entreprise
dans la préparation d'un rendez-vous de vente avec la méthode **SIMAC** et le profil **SONCAS-E**,
puis dans le suivi centré sur l'appel à l'action.

**Application en ligne : https://simac.avapmo.com**

## Ce que fait l'application

| Étape | Ce que vous faites | Ce que fait l'IA |
|---|---|---|
| **1 · Offre** | Texte libre + site web + profils collés (LinkedIn, Instagram…) ; fiche produit éditable, export/import JSON | Remplit la fiche depuis la description (rien d'inventé : les champs sans information restent vides), pose **une question à la fois** pour les trous, et note la **maturité de l'offre de 1 à 5** (idée → prête à présenter) avec points forts, blocages et l'action prioritaire |
| **2 · Client** | Entreprise, **jusqu'à 3 interlocuteurs** (nom, rôle, décide / influence / utilise), URLs, notes collées (LinkedIn, mail…) ; données officielles, lecture de pages et recherche web avec clé | Fiche client : résumé, enjeu, problèmes possibles à valider, **faits sourcés vs hypothèses**, 6 questions de découverte |
| **3 · Persona** | Scores SONCAS-E de 1 à 3 **par personne**, modifiables | Un profil par interlocuteur, 2 arguments CABP par motivation, **tensions entre interlocuteurs**, un seul **message principal calé sur qui décide** |
| **4 · SIMAC** | Objectif + repli ; script entièrement éditable, impression / copie | Ouverture (20 s), Situation, Idée, Mécanisme (**prix en dernier**), Avantages (**chacun reformule un besoin**, « Pour X : … » par interlocuteur), Conclusion (adressée à qui décide) (**question, deux options, étape suivante**), 5-7 objections avec réponse « accueillir → creuser → répondre → relancer » |
| **5 · Suivi** | Débrief en 1 minute : résultat, objections entendues, décideur, **action / responsable / date / livrable** | Mail de suivi < 150 mots centré sur le CTA, terminé par une proposition datée ; leçons |
| **Historique** | Mémoire locale des RDV ; **export / import CSV** | Les RDV proches (même client, secteur, offre) sont relus avant chaque génération (RAG léger) |

Le CSV exporté est la base de connaissance : réimportez-le sur un autre poste, partagez-le,
ou servez-vous-en comme amorce RAG dans un autre outil. Colonnes dans [`web/lib/store.js`](web/lib/store.js).

## Hébergement gratuit et accès aux services

- **Hébergement** : fichiers statiques (`web/`). GitHub Pages via [`.github/workflows/pages.yml`](.github/workflows/pages.yml), ou n'importe quel hébergeur statique. Aucun backend, aucune base de données.
- **IA** : vous apportez une clé **gratuite** — Groq, Google Gemini, Mistral (plan Experiment), OpenRouter (modèles `:free`) — ou **Ollama** en local. La clé reste dans votre navigateur. Un **mode démo** sans IA montre le parcours.
- **Recherche** : identité officielle et annonces BODACC sans clé ; [Jina Reader](https://jina.ai/reader) pour les pages (sans clé à faible volume). La recherche web Jina exige une clé et consomme des crédits selon l’offre du fournisseur.
- **Données** : `localStorage` du navigateur + CSV. La génération transmet le contexte au fournisseur d’IA choisi ; les actions de recherche transmettent les critères aux API officielles et les requêtes/URLs à Jina.

## Recherche pour préparer un rendez-vous ou un email

- **Offre** : « Concurrents et alternatives » utilise la description, les cibles et le marché géographique (France par défaut). Modifiez la recherche, ou lisez une URL précise. Vérifiez et cochez les sources puis comparez : cible, offre, prix publié, différence étayée, question à poser. La comparaison est éditable et reste séparée de votre fiche produit.
- **Client** : choisissez rendez-vous ou email, renseignez entreprise, commune et interlocuteurs. Recherchez dans l’Annuaire des entreprises puis choisissez explicitement le SIRET. Les données de l’unité légale et de l’établissement sont distinguées. BODACC ajoute jusqu’à 10 annonces des 24 derniers mois.
- **Personnes** : recherchez séparément l’organisation et chacun des trois interlocuteurs/destinataires. Les résultats web sont décochés par défaut : vérifiez leur identité et leur pertinence. Aucun mandat public ne vaut confirmation du pouvoir de décision pour l’achat.
- **Préparation** : les sources cochées alimentent faits cités, hypothèses, signaux, questions par personne et ouverture. Le mode email ajoute un premier email éditable et copiable ; l’application ne l’envoie pas. Les faits sans référence valide passent dans les hypothèses.
- **Conservation** : le brouillon et le CSV des rendez-vous gardent les preuves, leurs dates, la comparaison et la fiche offre associée (`research_json`). Les anciens CSV restent lisibles. L’export offre JSON v2 contient `product` et `market` ; les anciennes fiches JSON restent importables. « Nouveau RDV » conserve l’offre et la recherche concurrentielle.
- **Pappers** : lien externe de consultation ; pas d’extraction automatique. Une intégration API demanderait des droits adaptés à cet usage. Sources : [conditions](https://www.pappers.fr/mentions-legales), [API](https://www.pappers.fr/api).

Le catalogue [data.gouv.fr](https://www.data.gouv.fr/) référence les sources officielles utilisées : [Recherche d’entreprises](https://recherche-entreprises.api.gouv.fr/docs/) et [BODACC](https://www.bodacc.fr/explore/dataset/annonces-commerciales/api/). Les connecteurs sectoriels Éducation/BOAMP et INPI ne sont pas inclus dans cette version.

## Lancer

```bash
# aucune dépendance : un serveur statique suffit
python3 -m http.server 8765 --directory web
# puis http://localhost:8765 → Réglages → choisir un fournisseur (ou « Mode démo »)
```

Tests unitaires et deux parcours navigateur (serveur ci-dessus démarré dans un autre terminal) :

```bash
npm install
npx playwright install chromium
npm test
```

Les tests navigateur simulent les services externes de recherche et bloquent l’inscription email. `npm run test:unit` ne nécessite pas de navigateur. `CHROME=/chemin/vers/chrome npm test` utilise un navigateur déjà installé.

## Structure

```
web/
  index.html, styles.css, app.js   # l'application (ES modules, sans build)
  lib/llm.js        # fournisseurs OpenAI-compatibles + mode démo
  lib/prompts.js    # la méthode (SIMAC, CABP, SONCAS-E, 7 erreurs) encodée en prompts
  lib/research.js   # API entreprises/BODACC, Jina, dates et citations
  lib/research-ui.js # recherche marché/client, sélection et revue des preuves
  lib/soncas.js     # dimensions, scores 1-3, top 3
  lib/store.js      # mémoire des RDV, CSV, récupération (RAG léger)
  lib/csv.js        # CSV RFC 4180 + téléchargement
docs/
  METHODE.md        # la méthode de vente, source de vérité pour les prompts
  ARCHITECTURE.md   # choix techniques et limites
tests/e2e.mjs       # parcours complet en mode démo (Playwright)
```

## Méthode

Issue des formations BGE « Conclure ses ventes » et « Construire son argumentaire commercial »
et du *Sales Meeting Preparation Guide*. Résumé dans [`docs/METHODE.md`](docs/METHODE.md).

## Page d'accueil, conditions et email

Au premier accès, une page d'instructions présente les 5 étapes et les conditions d'utilisation ; l'accès exige
leur acceptation et une adresse email (réglable). L'acceptation est mémorisée dans le navigateur
(`termsVersion` dans `web/config.js` : l'incrémenter force une nouvelle acceptation).

L'email est envoyé **sans serveur** à la même liste Buttondown que adp.avapmo.com (double opt-in : l'adresse n'est
inscrite qu'après confirmation par mail), étiquetée `source = simac-prep`. Réglages dans `web/config.js`
(`emailEndpoint`, `emailSource`) ; endpoint vide = adresse conservée seulement en local ; `emailRequired: false` la rend facultative.

**Accès après confirmation** (`confirmToUnlock: true`, par défaut) : l'outil est offert en échange d'une adresse confirmée.
Après l'envoi du formulaire, la page d'accueil reste fermée et affiche « Vérifiez votre boîte mail » (renvoi du mail
limité à un toutes les 60 s, changement d'adresse). L'outil s'ouvre quand l'utilisateur clique sur le lien du mail de
confirmation : dans Buttondown, la **redirection après confirmation doit pointer vers `https://simac.avapmo.com/?ok=1`**
(`?confirmed=1` est aussi accepté). Au retour, l'app marque l'adresse confirmée dans le navigateur, retire le paramètre
de l'URL et ouvre l'accès ; si le lien est ouvert dans un autre navigateur, l'accès y est ouvert aussi (le clic dans le
mail fait foi). Les acceptations enregistrées avant cette version restent valables. `confirmToUnlock: false` rétablit
l'accès immédiat ; sans adresse (email facultatif) ou sans endpoint, l'accès est également immédiat.

Limite assumée : sans serveur, c'est une barrière **douce** — quiconque tape `?ok=1` dans l'URL entre sans confirmer.
Une version gérée (avec serveur) ferait une vraie vérification.

## Crédit et responsabilité

Créé par [adp.avapmo.com](https://adp.avapmo.com) — contact@avapmo.com — utilisation gratuite.

Outil fourni « tel quel », sans garantie ni responsabilité sur les informations produites (y compris par l'IA) :
chaque utilisateur l'emploie sous sa propre responsabilité. Aucun engagement ni responsabilité de Guillermo Blanco,
adp.avapmo.com ou AVApmo. Les clés d'API et les données de rendez-vous restent dans le navigateur de l'utilisateur.

## Licence

Code : MIT. © 2026 Guillermo Blanco.

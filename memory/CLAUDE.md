# Memory — read layer (ADP §10.3)

<!-- HARD CAP: 200 lines. This file survives /compact and is re-injected on
     every compaction — every line here is paid for repeatedly. Reference,
     never inline. The architect curates; prune on every retro. -->

## Project (identity — every role reads this on startup)

SIMAC Prep — préparation de rendez-vous commerciaux (SIMAC / SONCAS) pour TPE-PME, gratuite, statique, IA au choix (BYOK) Premier cas d'usage ADP (adp.avapmop.com).

## Pointers (keep ≤5 lines each)

- **Active plan:** docs/plans/2026-10-08-mvp.md
- **Dispatch:** docs/tasks/current.md (wire mirror: .adp/dispatch.wire)
- **Context budget:** stop at ≤70% utilization (process.md §6)
- **Role prompts:** docs/prompts/ — referenced, not inlined

## Current Dispatch summary (≤5 lines, architect-maintained)

- Scaffold + e2e livrés (commit initial) ; ADP installé.
- Dev : T1 validation Groq/Gemini sur offre réelle → T2 publication Pages.
- Design : T3 revue mobile/impression après T1.
- Utilisateur : créer le repo GitHub public, clés Groq/Gemini.

<!-- {{RUNTIME:...}} markers are filled by the architect AT RUNTIME, not at install.
     They are intentionally NOT `<<<...>>>`, so `grep -r '<<<'` only flags the
     install-time placeholders you must fill before first use. -->>

## Standing facts (per-fact detail lives in memory/*.md — write layer)

- La méthode (docs/METHODE.md) et les prompts (web/lib/prompts.js) évoluent ensemble.
- Le CSV (COLUMNS, web/lib/store.js) est le contrat de données et l'amorce RAG.
- `npm test` exige un serveur statique sur :8765 (`npm run serve`).

---
name: operational-quick-ref
description: Repo architecture, key paths, run/test/deploy commands. DO trigger at session start for any code role. Do NOT trigger for pure planning/review sessions.
---

# Operational quick reference

**Purpose:** the answers every code session otherwise re-derives — what runs where, how to start it, how to test it. Fill the placeholders once at install; keep ≤150 lines.

## Architecture in five lines

SPA statique → appels directs du navigateur aux API LLM gratuites (BYOK) et à Jina Reader ; données en localStorage, export/import CSV = base RAG. Voir docs/ARCHITECTURE.md
(e.g. "FastAPI backend under api/, React frontend under web/src/, Postgres via docker-compose, deploys to Cloud Run via deploy.sh")

## Key paths

| What | Where |
|---|---|
| Backend entrypoint | aucun backend |
| Frontend entrypoint | web/app.js |
| Config / env | web/lib/llm.js (PROVIDERS) ; réglages utilisateur en localStorage simac.llm.settings |
| Migrations | aucune base — schéma CSV : COLUMNS dans web/lib/store.js |
| CI definition | .github/workflows/ |

## Commands

| Action | Command |
|---|---|
| Run local stack | npm run serve   (python3 -m http.server 8765 --directory web) → http://localhost:8765 |
| Full test suite | npm test   (Playwright, parcours complet en mode démo, serveur :8765 requis) |
| Single test file | node tests/e2e.mjs (un seul parcours pour l'instant) |
| Lint / typecheck | node --check web/app.js web/lib/*.js |
| Build | aucun build — fichiers statiques servis tels quels |
| Deploy (gated — see process.md §8) | git push origin main (Pages se déploie seul) |

## Gotchas (n≥2 only — anecdotes stay in the process-miss log)

- Le test e2e attend un serveur sur :8765 ; les réponses IA arrivant après un changement d'étape ne doivent pas re-rendre l'étape précédente (garde S.step)

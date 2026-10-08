---
name: design-principles
description: Design tokens, component patterns, and business invariants for UI work. DO trigger for any frontend/designer task. Do NOT trigger for backend-only work.
---

# Design principles

**Purpose:** stable domain knowledge for the designer lane — tokens, component conventions, accessibility floor, brand constraints. Stable means it doesn't churn weekly; per-feature design decisions live in plans, not here.

## Tokens

| Token | Value | Usage |
|---|---|---|
| #0f766e (teal) ; sombre #2dd4bf | | primary actions only |
| #b91c1c | | destructive actions only |
| 4px base : 4/6/8/10/12/16/22/28 | | all margins/paddings from this scale |
| system-ui ; 12/13/14/15/17/18/22px | | no ad-hoc font sizes |

## Component conventions

- Reuse before create: check web/app.js (renderers.<step>) — un renderer par étape first; a new component needs n≥2 call sites or a written justification in the task Result.
- State handling: un objet d'état S (brouillon) persisté dans localStorage simac.draft ; mémoire des RDV dans simac.meetings via web/lib/store.js (e.g. "server state via react-query, UI state via local useState — no global store for UI state").
- File placement: fonctions renderX() + template strings ; liaison par data-bind="objet.champ".

## Accessibility floor (non-negotiable)

- Interactive elements: keyboard-reachable, visible focus state.
- Color contrast ≥ WCAG AA; never color as the only signal.
- Images/icons that convey meaning carry alt/aria labels.

## Business invariants visible in the UI

| # | Invariant | Why |
|---|---|---|
| 1 | Les scores SONCAS restent modifiables par l'utilisateur après la proposition IA, et l'écart IA/utilisateur est visible (e.g. "prices always show currency + VAT state") | la méthode dit que SONCAS explore des motivations, pas des types figés : l'humain tranche |

## Maintenance

Owned by the designer lane; the architect merges changes (process.md §4). Entries follow the n-counter: a one-off design decision is a plan detail, not a principle.

---
name: contract-enforcement
description: Checklist to review code against this project's domain rules. DO trigger during PDCA Check and before marking any task REVIEW/DONE. Do NOT trigger during exploration.
---

# Contract enforcement checklist

**Purpose:** "review this code against these N rules." The rules below are this project's domain invariants — things the type system can't catch. Seed it from your architecture-rules-ratified log (rules at template-promotion threshold, n≥4-5, belong here).

## How to use

1. Run this checklist over the diff (`git show <hash>`), not the whole file.
2. Each item gets a verdict: PASS / FAIL (cite file + function) / N-A.
3. FAIL on any item = the task does not close; cite the item number in the Result block.

## The contract

| # | Rule | How to verify |
|---|---|---|
| 1 | Le prix n'apparaît qu'en dernière étape du Mécanisme, jamais avant (e.g. "all timestamps stored UTC, converted at the edge") | relire web/lib/prompts.js (simacMessages) et un SIMAC généré : la ligne prix est la dernière du mécanisme |
| 2 | Chaque avantage reformule un besoin du client (« (besoin : …) ») (e.g. "every new endpoint has an auth decorator") | chaque ligne d'advantages contient '(besoin' |
| 3 | Aucun fait client inventé : ce qui n'est pas sourcé est une hypothèse | la fiche client sépare facts (avec source) et assumptions ; vérifier sur une génération |

## Standing items (apply to every project)

| # | Rule | How to verify |
|---|---|---|
| S1 | No secrets in the diff | grep the diff for key/token/password patterns |
| S2 | New behavior has a test that fails without the change | stash-check or read the test's assertion |
| S3 | Diff touches only the executing role's owned lane | compare paths against process.md §4 |
| S4 | Commit message: conventional format, body says WHY | `git log -1 --format=%B` |

## Maintenance

A rule enters this table at n≥2 (two real incidents). Rules not cited in 3+ retros are retirement candidates (PROTOCOL.md §6.11).

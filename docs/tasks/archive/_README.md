# Task archive

This directory holds the permanent record of every closed task. Each file is the full archive of one task (root cause, fix, tests, follow-ups, architect sign-off).

## Naming convention

```
YYYY-MM-DD-t{N}-{slug}.md
```

Examples:
- `2026-06-15-t1-scaffold-auth.md`
- `2026-06-18-t14b-db-rules-test-harness.md`
- `2026-07-02-round-12-batch.md` (when a round bundles many tasks)

## Per-archive file structure

Use whichever sections are relevant; not all closures need all sections.

```markdown
# T{N}: {title}

**Status:** DONE YYYY-MM-DD
**Agent:** developer | designer | architect
**Plan:** docs/plans/{relevant}.md
**Commits:** `abc1234`, `def5678`
**Reviewer verdict:** PASS (YYYY-MM-DD)

## Original spec
(Copy of the Instruction + What-NOT-to-change + Acceptance criteria, for the permanent record.)

## What was done
(2-5 paragraphs. The actual fix — files changed, mechanism, edge cases handled.)

## Tests
- Test files added: `tests/test_foo.py` (5 tests)
- Pre-fix: failing on `test_foo_handles_bar`
- Post-fix: 5/5 green; full suite 318/2 pre-existing failures unchanged

## Follow-ups spawned
- T{N}a: (spec'd as child task; status NEW)
- T{M}: (newly created task; status NEW)

## Key insight
(One paragraph. What pattern this fix exposes that future tasks should learn from. This is the most valuable part of the archive.)

## Architect sign-off
(One-line verdict + date + architect-session-ID if you tag sessions.)
```

## When to write a family-bundle archive

When 4+ closely related tasks close together (a "round" or "wave"), write one archive that bundles them. The bundle archive carries:

- A "Family-level architectural insights" section (the load-bearing summary)
- A per-task table with one row per child
- The same Tests / Follow-ups / Sign-off structure scoped to the bundle

Sessions that grep the archive should find the bundle's family-level section first; individual member sections are for deeper dives.

## What NOT to put in the archive

- Code (lives in git history)
- Detailed diff explanations (the diff IS the explanation)
- Speculation about future work (those become new tasks, not archive content)
- Anything the executor said in chat that wasn't ratified into the spec

The archive is a permanent record of what was decided + what was done + what was learned. Treat it as the document a future engineer (or session) will read in 6 months.

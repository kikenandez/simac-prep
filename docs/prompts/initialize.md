# Initialize — first architect session (ONE-TIME)

Use this **once**, right after install + filling placeholders, to turn a freshly
installed ADP repo into a working one. Unlike the role prompts, this is not stable
or reusable — it's a one-shot bootstrap task.

**How to run it:** start a new architect session by pasting the body of
`docs/prompts/architect.md`, then give it the instruction block below (or, in a
host that supports file references: `@docs/prompts/architect.md` +
`@docs/prompts/initialize.md`).

Preconditions (do these first):
- `grep -r '<<<' docs/ memory/CLAUDE.md` returns nothing (placeholders filled).
- Project name set once in `memory/CLAUDE.md`.
- If using `--host=claude-code`: enforcement verified (`scripts/verify-hooks.sh .`
  or `node scripts/verify-hooks.mjs .`, then a live `git add -A` is blocked).

---

```
Bootstrap this repository's ADP working state. You are INITIALIZING, not building.

1. Read docs/prompts/process.md and the current (skeleton) docs/tasks/current.md.
2. Inspect the repo to understand what it is and what's in flight (README,
   package/pyproject/lockfiles, dir layout, recent git log).
3. Write docs/plans/<today>-bootstrap.md from docs/plans/_template.md: the 3-5
   highest-leverage workstreams for the first week. ~10 minutes of writing, not a spec.
4. Rewrite the Dispatch block at the top of docs/tasks/current.md:
   - a 3-5 line status snapshot,
   - the first 1-2 tasks for the developer session (T1, T2) with concrete
     instructions + acceptance criteria,
   - designer pickup if there's UI work, else "no pickup pending",
   - user-actions-pending (anything only the human can do).
5. PROPOSE the file-ownership lanes (which paths each role owns) and STOP for my
   approval before finalizing them in process.md §4 — do not guess ownership for a
   multi-component repo.
6. Do NOT commit. Leave everything in the working tree for my review, and end with
   a terse summary of what you wrote.
```

---

After I approve the lanes, you (the architect) update `process.md §4` and the role
prompts' `OWNED_PATHS` / `DO_NOT_TOUCH` so all three sources agree. Then commit the
initialized state with exact-path staging:

```
git add docs/plans docs/tasks/current.md docs/prompts/process.md
git status --short
git commit -m "chore: initialize ADP dispatch + bootstrap plan"
```

Then open a parallel session, paste `docs/prompts/developer.md`, and it will pick
up T1. You're running ADP.

> `memory/CLAUDE.md` keeps runtime markers (`{{RUNTIME:ACTIVE_PLAN}}`,
> `{{RUNTIME:DISPATCH_SUMMARY}}`) that the architect fills at runtime, not at install.
> They're intentionally not `<<<...>>>`, so the `grep '<<<'` done-check ignores them.

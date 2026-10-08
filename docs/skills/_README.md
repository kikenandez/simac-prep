# docs/skills/

Optional directory for **scoped knowledge bundles** that role prompts can reference.

A "skill" here is a small markdown file (sometimes with a sub-folder of references) that captures domain knowledge a session would otherwise have to re-derive every time. Examples:

- `docs/skills/design-system/SKILL.md` — design tokens, component patterns, accessibility rules
- `docs/skills/date-handling/SKILL.md` — workday calendar, timezone rules, date-parsing library to use
- `docs/skills/security-review/SKILL.md` — OWASP checklist for this codebase
- `docs/skills/codebase-index/SKILL.md` — file map, common function locations, "where to look for X"

## When to add a skill

Add a skill when:

1. A piece of domain knowledge has been re-derived in 3+ sessions.
2. The knowledge is too small to deserve a full plan document.
3. It's stable enough that it doesn't churn weekly.

## When NOT to add a skill

- The knowledge changes weekly → keep it in plans / current.md instead.
- The knowledge is one-time onboarding context → put it in the role prompt.
- The knowledge is "how this specific bug was fixed" → that's archive content.

## Format

Each skill is one folder:

```
docs/skills/<slug>/
├── SKILL.md           # the main reference, scoped to one topic
└── references/        # optional sub-files for deep references
    ├── checklist.md
    └── examples.md
```

The `SKILL.md` should be ~50-200 lines. Bigger than that, split into references.

## Compatibility note

The "skill" convention here is markdown-only and host-agnostic. If you're on Claude Code, these can be installed as Claude Code Skills (add the appropriate frontmatter). If you're on Cursor, they map to `.cursor/rules/<slug>.mdc` files. Either way the markdown body is the source.

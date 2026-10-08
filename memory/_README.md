# memory/ — two-layer memory (ADP §10.3)

- **Read layer:** `CLAUDE.md` — ≤200 lines, hand-curated by the architect, survives `/compact`. References facts; never inlines them.
- **Write layer:** `*.md` — one file per fact (`user_role.md`, `feedback_testing.md`, `spec_root_hypothesis_falsified.md`). Any agent may append; the architect curates.

Hygiene: same archive-stub discipline as tasks — stale memories get pruned at the retro (§6.11), not preserved indefinitely. A memory that names a file/function must be grep-verified before reuse (lines and symbols drift).

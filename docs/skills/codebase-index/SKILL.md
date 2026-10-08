---
name: codebase-index
description: Navigate the codebase via the AST skeleton. DO trigger before reading/locating any code (Step 1.5). Do NOT trigger for docs-only or task-admin work.
---

# Codebase index (AST skeleton)

**Purpose:** locate code without reading whole files. The index lists classes, function/method signatures, typed attributes, and internal imports — no bodies. Whole-repo view ≈ 3K tokens vs ~6K to blind-read one large file.

## Procedure

1. Check the index exists and is fresh:
   - `codebase_index.txt` (production code) and `codebase_tests_index.txt` (tests) at the repo root.
   - Stale or missing → regenerate: `python scripts/generate_map.py .`
2. Grep the index for the symbol/concept, not the codebase:
   - `grep -n "<function-or-class>" codebase_index.txt`
3. Open only the 2-3 files the index points at. Never read a directory blind.
4. After a structural change (new module, renamed class), regenerate the index in the same session and stage it with your commit.

## Rules

- The index is generated, never hand-edited.
- Line numbers are NOT in the index by design — anchor on function names (lines drift; see PROTOCOL.md §10.4).
- Tests index is separate because tests are 2-3× prod size; only load it when working on tests.
- Non-Python repos: see PROTOCOL.md §7.3 (ast-grep + FTS5 alternative); replace `generate_map.py` accordingly and keep this SKILL.md contract identical.

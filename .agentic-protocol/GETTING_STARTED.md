# Getting Started — Agentic Development Protocol (ADP) 1.1 (tooling 1.1.5)

You've installed the protocol. This walkthrough gets you from "files on disk" to "first parallel multi-agent session" in about 15 minutes.

If you haven't read `PROTOCOL.md` yet, do that first — this file assumes you understand the five core patterns (stable prompts, Dispatch block, file ownership, commit hygiene, session lifecycle).

---

## Step 0 — How to install cleanly (before you run init.sh)

The installer writes files but **never touches git** — it won't commit or branch
for you. So install onto a clean tree, ideally a dedicated branch, then review and
merge:

```bash
cd /path/to/your/repo
git checkout -b adopt-adp                 # install on a branch
/path/to/adp/current/scripts/init.sh --dry-run .   # preview — writes nothing
/path/to/adp/current/scripts/init.sh --host=claude-code .   # then install for real
git status && git diff --stat             # review, then commit + merge
```

`--dry-run` shows exactly what would be added/skipped/merged. If you install onto a
repo with uncommitted changes, init.sh warns first — heed it, or your work and
ADP's files end up entangled in the same diff.

---

## Step 1 — Confirm the install (30 seconds)

```bash
ls -la docs/prompts/
# Expect: architect.md, developer.md, designer.md, reviewer.md, analyst.md, process.md

ls -la docs/tasks/
# Expect: current.md, archive/

ls -la docs/plans/
# Expect: _template.md, archive/

cat .agentic-protocol/VERSION
# Expect: ADP 1.1.5
```

If anything's missing, re-run the init script or `cp -r template/. .` from the protocol repo.

---

## Step 2 — Fill in your stack (5 minutes)

The prompts and skills have `<<<PLACEHOLDER>>>` slots. Fill them once; they don't change after.

**Fastest way — fill them all from one file:** edit `adp.answers` (one `KEY=value`
per line), then run `scripts/adp-fill.sh .` (or `node scripts/adp-fill.mjs .`). It
substitutes every `<<<KEY>>>` across `docs/` and `memory/CLAUDE.md` and reports
what's still open — ~10 answers instead of editing a dozen files. Leave the
ownership-lane keys blank if you'd rather a first architect session propose them.

The rest of this step is the **manual** equivalent (edit the files directly):

**Set the project name** in `memory/CLAUDE.md` (`<<<PROJECT_NAME>>>`) — the single
place the name lives; role prompts stay generic ("for this repository").

**Then the role prompts** (or just fill `adp.answers` above):

1. `docs/prompts/architect.md`:
   - `<<<STACK>>>` → e.g. "Python 3.12 + FastAPI + Postgres + React/Vite"
   - `<<<LOCAL_RUN>>>` → e.g. "`docker compose up`" or "`./run_local.sh`"
   - `<<<DEPLOY>>>` → e.g. "`./scripts/deploy.sh`" or "GitHub Actions on push to main"
   - `<<<GLOSSARY>>>` → internal acronyms / project codenames a fresh session should know

2. `docs/prompts/developer.md`:
   - Same `<<<STACK>>>` / `<<<LOCAL_RUN>>>` / `<<<DEPLOY>>>`
   - `<<<TEST_CMD>>>` → e.g. "`pytest tests/ -q`"
   - `<<<OWNED_PATHS>>>` → e.g. "`api/`, `db/`, `tests/`, `scripts/`"
   - `<<<DO_NOT_TOUCH>>>` → e.g. "`web/`, `docs/`"
   - `<<<ARCH_RULES>>>` → 3-7 timeless rules specific to your codebase (database access pattern, auth pattern, secrets handling)

3. `docs/prompts/designer.md` (or delete if no UI):
   - `<<<UI_STACK>>>` → e.g. "React + TypeScript + Tailwind, Vite"
   - `<<<DESIGN_TOKENS>>>` → font + color + spacing tokens
   - `<<<I18N_LOCALES>>>` → e.g. "en, fr, es" or "en only — no i18n yet"
   - `<<<BUILD_CMD>>>` → e.g. "`npm run build`"
   - `<<<E2E_CMD>>>` → e.g. "`npm run test:e2e`"
   - `<<<OWNED_PATHS>>>` → e.g. "`web/src/`, `web/public/locales/`, `web/tests/e2e/`"
   - `<<<DO_NOT_TOUCH>>>` → e.g. "`api/`, `db/`, `scripts/`"

4. `docs/prompts/reviewer.md` (optional):
   - `<<<TEST_CMD>>>`, `<<<BUILD_CMD>>>`

5. `docs/prompts/process.md`:
   - Fill in the File Ownership table (§4) with the same `<<<OWNED_PATHS>>>` values you used in role prompts. Three sources should agree: role prompt, process.md §4, and your team's mental model.

### Ownership lanes — worked examples by topology

The lanes (`OWNED_PATHS` / `DO_NOT_TOUCH`) are the one config decision a human
should make, not an agent. The template assumes a backend/frontend split; here's
how to map other layouts:

- **Backend + frontend (the default):** developer owns `api/`, `db/`, `tests/`,
  `scripts/`; designer owns `web/src/`, `web/public/locales/`, `web/tests/e2e/`.
  Each is the other's `DO_NOT_TOUCH`.
- **Single-file apps / monorepo of small things** (e.g. many standalone games or
  scripts): lanes split *by directory*, not by tier. Developer owns the logic dirs
  (`game1/`, `game2/`, `shared/`, `scripts/`); if there's no separate UI codebase,
  drop the designer role and fold visual rules into the developer's `ARCH_RULES`
  plus a designer-owned `DESIGN.md` *contract* the developer follows. (For a truly
  single-file app, the whole file is one lane — parallelize by *task*, not by file.)
- **Library + examples/docs:** developer owns `src/`, `tests/`; a comms/designer
  role owns `examples/`, `docs/`. Reviewer owns nothing — it only reads.
- **Service + infra:** developer owns app code + `tests/`; keep `infra/`,
  `.github/`, `deploy/` in `DO_NOT_TOUCH` and gate them behind the human (or a
  dedicated ops lane) — never let a feature session touch deploy wiring.

Rule of thumb: a lane is a set of paths **one** session can own without colliding
with another. If two roles need the same path, that's a handoff task, not a shared
lane. When in doubt, fewer roles + clear dirs beats more roles + overlapping paths.

> **Lanes are for your product CODE only — never put an ADP-installed path in a lane.**
> That means none of `docs/tasks/` (or `current.md`), `docs/plans/`, `docs/prompts/`,
> `docs/skills/`, `memory/`, `.adp/`, `.agentic-protocol/`, `.claude/`, or
> `.github/workflows/` belong in any role's `OWNED_PATHS` / `DO_NOT_TOUCH` — they're
> governed by process.md §4. In particular `current.md` (and `.adp/`) are co-edited/
> machine-managed, so a `DO_NOT_TOUCH` on them would stop the developer/designer from
> reporting their work.

> **Generated files, not hand-filled:** `codebase_index.txt` and
> `codebase_tests_index.txt` are produced automatically by
> `python scripts/generate_map.py .` (an AST skeleton — signatures + imports, no
> bodies). Run it once now, and re-run after structural changes. Never edit them by
> hand. They are *not* part of `adp.answers`.
>
> **Language support:** `generate_map.py` currently indexes **Python (`.py`) only**
> (it uses Python's `ast`). JS/TS/HTML/other languages are **not** indexed — on a
> polyglot repo the index covers just the Python parts, and on a non-Python repo it's
> empty. That's fine: the codebase index is an *optional* convenience (L2), not
> required. The rest of ADP is fully language-agnostic.

**Sanity check:** search the prompts for any remaining `<<<...>>>` placeholders and replace them:

```bash
grep -r "<<<" docs/prompts/ memory/CLAUDE.md
# Expect: empty (or only matches in commented examples)
```

---

## Steps 3–4 the easy way — let the architect initialize (recommended)

The fastest way to do the next two steps (first plan + first Dispatch) is the
one-time **initialize** task: start an architect session (paste
`docs/prompts/architect.md`), then hand it `docs/prompts/initialize.md` — or, in a
host with file references, `@docs/prompts/architect.md` + `@docs/prompts/initialize.md`.
It writes the bootstrap plan, rewrites the Dispatch, and *proposes* the file-ownership
lanes for your approval. Prefer to do it by hand? The manual steps below do the same.

---

## Step 3 — Write your first plan (3 minutes)

Copy the plan template and fill it in:

```bash
cp docs/plans/_template.md docs/plans/$(date +%Y-%m-%d)-bootstrap.md
```

Edit the new file. For a greenfield project: list the 3-5 highest-leverage things to build in the first week. For an existing project: pick one workstream you're about to start.

Don't over-plan. The architect session will refine this. You want ~10 minutes of writing, not 2 hours.

---

## Step 4 — Write your first Dispatch (2 minutes)

Open `docs/tasks/current.md`. The Dispatch block at the top has placeholders — replace them with:

- A status snapshot (1-3 lines): "Just installed ADP. Bootstrap plan in `docs/plans/2026-06-01-bootstrap.md`. No tasks dispatched yet."
- Developer session pickup: name 1-2 tasks. If the project is greenfield, those tasks might be "T1: scaffold project structure per bootstrap plan §3".
- Designer session pickup (if applicable): same.
- User actions pending: anything only the human can do right now.

Then write your first task block (T1) below the Dispatch using the template already in the file. Be concrete — files to create, acceptance criteria.

---

## Step 5 — Initialize git tracking (1 minute)

```bash
git add docs/prompts/ docs/tasks/ docs/plans/ .agentic-protocol/
git status --short    # confirm only ADP files staged
git commit -m "chore: install Agentic Development Protocol 1.1

Adds role prompts, process.md, dispatch-block skeleton, and plan
template. See .agentic-protocol/VERSION."
```

Note the `git status --short` step. That's the habit you want from day 1.

---

## Step 6 — Start your first architect session (now)

Open your AI coding host (Claude Code, Cursor, etc.). Start a new session.

**First message to paste** (literally — copy from the file):

```
[Paste the body of docs/prompts/architect.md here — everything inside the triple-backtick block]
```

The session will boot, read `process.md`, read `current.md` Dispatch, and stand by.

Your first conversation with it: "Read the bootstrap plan. Verify it's coherent. Refine the T1 task spec if needed. Then I'll start a developer session."

---

## Step 7 — Start a parallel developer session (when ready)

Same AI host, second session (or second terminal). Paste `docs/prompts/developer.md`.

The session will read Dispatch, find T1, set Status: IN_PROGRESS, and start working.

Now you have two sessions running. Watch them for the first task — confirm they don't step on each other's files. The exact-path staging rule and `git status --short` habit should make this a non-event.

---

## Teams, multiple computers & agentic sessions

**Install once per repo — not per computer.** ADP's files are git-tracked, so one
person runs `init.sh`, fills the placeholders, and commits. Everyone else gets the
whole protocol — prompts, Dispatch, hooks, settings — by `git clone` / `git pull`.
There is no second install.

**Per-developer "satellite" setup (no install, ~1 minute).** After cloning, each dev:

1. Ensures prerequisites are present: `bash` + `jq` (for the bash hooks) **or** just
   `node` (for the Node hooks). See Prerequisites in the repo README.
2. Confirms enforcement fires *on their machine*:
   `scripts/verify-hooks.sh .` (or `node scripts/verify-hooks.mjs .`), then a live
   `git add -A` in the AI host — it must be blocked. Hooks are evaluated locally, so
   a teammate missing the runtime gets no enforcement until they install it.
3. Optionally uses `.claude/settings.local.json` (per-user, gitignored) for personal
   overrides. The committed `settings.json` holds the **team** hook wiring — leave it.

**Mixed-OS teams → standardize on the Node hooks.** A committed `settings.json` can
point at only one flavor. The Node hooks (`.mjs`) run on macOS/Linux/Windows with
just `node`, so commit the Node wiring once
(`cp .claude/settings.node.json .claude/settings.json` before committing) and every
teammate is covered regardless of OS.

**Two operating models — pick deliberately:**

- **Centralized (best for heavy parallel agentic work).** All the parallel sessions
  (architect + developers + designer) run in **one** environment against **one**
  working tree — a dedicated box or shared cloud workspace. This is what ADP was
  built for: the git-hygiene hook and file-ownership lanes exist to keep parallel
  sessions on a *shared* `.git/index` from colliding. Humans connect to orchestrate.
- **Distributed.** Each developer runs their own session(s) on their own clone and
  collaborates via normal git (branches + PRs). Still valuable, but the hooks become
  a per-machine safety net rather than the coordination layer.

**What gets fragile across many computers:** the single-file shared state. The
**Dispatch** (`docs/tasks/current.md`) assumes **one owner at a time** — two
architects rewriting it on two machines will merge-conflict. And the regenerating
`.adp/*.wire` files churn per machine; if that's noisy for your team, have one
machine own them or git-ignore the live `.adp/` state. Cross-machine code collisions
are just ordinary git — file-ownership lanes reduce them, branches/PRs resolve them.

**Rule of thumb:** one committed install + a single Dispatch owner + Node hooks for a
mixed team. For serious parallel multi-agent runs, give it a dedicated working tree.

---

## What success looks like at week 1

- `docs/tasks/current.md` Dispatch block has been rewritten 5+ times
- `docs/tasks/archive/` has 3-7 archive files (closed tasks)
- `docs/plans/` has 2-4 active plans
- You (the human) appear in chat to (a) accept proposals, (b) deploy, (c) clarify spec ambiguity — not to relay information between sessions
- `git log --oneline` shows commits with clean conventional-commits prefixes and task IDs

---

## Troubleshooting

**"Two sessions tried to commit the same file."**
→ One of them skipped `git status --short` before commit. Read process.md §4a Hard Rule #5. The recovery: `git reset HEAD <unintended-file>`, re-commit the intended subset, write a handoff task for the file that needed cross-lane work.

**"Architect keeps trying to write code."**
→ Re-paste the architect prompt. The "Never implement code directly" rule is in the HARD rules block; if the session drifted, a re-paste with explicit reminder fixes it. If it keeps drifting, your architect session is too small a model — bump it to Opus or Sonnet.

**"`current.md` grew to 1500 lines and sessions are slow to boot."**
→ Run an architect cleanup pass. Archive stubs that are >1 round old. Move family-bundle insights to the archive-index section. See process.md §10.

**"A bug investigation ate the whole day and turned out to be local-stack staleness."**
→ Gate 0 was skipped. The pattern is the cost; the rule fires next time. Log the miss in `current.md` § "Process misses log".

**"I'm running ADP solo with one session."**
→ Fine. You'll skip the parallel-session commit hygiene rules (they're free anyway — exact-path staging is good habit) and you may collapse architect + developer into one role. The Dispatch block still helps you remember what you were doing across sessions.

---

## Next steps

- Read `PROTOCOL.md` §6-§9 to internalize the process / lifecycle.
- Once you've shipped your first 5 tasks, do an architect retrospective: open the archive files, look for patterns that should become "Architecture rules ratified" in `current.md`.
- Star the ADP repo, file issues for anything that didn't work in your context.

Welcome to multi-agent development. Build something good.

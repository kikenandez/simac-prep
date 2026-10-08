# Shared Development Process

All sessions (architect, developer, designer, reviewer, analyst if used) follow this process. This file is the single source of truth — individual role prompts reference it.

**Prompts are stable.** The role prompts under `docs/prompts/` are rewritten rarely. Priorities, open tasks, and "what to do next" live in `docs/tasks/current.md` (specifically the **Dispatch block** — see §3a). You paste the same prompt body every round; what changes is `current.md`.

---

## 1. PLAN → PROGRESS → TEST → DOCUMENT → COMMIT

Every task follows these 5 steps in order.

| Step | What | Who updates |
|---|---|---|
| **PLAN** | Read or create a plan under `docs/plans/YYYY-MM-DD-{slug}.md` | Architect creates, others read |
| **PROGRESS** | Update the plan's progress tracker table after each step | Whoever completed the step |
| **TEST** | Write tests before/alongside code. Run full suite. Zero new regressions. | Developer, Designer (visual) |
| **DOCUMENT** | Update relevant docs (see project-specific list in role prompts) | Whoever made the change |
| **COMMIT** | Conventional commits. One logical change per commit. | Whoever made the change |

---

## 2. PLAN DOCUMENT FORMAT

Filename: `docs/plans/YYYY-MM-DD-{short-slug}.md`

Standard structure:

```markdown
# Plan: {Title}

**Created:** YYYY-MM-DD
**Status:** PROPOSED | IN PROGRESS | DONE
**Branch:** (if applicable)

## Problem
## Proposed Solution
## Implementation Steps (table with effort + status)
## Progress Tracker (table updated as work proceeds)
## Backlog (deferred items)
```

A starter copy lives at `docs/plans/_template.md`.

---

## 3. TASK DISPATCH

Two task sources:

1. **Architect → Agent:** The architect writes tasks for planned features, improvements, and architectural changes. Dev/design sessions read `docs/tasks/current.md` and execute their assigned tasks.
2. **User → Agent (direct):** For small bug fixes related to work just done, the user can address the developer or designer directly without going through the architect. The agent fixes the issue, updates the task file, keeps the backlog current.

**All sessions read the same file.** No copy-pasting task content.

### Task file location

```
docs/tasks/current.md
```

### Task format

```markdown
### T{N}: {Short title}
- **Agent:** developer | designer | architect | reviewer
- **Status:** NEW | IN_PROGRESS | DONE | REVIEW | BLOCKED | CANCELED | DEFERRED
- **Plan:** docs/plans/{relevant-plan}.md (if applicable)
- **Priority:** P0 | P1 | P2 | P3
- **Created:** YYYY-MM-DD
- **Completed:** (filled by agent when DONE)

**Instruction:**
{What to do — specific files, functions, line numbers, guard rails}

**What NOT to change:**
{Explicit guard rails — files/functions to leave alone}

**Acceptance criteria:**
- [ ] {Concrete verification — test passes, behavior confirmed}

**Result:**
{Filled by the executing agent: what was done, commit hash, issues found}
```

### Spawned follow-up tasks

When a task splits during execution, use letter suffixes: `T14a`, `T14b`, `T14c`. The parent (`T14`) stays as a header/reference; the spawned children are the actual work units. The architect decides which parent a child belongs to — agents do not invent new parent numbers.

### Lifecycle

```
ARCHITECT writes task (Status: NEW)
    ↓
DEVELOPER/DESIGNER reads Dispatch + current.md, picks their task
    ↓
Sets Status: IN_PROGRESS
    ↓
Implements, tests, commits
    ↓
Sets Status: DONE (or REVIEW if architect sign-off needed), fills Result + Completed
    ↓
Re-reads current.md Dispatch block to pick the next task
    ↓
REVIEWER (optional) verifies acceptance criteria, appends verdict
    ↓
ARCHITECT reviews DONE tasks, archives to docs/tasks/archive/, updates Dispatch
```

### Rules

| Rule | Detail |
|---|---|
| **One owner** | Each task has exactly one agent. No shared ownership. |
| **Read Dispatch first** | Every session starts by reading `docs/tasks/current.md`, specifically the Dispatch block (§3a). |
| **Re-read on every completion** | After finishing a task, re-read `current.md` before picking the next. Catches architect updates mid-session. |
| **Pick your tasks** | Only work on tasks assigned to your role. Priority and Dispatch order determine which first. |
| **Update immediately** | Set IN_PROGRESS before starting, DONE (or REVIEW) when finished. |
| **Never delete** | Tasks are archived after review, never deleted. |
| **Blocked?** | Set BLOCKED + explain why. Architect unblocks. |
| **New issue found?** | Add a new task with Status: NEW; write a short spec. Do not modify existing tasks to redirect their scope. |
| **Direct user fix** | User reports a small bug directly → fix it, add a task with Status: DONE, fill Result. Keeps the backlog accurate. |
| **Big change?** | If a direct user request requires architectural decisions or touches multiple systems, suggest involving the architect first. |

---

## 3a. DISPATCH BLOCK (architect-maintained)

The **Dispatch block** at the top of `docs/tasks/current.md` is the single source of truth for "what should each session be doing right now." The architect maintains it after every status change, verdict, or new task.

### Why

Without Dispatch, sessions scan `current.md` for tasks with their role and pick the lowest-numbered NEW one. That works with 2-3 open tasks but breaks at 10+ tasks with different priorities, blocking relationships, and architect verdicts. Dispatch is the architect's running instruction to each session.

### Format

```markdown
## Dispatch — architect-maintained (updated YYYY-MM-DD)

### Developer session (next)
- **Pick up:** T{N} — short title
- **After T{N}:** T{M} → T{K} → T{J}
- **Do not start:** T{X} (reason), T{Y} (reason)
- **Context budget:** end session at ≤30% remaining
- **Standing reminders:** Gate 0 on every bug, exact-path staging

### Designer session (next)
- (same structure)

### Reviewer queue (if reviewer role is in use)
- T{A}, T{B}, T{C} — in this order

### User actions pending (no session needed)
- Items requiring the human: deploys, console toggles, domain config
```

### Maintenance rules

1. **Architect updates Dispatch after every task state change.** DONE / REVIEW / BLOCKED / NEW / archived → Dispatch reflects the new priority order.
2. **Sessions read Dispatch on startup AND after every completed task.** Not just at session start.
3. **Dispatch is not a backlog.** It's an instruction for THIS session. Keep it to 3-5 upcoming tasks per session plus explicit "do not start" entries.
4. **User-action items go in Dispatch too.** Things only the user can do live in the "User actions pending" section so they don't get forgotten.

---

## 4. FILE OWNERSHIP

Sessions can run in parallel. To avoid file conflicts:

| Owner | Files |
|---|---|
| **Architect** | `docs/plans/`, `docs/prompts/`, `docs/tasks/` **(Dispatch block + task structure + archiving)**, memory files, top-level architecture docs |
| **Developer** | (project-specific — see developer.md) **+ its own task's `Status`/`Result` in `current.md`** |
| **Designer** | (project-specific — see designer.md) **+ its own task's `Status`/`Result` in `current.md`** |
| **Reviewer** | Nothing writable except the Result block of REVIEW tasks |
| **Rule** | If two sessions need the same file, coordinate via the architect with a handoff task. Do not edit files outside your lane. |

**Coordination files are SHARED — they are not code lanes.** Everything ADP installs —
`docs/tasks/`, `docs/plans/`, `docs/prompts/`, `docs/skills/`, `memory/`, `.adp/`,
`.agentic-protocol/`, `.claude/`, `.github/workflows/adp-checks.yml` — is governed by the
roles above, **not** by your code-ownership lanes. Two sub-cases: `.adp/` is
machine-managed state (`.wire` files auto-regenerated by `wire-sync`; `results.jsonl`
appended by agents — don't hand-edit), and `.agentic-protocol/` is protocol metadata
(`VERSION`, `INSTALL_MANIFEST` — architect/installer only). On `current.md` specifically:
the **architect** owns the Dispatch block + task structure + archiving, but **each
executing session updates its OWN task's `Status` and `Result`** (§3). So **never put
`docs/tasks/` (or `current.md`) in a developer/designer `DO_NOT_TOUCH`** — that blocks
the updates the workflow depends on. (In parallel mode, follow §4a commit hygiene, and
let the architect broker `current.md` *status* edits if two sessions would collide — but
the executing session is never locked out of its own task.)

> **The ownership lanes (`OWNED_PATHS` / `DO_NOT_TOUCH`) are for your CODE directories
> only.** Do not list ADP's coordination files (`docs/tasks/`, `docs/plans/`, `memory/`,
> `.adp/`) in them.

Fill the developer/designer rows in this table when you install the protocol. Each role prompt also declares its `web/lib/, tests/, package.json`/`web/index.html, web/styles.css, web/app.js` (and the matching DO_NOT_TOUCH) — keep the three sources consistent.

---

## 4a. PARALLEL-SESSION COMMIT HYGIENE

Parallel sessions share the same working directory. Git staging is the fault line: one session's `git add -A` sweeps files from the other session's working tree, producing commits with the wrong content under the wrong label.

### Hard rules (five)

1. **Stage by exact path, never bulk.** Use `git add path/to/file1 path/to/file2`. **Never** `git add -A`, `git add .`, `git commit -a`, or any variant that stages the whole working tree. If you need to include a file not on your owned list (§4), stop and write a handoff task instead.

2. **Never `git reset --hard` without a stash.** If a commit has the wrong content, prefer `git reset --soft HEAD~1` (preserves staging) or `git reset HEAD~1` (preserves working tree, default). Hard reset is the last resort and must be preceded by `git stash` to capture the working tree in a survivable object.

3. **Verify "committed" claims before reporting.** When you write "code landed in `<hash>`" in a Result block, first run `git branch --contains <hash>`. If the result is empty, the hash is **orphan** — reachable only via reflog, not on any branch. Orphans are garbage-collected. An unchecked orphan claim is a data-loss risk.

4. **Resolve pre-commit-hook failures with new commits, not `--amend`.** If a hook rejects your commit, the commit did not happen. Fix the issue, re-stage specifically, commit again. Do not `--amend` (that edits the previous commit, which may be someone else's work if there was a race).

5. **Always `git status --short` BEFORE every `git commit`.** Verify the staged-files list shows only files you intended to stage. The git index is process-shared — a parallel session's intermediate `git add` (entirely legal under HARD RULE #1) is visible to your session's `git commit` and will be swept into your commit unless you check. Exact-path staging closes the "bulk-staging mistake" failure mode; this rule closes the "shared-index pollution" failure mode. If `git status --short` shows files outside your lane (§4) or files you didn't stage in this session, **stop**:
   - Un-stage the unintended files: `git reset HEAD <path>`.
   - Then proceed with the commit on your intended subset.
   - If unsure who owns the staged file, write a handoff task per §3.

### Checking the working tree before a commit

```bash
git status --short
# "M " and "A " entries indicate staged files.
# Only modified or untracked files you actually OWN should appear as staged.
# If a staged file is outside your lane (§4), stop and ask the architect.
```

### Verifying staged contents

```bash
git status --short    # Quick view: what's staged?
git diff --cached     # Optional: review the actual staged hunks.
git commit -m "..."
```

---

## 5. BUG REPORTING FORMAT

When the user reports a bug, capture it as a task:

```markdown
### T{N}: BUG — {Short title}
- **Agent:** developer | designer
- **Status:** NEW
- **Priority:** P0 | P1
- **Created:** YYYY-MM-DD
- **Reported by:** user (context: how they hit it, screenshot if any)

**Reproduction:**
1. Step by step, exactly what the user did
2. Including which screen / mode / document they were in
3. Ending with the observed wrong behaviour

**Expected:** What should happen
**Actual:** What happened (with error messages / screenshots / logs)

**Investigation gates (answer before coding):**
- Gate 0: Is the local stack fresh? Did the user `git pull && restart` before reproducing? (See §5a.)
- Gate 1: {Specific code path trace}
- Gate 2: {Specific state inspection}
- Gate N: {More as needed}

**What NOT to change until root cause is found:**
- {Files that should not be touched speculatively}

**Acceptance criteria:**
- [ ] Root cause documented in Result block
- [ ] Reproducing test written FIRST, failing on main
- [ ] Minimal fix landed, test now passes
- [ ] No new regressions in the full test suite
- [ ] Manual smoke matches the user's original repro

**Result:** (filled by agent)
```

---

## 5a. STANDING BUG PROTOCOL — Gate 0: local-stack freshness

**Every bug report starts with Gate 0.** The implementing role verifies the local stack is running the latest committed code before investigating.

```bash
git status                    # Must be clean (no uncommitted work from elsewhere)
git log --oneline -3           # Confirm HEAD matches what's on main
git pull                       # Get the latest
# Restart your local stack — whatever brings up the app:
#   ./run_local.sh, docker compose up, npm run dev, etc.
```

Rationale: many local stacks cache modules at startup. If you ran the stack before the latest commit landed, you are running old code and the "bug" may already be fixed. Skipping Gate 0 costs hours.

If Gate 0 resolves the bug, close the task as NOT-A-BUG in the Result block, noting that the local stack was stale. Do not delete the task — the NOT-A-BUG closure is itself a useful signal that the underlying code is correct.

---

## 6. COMMIT MESSAGE FORMAT

```
<type>: <description>

<optional body explaining why>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `perf`, `chore`, `ci`.

Rules:

- One logical change per commit. Do not bundle unrelated changes.
- Body explains **why**, not **what** (the diff shows what).
- Reference task IDs in parentheses: `(T28b)`, `(T16 Path C)`, etc.

---

## 7. TEST COMMANDS

Project-specific — see each role prompt's `npm test   (Playwright, parcours complet en mode démo, serveur :8765 requis)` / `aucun build — fichiers statiques servis tels quels` / `npm test` placeholders.

Document known pre-existing failures in the relevant plan; they stay failing until their own task addresses them. Zero NEW failures is the bar.

---

## 8. DEPLOYMENT

Project-specific — see role prompts' `GitHub Actions on push to main → GitHub Pages (.github/workflows/pages.yml, publie web/)` block.

### 8a. Deploy cadence (cost-driven)

Many CI/CD setups have a per-deploy cost (vulnerability scan, container build, downtime window). If yours does, set a cadence rule:

- **≤ 1 deploy / 24h (hard rule)** for cost-sensitive setups.
- **1 deploy / 3-7 days (target)** for routine bundling.
- **Same-day deploy** only for P0 user-facing data-loss bugs that cannot be reproduced locally.

The architect justifies each deploy in the Dispatch block with a one-line cost-justification.

### 8b. Local-smoke is the default verification gate

Before reaching for the deploy script, attempt verification locally. Most bugs reproduce against the same code paths in your local stack. Reserve prod verification for behavior that depends on prod-only state.

### 8c. Bundling discipline

When multiple tasks complete within the cadence window, batch them into one deploy. The architect maintains a "Deploy queue" sub-section in Dispatch listing the queued tasks and their local verification status.

### 8d. Pre-deploy checklist

Before deploying:

1. **Parity with origin:** `git pull --ff-only && git status --short` — refuses to merge if local diverges from origin; empty status confirms no uncommitted leaks.
2. Local tests pass.
3. Local verification ran for every queued task.
4. Known pre-launch user actions are done.
5. The Dispatch's "User actions pending" section is empty for items that block this deploy.
6. Cost-justification is in the Dispatch.

---

## 9. SESSION LIFECYCLE

Sessions have bounded context. Ending a session cleanly is better than rolling into a task that won't fit.

### Context budgets (hard rule)

**Stop at ≤70% utilization** of your model's context window. On a 1M-token model, that's ~700K consumed, ~300K cushion left.

| Session | Utilization cap | Cushion at 1M | Rationale |
|---|---|---|---|
| Developer | ≤70% used | ~300K | Push large tasks deeper into the session. Cushion leaves room for final commit + Result block + handoff. |
| Designer | ≤70% used | ~300K | Frontend tasks fit smaller; multiple per session is normal. |
| Architect | ≤70% used | ~300K | Pattern recognition holds well past 50% utilization. End earlier ONLY if subjective review quality drifts. |
| Reviewer | ≤70% used or queue empty | ~300K | Whichever comes first. |

**Stop condition:** session utilization reaches 70% **OR** the next task in Dispatch wouldn't fit in the remaining cushion.

If your model has a smaller context (e.g. 200K), the 70% rule still applies — stop at ~140K used.

### Mid-session Dispatch check

After every completed task, re-read `docs/tasks/current.md`:

1. Has the architect added new tasks? (Dispatch reflects them.)
2. Has a priority changed?
3. Is my budget below threshold?

If the next Dispatch task won't fit in the remaining budget, **stop there**. Write a session-end summary:

- Commit hashes landed
- One-line status per task touched
- Explicit note: "Context at ~X%. Stopping before T{N} per session lifecycle rule."

### Session-end ritual

The last message in a session is a terse wrap-up:

1. What was done (commit hashes + DONE task IDs)
2. What's next (reference Dispatch, don't re-state)
3. Session ends

Do NOT:
- Roll into the next task "just because there's room"
- Emit a full status summary (the commits and archive files are the summary)
- Attempt to hand off to another session via chat (Dispatch is the handoff)

---

## 10. ARCHIVE-STUB CONVENTION

When a task reaches DONE and has been reviewed:

1. **Write the full archive file** under `docs/tasks/archive/YYYY-MM-DD-t{N}-slug.md`. This is the permanent record — root cause, fix, tests, follow-ups, architect sign-off.

2. **Collapse the task in `current.md`** to a 5-8 line stub:
   ```markdown
   ### T{N}: {title} — ARCHIVED
   - **Agent:** {who}
   - **Status:** DONE YYYY-MM-DD — archived to `archive/YYYY-MM-DD-t{N}-slug.md`
   - **Commit:** `{hash}`
   - **Key insight:** {one sentence}
   - **Follow-ups spawned:** {if any}
   ```

3. **Do NOT preserve the original task body** in `current.md` "for context." The archive file IS the context.

4. **Keep archived stubs in `current.md` for one round**, then remove them entirely during the next architect cleanup pass.

### Cleanup cadence

Architect cleans `current.md` at:

- End of each session (remove stale stubs)
- Before any multi-session round starts (ensure the next batch starts lean)
- Any time `current.md` exceeds ~1000 lines (mechanical trigger)

Target: **≤800 lines active content**. Above that, the file is harder to scan and sessions waste context re-reading irrelevant blocks.

---

## 10a. ARCHIVE-ACCESS PROTOCOL

The archive directory accumulates indefinitely. Reading all of it into context on every session would waste tokens. The discipline below scales archive access.

### Escalating-cost lookup hierarchy

When a P0 references a task ID / commit hash / architectural pattern, the architect SHOULD follow this hierarchy and stop at the first step that answers the question:

| Cost | Step | When to use |
|---|---|---|
| Free | Read the archive-index row in `current.md` | Always first |
| ~50 tokens | `grep -l "<anchor>" docs/tasks/archive/` | Identify candidate files |
| ~500 tokens | `grep -B2 -A30 "<topic>" docs/tasks/archive/<file>.md` | Read only the matched chunk |
| ~5k tokens | Read the full archive file | **Last resort.** Only when prior steps didn't pin the answer |

### Hard rules

1. **Default-deny on archive reads.** Operate as if no archive file is in context until a specific question with a specific anchor justifies opening it.
2. **Never read more than 2 archives per task.** If you need more, split the task into sub-questions, each scoped to one archive.
3. **Never read archives "just in case."** Reads are triggered by a specific anchor (task ID / commit / rule number / file path / quoted user symptom).

---

## 11. SUB-AGENT WORKTREE CLEANUP (if you use isolated worktrees)

When the architect dispatches a sub-agent via an isolated git worktree, the dispatched harness may not exit when its task completes, leaving the worktree locked. Manual recipe:

```bash
WID=agent-<id>     # the worktree directory name
LOCK=.git/worktrees/$WID/locked
PID=$(grep -oE 'pid [0-9]+' "$LOCK" 2>/dev/null | awk '{print $2}')
[ -n "$PID" ] && ps -p "$PID" -o command= 2>/dev/null | grep -q claude \
  && kill "$PID" && sleep 1 && kill -9 "$PID" 2>/dev/null
git worktree unlock ".claude/worktrees/$WID" 2>/dev/null
git worktree remove --force ".claude/worktrees/$WID"
git branch -d worktree-$WID 2>/dev/null
git worktree list   # verify only main remains
```

A `Stop` hook in `~/.claude/hooks/cleanup-orphan-worktree-agents.sh` can automate this — see the source-protocol's reference implementation.

---

## 12. ARTIFACT VS UI INVARIANT (if your product exposes shareable artifacts)

**All artifacts generated by the product are client-facing and MUST exclude internal information.** When the user adds a `visibility` flag or any "team-only" marker on a record, every artifact-generation surface filters it out unconditionally. There is no "internal artifact" type.

### What is NOT an artifact (still shows internal items)

Internal-team UX during intake / review / debugging: dashboards, edit modes, chat/Ask AVA prompts and replies, validator output / debug exports. Internal-only items render here with a visual marker so the user knows what's flagged internal.

### What IS an artifact (filters internal items)

User-triggered "share with X" surfaces: PDF / Markdown / HTML exports, slide-deck exports, public links, email digests, newsletter summaries, status reports.

### Architect rule

When you spec a new artifact-generation surface (or a new visibility flag on a record), the spec must answer:
1. Is this an artifact or a UI surface?
2. If artifact: which visibility flags does it filter on, and which records get hidden?
3. If UI: how is the internal item visually marked?

Skip this section if your product has no shareable artifact surfaces.

---

## 13. THE PROTOCOL RETROSPECTIVE — the lessons-learned sanity check (side process)

The per-task ACT phase (§1 PDCA) is tactical: a miss surfaces, a rule is named or promoted, work continues. Individual misses can hide patterns that only show up across cycles. The **protocol retrospective** is the slower-cadence outer-loop sanity check that catches what per-task ACT misses. The per-task ACT is the inner loop; the retro is the outer loop. Both feed the same process.

### Cadence

- **Default: every 2 weeks.** Maximum: 4 weeks between retros.
- **Skipping a retro is itself a process-miss — log it.** Protect the retro on the calendar like a deploy gate.

### Who

- **Architect AND the human, paired.** Architect brings the per-task log; human brings strategic context (cost, business priorities, team feedback) the architect doesn't have access to.
- **30-60 minutes**, not a long meeting.

### Inputs to review (in order of typical impact)

1. **Process-miss log delta** since last retro. Patterns? Misses that should escalate to a rule candidate (n=1)?
2. **Architecture-rules-ratified log delta.** What was promoted? Candidates at n=1 that should advance to n=2? **Ratified rules not cited in 3+ retros → candidate for retirement.**
3. **Subsystem hotspot map (if used).** New sites discovered? Sites retired? Rows needing re-grep-verification?
4. **Skills folder usage.** Most-loaded, least-loaded, any false-positive / false-negative triggers?
5. **Dispatch hygiene.** Block staying lean (3-5 tasks per role)? Sessions reading on every task end? Any session start on stale Dispatch?
6. **Test baseline drift.** Catching false alarms? Deterministic-clock fix progress?
7. **Deploy ladder + waiver ledger.** Waiver count? Cadence holding? Any failed-verification waiver that now tightens a gate?
8. **Token economy.** Any session bloated? Any prose file past its pruning trigger?
9. **Roadblocks.** What blocked the team this cycle that no rule has yet named? Often the most valuable input.

### Outputs (mandatory — even if "no change")

- **Protocol changes committed** — rule changed, candidate promoted, rule retired, skill revised, hotspot row added/retired, section reworded. PROTOCOL.md / process.md gets a commit; rules log gets the entry.
- **A retro archive entry** — dated, numbered (retro #1, #2, …) under `docs/retros/YYYY-MM-DD-retro-N.md`. 10-30 lines. Write it even when the verdict is "no change needed" — open loops are worse than closed loops with a null result.
- **Dispatch action items** carried into the next cycle.

### Anti-patterns to avoid

- **The "add more rules" reflex.** Mature retros also retire rules. Track citation counts; a rule not cited in 3+ retros is a candidate for retirement.
- **Retro-as-blame.** The process-miss log already names misses neutrally — by entry number, not by author. The retro is for patterns, not people.
- **Skip-it-this-cycle drift.** The retro becomes optional; misses accumulate; the protocol stops learning.
- **Open-loop accumulation.** Each retro must produce a concrete change OR a documented "no change needed" decision.
- **Retro-as-substitute for per-task ACT.** Per-task ACT still runs every task. The retro is the *outer* loop, not a replacement.

### Success metrics for the retro itself

- **Process-miss rate trending DOWN** over time → rules are catching what they should.
- **Rule-citation distribution healthy** — no rule monopolizing citations (too generic); no rules dormant (candidates for retirement).
- **Hotspot map length stable** — additions ≈ retirements.
- **Deploy waivers infrequent** — gates are calibrated.

If misses are flat or rising across 2-3 retros, investigate the retro process itself.

### Retro template

Use `docs/retros/_template.md` as the starting structure for each retro entry. Copy, fill, commit.

---

*End of process.md.*

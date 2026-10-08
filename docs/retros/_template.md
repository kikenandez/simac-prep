# Retro #{N} — YYYY-MM-DD

**Cadence:** every 2 weeks (default; max 4 weeks). Skipping = process-miss.
**Participants:** architect + human. 30-60 min.
**Last retro:** Retro #{N-1} (YYYY-MM-DD). Action items from last retro: _list / "all closed"_.

---

## 1. Process-miss log delta

Since last retro: #{first new entry} → #{last new entry}.

Patterns across multiple misses (if any):

- _(leave blank if no pattern detected this cycle)_

Misses to escalate from anecdote to candidate rule (n=1):

- _(name them here; they go into the rules log at n=1 — visible, watched for recurrence)_

## 2. Architecture-rules-ratified log delta

Promoted this cycle:

- _(rule N → ratified; rule M → template, etc.)_

Candidates at n=1 reaching n=2 this cycle (promoted to ratified):

- _(rule X observed twice → ratified)_

**Rules to retire** — not cited in 3+ retros:

- _(this is the under-discussed half of rule lifecycle. Track citation counts. Empty is fine; over-accumulating is not.)_

## 3. Subsystem hotspot map (§10.4)

New sites discovered this cycle:

- _(subsystem X → +1 site; row updated in same commit as the discovering task)_

Sites retired (subsystem rewritten / removed):

- _(none / list)_

Rows needing re-grep-verification (function-name anchor stale):

- _(none / list)_

## 4. Skills folder usage

Most-loaded skills this cycle: _list_
Least-loaded (candidates for revision/retirement): _list_
Any skill whose description triggered false positives or false negatives: _list_

## 5. Dispatch hygiene

- Block staying lean? (3-5 tasks per role, explicit "do not start" entries): yes / no
- Sessions reading on every task end? yes / no
- Any session start on stale Dispatch? yes (log as miss) / no

## 6. Test baseline drift

Baseline-per-session catching false alarms? _yes/no/N_
Deterministic-clock fix status: _flagged / in progress / shipped_

## 7. Deploy ladder + waivers

- Waivers this cycle: _count + brief_
- Cadence: _holding ≤1/24h hard, target 3-7d / drift observed_
- Any waiver that failed verification (→ tightens a gate)? _none / list_

## 8. Token economy

- Sessions bloated this cycle: _none / list_
- Prose files past their pruning trigger: _none / list_
- New wire-format candidate (file read repeatedly across many sessions): _none / list_

## 9. Roadblocks

What blocked the team this cycle that no rule has yet named?

- _(this is often the single most valuable section; under-reported by default. Capture even the small ones.)_

---

## Outputs (mandatory — even if "no change")

### Protocol changes committed this retro

- _(file:section → what changed; commit hash; or "no change needed")_

### Retro carry-overs (into next cycle's Dispatch)

- _(action item → owner → cycle target)_

### Verdict

- **Process-miss rate trend:** _down / flat / up_
- **Rule-citation distribution:** _healthy / one-rule monopoly / dormant rules accumulating_
- **Hotspot map length trend:** _stable / growing (investigate) / shrinking (verify retirements were valid)_
- **Retro process itself:** _earning its keep / needs adjustment (specify)_

---

*End of Retro #{N}. Next retro: YYYY-MM-DD ({+2 weeks default; +4 weeks max}).*

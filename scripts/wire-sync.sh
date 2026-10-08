#!/usr/bin/env bash
# wire-sync.sh — Keep ADP wire files in sync with prose docs.
#
# Direction: prose → wire (the safe direction; prose is the canonical source).
# Run at session end, or from a Stop hook, or manually after a Dispatch update.
#
# Usage:
#   ./scripts/wire-sync.sh [path/to/repo-root]
#   ./scripts/wire-sync.sh                    # uses current directory
#
# What it does:
#   1. Reads docs/tasks/current.md (Dispatch block + tasks)
#   2. Writes .adp/dispatch.wire (compact form)
#   3. Reads docs/tasks/current.md task headers
#   4. Writes .adp/tasks.wire (one line per task)
#   5. Reads .adp/status and reports orphan IN_PROG entries
#
# What it does NOT do (intentionally):
#   - Touch proc.wire or roles.wire (those are mostly static; edit manually
#     when process.md or role prompts change).
#   - Touch results.jsonl (append-only, written by agents themselves).
#   - Overwrite anything in docs/ — this is a one-way sync, prose → wire.

set -euo pipefail

REPO="${1:-$(pwd)}"
cd "$REPO"

if [ ! -d ".adp" ]; then
  echo "Error: .adp/ directory not found at $REPO/.adp"
  echo "Did you run init.sh first? See .agentic-protocol/GETTING_STARTED.md"
  exit 1
fi

if [ ! -f "docs/tasks/current.md" ]; then
  echo "Error: docs/tasks/current.md not found. Nothing to sync."
  exit 1
fi

CURRENT="docs/tasks/current.md"
DISPATCH=".adp/dispatch.wire"
TASKS=".adp/tasks.wire"

# === Dispatch sync ===
# Extract Dispatch block from current.md and convert to wire form.
# We look for the "## Dispatch" header and parse the role sub-sections.

python3 - <<'PYEOF'
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

CURRENT = Path("docs/tasks/current.md")
DISPATCH_OUT = Path(".adp/dispatch.wire")
TASKS_OUT = Path(".adp/tasks.wire")

text = CURRENT.read_text()
lines = text.splitlines()

# Find the Dispatch block (lines between "## Dispatch" and the next "##" at column 0).
dispatch_lines = []
in_dispatch = False
for line in lines:
    if line.startswith("## Dispatch"):
        in_dispatch = True
        continue
    if in_dispatch and line.startswith("## ") and not line.startswith("### "):
        break
    if in_dispatch:
        dispatch_lines.append(line)

# Helpers to extract per-role pickup info from the dispatch block.
def find_role_block(role_name, lines):
    """Return the lines under `### {role_name}` until the next ### header."""
    out, capture = [], False
    needle = f"### {role_name}"
    for line in lines:
        if line.lower().startswith(needle.lower()):
            capture = True
            continue
        if capture and line.startswith("### "):
            break
        if capture:
            out.append(line)
    return out

def extract_field(block, prefix):
    """Find `- **{prefix}:** value` or `- {prefix}: value` and return value."""
    for line in block:
        m = re.match(r'^\s*-\s*\*\*' + prefix + r':\*\*\s*(.+)$', line)
        if m:
            return m.group(1).strip()
        m = re.match(r'^\s*-\s*' + prefix + r':\s*(.+)$', line, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None

def compact_value(s):
    """Trim noise: remove backticks, collapse whitespace."""
    if s is None:
        return None
    return re.sub(r'\s+', ' ', s.replace('`', '').strip())

dev_block = find_role_block("Developer session", dispatch_lines)
des_block = find_role_block("Designer session", dispatch_lines)
rev_block = find_role_block("Reviewer queue", dispatch_lines)
usr_block = find_role_block("User actions pending", dispatch_lines)

def extract_after_field(block):
    """Match '- **After T7:** ...' or '- **After:** ...'."""
    for line in block:
        m = re.match(r'^\s*-\s*\*\*After[^:]*:\*\*\s*(.+)$', line)
        if m:
            return m.group(1).strip()
    return None

def role_to_wire(role_short, block):
    if not block:
        return None
    take = compact_value(extract_field(block, "Pick up"))
    nxt  = compact_value(extract_after_field(block))
    no   = compact_value(extract_field(block, "Do not start"))
    cap  = compact_value(extract_field(block, "Context budget"))
    rem  = compact_value(extract_field(block, "Standing reminders"))
    lines_out = [role_short]
    if take: lines_out.append(f" take {take[:80]}")
    if nxt:  lines_out.append(f" next {nxt[:80]}")
    if no:   lines_out.append(f" no   {no[:80]}")
    if cap:  lines_out.append(f" cap  {cap[:40]}")
    if rem:  lines_out.append(f" rem  {rem[:80]}")
    return "\n".join(lines_out)

now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ")
out = [
    "; ADP dispatch — wire v1.1 (auto-synced from docs/tasks/current.md)",
    f"v 1.1",
    f"upd {now} by=wire-sync",
    "",
]
for role_short, block in [("dev", dev_block), ("des", des_block), ("rev", rev_block)]:
    wire = role_to_wire(role_short, block)
    if wire:
        out.append(wire)
        out.append("")

if usr_block:
    out.append("usr")
    for line in usr_block:
        m = re.match(r'^\s*-\s+(.*)$', line)
        if m and m.group(1).strip():
            out.append(f" - {compact_value(m.group(1))[:90]}")
    out.append("")

DISPATCH_OUT.write_text("\n".join(out))
print(f"WROTE  {DISPATCH_OUT}  ({DISPATCH_OUT.stat().st_size} bytes)")

# === Tasks sync ===
def format_task_line(t):
    tid   = t.get("id", "?")
    role  = (t.get("agent", "?")[:3])
    state = t.get("status", "NEW").upper()[:8]
    prio  = t.get("priority", "P2")
    plan  = t.get("plan", "-")
    plan  = "@" + plan if plan != "-" and not plan.startswith("@") else plan
    inst  = f"inst@{plan}#{tid}" if plan != "-" else "-"
    acc   = "see-plan"
    return f"{tid:<6}| {role} | {state:<8} | {prio} | {plan} | {inst} | {acc}"

# Extract every "### T{N}:" task and convert to one wire line each.
# Task IDs: T{N} plus project schemes like WX.5 / FND-FU.2 / F1-FU.3. Stubs whose
# title says ARCHIVED are skipped; any other ##/### heading ends the current task
# (so fields under non-task headings never leak into the previous task).
task_re = re.compile(r'^### ([A-Z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*):\s+(.+?)$')
field_re = re.compile(r'^\s*-\s+\*\*(\w+):\*\*\s+(.+?)$')

tasks_out = ["; ADP tasks — wire v1.1 (auto-synced from docs/tasks/current.md)",
             "; T{N} | role | state | prio | plan-ref | inst-ref | acc-summary",
             ""]

current_task = None
for line in lines:
    if line.startswith("## ") or line.startswith("### "):
        if current_task:
            tasks_out.append(format_task_line(current_task))
        current_task = None
        m = task_re.match(line)
        if m and "ARCHIVED" not in m.group(2):
            current_task = {"id": m.group(1), "title": m.group(2).strip()}
        continue
    if current_task:
        f = field_re.match(line)
        if f:
            key, val = f.group(1).lower(), f.group(2).strip()
            current_task[key] = val

# Don't forget the last task
if current_task:
    tasks_out.append(format_task_line(current_task))

TASKS_OUT.write_text("\n".join(tasks_out) + "\n")
print(f"WROTE  {TASKS_OUT}  ({TASKS_OUT.stat().st_size} bytes)")

# === Orphan check ===
status_path = Path(".adp/status")
if status_path.exists():
    status_text = status_path.read_text()
    in_prog = [line for line in status_text.splitlines() if "IN_PROG" in line]
    if in_prog:
        print("")
        print("WARN  Active IN_PROG roles (verify these are still alive):")
        for line in in_prog:
            print(f"      {line.strip()}")

print("")
print("Sync complete.")
PYEOF

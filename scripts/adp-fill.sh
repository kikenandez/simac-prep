#!/usr/bin/env bash
# adp-fill.sh — substitute <<<KEY>>> placeholders from adp.answers (backlog #4).
#
# Fill adp.answers, run this once: every <<<KEY>>> in docs/ and memory/CLAUDE.md is
# replaced. Reports what was filled and what's still open. (Node twin: adp-fill.mjs.)
#
# Usage:  ./scripts/adp-fill.sh [path/to/repo]   (defaults to current dir)
set -euo pipefail
REPO="${1:-$(pwd)}"; cd "$REPO"
[ -f adp.answers ] || { echo "Error: adp.answers not found in $REPO"; exit 1; }

# The substitution itself is done in Python for safe literal replace (values may
# contain /, &, quotes, etc.) — same engine the wire scripts use.
python3 - "$REPO" <<'PYEOF'
import re, sys
from pathlib import Path
repo = Path(sys.argv[1])

answers, blank = {}, []
for line in (repo / "adp.answers").read_text(encoding="utf-8").splitlines():
    s = line.strip()
    if not s or s.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    k, v = k.strip(), v.strip()
    if not k:
        continue
    (answers.__setitem__(k, v) if v else blank.append(k))

targets = [p for p in (repo / "docs").rglob("*.md")]
claude = repo / "memory" / "CLAUDE.md"
if claude.exists():
    targets.append(claude)

subs, used = 0, set()
for f in targets:
    text = f.read_text(encoding="utf-8")
    changed = False
    for k, v in answers.items():
        tok = f"<<<{k}>>>"
        if tok in text:
            n = text.count(tok)
            text = text.replace(tok, v)
            subs += n; used.add(k); changed = True
    if changed:
        f.write_text(text, encoding="utf-8")

print(f"==> adp-fill: applied {len(used)} key(s) across {len(targets)} files ({subs} substitutions).")
unused = [k for k in answers if k not in used]
if unused:
    print(f"  note: {len(unused)} filled key(s) matched no placeholder: {', '.join(unused)}")

remaining = set()
for f in targets:
    remaining.update(re.findall(r"<<<([A-Z0-9_]+)>>>", f.read_text(encoding='utf-8')))
if remaining:
    print(f"\n  STILL OPEN — {len(remaining)} placeholder(s) not yet filled:")
    print("    " + ", ".join(sorted(remaining)))
    print("  Fill them in adp.answers and re-run, or edit the files directly.")
    sys.exit(2)
print("\n  All <<<placeholders>>> filled. (Runtime {{RUNTIME:...}} markers are left for the architect.)")
PYEOF

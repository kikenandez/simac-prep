#!/usr/bin/env python3
"""adp_metrics.py — protocol metrics snapshot (ADP §6.13).

Derives the four headline metrics from artifacts the protocol already
produces — no extra bookkeeping required of any session:

  cycle time     archive filename date (close) minus the task's Created: date
  rework rate    closed tasks that have commits referencing their T{N} AFTER
                 the close date (fix-after-done = the Check missed something)
  check catches  RETURN-FOR-FIX verdicts found in archives (caught BY Check —
                 the counterweight to rework: high catches + low rework = the
                 gate works)
  miss trend     process-miss entries in current.md, bucketed by retro window

Usage:
  python scripts/adp_metrics.py [repo_root] [--since YYYY-MM-DD] [--window 14]

Honest limits (§6.13): these are floor estimates parsed from conventions.
A task closed without an archive file is invisible; a fix commit that
doesn't cite its T{N} is invisible. The conventions ARE the instrumentation —
if the numbers look wrong, audit convention adherence first.
Stdlib only — no dependencies.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

ARCHIVE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-(t\d+[a-z]?|round-\d+-batch)", re.I)
CREATED_RE = re.compile(r"\*\*Created:\*\*\s*(\d{4}-\d{2}-\d{2})")
RETURN_RE = re.compile(r"RETURN-FOR-FIX", re.I)
MISS_RE = re.compile(r"^\s*[-*]?\s*#(\d+)[:.\s]", re.M)


def sh(args: list[str], cwd: Path) -> str:
    try:
        return subprocess.run(args, cwd=cwd, capture_output=True, text=True,
                              check=False).stdout
    except OSError:
        return ""


def parse_date(s: str) -> date | None:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default=".")
    ap.add_argument("--since", default=None, help="ignore archives closed before this date")
    ap.add_argument("--window", type=int, default=14,
                    help="bucket size in days for the miss trend (default 14 = retro cadence)")
    a = ap.parse_args()
    root = Path(a.root).resolve()
    since = parse_date(a.since) if a.since else None

    archive_dir = root / "docs" / "tasks" / "archive"
    if not archive_dir.is_dir():
        print(f"error: {archive_dir} not found — is this an ADP repo?", file=sys.stderr)
        return 1

    # ---- cycle time + check catches, from archive files -------------------
    cycles: list[tuple[str, int]] = []   # (task_id, days)
    closes: dict[str, date] = {}         # task_id -> close date
    returns = 0
    n_archives = 0
    for f in sorted(archive_dir.glob("*.md")):
        m = ARCHIVE_RE.match(f.name)
        if not m:
            continue
        close = parse_date(m.group(1))
        # The filename date can precede the commit that actually lands the archive
        # (late-night closes, next-day archive commits). Use the later of the two so
        # the closing commits themselves never count as rework.
        added = parse_date(sh(["git", "log", "--diff-filter=A", "--format=%as", "-1", "--",
                               str(f.relative_to(root))], root).strip() or "")
        if close and added and added > close:
            close = added
        if close is None or (since and close < since):
            continue
        n_archives += 1
        tid = m.group(2).lower()
        body = f.read_text(encoding="utf-8", errors="replace")
        returns += len(RETURN_RE.findall(body))
        if tid.startswith("t"):
            closes[tid] = close
            cm = CREATED_RE.search(body)
            created = parse_date(cm.group(1)) if cm else None
            if created and created <= close:
                cycles.append((tid, (close - created).days))

    # ---- rework, from git: commits citing T{N} after its close date -------
    reworked: set[str] = set()
    log = sh(["git", "log", "--no-merges", "--format=%as %s", "--all"], root)
    for line in log.splitlines():
        try:
            d_str, msg = line.split(" ", 1)
        except ValueError:
            continue
        d = parse_date(d_str)
        if d is None:
            continue
        if re.match(r"docs(\([^)]*\))?:\s*archive\b", msg, re.I):
            continue  # archiving a task is closing it, not reworking it
        for tm in re.finditer(r"\bT(\d+[a-z]?)\b", msg, re.I):
            tid = "t" + tm.group(1).lower()
            if tid in closes and d > closes[tid]:
                reworked.add(tid)

    # ---- miss trend, from current.md ---------------------------------------
    current = root / "docs" / "tasks" / "current.md"
    miss_total = 0
    if current.is_file():
        miss_total = len(set(MISS_RE.findall(
            current.read_text(encoding="utf-8", errors="replace"))))

    # ---- report ------------------------------------------------------------
    w = a.window
    print(f"ADP metrics snapshot — {root.name} — {date.today().isoformat()}"
          + (f" (since {since})" if since else ""))
    print(f"  closed tasks (archived):        {n_archives}")
    if cycles:
        days = sorted(d for _, d in cycles)
        med = days[len(days) // 2]
        print(f"  cycle time (Created→close):     median {med}d, "
              f"mean {sum(days)/len(days):.1f}d, max {days[-1]}d  (n={len(days)})")
    else:
        print("  cycle time:                     n/a (no archives with a Created: date)")
    if closes:
        rate = 100.0 * len(reworked) / len(closes)
        print(f"  rework rate (fix after close):  {len(reworked)}/{len(closes)} tasks = {rate:.0f}%"
              + (f"  -> {', '.join(sorted(reworked))}" if reworked else ""))
    print(f"  check catches (RETURN-FOR-FIX): {returns}")
    print(f"  process-miss entries (total):   {miss_total}")
    if closes:
        # close-volume per window as a trivial throughput trend
        buckets: dict[date, int] = defaultdict(int)
        anchor = max(closes.values())
        for c in closes.values():
            buckets[anchor - timedelta(days=((anchor - c).days // w) * w)] += 1
        trend = ", ".join(f"{k.isoformat()}:{buckets[k]}"
                          for k in sorted(buckets, reverse=True)[:6])
        print(f"  closes per {w}d window (recent): {trend}")
    print("\nInterpretation guide: PROTOCOL.md §6.13. Low rework + nonzero check")
    print("catches = the gate works. Rising misses across windows = take it to retro.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

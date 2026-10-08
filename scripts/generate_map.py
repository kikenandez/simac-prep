#!/usr/bin/env python3
"""generate_map.py — codebase-index AST generator (ADP §7.3).

LANGUAGE SUPPORT: Python (.py) ONLY — this uses Python's `ast`. JS/TS/HTML and
other languages are not indexed (a polyglot repo indexes just its Python; a
non-Python repo produces an empty index). The codebase index is an optional
convenience; the rest of ADP is language-agnostic.

Walks a repo, parses every Python file, and writes a low-token AST skeleton:
classes, function/method signatures, type-hinted attributes, and internal
imports — NO implementation bodies. Output is two files at the repo root:

  codebase_index.txt        production code skeleton
  codebase_tests_index.txt  test skeleton (separated — tests are typically
                            2-3x the prod code size)

Usage:
  python scripts/generate_map.py [repo_root]      # default: cwd
  python scripts/generate_map.py . --quiet

Agents read the index FIRST (role-prompt "Step 1.5") to pick the 2-3 files
they actually need to open. Reading a 2000-line file blind costs ~6K tokens;
the whole-repo skeleton costs ~3K and points at the right files. Break-even
is one task.

For non-Python repos, see PROTOCOL.md §7.3 (ast-grep + FTS5 alternative).
Stdlib only — no dependencies.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

SKIP_DIRS = {
    ".git", ".hg", ".svn", "__pycache__", ".mypy_cache", ".pytest_cache",
    ".ruff_cache", ".tox", ".venv", "venv", "env", "node_modules",
    "dist", "build", ".eggs", "site-packages", ".adp",
}

PROD_OUT = "codebase_index.txt"
TEST_OUT = "codebase_tests_index.txt"
INDEX_TOKEN_WARN = 25_000  # warn if an index exceeds this (~100 KB) — Codex install-retro


def is_test_path(rel: Path) -> bool:
    parts = [p.lower() for p in rel.parts]
    if any(p in ("tests", "test", "e2e") for p in parts[:-1]):
        return True
    name = rel.name.lower()
    return name.startswith("test_") or name.endswith("_test.py") or name == "conftest.py"


def fmt_arg(a: ast.arg) -> str:
    return f"{a.arg}: {ast.unparse(a.annotation)}" if a.annotation else a.arg


def fmt_signature(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    a = fn.args
    parts: list[str] = []
    pos = list(a.posonlyargs) + list(a.args)
    n_defaults = len(a.defaults)
    for i, arg in enumerate(pos):
        s = fmt_arg(arg)
        if i >= len(pos) - n_defaults:
            s += "=…"
        parts.append(s)
    if a.posonlyargs:
        parts.insert(len(a.posonlyargs), "/")
    if a.vararg:
        parts.append("*" + fmt_arg(a.vararg))
    elif a.kwonlyargs:
        parts.append("*")
    for arg, d in zip(a.kwonlyargs, a.kw_defaults):
        s = fmt_arg(arg)
        if d is not None:
            s += "=…"
        parts.append(s)
    if a.kwarg:
        parts.append("**" + fmt_arg(a.kwarg))
    ret = f" -> {ast.unparse(fn.returns)}" if fn.returns else ""
    prefix = "async def" if isinstance(fn, ast.AsyncFunctionDef) else "def"
    deco = "".join(
        f"@{ast.unparse(d)} " for d in fn.decorator_list
        if isinstance(d, (ast.Name, ast.Attribute))
    )
    return f"{deco}{prefix} {fn.name}({', '.join(parts)}){ret}"


def internal_imports(tree: ast.Module, internal_roots: set[str]) -> list[str]:
    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root in internal_roots:
                    found.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level > 0:  # relative import — internal by definition
                found.append("." * node.level + (node.module or ""))
            elif node.module and node.module.split(".")[0] in internal_roots:
                found.append(node.module)
    return sorted(set(found))


def class_attrs(cls: ast.ClassDef) -> list[str]:
    attrs: list[str] = []
    for node in cls.body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            attrs.append(f"{node.target.id}: {ast.unparse(node.annotation)}")
    return attrs


def skeleton_for(path: Path, rel: Path, internal_roots: set[str]) -> str | None:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
    except SyntaxError as e:
        return f"## {rel}\n  (unparseable: {e.msg} @ line {e.lineno})\n"
    lines: list[str] = [f"## {rel}"]
    imps = internal_imports(tree, internal_roots)
    if imps:
        lines.append(f"  imports: {', '.join(imps)}")
    n_top = 0
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            lines.append(f"  {fmt_signature(node)}")
            n_top += 1
        elif isinstance(node, ast.ClassDef):
            bases = ", ".join(ast.unparse(b) for b in node.bases)
            lines.append(f"  class {node.name}" + (f"({bases})" if bases else ""))
            for attr in class_attrs(node):
                lines.append(f"    {attr}")
            for sub in node.body:
                if isinstance(sub, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    lines.append(f"    {fmt_signature(sub)}")
            n_top += 1
    if n_top == 0 and not imps:
        return None  # nothing navigable — keep the index lean
    return "\n".join(lines) + "\n"


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    quiet = "--quiet" in sys.argv or "-q" in sys.argv
    root = Path(args[0]).resolve() if args else Path.cwd()
    if not root.is_dir():
        print(f"error: not a directory: {root}", file=sys.stderr)
        return 1

    py_files: list[Path] = []
    for p in sorted(root.rglob("*.py")):
        if any(part in SKIP_DIRS for part in p.relative_to(root).parts):
            continue
        py_files.append(p)
    if not py_files:
        print(f"no .py files under {root} — nothing to index", file=sys.stderr)
        return 1

    # Internal import roots = top-level dirs/files that contain Python.
    internal_roots = {p.relative_to(root).parts[0].removesuffix(".py") for p in py_files}

    prod, tests = [], []
    for p in py_files:
        rel = p.relative_to(root)
        sk = skeleton_for(p, rel, internal_roots)
        if sk:
            (tests if is_test_path(rel) else prod).append(sk)

    header = (
        "# {title} — generated by scripts/generate_map.py (ADP §7.3)\n"
        "# AST skeleton: signatures + typed attrs + internal imports. No bodies.\n"
        "# Regenerate after structural changes: python scripts/generate_map.py .\n\n"
    )
    (root / PROD_OUT).write_text(
        header.format(title="codebase index") + "\n".join(prod), encoding="utf-8")
    (root / TEST_OUT).write_text(
        header.format(title="codebase TESTS index") + "\n".join(tests), encoding="utf-8")

    if not quiet:
        for out, items in ((PROD_OUT, prod), (TEST_OUT, tests)):
            size = (root / out).stat().st_size
            tokens = size // 4
            print(f"wrote {out}: {len(items)} modules, ~{tokens:,} tokens")
            # Codex install-retro: the index can blow past the "low-token" promise
            # on artifact-heavy repos. Warn + suggest scoping it.
            if tokens > INDEX_TOKEN_WARN:
                print(
                    f"  WARN: {out} is ~{tokens:,} tokens (> {INDEX_TOKEN_WARN:,}). "
                    "That undercuts the low-token promise — exclude benchmark/"
                    "generated/vendored dirs, or index a subtree: "
                    f"python scripts/generate_map.py <subdir>",
                    file=sys.stderr,
                )
    return 0


if __name__ == "__main__":
    sys.exit(main())

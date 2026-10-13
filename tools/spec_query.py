#!/usr/bin/env python3
"""Find and extract spec content by ID — for people, Claude skills, and hooks.

Usage:
  spec_query.py show <ID>...               Print the definition of each ID
  spec_query.py context <ID> [--full]      Self-contained bundle: the item + everything it links to
  spec_query.py refs <ID>                  Where an ID is referenced (impact analysis)
  spec_query.py list [PREFIX] [--status S] [--milestone M]
                                           List items with titles, e.g. `list F --milestone M-1`
  spec_query.py ids-in "<text>"            IDs mentioned in a text, with titles and locations
  spec_query.py search "<regex>"           Search spec text; shows the enclosing ID for each hit
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from specs_index import ROOT, Index, prefix_of  # noqa: E402

# Order in which linked items appear in a context bundle.
SECTION_ORDER = ["PER", "PRN", "ENT", "INV", "RULE", "F", "FLOW", "SCR", "CMP", "COPY",
                 "NFR", "EVT", "MOD", "ADR", "DEP", "M"]
SECTION_TITLE = {
    "PER": "Personas", "PRN": "Principles", "ENT": "Entities", "INV": "Invariants",
    "RULE": "Rules", "F": "Features", "FLOW": "Flows", "SCR": "Screens", "CMP": "Components",
    "COPY": "Copy", "NFR": "Non-functional requirements", "EVT": "Analytics events",
    "MOD": "Modules", "ADR": "Decisions", "DEP": "Dependencies", "M": "Milestones",
}


def die(msg: str) -> None:
    print(msg, file=sys.stderr)
    sys.exit(1)


def summary_line(ix: Index, id_: str) -> str:
    d = ix.get(id_)
    if not d:
        return f"- {id_} — (undefined)"
    status = f" [{d.meta['status']}]" if d.meta.get("status") else ""
    return f"- {id_} — {d.title}{status} ({d.rel}:{d.line})"


def cmd_show(ix: Index, ids: list[str]) -> None:
    for id_ in ids:
        d = ix.get(id_)
        if not d:
            die(f"{id_}: not defined")
        print(f"<!-- {id_} — {d.rel}:{d.line} -->")
        print(d.block)
        print()


def cmd_context(ix: Index, id_: str, full: bool) -> None:
    root = ix.get(id_)
    if not root:
        die(f"{id_}: not defined")
    print(f"# Spec context: {id_} — {root.title}\n")
    print(f"Source: {root.rel}:{root.line}. Everything below is quoted from specs/ (the source of truth).\n")
    print(root.block.rstrip())

    linked = [i for i in ix.outgoing(root) if ix.get(i)]
    # Requirements/ACs of the root itself are already in its block.
    linked = [i for i in linked if not i.startswith(id_ + ".")]

    groups: dict[str, list[str]] = {}
    for i in linked:
        groups.setdefault(prefix_of(i), []).append(i)

    print("\n\n---\n# Linked specs\n")
    for p in SECTION_ORDER:
        ids = groups.get(p)
        if not ids:
            continue
        print(f"## {SECTION_TITLE[p]}\n")
        for i in ids:
            d = ix.get(i)
            sub = "." in i and prefix_of(i) == "F"  # e.g. F-008.R5 -> quote the requirement
            if d.file_level and not full and p != "CMP":
                print(summary_line(ix, i))
            elif sub or not d.file_level:
                print(f"<!-- {i} — {d.rel}:{d.line} -->")
                print(d.block.strip())
                print()
            else:
                body = d.block.split("\n---\n", 1)[-1].strip() if d.block.startswith("---") else d.block
                print(f"### {i} — {d.title} ({d.rel})\n")
                print(body)
                print()
        print()

    backrefs = sorted({r.rel for r in ix.references_to(id_) if r.path != root.path})
    if backrefs:
        print("## Referenced by\n")
        for rel in backrefs:
            print(f"- {rel}")


def cmd_refs(ix: Index, id_: str) -> None:
    if not ix.get(id_):
        die(f"{id_}: not defined")
    refs = ix.references_to(id_)
    if not refs:
        print(f"{id_} is not referenced anywhere.")
        return
    for r in refs:
        line = Path(r.path).read_text().splitlines()[r.line - 1].strip()
        print(f"{r.rel}:{r.line}: {line[:140]}")


def cmd_list(ix: Index, prefix: str | None, status: str | None, milestone: str | None) -> None:
    for id_, defs in sorted(ix.defs.items(), key=lambda kv: (prefix_of(kv[0]), kv[0])):
        d = defs[0]
        if prefix and prefix_of(id_) != prefix:
            continue
        if "." in id_ and prefix_of(id_) == "F":
            continue  # requirements/ACs: use `show F-xxx` instead
        if status and d.meta.get("status") != status:
            continue
        if milestone and d.meta.get("milestone") != milestone:
            continue
        print(summary_line(ix, id_))


def cmd_ids_in(ix: Index, text: str) -> None:
    for id_ in ix.ids_in(text):
        print(summary_line(ix, id_))


def enclosing_id(ix: Index, path: Path, line_no: int) -> str | None:
    best = None
    for id_, defs in ix.defs.items():
        for d in defs:
            if d.path == path and d.line <= line_no:
                end = d.line + d.block.count("\n")
                if line_no <= end and (best is None or d.line >= best[1]):
                    best = (id_, d.line)
    return best[0] if best else None


def cmd_search(ix: Index, pattern: str) -> None:
    rx = re.compile(pattern, re.I)
    for path, f in sorted(ix.files.items()):
        for n, line in enumerate(f.text.splitlines(), 1):
            if rx.search(line):
                owner = enclosing_id(ix, path, n) or "-"
                rel = path.relative_to(ROOT)
                print(f"[{owner}] {rel}:{n}: {line.strip()[:140]}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("show"); s.add_argument("ids", nargs="+")
    c = sub.add_parser("context"); c.add_argument("id"); c.add_argument("--full", action="store_true",
                                                                         help="inline linked files in full")
    r = sub.add_parser("refs"); r.add_argument("id")
    l = sub.add_parser("list"); l.add_argument("prefix", nargs="?")
    l.add_argument("--status"); l.add_argument("--milestone")
    i = sub.add_parser("ids-in"); i.add_argument("text")
    q = sub.add_parser("search"); q.add_argument("pattern")
    args = ap.parse_args()

    ix = Index()
    if args.cmd == "show":
        cmd_show(ix, args.ids)
    elif args.cmd == "context":
        cmd_context(ix, args.id, args.full)
    elif args.cmd == "refs":
        cmd_refs(ix, args.id)
    elif args.cmd == "list":
        cmd_list(ix, args.prefix, args.status, args.milestone)
    elif args.cmd == "ids-in":
        cmd_ids_in(ix, args.text)
    elif args.cmd == "search":
        cmd_search(ix, args.pattern)


if __name__ == "__main__":
    main()

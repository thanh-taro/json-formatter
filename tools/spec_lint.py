#!/usr/bin/env python3
"""Validate specs/ against the rules in specs/README.md.

Usage:
  python3 tools/spec_lint.py                    # check specs
  python3 tools/spec_lint.py --coverage Tests/  # also list ACs without a test
  python3 tools/spec_lint.py --quiet            # print errors only (used by hooks)

Exit code 1 if there are errors. Warnings never fail.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from specs_index import ROOT, SPECS, Index, prefix_of  # noqa: E402

LIFECYCLE = {"draft", "ready", "building", "shipped", "deprecated"}
ADR_STATUS = {"proposed", "accepted", "superseded"}
REQUIRED_META = {
    "F": ["id", "title", "status", "milestone", "priority"],
    "SCR": ["id", "title", "status", "features", "components"],
    "CMP": ["id", "title", "status"],
    "FLOW": ["id", "title", "status", "features", "screens"],
    "MOD": ["id", "title", "status"],
    "ADR": ["id", "title", "status", "date"],
}
# Tool, vendor, and platform names that must not appear in tool/platform-neutral layers.
# Override or extend per project in specs/lint-config.json:
#   {"neutral_layers": [...], "leak_words": [...], "extra_leak_words": [...]}
NEUTRAL_LAYERS = ("00-product", "10-domain", "20-features", "30-experience", "50-quality", "60-delivery")
LEAK_WORDS = ["Figma", "Sketch", "Penpot", "Linear", "Jira", "Notion", "XCTest", "Swift Testing",
              "SwiftUI", "UIKit", "AVFoundation", "Core Image", "Metal", "Xcode", "Jetpack Compose",
              "Kotlin", "React", "Next.js", "Vue", "Flutter", "Firebase", "Supabase", "AWS",
              "iOS", "iPhone", "iPad", "Android", "Swift"]
_cfg_path = SPECS / "lint-config.json"
if _cfg_path.exists():
    _cfg = json.loads(_cfg_path.read_text())
    NEUTRAL_LAYERS = tuple(_cfg.get("neutral_layers", NEUTRAL_LAYERS))
    LEAK_WORDS = list(_cfg.get("leak_words", LEAK_WORDS)) + list(_cfg.get("extra_leak_words", []))
LEAK_RE = re.compile(r"\b(" + "|".join(re.escape(w) for w in LEAK_WORDS) + r")\b")


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, where: str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    def warn(self, where: str, msg: str) -> None:
        self.warnings.append(f"{where}: {msg}")


def check_definitions(ix: Index, r: Report) -> None:
    for id_, defs in ix.defs.items():
        if len(defs) > 1:
            places = ", ".join(f"{d.rel}:{d.line}" for d in defs)
            r.error(defs[0].rel, f"{id_} defined more than once ({places})")


def check_references(ix: Index, r: Report) -> None:
    for ref in ix.refs:
        if ref.id not in ix.defs:
            r.error(f"{ref.rel}:{ref.line}", f"unresolved reference {ref.id}")
            continue
        target = ix.get(ref.id)
        source_file = ix.files.get(ref.path)
        src_status = source_file.meta.get("status") if source_file else None
        if target.meta.get("status") == "deprecated" and src_status not in ("deprecated", None):
            r.warn(f"{ref.rel}:{ref.line}", f"references deprecated {ref.id}")


def check_frontmatter(ix: Index, r: Report) -> None:
    for d in (d[0] for d in ix.defs.values() if d[0].file_level):
        p = prefix_of(d.id)
        for key in REQUIRED_META.get(p, []):
            if key not in d.meta or d.meta[key] in ("", []) and key not in ("features", "components"):
                r.error(d.rel, f"frontmatter missing '{key}'")
        status = d.meta.get("status", "")
        allowed = ADR_STATUS if p == "ADR" else LIFECYCLE
        if status not in allowed:
            r.error(d.rel, f"invalid status '{status}' (allowed: {', '.join(sorted(allowed))})")
        expected_name = d.id
        if not d.path.stem.startswith(expected_name):
            r.error(d.rel, f"file name should start with its id '{d.id}'")


def check_features(ix: Index, r: Report) -> None:
    for f in ix.features():
        reqs = sorted(k for k in ix.defs if k.startswith(f.id + ".R"))
        acs = sorted(k for k in ix.defs if k.startswith(f.id + ".AC"))
        if not reqs:
            r.error(f.rel, "feature has no requirements (- **R1** ...)")
        if not acs:
            r.error(f.rel, "feature has no acceptance criteria (- **AC1** ...)")
        covered: set[str] = set()
        for ac in acs:
            block = ix.get(ac).block
            low = block.lower()
            if not ("given" in low and "when" in low and "then" in low):
                r.error(f"{f.rel}:{ix.get(ac).line}", f"{ac} is not in Given/When/Then form")
            covered.update(re.findall(r"\bR\d+\b", block))
        for req in reqs:
            local = req.split(".", 1)[1]
            if local not in covered:
                r.warn(f.rel, f"{req} is not referenced by any acceptance criterion")
        if f.meta.get("status") not in ("draft", None) and re.search(r"^- \[ \]", f.block, re.M):
            r.error(f.rel, "non-draft feature has unchecked open questions")
        ms = f.meta.get("milestone", "")
        if ms and ms not in ix.defs:
            r.error(f.rel, f"milestone {ms} is not defined in 60-delivery/roadmap.md")


# Frontmatter list that must declare each prefix referenced in a feature's body.
FEATURE_LINKS = {"ENT": "entities", "RULE": "rules", "SCR": "screens", "CMP": "components",
                 "NFR": "nfr", "EVT": "events"}
# Definitions that should be used somewhere (otherwise they are probably dead).
MUST_BE_USED = ("COPY", "RULE", "INV", "ENT", "NFR", "EVT")


def check_feature_links(ix: Index, r: Report) -> None:
    """Body references must be declared in frontmatter, so link-based tooling sees them."""
    for f in ix.features():
        body = f.block.split("\n---\n", 1)[-1]
        for id_ in ix.ids_in(body):
            key = FEATURE_LINKS.get(prefix_of(id_))
            if key and id_ not in (f.meta.get(key) or []):
                r.warn(f.rel, f"{id_} is referenced in the body but missing from frontmatter '{key}'")


def check_order(ix: Index, r: Report) -> None:
    for f in ix.features():
        for kind in ("R", "AC"):
            nums = [int(m) for m in re.findall(rf"^- \*\*{kind}(\d+)\*\*", f.block, re.M)]
            if nums != sorted(nums):
                r.warn(f.rel, f"{kind} items are not in ascending order: {nums}")


def check_unused(ix: Index, r: Report) -> None:
    used = {ref.id for ref in ix.refs}
    for id_, defs in ix.defs.items():
        if prefix_of(id_) in MUST_BE_USED and id_ not in used:
            r.warn(f"{defs[0].rel}:{defs[0].line}", f"{id_} is defined but never referenced")


def check_copy_notes(r: Report) -> None:
    """UI text must have its own COPY ID, never live in the Notes column."""
    path = SPECS / "30-experience" / "copy.md"
    if not path.exists():
        return
    for n, line in enumerate(path.read_text().splitlines(), 1):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 3 and cells[0].startswith("**COPY-") and re.search(r'"[^"]+"', cells[2]):
            r.warn(f"{path.relative_to(ROOT)}:{n}", "quoted text in the Notes column — give it its own COPY ID")


def check_feature_index(ix: Index, r: Report) -> None:
    index_path = SPECS / "20-features" / "_index.md"
    if not index_path.exists():
        if ix.features():
            r.error("specs/20-features", "_index.md missing")
        return
    rows = {}
    for line in index_path.read_text().splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 5 and re.fullmatch(r"F-\d+", cells[0]):
            rows[cells[0]] = cells
    rel = str(index_path.relative_to(ROOT))
    for f in ix.features():
        row = rows.pop(f.id, None)
        if row is None:
            r.error(rel, f"{f.id} missing from feature map")
            continue
        expected = [f.id, f.meta.get("title"), f.meta.get("milestone"), f.meta.get("priority"),
                    f.meta.get("status")]
        if row != expected:
            r.error(rel, f"{f.id} row out of sync with frontmatter (expected: {' | '.join(map(str, expected))})")
    for extra in rows:
        r.error(rel, f"{extra} listed but no feature file exists")


def token_paths(tokens: dict, prefix: str = "") -> set[str]:
    out = set()
    for k, v in tokens.items():
        if k.startswith("$") or not isinstance(v, dict):
            continue
        path = f"{prefix}.{k}" if prefix else k
        if "$value" in v:
            out.add(path)
        out |= token_paths(v, path)
    return out


def check_json_and_tokens(ix: Index, r: Report) -> None:
    for p in SPECS.rglob("*.json"):
        try:
            json.loads(p.read_text())
        except json.JSONDecodeError as e:
            r.error(str(p.relative_to(ROOT)), f"invalid JSON: {e}")
            return
    tokens_file = SPECS / "30-experience" / "tokens.json"
    if not tokens_file.exists():
        return
    known = token_paths(json.loads(tokens_file.read_text()))
    for d in (d[0] for d in ix.defs.values() if d[0].file_level):
        for t in d.meta.get("tokens", []) or []:
            if t not in known:
                r.error(d.rel, f"unknown design token '{t}'")


def check_leaks(r: Report) -> None:
    for layer in NEUTRAL_LAYERS:
        for p in (SPECS / layer).rglob("*"):
            if not p.is_file():
                continue
            if not p.is_file() or p.name == "lint-config.json":
                continue
            for n, line in enumerate(p.read_text().splitlines(), 1):
                m = LEAK_RE.search(line)
                if m:
                    r.error(f"{p.relative_to(ROOT)}:{n}",
                            f"tool/platform name '{m.group(1)}' in a neutral layer (move to 40-technical or adapters/)")


def check_coverage(ix: Index, r: Report, test_dir: Path, include_drafts: bool) -> list[str]:
    text = ""
    for p in test_dir.rglob("*"):
        if p.is_file() and p.suffix in (".swift", ".kt", ".ts", ".py", ".js"):
            text += p.read_text(errors="ignore") + "\n"
    missing = []
    for f in ix.features():
        if f.meta.get("status") == "draft" and not include_drafts:
            continue
        for ac in sorted(k for k in ix.defs if k.startswith(f.id + ".AC")):
            compact = ac.replace("-", "").replace(".", "_")  # F-003.AC1 -> F003_AC1
            if ac not in text and compact not in text:
                missing.append(ac)
    return missing


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--coverage", type=Path, help="test directory to check AC coverage against")
    ap.add_argument("--include-drafts", action="store_true", help="coverage also for draft features")
    ap.add_argument("--quiet", action="store_true", help="errors only")
    args = ap.parse_args()

    ix = Index()
    r = Report()
    check_definitions(ix, r)
    check_references(ix, r)
    check_frontmatter(ix, r)
    check_features(ix, r)
    check_feature_index(ix, r)
    check_json_and_tokens(ix, r)
    check_leaks(r)
    check_feature_links(ix, r)
    check_order(ix, r)
    check_unused(ix, r)
    check_copy_notes(r)

    for e in r.errors:
        print(f"ERROR   {e}")
    if not args.quiet:
        for w in r.warnings:
            print(f"WARNING {w}")

    if args.coverage:
        missing = check_coverage(ix, r, args.coverage, args.include_drafts)
        print(f"\nAC coverage: {len(missing)} acceptance criteria without a test")
        for m in missing:
            print(f"  - {m}")

    if not args.quiet:
        n_defs = len(ix.defs)
        print(f"\n{n_defs} IDs, {len(ix.refs)} references, "
              f"{len(r.errors)} errors, {len(r.warnings)} warnings")
    return 1 if r.errors else 0


if __name__ == "__main__":
    sys.exit(main())

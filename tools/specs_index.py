"""Shared spec index: finds every ID definition and reference under specs/.

Standard library only. Used by spec_lint.py, spec_query.py, and the Claude hooks.
Definition syntax is documented in specs/README.md ("Defining vs referencing").
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPECS = ROOT / "specs"

PREFIXES = ("PER", "PRN", "ENT", "INV", "RULE", "FLOW", "F", "SCR", "CMP", "COPY",
            "MOD", "ADR", "DEP", "NFR", "EVT", "M")
# Sub-parts (".R1", ".split") never match a file extension, so "CMP-Toast.md" yields CMP-Toast.
ID_RE = re.compile(
    r"(?<![A-Za-z0-9_\-])(?:" + "|".join(PREFIXES) + r")-[A-Za-z0-9_]+"
    r"(?:\.(?!(?:md|json|ya?ml|py|swift|html?|dc|css|js|txt|png|jpe?g|svg|pdf)\b)[A-Za-z][A-Za-z0-9_]*)*"
)
# File-level items: one file = one item, defined by frontmatter `id:`.
FILE_LEVEL = ("F", "SCR", "CMP", "FLOW", "MOD", "ADR")

HEADING_DEF = re.compile(r"^(#{2,4})\s+(\S+)")
LIST_DEF = re.compile(r"^(\s*)-\s+\*\*([^*]+)\*\*")
TABLE_DEF = re.compile(r"^\|\s*\*\*([^*]+)\*\*\s*\|")
YAML_DEF = re.compile(r"^(\s*)-\s+id:\s*(\S+)")
LOCAL_DEF = re.compile(r"^(R|AC)\d+$")

EXCLUDED = ("_templates",)
# Placeholder IDs used in docs/templates, e.g. F-xxx, F-xxx.ACn, ADR-XXXX, CMP-Name.
PLACEHOLDER_RE = re.compile(r"^[A-Z]+-(x+|X+|Name|ID|IDs)(\.|$)")


def prefix_of(id_: str) -> str:
    return id_.split("-", 1)[0]


@dataclass
class Definition:
    id: str
    path: Path
    line: int  # 1-based
    title: str
    block: str  # full text of the definition
    file_level: bool = False
    meta: dict = field(default_factory=dict)  # frontmatter for file-level items

    @property
    def rel(self) -> str:
        return str(self.path.relative_to(ROOT))


@dataclass
class Reference:
    id: str
    path: Path
    line: int

    @property
    def rel(self) -> str:
        return str(self.path.relative_to(ROOT))


@dataclass
class SpecFile:
    path: Path
    text: str
    meta: dict
    body_start: int  # 0-based line index where body starts


def parse_frontmatter(text: str) -> tuple[dict, int]:
    """Parse simple YAML frontmatter: `key: value` and `key: [a, b]`."""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, 0
    meta: dict = {}
    for i in range(1, len(lines)):
        line = lines[i]
        if line.strip() == "---":
            return meta, i + 1
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            meta[key.strip()] = [v.strip() for v in value[1:-1].split(",") if v.strip()]
        else:
            meta[key.strip()] = value
    return {}, 0  # unterminated frontmatter


def spec_files() -> list[Path]:
    files = []
    for p in sorted(SPECS.rglob("*")):
        if not p.is_file() or any(part in EXCLUDED for part in p.parts):
            continue
        if p == SPECS / "README.md":
            continue  # the rulebook; its example IDs are illustrations, not references
        if p.suffix in (".md", ".yaml", ".yml", ".json"):
            files.append(p)
    return files


def _md_block_heading(lines: list[str], start: int, level: int) -> str:
    end = start + 1
    while end < len(lines):
        m = re.match(r"^(#{1,6})\s", lines[end])
        if m and len(m.group(1)) <= level:
            break
        end += 1
    return "\n".join(lines[start:end]).rstrip()


def _md_block_list(lines: list[str], start: int, indent: int) -> str:
    end = start + 1
    while end < len(lines):
        line = lines[end]
        if not line.strip():
            break
        lead = len(line) - len(line.lstrip())
        if lead <= indent:
            break
        end += 1
    return "\n".join(lines[start:end]).rstrip()


def _title_after(line: str, id_: str) -> str:
    rest = line.split(id_, 1)[1] if id_ in line else line
    rest = rest.strip().lstrip("*").strip()
    rest = re.sub(r"^[|—:\-\s]+", "", rest)
    rest = rest.split("|")[0].strip() if line.lstrip().startswith("|") else rest
    return rest[:120]


class Index:
    def __init__(self) -> None:
        self.files: dict[Path, SpecFile] = {}
        self.defs: dict[str, list[Definition]] = {}
        self.refs: list[Reference] = []
        self.errors: list[str] = []
        self._build()

    # -- building -----------------------------------------------------------
    def _add_def(self, d: Definition) -> None:
        self.defs.setdefault(d.id, []).append(d)

    def _build(self) -> None:
        for path in spec_files():
            text = path.read_text(encoding="utf-8")
            if path.suffix == ".md":
                self._index_md(path, text)
            elif path.suffix in (".yaml", ".yml"):
                self._index_yaml(path, text)
            else:
                self._index_refs(path, text.splitlines(), 0, set())

    def _index_md(self, path: Path, text: str) -> None:
        meta, body_start = parse_frontmatter(text)
        self.files[path] = SpecFile(path, text, meta, body_start)
        lines = text.splitlines()
        def_lines: set[int] = set()
        file_id = meta.get("id")
        if file_id:
            self._add_def(Definition(file_id, path, 1, meta.get("title", ""), text,
                                     file_level=True, meta=meta))
        is_feature = bool(file_id) and prefix_of(file_id) == "F"
        for i in range(body_start, len(lines)):
            line = lines[i]
            m = HEADING_DEF.match(line)
            if m and ID_RE.fullmatch(m.group(2)):
                id_ = m.group(2)
                self._add_def(Definition(id_, path, i + 1, _title_after(line, id_),
                                         _md_block_heading(lines, i, len(m.group(1)))))
                def_lines.add(i)
                continue
            m = LIST_DEF.match(line)
            if m:
                raw = m.group(2).strip()
                if ID_RE.fullmatch(raw):
                    self._add_def(Definition(raw, path, i + 1, _title_after(line, raw),
                                             _md_block_list(lines, i, len(m.group(1)))))
                    def_lines.add(i)
                elif is_feature and LOCAL_DEF.match(raw):
                    full = f"{file_id}.{raw}"
                    self._add_def(Definition(full, path, i + 1, _title_after(line, raw),
                                             _md_block_list(lines, i, len(m.group(1)))))
                continue
            m = TABLE_DEF.match(line)
            if m and ID_RE.fullmatch(m.group(1).strip()):
                id_ = m.group(1).strip()
                self._add_def(Definition(id_, path, i + 1, _title_after(line, id_), line))
                def_lines.add(i)
        # References: frontmatter (except `id:`) and body.
        for i in range(1, body_start):
            if lines[i].startswith("id:"):
                continue
            for m in ID_RE.finditer(lines[i]):
                self.refs.append(Reference(m.group(0), path, i + 1))
        self._index_refs(path, lines, body_start, def_lines)

    def _index_yaml(self, path: Path, text: str) -> None:
        lines = text.splitlines()
        def_lines: set[int] = set()
        starts = [(i, m) for i, l in enumerate(lines) if (m := YAML_DEF.match(l))]
        for n, (i, m) in enumerate(starts):
            end = starts[n + 1][0] if n + 1 < len(starts) else len(lines)
            block = "\n".join(lines[i:end]).rstrip()
            when = re.search(r"when:\s*(.+)", block)
            self._add_def(Definition(m.group(2), path, i + 1,
                                     when.group(1).strip() if when else "", block))
            def_lines.add(i)
        self._index_refs(path, lines, 0, def_lines)

    def _index_refs(self, path: Path, lines: list[str], start: int, skip_first: set[int]) -> None:
        for i in range(start, len(lines)):
            matches = list(ID_RE.finditer(lines[i]))
            if i in skip_first and matches:
                matches = matches[1:]  # first match on a definition line is the definition
            for m in matches:
                if not PLACEHOLDER_RE.match(m.group(0)):
                    self.refs.append(Reference(m.group(0), path, i + 1))

    # -- queries ------------------------------------------------------------
    def get(self, id_: str) -> Definition | None:
        found = self.defs.get(id_)
        return found[0] if found else None

    def references_to(self, id_: str) -> list[Reference]:
        return [r for r in self.refs if r.id == id_ or r.id.startswith(id_ + ".")]

    def ids_in(self, text: str) -> list[str]:
        seen: list[str] = []
        for m in ID_RE.finditer(text):
            if PLACEHOLDER_RE.match(m.group(0)):
                continue
            if m.group(0) not in seen:
                seen.append(m.group(0))
        return seen

    def outgoing(self, d: Definition) -> list[str]:
        """IDs referenced from a definition's block (frontmatter links first)."""
        ids: list[str] = []
        for key, value in d.meta.items():
            if key != "id" and isinstance(value, list):
                ids.extend(v for v in value if ID_RE.fullmatch(v))
        ids.extend(self.ids_in(d.block))
        out: list[str] = []
        for i in ids:
            if i != d.id and i not in out:
                out.append(i)
        return out

    def features(self) -> list[Definition]:
        return [d[0] for k, d in sorted(self.defs.items())
                if prefix_of(k) == "F" and d[0].file_level]

# Specs

The single source of truth for this app. Designs, user stories, code, and tests are **derived**
from these files. When a derived artifact is wrong, fix the spec and regenerate — never patch
the derived artifact alone.

## Rules

1. **One fact, one place.** Define something once; everywhere else references it by ID.
2. **Stable IDs.** IDs are never renamed, renumbered, or reused. Removed items become `deprecated`.
3. **What & why, not how.** Specs describe behavior and intent. Implementation choices live
   only in `40-technical/`.
4. **Tool-agnostic.** Only open, plain-text formats. No tool or vendor names outside
   `40-technical/` (and there only as technology decisions, never as workflow tools).
   How tools consume specs is described in `/adapters`.
5. **Dependency direction.** A layer may reference its own or lower-numbered layers only.
   (A feature may reference the domain; the domain never references a screen.)
   Exceptions: feature frontmatter may link experience IDs (screens, components, events);
   any layer may reference quality requirements (`NFR-`), which apply across layers.
6. **Git is the approval workflow.** Spec changes go through PRs. Merged to main = approved.

## Layers

| Folder | Answers | Changes |
|---|---|---|
| `00-product/` | Why does the app exist, for whom, with which vocabulary? | Rarely |
| `10-domain/` | What things exist and which rules always hold? | Occasionally |
| `20-features/` | What can users do? (the main working unit) | Often |
| `30-experience/` | How does it look, read, and feel? | Often |
| `40-technical/` | How is it built, and why those choices? | Occasionally |
| `50-quality/` | How good must it be, and how do we measure it? | Occasionally |
| `60-delivery/` | When does what ship? | Often |

## ID scheme

| Prefix | Meaning | Example | Defined in |
|---|---|---|---|
| `PER-` | Persona | `PER-01` | `00-product/personas.md` |
| `PRN-` | Principle | `PRN-02` | `00-product/principles.md` |
| `ENT-` | Domain entity | `ENT-Clip` | `10-domain/model.md` |
| `INV-` | Invariant (always true) | `INV-03` | `10-domain/model.md` |
| `RULE-` | Business rule / limit | `RULE-01` | `10-domain/rules.md` |
| `F-` | Feature | `F-003` | `20-features/F-003-*.md` |
| `F-xxx.R#` | Requirement of a feature | `F-003.R2` | inside the feature file |
| `F-xxx.AC#` | Acceptance criterion | `F-003.AC1` | inside the feature file |
| `SCR-` | Screen | `SCR-Editor` | `30-experience/screens/` |
| `CMP-` | Component | `CMP-Timeline` | `30-experience/components/` |
| `FLOW-` | User flow | `FLOW-01` | `30-experience/flows/` |
| `COPY-` | User-facing string | `COPY-editor.split` | `30-experience/copy.md` |
| `MOD-` | Code module | `MOD-Engine` | `40-technical/modules/` |
| `ADR-` | Architecture decision | `ADR-0002` | `40-technical/adr/` |
| `DEP-` | Dependency / asset pack | `DEP-01` | `40-technical/dependencies.md` |
| `NFR-` | Non-functional requirement | `NFR-03` | `50-quality/nfr.md` |
| `EVT-` | Analytics event | `EVT-clip_split` | `50-quality/analytics.yaml` |
| `M-` | Milestone | `M-1` | `60-delivery/roadmap.md` |

### Defining vs referencing

The lint tool (`tools/spec_lint.py`) recognises a **definition** as one of:

- a frontmatter `id:` (one file = one item: features, screens, components, flows, modules, ADRs)
- a heading starting with the ID: `### ENT-Clip — Clip`
- a list item or table row starting with the bold ID: `- **INV-03** …` / `| **RULE-01** | … |`
- in YAML files, a line `- id: EVT-clip_split`
- inside a feature file, `- **R1** …` / `- **AC1** …` define `F-xxx.R1` / `F-xxx.AC1`

Every other occurrence of an ID is a **reference** and must resolve to a definition.
Inside a feature, `R2` / `AC1` may be used as short local references; across files always use
the full form `F-003.R2`.

## Status lifecycle (frontmatter `status:`)

`draft` → `ready` → `building` → `shipped` → `deprecated`

- **draft** — being written; may have open questions. Do not generate from it.
- **ready** — complete, reviewed, no open questions. Safe to generate designs/stories/code.
- **building** — implementation in progress. Changes need a note in `60-delivery/changelog.md`.
- **shipped** — live. Behavior changes need a changelog entry.
- **deprecated** — kept for history; must not be referenced by non-deprecated items.

## Formats

| Content | Format |
|---|---|
| Prose specs | Markdown + YAML frontmatter |
| Data model | JSON Schema (`10-domain/project.schema.json`) |
| Design tokens | W3C Design Tokens (DTCG) JSON (`30-experience/tokens.json`) |
| Flows / diagrams | Mermaid inside Markdown |
| Analytics events | YAML |
| Acceptance criteria | Given / When / Then, plain text |

If a format needs one vendor's app to open or edit it, it does not belong here.

## Writing guidelines

- A feature should be readable in ~2 minutes. More than ~8 requirements → split it.
- Requirements state observable behavior, never UI layout or implementation.
- Every requirement is covered by at least one acceptance criterion.
- UX notes reference screens, components, and copy by ID — no colors, sizes, or pixel values.
- Units: time in seconds in prose; the data model stores integer microseconds (`ENT-Project`).
- Start new files from `_templates/`.

## Tooling

- `python3 tools/spec_query.py context <ID>` — a self-contained bundle: the item plus every
  persona, rule, entity, screen, copy string… it links to. Also `show`, `refs`, `list`,
  `search`, `ids-in`.
- `python3 tools/spec_lint.py` — validates IDs, references, frontmatter, Given/When/Then,
  requirement coverage, the feature map, tokens, and tool-name leaks into neutral layers;
  warns about body references missing from frontmatter, out-of-order R/AC items, unused
  definitions, and UI text hidden in copy notes.

## Change process

1. Edit specs (new IDs for new things; never repurpose an ID).
2. Run `python3 tools/spec_lint.py`.
3. If the item is `building`/`shipped`, add an entry to `60-delivery/changelog.md`.
4. Open a PR. After merge, regenerate derived artifacts (see `/adapters`).

# Spec review — round 1 (3 reviewers: F-001..005, F-006..009 + experience, cross-cutting)

## High-confidence (found by 2+ reviewers)
- Empty vs whitespace-only contradiction → RULE-03/RULE-04: zero chars = empty state; whitespace-only = `empty-document` error. Fixed.
- Error positions undefined per code → RULE-04 now gives the position for every code. Fixed.
- Line/column/offset counting undefined → ENT-Issue defines breaks (LF/CRLF/CR) and code points. Fixed.
- `unsafe-number` untestable → RULE-05 precise definition with non-flagged examples. Fixed.
- Out-of-memory path lacked copy/AC → COPY-error.too_large, F-001.R9/AC10. Fixed.
- lineEnding unused / BOM scattered → RULE-07/08 own line endings, final break, BOM (D-006). Fixed.

## Blockers
- Theme before first paint impossible via messages → RULE-16: initial theme in the address, later via messages, ready signal. Fixed.
- "Configured origins" undefined → RULE-16: deploy-time allow-list controls embedding and messages; F-008.AC8. Fixed.
- Toolbar busy vs AC "use the toolbar" → D-005: scroll + cancel only; editor read-only while busy. Fixed.

## Majors
- Tree clipboard fallback → F-006.R9/AC12. Download blocked → F-007.R5/AC6, COPY-error.download.
- Tree checking state → F-006.R10/AC13, COPY-tree.checking. Tree at scale → measurable AC9, NFR-02 progress, very-large tier COPY-tree.too_large.
- Copy progress contradicted NFR-02 → F-007.R6/AC8.
- RULE-02 measurement (UTF-8 bytes, 10^6) and tier re-evaluation on paste/typing; paste > 100 MB confirmation (F-001.AC11).
- RULE-09 re-indent fully specified (unit detection, ties, leftovers).
- Max nesting depth → RULE-14 (10,000), `too-deep` code + hint.
- NFRs measurable: "after load" defined, scroll = no frame > 50 ms, startup network profile.
- Undo memory → D-007 / RULE-15 + COPY-notice.undo_trimmed, F-001.AC12.

## Minors
- Validity values aligned (valid/invalid/checking/empty). ENT-Issue `params`. RULE-06 ASCII. RULE-10 "most recent tool operation".
  RULE-12 object groups / nested groups / no actions on group rows. F-007 copy from tree view → text view. Glossary: IDs removed (layer direction), terms added.
- F-001 text-drag within the editor is normal editing.

## Not changed
- vision.md mentions the roadmap file by path (not an ID) — acceptable.

Lint after fixes: 264 IDs, 0 errors, 0 warnings.

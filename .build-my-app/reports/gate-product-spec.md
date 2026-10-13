# Gate G1 — Product & spec

| Check | Result | Evidence |
|---|---|---|
| Lint 0 errors / 0 warnings | pass | `spec_lint.py`: 269 IDs, 405 refs, 0/0 |
| Every feature has R + AC | pass | F-001..F-009: 57 requirements, 75 ACs, all requirements covered |
| No open product decisions | pass | D-001..D-007 answered |
| Last review round no blockers | pass | spec-review-round-2.md |

Produced: vision brief, 00-product (vision, 2 personas, 5 principles, glossary), 10-domain (5 entities,
5 invariants, 16 rules), 9 M-1 features, SCR-Formatter, 6 components, 3 flows, copy deck, 9 NFRs,
analytics (none by design), roadmap M-1..M-4, changelog.

Open risks: F-006 has 10 requirements (guideline ~8) — kept together because it is one view;
100 MB performance targets unproven until architecture spikes.

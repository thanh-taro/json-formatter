---
id: MOD-Copy
title: Copy — generated UI strings per language, active language, value formatting
status: draft
depends_on: []
---

## Responsibility
The typed, generated module of every user-facing string from `specs/30-experience/copy.md`
in every supported language (RULE-19; ADR-0011, ADR-0014), the active-language signal (set by
MOD-Host), with placeholder-checked formatting (`{size}`, `{lines}`, `{percent}`,
`{bracket}`, `{line}`, `{count}`, `{n}`), the issue-code → hint mapping for RULE-04/RULE-05,
and formatting of sizes (B/KB/MB, 1 MB = 1,000,000 bytes) and counts for the active language,
including its plural rule (F-012.R6). No
other module contains user-facing literals (lint rule).

## Not responsible for
- Deciding when text is shown (MOD-App); choosing the language (MOD-Host, RULE-19).
- Retired strings: COPY-error.download has no caller since F-007.R5 was deprecated (D-023);
  it is not generated and should be removed from `copy.md` by the experience layer.

## Public surface
- `t(id, params?)` with compile-time-checked IDs and parameters.
- `hintFor(issue)`, `formatSize(bytes)`, `formatCount(n)`, `tCount(id, n)`.
- `language` signal (`en-US` | `vi-VN`) and `setLanguage(lang)`; `t()` reads the signal.

## Implements
F-005.R3, F-005.R4 (hints), F-009.R1, F-009.R2, F-009.R3 (statement text, source link label); F-012.R1, F-012.R6, F-012.AC12; NFR-06 (accessible names
come from COPY labels).

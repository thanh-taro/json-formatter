---
id: MOD-Copy
title: Copy — generated UI strings and value formatting
status: draft
depends_on: []
---

## Responsibility
The typed, generated module of every user-facing string from `specs/30-experience/copy.md`
(ADR-0011), with placeholder-checked formatting (`{size}`, `{lines}`, `{percent}`,
`{bracket}`, `{line}`, `{count}`, `{n}`), the issue-code → hint mapping for RULE-04/RULE-05,
and locale-neutral formatting of sizes (B/KB/MB, 1 MB = 1,000,000 bytes) and counts. No
other module contains user-facing literals (lint rule).

## Not responsible for
- Deciding when text is shown (MOD-App); translation (English only in M-1).

## Public surface
- `t(id, params?)` with compile-time-checked IDs and parameters.
- `hintFor(issue)`, `formatSize(bytes)`, `formatCount(n)`.

## Implements
F-005.R3, F-005.R4 (hints), F-009.R1, F-009.R2 (statement text); NFR-06 (accessible names
come from COPY labels).

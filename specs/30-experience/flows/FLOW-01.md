---
id: FLOW-01
title: Paste and beautify
status: ready
features: [F-001, F-002, F-005, F-007]
screens: [SCR-Formatter]
---

## Goal
Turn a pasted blob of JSON into readable text and take it away.

## Diagram
```mermaid
flowchart LR
  A[Open tool] --> B[Paste JSON]
  B --> C{Valid?}
  C -- yes --> D[Beautify]
  C -- no --> E[FLOW-02]
  D --> F[Copy or download]
```

## Steps
1. Open the tool — SCR-Formatter, empty state.
2. Paste — F-001.R1; validated automatically — F-005.R1.
3. Choose indent and beautify — F-002.R1, F-002.R2.
4. Copy or download — F-007.R1, F-007.R2.

## Exits & failures
- Invalid input → FLOW-02. Leaving the page discards the document (PRN-01).

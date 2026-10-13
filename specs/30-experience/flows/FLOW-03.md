---
id: FLOW-03
title: Find a value and grab its path
status: ready
features: [F-001, F-006]
screens: [SCR-Formatter]
---

## Goal
In a large payload, locate a nested value and copy its path or value for use elsewhere.

## Diagram
```mermaid
flowchart LR
  A[Valid document] --> B[Switch to tree]
  B --> C[Expand to node]
  C --> D[Copy path / value]
  C --> E[Show in text]
```

## Steps
1. Load the document — F-001.
2. Switch to tree view — F-006.R1.
3. Expand containers to the node — F-006.R3.
4. Copy path or value — F-006.R4, F-006.R5; or reveal in text — F-006.R6.

## Exits & failures
- Document invalid → tree explains and offers jump to error — F-006.R7, then FLOW-02.

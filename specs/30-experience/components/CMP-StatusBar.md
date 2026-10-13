---
id: CMP-StatusBar
title: Status bar
status: ready
tokens: [size.statusbar, font.size.xs, space.3]
---

## Purpose
Always-visible facts about the document.

## Anatomy
Validity indicator · size and line count · cursor position · privacy statement.

## Variants & states
| Variant / state | Description |
|---|---|
| valid / invalid / checking / empty | per F-005 |

## Behavior
Activating the validity indicator when invalid jumps to the error. Activating the privacy
statement opens its details.

## Accessibility
Status role (polite live region) for validity.

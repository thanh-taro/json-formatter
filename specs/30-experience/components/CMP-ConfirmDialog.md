---
id: CMP-ConfirmDialog
title: Confirm dialog
status: ready
tokens: [radius.md, size.control, font.size.md, space.4]
---

## Purpose
Ask before an action that may be slow or run out of memory (RULE-02): COPY-confirm.very_large.

## Anatomy
Scrim · panel (message, size) · COPY-action.cancel (default focus) · COPY-action.continue.

## Variants & states
| Variant / state | Description |
|---|---|
| very large content | message with the size; Continue / Cancel |

## Behavior
Modal within the tool; Escape cancels; nothing changes until Continue.

## Accessibility
Dialog role with accessible name from the message; focus trapped; focus returns to the
triggering control.

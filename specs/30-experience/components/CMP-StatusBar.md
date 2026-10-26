---
id: CMP-StatusBar
title: Status bar
status: ready
tokens: [size.statusbar, font.size.xs, space.3, size.targetMin, size.touchTarget]
---

## Purpose
Always-visible facts about the document.

## Anatomy
Validity indicator · size and line count · cursor position · privacy statement · source link (F-009.R3).

## Variants & states
| Variant / state | Description |
|---|---|
| valid / invalid / checking / empty | per F-005; valid with warnings uses COPY-status.valid_warnings |
| narrow | cursor position hidden; size and lines use COPY-status.size_lines_short; privacy statement shortens to its icon with COPY-privacy.badge_label; source link shortens to its icon, named COPY-privacy.source_label; if the items still do not fit (e.g. vi-VN under ~330 px), they wrap onto a second row and the bar grows; toasts and the privacy details stay clear of it (F-012.AC11) |

## Behavior
Activating the validity indicator when invalid jumps to the error. Activating the privacy
statement opens its details. Activating the source link opens the source repository in a new
tab (F-009.R3).

## Accessibility
Status role (polite live region) for validity. The source link is a link (not a button) whose
accessible name and tooltip are COPY-privacy.source_label; its icon, the GitHub mark (DEP-40), is decorative. Its target is at
least `size.targetMin`, and `size.touchTarget` when the primary pointer is coarse (style.md §3);
that hit area may extend beyond the bar's `size.statusbar` height.

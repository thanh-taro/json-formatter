---
id: CMP-Notice
title: Notice
status: ready
tokens: [size.control, size.targetMin, radius.sm, font.size.sm, space.3]
---

## Purpose
One place for transient and inline messages: progress, notices, errors and confirmations of
small actions.

## Anatomy
Icon · message · optional action(s) · optional dismiss. Two placements: **bar** (full width,
directly under the toolbar, pushes the document down) and **toast** (small, bottom-right above
the status bar, auto-dismisses).

## Variants & states
| Variant / state | Description |
|---|---|
| progress bar | progress text + bar + COPY-action.cancel (loading, formatting, exporting); toolbar controls stay in place, disabled |
| info bar | e.g. COPY-notice.large, COPY-notice.undo_trimmed, COPY-notice.no_indent, COPY-notice.multiple_files; dismissible |
| error bar | file errors offer COPY-action.open to try another file; e.g. COPY-error.encoding, COPY-error.too_large, COPY-error.not_a_file, COPY-error.clipboard; dismissible |
| toast | e.g. COPY-toast.copied; disappears after 2 s; never the only signal for errors |

## Behavior
At most one bar at a time (newest wins; progress has priority); toasts stack up to 2.
Dismiss with COPY-action.dismiss or Escape when focused.

## Accessibility
Bars and toasts are polite live regions; errors are assertive once. Actions are real buttons
at least `size.targetMin`.

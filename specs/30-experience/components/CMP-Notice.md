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
| progress bar | progress text + bar + COPY-action.cancel (loading, formatting, exporting); the only visible busy signal: toolbar controls stay in place and keep their normal look while their activation is ignored (D-031) |
| info bar | e.g. COPY-notice.large, COPY-notice.undo_trimmed, COPY-notice.no_indent, COPY-notice.multiple_files; dismissible |
| error bar | file errors offer COPY-action.open to try another file; e.g. COPY-error.encoding, COPY-error.too_large, COPY-error.not_a_file, COPY-error.clipboard; dismissible |
| toast | e.g. COPY-toast.copied; disappears after 2 s; never the only signal for errors |
| narrow | bar text and actions wrap onto more rows instead of overflowing; labels are never truncated (F-012.AC11) |

## Behavior
At most one bar at a time (newest wins; progress has priority); toasts stack up to 2.
Outcome bars — COPY-notice.no_indent, COPY-notice.multiple_files and every error bar — report the
result of one action and are removed when the next tool action starts (beautify, minify, re-indent,
open, clear, copy, download) or the document changes; COPY-notice.large and COPY-notice.undo_trimmed
describe the document and stay until dismissed (D-032).
Dismiss with COPY-action.dismiss or Escape when focused.

## Accessibility
Bars and toasts are polite live regions; errors are assertive once. Actions are real buttons
at least `size.targetMin`.

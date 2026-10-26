---
id: SCR-Formatter
title: Formatter
status: ready
features: [F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-010, F-011, F-012]
components: [CMP-Toolbar, CMP-Editor, CMP-TreeView, CMP-StatusBar, CMP-IssuePanel, CMP-DropOverlay, CMP-SearchPanel, CMP-Notice, CMP-ConfirmDialog]
---

## Purpose
The single screen: load, format, check, explore and export a JSON document.

## Layout regions
1. CMP-Toolbar — load/clear, beautify, minify, re-indent with indent selector, view switch
   (text/tree), copy, download.
2. CMP-Notice bar (when present) — progress, notices and errors; toasts float above the status bar.
3. Main area — CMP-Editor (text view, with CMP-SearchPanel docked at its top when open) or
   CMP-TreeView (tree view); CMP-DropOverlay covers it
   while a file is dragged over.
4. CMP-IssuePanel — shown when there are issues; collapsible.
5. CMP-StatusBar — validity, size/lines, cursor position, privacy statement, source link.

## States
| State | When | What the user sees |
|---|---|---|
| default | document present | editor or tree, status bar with validity |
| empty | document empty | CMP-Editor empty variant |
| loading | a file is being read or an operation runs > 0.5 s | CMP-Notice progress bar, cancel |
| error | document invalid | error marked in editor, CMP-IssuePanel open, COPY-status.invalid |
| large | document in large/very-large tier | CMP-Notice info bar with COPY-notice.large once, reduced visual extras |
| confirm | very large content or result | CMP-ConfirmDialog |

Startup must meet NFR-05.

## Entry & exit
- Entered from: the host portal's navigation, or the tool's own address.
- Exits to: none (single screen).

## Accessibility
Reading order: toolbar → main area → issue panel → status bar. Every action has a keyboard
path and an accessible name (COPY-* labels). Validity changes are announced politely; errors
are announced once per new error, not on every keystroke. File drop has a non-drag
alternative (open action).

## Language
No language control; the page language and every string follow RULE-19 (F-012). Every state
must fit at 320 px in every language (NFR-07). The tree's value kinds are marked as English
inside a vi-VN page (NFR-06).

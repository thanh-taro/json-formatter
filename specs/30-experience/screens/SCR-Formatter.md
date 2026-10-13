---
id: SCR-Formatter
title: Formatter
status: ready
features: [F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-010, F-011]
components: [CMP-Toolbar, CMP-Editor, CMP-TreeView, CMP-StatusBar, CMP-IssuePanel, CMP-DropOverlay, CMP-SearchPanel]
---

## Purpose
The single screen: load, format, check, explore and export a JSON document.

## Layout regions
1. CMP-Toolbar — load/clear, beautify, minify, re-indent with indent selector, view switch
   (text/tree), copy, download.
2. Main area — CMP-Editor (text view, with CMP-SearchPanel docked at its top when open) or
   CMP-TreeView (tree view); CMP-DropOverlay covers it
   while a file is dragged over.
3. CMP-IssuePanel — shown when there are issues; collapsible.
4. CMP-StatusBar — validity, size/lines, cursor position, privacy statement.

## States
| State | When | What the user sees |
|---|---|---|
| default | document present | editor or tree, status bar with validity |
| empty | document empty | COPY-empty.title, COPY-empty.body, open action |
| loading | a file is being read or an operation runs > 0.5 s | COPY-progress.loading or COPY-progress.formatting, cancel |
| error | document invalid | error marked in editor, CMP-IssuePanel open, COPY-status.invalid |
| large | document in large/very-large tier | COPY-notice.large once, reduced visual extras |

Startup must meet NFR-05.

## Entry & exit
- Entered from: the host portal's navigation, or the tool's own address.
- Exits to: none (single screen).

## Accessibility
Reading order: toolbar → main area → issue panel → status bar. Every action has a keyboard
path and an accessible name (COPY-* labels). Validity changes are announced politely; errors
are announced once per new error, not on every keystroke. File drop has a non-drag
alternative (open action).

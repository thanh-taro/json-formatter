---
id: CMP-IssuePanel
title: Issue panel
status: ready
tokens: []
---

## Purpose
Lists the error or warnings with location and hint.

## Anatomy
Header with counts · list of issues (severity, location, message, hint).

## Variants & states
| Variant / state | Description |
|---|---|
| error | one error item |
| warnings | up to 1,000 warning items plus overflow line |
| collapsed | header only |

## Behavior
Activating an item jumps to its position in the text.

## Accessibility
List role; each item announces severity, location, and hint.

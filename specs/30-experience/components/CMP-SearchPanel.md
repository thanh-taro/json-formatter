---
id: CMP-SearchPanel
title: Search panel
status: ready
tokens: [size.control, radius.sm, font.size.sm, font.size.code]
---

## Purpose
Find text in the document (F-010).

## Anatomy
Search field · match case toggle · count · previous · next · close.

## Variants & states
| Variant / state | Description |
|---|---|
| closed | hidden |
| open, empty | field focused, no count |
| matches | count `n of N` |
| counting | first match shown, total pending |
| no match | COPY-search.none |
| narrow | toggle and count move under the field |

## Behavior
Enter moves to the next match, Shift+Enter to the previous; Escape closes and returns focus.

## Accessibility
Field labelled by COPY-search.placeholder; count is a polite live region; toggle is a pressed button.

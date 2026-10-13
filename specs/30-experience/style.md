---
title: Style — Workbench
status: ready
---

# Style — "Workbench" (decision D-010)

The formatter is a workbench inside the portal's night market: the same palette, fonts and grid
as the host, arranged like a professional code editor. The JSON is the hero; chrome stays thin.
All values live in `tokens.json`; base colors, fonts, spacing and motion mirror the portal's
tokens so the tool looks native when embedded (PRN-05).

## Principles
1. **Content first.** Toolbar (`size.toolbar`) and status bar (`size.statusbar`) are thin strips
   on `surface`; the document area takes everything else. Hairlines (`line`) separate regions;
   no cards, no shadows, no glow inside the tool.
2. **One filled button.** Beautify is the only filled control (`accent` / `onAccent`). Every other
   action is a quiet text+icon button that fills with `surface2` on hover.
3. **Dense but targetable.** 13 px mono text on 20 px lines (`font.size.code`, `size.codeLine`);
   controls are `size.control` high with at least `size.targetMin` hit areas, growing to
   `size.touchTarget` when the primary pointer is coarse.
4. **State in form, not only color.** Validity shows a dot plus words; errors get a wavy underline,
   a tinted line (`dangerBg`) and a severity badge; warnings a dotted underline and a `warnBg`
   badge. Color is never the only signal.
5. **Same in both themes.** Dark and light are both first-class; every text pair, including every
   syntax color on every editor background, passes WCAG AA (`contrast.pairs`,
   `tools/token_contrast.py`).
6. **Crisp shapes.** `radius.sm` for buttons, badges and the indent selector; `radius.pill` only
   for severity badges. Square editor and panel edges.

## Type
- **UI:** Manrope 500/600 at `font.size.sm`–`md` for buttons, labels, panel text.
- **Code:** JetBrains Mono 400/500 at `font.size.code` for the editor, tree, gutter, positions
  and the status bar.
- The wide display face of the portal is not used inside the tool (the portal header carries
  the title).

## Syntax colors
| Role | Token | Applies to |
|---|---|---|
| Member names | `syntaxKey` | keys in the editor and tree |
| Strings | `syntaxString` | string values |
| Numbers | `syntaxNumber` | numbers (always shown exactly as written) |
| Literals | `syntaxLiteral` | `true`, `false`, `null` |
| Punctuation | `syntaxPunct` | brackets, commas, colons |

## Regions
- **Toolbar:** groups separated by hairline dividers: load · format (+ indent selector) · view
  switch · export (right-aligned). Under `size.minWidth`-ish widths labels hide, icons stay with
  accessible names; groups overflow into a menu.
- **Editor:** line-number gutter on `surface`, document on `bg`, current line on `currentLine`.
- **Issue panel:** docked under the editor, tabbed header (problems / warnings) with counts,
  at most `size.issuePanelMax` of the height, collapsible.
- **Status bar:** validity dot + words, size and lines, cursor position, then the privacy badge
  at the far end in `success`.
- **Tree:** same row height and font as the editor; indent `size.treeIndent` per level; selected
  row on `selection` with a 2 px `accent` inner edge; row actions appear on hover/focus.

## Motion
Only `motion.duration.fast` hover/press fades and `base` panel open/close. No motion under
reduced-motion except opacity.

## Iconography
1.5 px stroke icons at `size.icon.sm`, rounded caps, from the open-licensed set chosen in the
architecture (same family as the portal).

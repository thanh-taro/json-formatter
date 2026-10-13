# Design adapter — Claude Design canvas

Tool: a Claude Design artifact (live artboards on a canvas), decision D-011 — same tool and
conventions as the taro-kit portal. The canvas is a derived artifact: the specs stay the source
of truth.

## Naming
- Screen artboards: one per screen state (or flow step) and viewport, titled
  `<SCR-ID> / <state> / <viewport>`. Theme is a **tweak** on the artboard; state × theme
  coverage counts each tweak value as a frame.
- Components: one artboard per component (`CMP-<Name>`), holding every row of its
  "Variants & states" table for both themes, each cell labeled `<CMP-ID> / <variant> / <theme>`.
- Flows: `<FLOW-ID> / step <n>`.
- Viewports: **embedded** 1200 × 760 (the portal's tool area on a desktop), **narrow** 390 × 760
  (the portal's phone layout; NFR-07 minimum is 360).

## Tokens
- In code, tokens are generated from `specs/30-experience/tokens.json` as CSS custom
  properties `--tk-color-<role>`, `--tk-space-<n>`, `--tk-radius-<name>`, `--tk-font-<role>`,
  `--tk-size-<name>`; dark on `:root`, light under `[data-theme="light"]` (same scheme as the portal).
- Artboards render both themes, declaring color roles as short custom properties (`--bg`,
  `--fg`, `--accent`, `--syntaxKey`…) scoped to `.tk-dark` / `.tk-light`. Every value must equal
  tokens.json. Spacing, radius, type and sizes use token values. A value with no token is a finding.

## Copy
- Every visible string comes from `specs/30-experience/copy.md`; each text element carries
  `data-copy="<COPY-ID>"`.
- JSON content in the editor and tree is **sample data**, labeled as such, and is the only text
  without a COPY ID.

## Review
Each artboard links its spec ID. The design-auditor checks coverage (state × theme), COPY IDs
and tokens; the ui-critic reviews screenshots; the a11y-auditor checks contrast, targets, and
reading order.

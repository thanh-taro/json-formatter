# JSON Formatter (taro-kit tools) — instructions for Claude

A private, lossless JSON formatter for developers, embedded via iframe in the taro-kit tools portal: format, validate with precise errors, and explore as a tree — nothing leaves the browser.

This project is built with the **build-my-app** workflow. Progress lives in
`.build-my-app/state.json`; resume with `/build-my-app:start`, inspect with `/build-my-app:status`.

## Source of truth
`specs/` is the single source of truth for WHAT the app does and WHY. Read `specs/README.md`.

- Before designing, implementing, or testing anything, load its spec context:
  `python3 tools/spec_query.py context <ID>`.
- Never invent behavior. If a spec is missing or ambiguous, stop and propose a spec change.
- Use only the vocabulary in `specs/00-product/glossary.md`.
- Only generate from specs whose `status` is `ready` or later.
- Cite spec IDs in code (`// Implements: F-003.R2`) and in test names (see `adapters/tests.md`).

## Specs vs adapters
- `specs/` is tool-agnostic; platform and technology decisions live only in `specs/40-technical/`.
- `adapters/` describes how specific tools consume the specs.

## Licensing
Follow the dependency and asset policy in `specs/40-technical/dependencies.md` and its ADR.
Register every dependency and asset before use.

## Checks
- `python3 tools/spec_lint.py` must report 0 errors after any spec change.
- `python3 tools/spec_lint.py --coverage <tests-dir>` lists acceptance criteria without tests.

# Domain model

M-1 stores nothing between sessions (PRN-01); every entity lives only in memory.

### ENT-Document — Document
The text being worked on.
- `text` — the full content, any length (size tiers: RULE-02).
- `sourceName` — file name if opened from a file, otherwise none.
- `lineEnding` — dominant line ending of the text (LF or CRLF; LF when there are none); used by RULE-07.
- `endsWithLineBreak` — whether the text ends with a line break; used by RULE-07.
- `tier` — size tier per RULE-02.
- `validity` — `valid`, `invalid`, `checking` (a result for the current text is being computed), or `empty` (zero characters, RULE-03).
- `issues` — list of ENT-Issue from the latest validation.

### ENT-IndentStyle — Indent style
- `kind` — `spaces` or `tab`.
- `width` — number of spaces when `kind = spaces` (RULE-01).

### ENT-Issue — Issue
- `severity` — `error` or `warning`.
- `code` — one of the codes in RULE-04 / RULE-05.
- `line`, `column` — 1-based position per RULE-04 / RULE-05. Lines are separated by LF, CRLF or a
  lone CR (each counts as one break); a trailing break starts a new, empty line. Columns count
  Unicode code points. A leading byte-order mark is not counted.
- `offset` — 0-based position in code points from the start of the document (after any byte-order mark).
- `params` — values used in the hint (e.g. the bracket and the line it opened on).
- `hint` — plain-language explanation and likely fix.

### ENT-Node — Node
One value in a valid document's structure.
- `kind` — `object`, `array`, `string`, `number`, `boolean`, `null`.
- `key` — member name (for object members) or index (for array elements); none for the root.
- `sourceText` — the value exactly as written in the document (RULE-11).
- `childCount` — for objects and arrays.
- `path` — see RULE-06.
- `span` — start and end offset in the document.

## Invariants
- **INV-01** Beautify, minify and re-indent never change the sequence of tokens: every string,
  number (character-for-character), literal, key and punctuation mark of the input appears in
  the output in the same order. Only insignificant whitespace differs.
- **INV-02** No user content, or anything derived from it, is sent off the device.
- **INV-03** An operation that cannot complete (invalid input for beautify/minify, cancellation,
  failure) leaves the document exactly as it was.
- **INV-04** Every change the tool makes to the document can be undone in one step, within the
  history limits of RULE-15.
- **INV-05** The tree and the validity status always describe the current document text, or
  are clearly marked as out of date while it is being re-checked.

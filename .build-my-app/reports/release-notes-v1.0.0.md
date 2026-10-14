# JSON Formatter 1.0.0

First public release, at https://json-formatter.tarokit.app and inside the taro-kit tools portal.

JSON Formatter is a private, lossless formatter for developers. Paste or open some JSON, tidy it
up, find out exactly what is wrong with it, and explore it as a tree. Nothing leaves your browser.

## What you can do

**Get your JSON in**
- Paste or type it, drop a file onto the page, or choose a file.
- Documents up to 10 MB are fully supported with everything switched on. Between 10 and 100 MB the
  tool still works and may reduce syntax colouring; you are told once. Above 100 MB it asks before
  loading, and keeps your current document if your device cannot hold the new one.
- Big files show progress and can be cancelled. Replacing or clearing the document can be undone in one step.

**Tidy it up**
- **Beautify**: one member or element per line, indented the way you like (2 spaces by default,
  4 spaces, a tab, or 1 to 8 spaces).
- **Minify**: everything on one line, no extra whitespace.
- **Re-indent**: switch between tabs and spaces, or between 2 and 4 spaces, without changing
  your own line layout. It works even when the JSON is not valid yet.
- All of this is lossless: only whitespace changes. Every value, key and number is kept exactly as you wrote it.
  Each action can be undone.

**Find out what is wrong**
- Validation runs as you type and never gets in the way of typing or scrolling.
- For invalid JSON you get the first error with its line and column and a plain-language hint on how to fix it.
  Click the error to jump to it.
- Warnings for valid JSON that tends to cause trouble elsewhere: repeated keys, numbers too big or too precise for
  most programs, and a hidden byte-order mark at the start.
- Size and line count are always visible.

**Explore it**
- Switch to a tree view of valid documents. Expand and collapse any level, or collapse everything.
- Copy the path of any node (for example `$.items[0].id`) or its value, or jump to it in the text.
- It stays smooth on big documents, including arrays with 100,000 items.

**Get it out**
- Copy the whole document, or download it as a file. Files you opened keep their name; otherwise you get
  `formatted.json`, `minified.json` or `document.json`.
- If your browser blocks copying, the tool tells you and lets you copy by hand.

**Find text**
- Search the document with next and previous, a match count ("3 of 17"), and an optional match-case switch.

**Works where you are**
- Light and dark themes. Embedded in the taro-kit portal it follows the portal's theme; on its own it follows your device.
- Works down to a 320 px wide screen, with large touch targets, keyboard access, and support for screen readers and high-contrast mode.
- Works offline after one complete visit. A new version is picked up the next time you open the tool, never in the middle of your work.

## Privacy

Your JSON never leaves your browser. It is never uploaded, logged or stored. There are no analytics,
cookies or accounts. The tool's content security policy forbids it from making network connections.
To work offline, the browser keeps a copy of the tool's own program files, never your data. See "Privacy"
in the README for the full note. The open-source notices are linked from the privacy details and
available at `/third-party-notices.txt`.

## Good to know

- Syntax colouring is reduced for documents above 10 MB to keep typing instant. Between about 2 and 10 MB, with colouring on, scrolling or typing can occasionally take slightly longer than 0.1 s on slower devices.
- Very large documents (100 MB and more) work best in Chromium-based browsers; Safari scrolling and memory use are
  heavier there. Fast scrollbar dragging on a 100 MB document in Chrome can briefly drop frames.
- Only the first syntax error is reported, because a strict JSON parser stops there. Fixing it and checking
  again shows the next one.
- JSON with comments, trailing commas or single quotes is reported as an error, not repaired. Automatic fixing,
  tree search, sorting keys and similar tools are planned for later releases.
- Real-device checks (Safari and Firefox, screen readers, phones) were still being completed at release time.

## Versioning

This is 1.0.0 (first stable release; milestone M-1). Later releases follow semantic versioning:
fixes bump the last number, new features the middle one.

---
Internal appendix (not for users). Derived from F-001 to F-011 (all `shipped`), the changelog in
`specs/60-delivery/changelog.md`, `.build-my-app/reports/gate-qa.md`, `qa/perf.md` and
`qa/privacy-declaration.md`. Rules: RULE-01 (indent styles), RULE-02 (size tiers), RULE-10 (download names).
Decisions: D-022 (colouring exception 2 to 10 MB), D-025 (WebKit limits). Open: QA-025 (accepted).

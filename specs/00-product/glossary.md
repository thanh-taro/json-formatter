# Glossary

| Term | Meaning |
|---|---|
| Document | The text currently in the editor. May or may not be valid JSON. |
| Valid / invalid / empty | Whether the document conforms to the JSON standard; a document with zero characters is empty. |
| Size tier | Normal, large or very large, by document size; larger tiers trade visual extras for speed. |
| Beautify | Rewrite the document with one member/element per line and a chosen indent. |
| Minify | Rewrite the document with no insignificant whitespace. |
| Indent style | How one level of nesting is indented: N spaces or a tab. |
| Re-indent | Change the indentation of existing lines without changing line structure. |
| Issue | An error (document invalid) or a warning (valid, but likely to cause trouble elsewhere) found while validating. |
| Hint | A plain-language explanation of an issue and its likely fix. |
| Node | One value in the document's structure, shown in the tree. |
| Path | Text address of a node from the root, e.g. `$.items[0].id`. |
| Byte-order mark | An invisible marker some editors put at the start of a text file. |
| Source name | The file name a document was opened from. |
| Host | The portal page that embeds the tool. |
| Lossless | Only insignificant whitespace changes; every value, key and number spelling stays as written. |

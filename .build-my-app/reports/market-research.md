# Market research — JSON formatter (2026-10-13)

Source quality: competitor details mostly come from vendor listicles and aggregators; first-party
pricing and Reddit/HN sentiment were not verified.

## Competitors
| Tool | Notes | Source |
|---|---|---|
| jsonformatter.org | Free, ad-supported, tree view; listed as server-side | [SaaSHub](https://www.saashub.com/compare-jsonformatter-org-vs-json-crack), [DevPlaybook](https://devplaybook.cc/blog/top-10-online-json-formatters-compared-2026/) (vendor, biased) |
| CodeBeautify | Many converters, ad-heavy, server-side | DevPlaybook |
| jsonlint.com | Strict validator, line/column errors, no tree, weak > 1 MB | DevPlaybook |
| curiousconcept | Compact formatter + validation, "aging" | DevPlaybook (unverified) |
| jsoneditoronline.org | Tree + code editor; free tier full, ~$2–5/mo paid | [Toolradar](https://toolradar.com/tools/json-editor-online) (may be outdated) |
| JSON Crack | OSS graph visualizer, local processing, Apache-2.0 | [GitHub](https://github.com/AykutSarac/jsoncrack.com) |
| it-tools | Self-hostable toolbox, GPL-3.0 | [GitHub](https://github.com/CorentinTh/it-tools) |
| DevToys | Desktop, MIT, JSON format/YAML/JSONPath | [GitHub](https://github.com/DevToys-app/DevToys) |

Not researched: transform.tools, DevUtils, browser built-in viewers, VS Code.

## Praise & complaints
- Complaints: ads, clutter, slow on large files, uploading data to servers, sign-ups
  ([Indie Hackers](https://www.indiehackers.com/post/just-launched-formatjsononline-com-a-clean-fast-and-private-json-formatter-MKiSTl0H9iteAOFE4ACc), [Product Hunt](https://www.producthunt.com/products/ojf-online-json-formatt/reviews)).
- Praise: precise line/column errors (JSONLint), dual tree + code views (JSONEditorOnline).
- Big integers: native parsing loses precision above 2^53−1
  ([DEV](https://dev.to/fazal_mansuri_/javascript-precision-loss-with-large-numbers-the-silent-bug-that-breaks-applications-without-4lhg), [2ality](https://2ality-com.onrender.com/2022/11/json-parse-with-source.html)).

## Privacy incident
Nov 2025: watchTowr found the public "Recent Links" pages of JSONFormatter and CodeBeautify
exposed 80,000+ saved entries incl. credentials, keys and PII
([BleepingComputer](https://www.bleepingcomputer.com/news/security/code-formatters-expose-thousands-of-secrets-from-banks-govt-tech-orgs), [Help Net Security](https://helpnetsecurity.com/2025/11/25/code-formatting-sites-exposing-secrets)).
Strongest argument for a client-only tool with no save/share-link feature.

## Gaps
- Verifiable no-upload (no network after load, no analytics).
- Large-file speed (worker + virtualization).
- Lossless numbers and key order.
- Error quality: line/column + code frame + specific hints; lenient mode with auto-fix.
- Ad-free, embeddable.

## Table stakes vs differentiators
- Table stakes: beautify/minify, indent options, validation with line numbers, tree view, copy, no sign-up.
- Differentiators: verifiable privacy, lossless numbers/order, big-file speed, auto-fix, copy-path, search.

## Licensing
RFC 8259 is the spec. Avoid copying GPL code (it-tools); MIT/Apache-2.0 are safe.

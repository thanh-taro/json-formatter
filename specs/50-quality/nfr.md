# Non-functional requirements

Reference machine: a mid-range laptop from the last 4 years (e.g. 4+ cores, 16 GB RAM) in a
current desktop browser.

| ID | Requirement | Measure |
|---|---|---|
| **NFR-01** | Privacy: after the initial load (all of the tool's own code and assets fetched, including registering the offline cache and the browser checking it for a new version while the page opens), the tool makes no network requests of its own; the only exception is the browser's own fetching or update-checking of the tool's own files for the offline cache, which never carries user content (D-021); no analytics; no document content persisted anywhere (memory only). The tool's content policy forbids outgoing connections. | Network log during a full M-1 session shows zero requests after load; policy header present. |
| **NFR-02** | Responsiveness: user input (typing, scrolling, clicking) gets visible feedback within 100 ms at every size tier (accepted exception, D-022: with syntax colouring on, documents between about 2 MB and 10 MB may exceed this while scrolling or typing); operations longer than 0.5 s show progress, longer than 1 s are cancellable. | Interaction latency traces on 1 MB, 10 MB, 100 MB documents. |
| **NFR-03** | Throughput on the reference machine: validate, beautify or minify 10 MB in ≤ 1 s and 100 MB in ≤ 10 s. | Benchmark suite in CI-comparable conditions. |
| **NFR-04** | Large documents: a 100 MB document opens, scrolls with no frame longer than 50 ms, and is editable; peak memory stays below 1.5 GB. Above 100 MB, best effort per RULE-02. | Manual + automated runs with generated 10/50/100/200 MB fixtures. |
| **NFR-05** | Startup: interactive within 1.5 s on a 10 Mbit/s, 40 ms round-trip connection with a cold cache; within 0.5 s when cached. A size budget for the initial download is set in the architecture. | Lab measurement with network throttling. |
| **NFR-06** | Accessibility: WCAG 2.2 AA; every action operable by keyboard; status changes announced. | Automated audit + manual screen-reader pass. |
| **NFR-07** | Browser support: latest two versions of the major desktop browser engines (Chromium-based, Gecko-based, WebKit-based); usable down to 360 px wide (phone layouts of the host included); embedded and standalone. | Test matrix. |
| **NFR-08** | Correctness: accepts every document the JSON standard accepts and rejects every one it rejects, measured against a public JSON conformance test suite; beautify/minify round-trips are token-identical (INV-01). | Conformance + property-based tests. |
| **NFR-09** | Embedding safety: the tool can only be embedded by configured host origins and accepts messages only from them. | Header check + message-origin tests. |

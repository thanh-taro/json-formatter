# F-011 Work offline — code review 1

Branch `worktree-agent-af4ed274c018e9771` @ 668103f, reviewed against F-011, NFR-01 (+D-021),
ADR-0009/0012 + SP-iframe evidence, MOD-Host. Unit tests pass (12/12); the e2e suite was read, not run.

**Verdict: changes required.** One blocker comes from the deviation from ADR-0012. The rest
follows ADR-0012 closely: the seed list, network-first page with an `ignoreSearch` fallback,
cache-first hashed assets, no `skipWaiting`/`clients.claim`, `updateViaCache: "all"`, and the
`/sw.js` headers and lint carve-out.

## Blocker

### B1 — Copying the cache at install time takes a snapshot too early; deleting caches on activate then breaks the next offline open after a deploy
`src/host/sw.ts:43-56` (install copy), `:60-65` (activate delete), `:14-15` + `scripts/lib/offline.mjs:52-57`
(the build id goes into both the cache name and the bytes of `/sw.js`), `src/host/offline.ts:54` (the seed goes to `ready.active`).

Every deploy changes `/sw.js`, because the build id is stamped into it. So every deploy goes
through the worker lifecycle. Here is a failing sequence:
1. Day 0: the user opens build A. Worker A starts, and cache A is seeded with HTML A and the A assets.
2. Build B is deployed. On day 2 (the `/sw.js` max-age has expired) the user opens the tool
   online. The page is still controlled by worker A:
   - The network-first navigation stores **HTML B** in cache A (`sw.ts:80`).
   - The browser's update check finds a new `/sw.js`, and **install B copies cache A at that moment**.
     The B assets are still loading, and the lazy chunks and fonts load later. The page's seed
     message goes to `ready.active`, which is worker **A**, so those files land in cache A only.
     Nothing ever adds them to cache B.
3. The user closes the tab. Worker B activates and **deletes cache A** (`sw.ts:63`).
4. Day 3, offline: cache B can hold HTML B with only some (or none) of the B assets. The page
   loads its `/assets/index-<B>.js`, gets a cache miss, then a failed network fetch, and shows a
   blank page. That breaks F-011.R1/AC1.

Whether it fails depends on timing (when install runs compared with the asset and font loads). It
also gets worse when worker B sits in "waiting" for hours while more navigations update cache A
only. The copy also mixes versions: the new worker's cache is assembled from whatever the old one
held, which may be newer than the worker itself.

Deleting caches on activate also contradicts the ADR-0012 text: "pruned on each navigation
(not in `activate`)".

**Simplest correct design (stays inside ADR-0012, so no new ADR is needed):**
- Use **one fixed cache name** with a schema version that you only bump when the cache
  *format* changes, e.g. `json-formatter-v1`. ADR-0012's "one versioned Cache Storage entry set"
  allows this. Every worker reads from and writes to the same cache, so the files worker A stored
  during the B visit are exactly what worker B serves.
- **Remove** the install handler, and the build-id stamping (`BUILD_ID`, `buildId`, `generateBundle`
  replace). In activate, delete only caches with the prefix that don't match the fixed name, so
  old schema versions are cleaned up. Keep the `tk-chunks` meta.
- Then `/sw.js` changes only when the worker's code changes. That means no lifecycle churn on
  every deploy, and fewer of the D-021 update/seed requests on WebKit.
- Pruning per seed (already there) keeps growth bounded. New versions still arrive through the
  network-first HTML (R3), whether or not `/sw.js` changed.

If the builder wants to keep build-id caches plus a migration step, that is a real change to an
accepted ADR and needs a new ADR. It would also have to make the new worker's cache complete
(for example, seeding to the waiting worker as well), which is more complex for no benefit.

## Major

### M1 — No test exercises the deviation or a `/sw.js` change
`tests/e2e/f011-offline.spec.ts:186-218` (AC3), `tests/e2e/server.mjs` publish mode.

`/publish` rewrites only the HTML and the asset paths. `/sw.js` is served byte-identical, so
install/activate/copy never run in any test. AC3 therefore passes whatever the install and activate
logic does, and B1 cannot be caught. The `seeded()` helper (`:65-73`) also merges keys across
**all** caches, so it would hide a split between cache A and cache B.

Fix: add a test where publishing also changes `/sw.js` (for example, the server appends a comment
to it while `published` is on). The steps: open online after publish, wait for the asset loads,
close all tool pages so the new worker activates, go offline, open again, then assert v2 loads and
works. Make `seeded()` check only the single expected cache name.

The other ACs are meaningful:
- AC1 (standalone and embedded) fails without the worker: the server destroys the socket.
- AC2 is the NFR-01 measure and passes trivially without a worker, which is acceptable.

## Minor

### m1 — The page is stored before its assets, so an interrupted load can leave a mixed cache
`src/host/sw.ts:77-81`. The network-first navigation stores HTML B as soon as it arrives. If the
connection drops before the B assets have loaded (or before the seed runs), the cache holds HTML B
with A assets, and the next offline open is blank. This is the same risk as the ADR design, made
more likely by B1.

Fix: don't store the page in the fetch handler. Store it in the seed handler, **last**, after every
asset has been stored, and always overwrite it. Today `sw.ts:111` skips the write when the key
already exists, so the page key needs an exception.

### m2 — The activate cleanup is an ADR deviation in itself
`sw.ts:60-65` deletes whole caches in activate. Once B1's fixed cache name is in place, this only
removes caches from other schema versions. Note that in the ADR follow-up or the code comment.

### m3 — Pages are never pruned
`offline-policy.ts:87-90`. Any same-origin navigation that returns 200 is cached by path and kept
forever, for example `/third-party-notices.txt` opened in the tool's origin. That growth is bounded
but unnecessary. Fix: cache only navigations to `/` (or `/index.html`).

## Checked, no issue
- **Seed list:** the document plus resource-timing `/assets/*` plus `tk-chunks`. `tk-chunks` includes
  both JS entries (`index-*.js`), so the module worker chunk is covered. Fonts are covered through
  resource timing after `document.fonts.ready`. Seed targets are same-origin, capped, deduplicated,
  and exclude `/sw.js`.
- **Page fallback:** pages are keyed by origin + path, and the fallback uses `ignoreSearch`, so
  `?theme=dark` and `?theme=light` share one entry, as the MOD-Host note requires.
- **Asset caching:** hashed assets are cache-first and only `ok`/`basic`/non-redirected responses
  are stored, so mixing versions within an asset is impossible.
- **Update flow:** there is no reload path anywhere (R3), and AC3 checks this with an open session.
- **Failure modes:** a quota error during seeding is caught per file. A quota error during the
  B1 install copy would fail the install and retry the update on every navigation; this goes
  away with the fix. A missing seed (tab closed early) only means the tool isn't offline-ready yet.
- **Headers:** the `/sw.js` header block has `!` detaches and `connect-src 'self'` (ADR-0009), and
  the page keeps `connect-src 'none'`.

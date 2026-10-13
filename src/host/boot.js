// Implements: F-008.R1, F-008.R2, RULE-16 (initial theme before first paint), MOD-Host.
// Inlined into <head> by vite.config.ts and allowed by its CSP hash (scripts/gen-headers.mjs).
// Classic script, no imports. Comment-only lines are stripped before hashing and inlining.
(function () {
  var d = document.documentElement;
  var t = null;
  try {
    t = new URLSearchParams(location.search).get('theme');
  } catch (e) {}
  if (t === 'light' || t === 'dark') {
    d.setAttribute('data-theme-source', 'address');
  } else {
    t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    d.setAttribute('data-theme-source', 'device');
  }
  d.setAttribute('data-theme', t);
})();

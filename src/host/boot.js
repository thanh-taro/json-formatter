// Implements: F-008.R1, F-008.R2, RULE-16 (initial theme before first paint), MOD-Host;
// F-012.R1, F-012.R3, RULE-19 (page language before first paint; same matching as contract.ts).
// Inlined into <head> by vite.config.ts and allowed by its CSP hash (scripts/gen-headers.mjs).
// Classic script, no imports. Comment-only lines are stripped before hashing and inlining.
(function () {
  var t = null;
  try {
    t = new URLSearchParams(location.search).get('theme');
  } catch (e) {}
  if (t !== 'light' && t !== 'dark') {
    t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', t);
  var supported = ['en-US', 'vi-VN'];
  var match = function (v) {
    if (typeof v !== 'string' || !v.trim()) return null;
    v = v.trim().toLowerCase();
    for (var i = 0; i < supported.length; i++) if (supported[i].toLowerCase() === v) return supported[i];
    var p = v.split(/[-_]/)[0];
    for (var j = 0; j < supported.length; j++) if (supported[j].toLowerCase().split('-')[0] === p) return supported[j];
    return null;
  };
  var l = null;
  try {
    l = match(new URLSearchParams(location.search).get('lang'));
    var prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var k = 0; !l && k < prefs.length; k++) l = match(prefs[k]);
  } catch (e) {}
  document.documentElement.setAttribute('lang', l || supported[0]);
})();

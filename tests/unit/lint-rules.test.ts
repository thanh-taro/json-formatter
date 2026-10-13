// The lint bans that keep content in the page (INV-02, NFR-01, ADR-0008): only MOD-Host may
// reach other windows; nothing may navigate, persist or connect.
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function errors(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => `${m.ruleId}: ${m.message}`);
}

const APP = 'src/app/probe.ts';
const HOST = 'src/host/probe.ts';

describe('lint bans', () => {
  it('INV-02 F-008.R5 outside MOD-Host, no code can post to or reach another window', async () => {
    for (const code of [
      'parent.postMessage("x", "https://a.example");',
      'window.parent.postMessage("x", "https://a.example");',
      'top.postMessage("x", "https://a.example");',
      'window.top?.postMessage("x", "https://a.example");',
      'opener.postMessage("x", "https://a.example");',
      'const p = window.parent; p.postMessage("x", "https://a.example");',
      'const o = self.opener; export { o };',
    ]) {
      expect(await errors(code, APP), code).not.toEqual([]);
    }
  });

  it('INV-02 F-008.R5 MOD-Host may post to its parent', async () => {
    expect(await errors('window.parent.postMessage({ type: "taro:ready" }, "https://a.example");', HOST)).toEqual([]);
  });

  it('INV-02 no navigation that could carry content, in any module', async () => {
    for (const file of [APP, HOST]) {
      for (const code of [
        'location.href = "https://x.example/?" + 1;',
        'location = "https://x.example";',
        'window.location = "https://x.example";',
        'window.location.href = "https://x.example";',
        'location.assign("https://x.example");',
        'window.location.replace("https://x.example");',
        'window.open("https://x.example");',
        'open("https://x.example");',
      ]) {
        expect(await errors(code, file), `${file}: ${code}`).not.toEqual([]);
      }
    }
  });

  it('NFR-01 PRN-01 no network or storage APIs, in any module', async () => {
    for (const file of [APP, HOST]) {
      for (const code of [
        'fetch("/x");',
        'localStorage.setItem("a", "b");',
        'caches.open("x");',
        'new BroadcastChannel("x");',
        'navigator.storage.persist();',
        'navigator.sendBeacon("/x");',
      ]) {
        expect(await errors(code, file), `${file}: ${code}`).not.toEqual([]);
      }
    }
  });

  it('smoke: reading the address is still allowed', async () => {
    expect(await errors('export const q = new URLSearchParams(location.search).get("theme");', APP)).toEqual([]);
  });
});

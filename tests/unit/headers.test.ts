// MOD-Build: the HOST_ORIGINS deploy setting drives frame-ancestors (ADR-0008 §4, ADR-0009).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error -- plain ESM build script without type declarations
import { DEFAULT_HOST_ORIGINS, hostOrigins, pageCsp, parseHostOrigins } from '../../scripts/gen-headers.mjs';

const saved = process.env['HOST_ORIGINS'];
afterEach(() => {
  if (saved === undefined) delete process.env['HOST_ORIGINS'];
  else process.env['HOST_ORIGINS'] = saved;
});

const frameAncestors = (csp: string) => /frame-ancestors ([^;]+)/.exec(csp)?.[1];

describe('frame-ancestors from HOST_ORIGINS', () => {
  it('F-008.AC8 NFR-09 only the configured host origins may embed the tool', () => {
    expect(frameAncestors(pageCsp(['https://tarokit.app']) as string)).toBe('https://tarokit.app');
    expect(frameAncestors(pageCsp(['https://a.example', 'https://b.example']) as string)).toBe(
      'https://a.example https://b.example',
    );
  });

  it("F-008.AC8 RULE-16 an empty list refuses every embedder ('none')", () => {
    process.env['HOST_ORIGINS'] = '';
    expect(hostOrigins()).toEqual([]);
    expect(frameAncestors(pageCsp() as string)).toBe("'none'");
  });

  it('NFR-09 the deploy setting is parsed into the list that is also compiled in', () => {
    delete process.env['HOST_ORIGINS'];
    expect(hostOrigins()).toEqual([DEFAULT_HOST_ORIGINS]);
    process.env['HOST_ORIGINS'] = ' https://a.example  https://b.example ';
    expect(hostOrigins()).toEqual(['https://a.example', 'https://b.example']);
  });

  it('NFR-09 refuses wildcards, keywords, directives, paths and plain http (the build fails)', () => {
    for (const bad of [
      '*',
      'null',
      "'self'",
      'https:',
      'https://*.tarokit.app',
      'https://a.example;sandbox',
      'https://a.example; frame-ancestors *',
      'http://tarokit.app',
      'https://tarokit.app/tools',
      'https://tarokit.app?x=1',
      'https://user@tarokit.app',
      'https://tarokit.app:443',
      'tarokit.app',
      'https://tarokit.app *',
    ]) {
      expect(() => parseHostOrigins(bad), bad).toThrow(/HOST_ORIGINS refused/);
    }
  });

  it('NFR-09 normalises valid entries to serialised origins', () => {
    expect(parseHostOrigins('https://TaroKit.app/')).toEqual(['https://tarokit.app']);
    expect(parseHostOrigins('https://tarokit.app https://tarokit.app,https://b.example:8443')).toEqual([
      'https://tarokit.app',
      'https://b.example:8443',
    ]);
    expect(parseHostOrigins('http://localhost:4174')).toEqual(['http://localhost:4174']);
    expect(parseHostOrigins('')).toEqual([]);
  });

  it('NFR-09 the committed _headers sends frame-ancestors and no X-Frame-Options', () => {
    const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
    expect(headers).toMatch(/frame-ancestors https:\/\/tarokit\.app/);
    expect(headers).not.toMatch(/X-Frame-Options/i);
    expect(headers).toMatch(/Strict-Transport-Security: max-age=31536000; includeSubDomains/);
  });
});

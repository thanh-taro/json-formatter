// Generated tokens (ADR-0011): dark on :root, light under [data-theme="light"], --tk-* names.
import { describe, expect, it } from 'vitest';
import tokensJson from '../../specs/30-experience/tokens.json';
import { readFileSync } from 'node:fs';
import { TOKEN_VARS } from '../../src/app/styles/tokens.gen';

// Read from disk: Vitest blanks CSS imports, including ?raw.
const css = readFileSync(new URL('../../src/app/styles/tokens.gen.css', import.meta.url), 'utf8');

type ColorGroup = Record<string, { $value: string } | string>;
const colors = tokensJson.color as unknown as { dark: ColorGroup; light: ColorGroup };

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

describe('generated tokens', () => {
  it('smoke: dark colours are the :root default, light ones override under [data-theme="light"]', () => {
    const root = block(':root');
    const light = block('[data-theme="light"]');
    for (const [role, token] of Object.entries(colors.dark)) {
      if (typeof token === 'string') continue;
      const name = TOKEN_VARS[`color.${role}` as keyof typeof TOKEN_VARS];
      expect(root).toContain(`${name}: ${token.$value};`);
      const lightToken = colors.light[role];
      if (lightToken && typeof lightToken !== 'string') expect(light).toContain(`${name}: ${lightToken.$value};`);
    }
  });

  it('smoke: every token name uses the --tk- prefix', () => {
    for (const v of Object.values(TOKEN_VARS)) expect(v).toMatch(/^--tk-[a-z0-9-]+$/);
    expect(TOKEN_VARS['space.4']).toBe('--tk-space-4');
    expect(TOKEN_VARS['color.bg']).toBe('--tk-color-bg');
  });
});

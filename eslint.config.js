// ESLint flat config (ADR-0003): TypeScript, accessibility, the network/storage API ban
// (INV-02, NFR-01) and module boundaries (architecture.md "Dependency rule").
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

const NETWORK_AND_STORAGE = [
  ['fetch', 'INV-02: no network requests from the tool'],
  ['XMLHttpRequest', 'INV-02: no network requests from the tool'],
  ['WebSocket', 'INV-02: no network requests from the tool'],
  ['EventSource', 'INV-02: no network requests from the tool'],
  ['localStorage', 'PRN-01: nothing is persisted'],
  ['sessionStorage', 'PRN-01: nothing is persisted'],
  ['indexedDB', 'PRN-01: nothing is persisted'],
].map(([name, message]) => ({ name, message }));

const NETWORK_PROPERTIES = [
  { object: 'navigator', property: 'sendBeacon', message: 'INV-02: no network requests from the tool' },
  { object: 'window', property: 'fetch', message: 'INV-02: no network requests from the tool' },
  { object: 'self', property: 'fetch', message: 'INV-02: no network requests from the tool' },
  { object: 'globalThis', property: 'fetch', message: 'INV-02: no network requests from the tool' },
  { object: 'document', property: 'cookie', message: 'PRN-01: nothing is persisted' },
  { object: 'window', property: 'localStorage', message: 'PRN-01: nothing is persisted' },
  { object: 'self', property: 'importScripts', message: 'INV-02: no remote scripts' },
];

const DOM_MODULES = [
  'preact',
  'preact/*',
  '@preact/*',
  '@codemirror/view',
  '@codemirror/language',
  '@codemirror/commands',
];

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      '.lighthouseci/',
      '.claude/',
      '.build-my-app/',
      'design/',
      'tests/fixtures/',
      '**/*.gen.ts',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: ['src/**/*.{ts,tsx,js}'],
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_AND_STORAGE],
      'no-restricted-properties': ['error', ...NETWORK_PROPERTIES],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='postMessage'][callee.object.property.name='parent']",
          message: 'Only MOD-Host may post to the parent window (ADR-0008).',
        },
      ],
    },
  },
  {
    // MOD-Host owns the parent-window channel.
    files: ['src/host/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // MOD-Core imports nothing.
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        // only files of MOD-Core itself (same folder)
        { patterns: [{ regex: '^(?!\\./[^/]+$)', message: 'MOD-Core imports nothing (architecture.md).' }] },
      ],
    },
  },
  {
    // MOD-Worker imports only MOD-Core and @codemirror/state; never DOM code.
    files: ['src/worker/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: DOM_MODULES, message: 'The worker never imports DOM code (architecture.md).' },
            {
              group: ['app', 'editor', 'tree', 'host', 'io', 'copy'].flatMap((m) => [`../${m}`, `../${m}/*`]),
              message: 'MOD-Worker imports only MOD-Core and @codemirror/state.',
            },
          ],
        },
      ],
    },
  },
  {
    // The boot script is a classic inline script.
    files: ['src/host/boot.js'],
    languageOptions: { sourceType: 'script' },
    rules: { 'no-empty': 'off', 'no-var': 'off', '@typescript-eslint/no-unused-vars': 'off' },
  },
);

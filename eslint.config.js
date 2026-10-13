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
  ['caches', 'PRN-01: nothing is persisted (Cache Storage belongs to /sw.js only, ADR-0012)'],
  ['BroadcastChannel', 'PRN-01: nothing leaves this page'],
  ['open', 'INV-02: no navigation that could carry content'],
].map(([name, message]) => ({ name, message }));

// Windows outside the tool: only MOD-Host may reach them (ADR-0008 §3, INV-02).
const OTHER_WINDOWS = ['parent', 'top', 'opener'];
const OTHER_WINDOW_GLOBALS = OTHER_WINDOWS.map((name) => ({
  name,
  message: 'Only MOD-Host may reach other windows (ADR-0008).',
}));
const OTHER_WINDOW_PROPERTIES = ['window', 'self', 'globalThis'].flatMap((object) =>
  OTHER_WINDOWS.map((property) => ({ object, property, message: 'Only MOD-Host may reach other windows (ADR-0008).' })),
);

const NETWORK_PROPERTIES = [
  { object: 'navigator', property: 'sendBeacon', message: 'INV-02: no network requests from the tool' },
  { object: 'window', property: 'fetch', message: 'INV-02: no network requests from the tool' },
  { object: 'self', property: 'fetch', message: 'INV-02: no network requests from the tool' },
  { object: 'globalThis', property: 'fetch', message: 'INV-02: no network requests from the tool' },
  { object: 'document', property: 'cookie', message: 'PRN-01: nothing is persisted' },
  { object: 'window', property: 'localStorage', message: 'PRN-01: nothing is persisted' },
  { object: 'self', property: 'importScripts', message: 'INV-02: no remote scripts' },
  { object: 'navigator', property: 'storage', message: 'PRN-01: nothing is persisted' },
  { object: 'window', property: 'open', message: 'INV-02: no navigation that could carry content' },
  { object: 'location', property: 'assign', message: 'INV-02: no navigation that could carry content' },
  { object: 'location', property: 'replace', message: 'INV-02: no navigation that could carry content' },
];

// Navigation by assignment (CSP has no navigate-to), and postMessage to another window.
const NAVIGATION_SYNTAX = [
  "AssignmentExpression[left.type='Identifier'][left.name='location']",
  "AssignmentExpression[left.property.name='location']",
  "AssignmentExpression[left.object.name='location']",
  "AssignmentExpression[left.object.property.name='location']",
  "CallExpression[callee.object.property.name='location'][callee.property.name=/^(assign|replace)$/]",
].map((selector) => ({ selector, message: 'INV-02: no navigation that could carry content.' }));
const OTHER_WINDOW_POST = [
  "CallExpression[callee.property.name='postMessage'][callee.object.name=/^(parent|top|opener)$/]",
  "CallExpression[callee.property.name='postMessage'][callee.object.property.name=/^(parent|top|opener)$/]",
].map((selector) => ({ selector, message: 'Only MOD-Host may post to another window (ADR-0008).' }));

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
      'no-restricted-globals': ['error', ...NETWORK_AND_STORAGE, ...OTHER_WINDOW_GLOBALS],
      'no-restricted-properties': ['error', ...NETWORK_PROPERTIES, ...OTHER_WINDOW_PROPERTIES],
      'no-restricted-syntax': ['error', ...NAVIGATION_SYNTAX, ...OTHER_WINDOW_POST],
    },
  },
  {
    // MOD-Host owns the parent-window channel; every other ban still applies.
    files: ['src/host/**'],
    rules: {
      'no-restricted-globals': ['error', ...NETWORK_AND_STORAGE],
      'no-restricted-properties': ['error', ...NETWORK_PROPERTIES],
      'no-restricted-syntax': ['error', ...NAVIGATION_SYNTAX],
    },
  },
  {
    // The offline service worker (ADR-0012) is the one place that may use Cache Storage and
    // forward the browser's own requests; it never runs in the page.
    files: ['src/host/sw.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...NETWORK_AND_STORAGE.filter(({ name }) => name !== 'fetch' && name !== 'caches'),
      ],
    },
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

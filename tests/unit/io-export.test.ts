// MOD-IO copy and download (F-007): RULE-10 file names, the clipboard outcomes ("copied",
// "blocked", or the export's own failure) with a fake clipboard, and the worker export the copy
// and download use (line ending, progress, cancel).
import { describe, expect, it } from 'vitest';
import { copyBlob, download, downloadName, type ClipboardEnv } from '../../src/io';
import { WorkerEngine } from '../../src/worker/engine';
import type { FromWorker } from '../../src/worker/protocol';

describe('RULE-10 download file name', () => {
  it('F-007.AC2 RULE-10 a document from orders.json keeps the file name after beautify', () => {
    expect(downloadName('orders.json', 'beautify')).toBe('orders.json');
    expect(downloadName('orders.json', 'minify')).toBe('orders.json');
  });

  it('F-007.AC3 RULE-10 a pasted document last minified is named minified.json', () => {
    expect(downloadName(null, 'minify')).toBe('minified.json');
  });

  it('RULE-10 a pasted document last beautified is named formatted.json, otherwise document.json', () => {
    expect(downloadName(null, 'beautify')).toBe('formatted.json');
    expect(downloadName(null, 'reindent')).toBe('document.json');
    expect(downloadName(null, 'clear')).toBe('document.json');
    expect(downloadName(null, null)).toBe('document.json');
    expect(downloadName('', null)).toBe('document.json');
  });
});

/** A fake async clipboard recording the text of every written item. */
function fakeClipboard(mode: 'ok' | 'deny' | 'deny-late' = 'ok') {
  const writes: string[] = [];
  class Item {
    constructor(readonly data: Record<string, Promise<Blob> | Blob>) {}
    getType(type: string) {
      return Promise.resolve(this.data[type]!);
    }
  }
  const env: ClipboardEnv = {
    ClipboardItem: Item as unknown as typeof ClipboardItem,
    clipboard: {
      write: async (items: ClipboardItems) => {
        if (mode === 'deny') throw new DOMException('denied', 'NotAllowedError');
        const blob = await (items[0] as unknown as Item).getType('text/plain');
        if (mode === 'deny-late') throw new DOMException('too large', 'NotAllowedError');
        expect(blob.type).toBe('text/plain');
        writes.push(await blob.text());
      },
    },
  };
  return { env, writes };
}

describe('MOD-IO clipboard', () => {
  it('F-007.AC1 F-007.R1 the whole document is written as plain text and reported "copied"', async () => {
    const { env, writes } = fakeClipboard();
    const outcome = await copyBlob(
      Promise.resolve(new Blob(['{\r\n  "a": 1\r\n}'], { type: 'application/json' })),
      env,
    );
    expect(outcome).toBe('copied');
    expect(writes).toEqual(['{\r\n  "a": 1\r\n}']);
  });

  it('F-007.AC4 F-007.R3 a refused write is reported "blocked"', async () => {
    const { env } = fakeClipboard('deny');
    expect(await copyBlob(Promise.resolve(new Blob(['[1]'])), env)).toBe('blocked');
  });

  it('F-007.R3 a write refused after the text was handed over (WebKit above ~120 MB, D-025) is "blocked"', async () => {
    const { env } = fakeClipboard('deny-late');
    expect(await copyBlob(Promise.resolve(new Blob(['[1]'])), env)).toBe('blocked');
  });

  it('F-007.R3 no clipboard API in the environment is reported "blocked"', async () => {
    expect(await copyBlob(Promise.resolve(new Blob(['[1]'])), { clipboard: undefined, ClipboardItem: undefined })).toBe(
      'blocked',
    );
    const throwing: ClipboardEnv = {
      ClipboardItem: class {
        constructor() {
          throw new TypeError('unsupported');
        }
      } as unknown as typeof ClipboardItem,
      clipboard: { write: () => Promise.resolve() },
    };
    expect(await copyBlob(Promise.resolve(new Blob(['[1]'])), throwing)).toBe('blocked');
  });

  it('F-007.R6 a failed or cancelled export is passed on, not reported as "blocked"', async () => {
    const { env } = fakeClipboard();
    const failure = new Error('cancelled');
    await expect(copyBlob(Promise.reject(failure), env)).rejects.toBe(failure);
  });
});

describe('MOD-IO download', () => {
  it('F-007.R2 F-007.R4 the Blob is saved through a local object URL under the given name, then revoked', async () => {
    const clicked: { href: string; download: string }[] = [];
    const revoked: string[] = [];
    const anchor = {
      href: '',
      download: '',
      style: {} as Record<string, string>,
      click() {
        clicked.push({ href: this.href, download: this.download });
      },
      remove() {},
    };
    const env = {
      createElement: () => anchor as unknown as HTMLAnchorElement,
      append: () => undefined,
      createObjectURL: () => 'blob:http://localhost:4173/1234',
      revokeObjectURL: (u: string) => revoked.push(u),
      revokeAfterMs: 0,
    };
    download(new Blob(['{}']), 'orders.json', env);
    expect(clicked).toEqual([{ href: 'blob:http://localhost:4173/1234', download: 'orders.json' }]);
    await new Promise((r) => setTimeout(r, 5));
    expect(revoked).toEqual(['blob:http://localhost:4173/1234']);
  });
});

describe('MOD-Worker export for copy and download', () => {
  function engineWith(text: string) {
    const out: FromWorker[] = [];
    const engine = new WorkerEngine((m) => out.push(m));
    engine.handle({ type: 'seed', phase: 'begin', version: 1 });
    // the editor re-seeds in ~1 M-unit chunks (MOD-Editor `chunks()`)
    for (let i = 0; i < text.length; i += 1 << 20)
      engine.handle({ type: 'seed', phase: 'chunk', version: 1, text: text.slice(i, i + (1 << 20)) });
    engine.handle({ type: 'seed', phase: 'end', version: 1 });
    return { engine, out };
  }

  it('F-007.AC1 RULE-10 the export is the text exactly as shown, joined with the document line ending, UTF-8', async () => {
    const { engine, out } = engineWith('{\n  "é": "😀"\n}');
    engine.handle({ type: 'job', jobId: 7, job: { kind: 'export', version: 1, eol: '\r\n' } });
    await engine.idle();
    const m = out.find((x) => x.type === 'blob');
    expect(m?.type).toBe('blob');
    if (m?.type !== 'blob') return;
    expect(new Uint8Array(await m.blob.arrayBuffer())).toEqual(new TextEncoder().encode('{\r\n  "é": "😀"\r\n}'));
  });

  it('F-007.AC8 F-007.R6 a large export reports progress and can be cancelled', async () => {
    const line = '{"id": 123456, "name": "item", "ok": true},\n';
    const { engine, out } = engineWith(line.repeat(Math.ceil((8 << 20) / line.length)));
    engine.handle({ type: 'job', jobId: 1, job: { kind: 'export', version: 1, eol: '\n' } });
    await engine.idle();
    expect(out.filter((m) => m.type === 'progress' && m.jobId === 1).length).toBeGreaterThan(1);
    engine.handle({ type: 'job', jobId: 2, job: { kind: 'export', version: 1, eol: '\n' } });
    while (!out.some((m) => m.type === 'progress' && m.jobId === 2)) await new Promise((r) => setTimeout(r, 1));
    engine.handle({ type: 'cancel', jobId: 2 });
    await engine.idle();
    expect(out.find((m) => 'jobId' in m && m.jobId === 2 && m.type !== 'progress')).toMatchObject({
      type: 'failed',
      reason: 'cancelled',
    });
  });
});

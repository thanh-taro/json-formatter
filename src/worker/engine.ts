// MOD-Worker engine (ADR-0005 §2): the compact mirror, one job at a time, cooperative
// cancellation in ~16 ms / ~1 MB slices yielding through a MessageChannel tick, file and Blob
// reading in 1 MB `slice().arrayBuffer()` windows, export Blobs. DOM-free and transport-free
// (`post` is injected) so it runs under Vitest in Node as well as in the module worker.
import { ChangeSet } from '@codemirror/state';
import {
  detectUnit,
  IndentScanner,
  Reindenter,
  indentStyle,
  reindentDelta,
  reindentIsNoop,
  isLargeTier,
  LineBreakScanner,
  tierOf,
  PositionResolver,
  positionsOf,
  resultOf,
  TreeIndex,
  Validator,
  GROUP,
  type ContainerRef,
  type FormatMode,
  type IndentStyle,
  type LineEnding,
  type SkipTable,
  type SourceUnit,
  type ValidationOutcome,
} from '../core';
import { Mirror, MirrorBuilder } from './mirror';
import type { FailReason, FromWorker, JobSpec, TextFacts, ToWorker } from './protocol';

export const SLICE_MS = 16;
export const SLICE_UNITS = 1 << 20;
/** Blob read window (WebKit cannot stream()/arrayBuffer() in-memory Blobs above ~100–120 MB). */
export const READ_BYTES = 1 << 20;
/** Text forwarded to the main thread per message, at most. */
const FORWARD_UNITS = 1 << 20;
/** First input piece of a format job; it adapts to the work each piece takes. */
const FORMAT_PIECE_MIN = 1 << 10;
/** ADR-0005 §2: validation is immediate below ~1 MB, debounced by idle time above. */
export const VALIDATE_IMMEDIATE_UNITS = 1 << 20;
export const VALIDATE_DEBOUNCE_MS = 200;
/** ADR-0007 §2: background checkpoint fill runs in slices of at most this long. */
export const FILL_SLICE_MS = 8;
/** Children scanned per checkpoint-fill step (a few hundred KB at most). */
const FILL_STEP = 1000;

type Post = (msg: FromWorker, transfer?: Transferable[]) => void;

class Cancelled extends Error {}
/** The document changed while the job ran: its result would describe stale text (INV-05). */
class Superseded extends Cancelled {}
/** The fatal decoder rejected the bytes (RULE-13); only this is reported as `encoding`. */
class EncodingError extends Error {}
/** Beautify/minify refused an invalid document (F-002.R4, F-003.R3). */
class InvalidDocument extends Error {}

/** Yields to the event loop without the 4 ms timer clamp, so `cancel`/`edit` get through. */
/** `chunk` in pieces of at most one slice of input (mirror chunks may reach 4 M units). */
function* pieces(chunks: Iterable<string>): Generator<string> {
  for (const c of chunks) {
    if (c.length <= SLICE_UNITS) yield c;
    else for (let i = 0; i < c.length; i += SLICE_UNITS) yield c.slice(i, i + SLICE_UNITS);
  }
}

function yieldTick(): Promise<void> {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      resolve();
    };
    ch.port2.postMessage(0);
  });
}

/** Time-slice bookkeeping for one job. */
class Slicer {
  private start: number;
  private units = 0;
  constructor(
    private readonly engine: WorkerEngine,
    private readonly jobId: number,
    private readonly onSliceEnd: () => void,
    private readonly stale: () => boolean = () => false,
  ) {
    this.start = engine.now();
  }

  /** Call after each unit of work; yields at the end of a slice (≤ 16 ms or ≤ 1 MB of input). */
  async step(units: number, fraction: () => number): Promise<void> {
    this.units += units;
    if (this.engine.now() - this.start < SLICE_MS && this.units < SLICE_UNITS) return;
    this.onSliceEnd();
    this.engine.post({ type: 'progress', jobId: this.jobId, fraction: fraction() });
    await yieldTick();
    this.engine.throwIfCancelled(this.jobId);
    if (this.stale()) throw new Superseded('document changed');
    this.start = this.engine.now();
    this.units = 0;
  }
}

/** Batches decoded text into ≤ 1 M-unit strings posted at the end of each slice. */
class Forwarder {
  private buf: string[] = [];
  private n = 0;
  constructor(
    private readonly engine: WorkerEngine,
    private readonly jobId: number,
  ) {}
  add(s: string): void {
    if (!s) return;
    this.buf.push(s);
    this.n += s.length;
    if (this.n >= FORWARD_UNITS) this.flush();
  }
  flush(): void {
    if (!this.n) return;
    this.engine.post({
      type: 'chunk',
      jobId: this.jobId,
      text: this.buf.length === 1 ? this.buf[0]! : this.buf.join(''),
    });
    this.buf = [];
    this.n = 0;
  }
}

/** Streamed input of an insertText job. */
class TextInbox {
  private queue: string[] = [];
  private ended = false;
  private wake: (() => void) | null = null;
  put(text: string, end: boolean): void {
    if (text) this.queue.push(text);
    if (end) this.ended = true;
    this.wake?.();
  }
  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    for (;;) {
      const next = this.queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (this.ended) return;
      await new Promise<void>((r) => (this.wake = r));
      this.wake = null;
    }
  }
}

function factsOf(scan: LineBreakScanner, length: number): TextFacts {
  scan.end();
  return {
    length,
    breaks: { ...scan.counts },
    nonBreakBytes: scan.nonBreakBytes,
    endsWithLineBreak: scan.endsWithLineBreak,
  };
}

function reasonOf(e: unknown): FailReason {
  if (e instanceof Cancelled) return 'cancelled';
  // Implements: RULE-13 — only failures of the fatal decoder itself (security review MINOR-2).
  if (e instanceof EncodingError) return 'encoding';
  if (e instanceof InvalidDocument) return 'invalid';
  // Implements: F-001.R9 — allocation failures become "too large" instead of a crash.
  if (e instanceof RangeError) return 'too-large';
  if (e instanceof Error && /memory|allocation/i.test(e.message)) return 'too-large';
  // F-001 edge case: the browser could not read the file (moved, deleted, no permission).
  if (e instanceof DOMException && ['NotReadableError', 'NotFoundError', 'SecurityError'].includes(e.name))
    return 'unreadable';
  return 'internal';
}

interface QueuedJob {
  jobId: number;
  /** Jobs with the same key supersede each other while queued (e.g. validation of stale versions). */
  key?: string | undefined;
  run: () => Promise<void>;
}

export class WorkerEngine {
  mirror: Mirror = Mirror.empty;
  version = 0;
  /** The result of the last finished load/insert job, until `adopt` or `cancel`; a load also
   * carries the validation done while reading (ADR-0005 §2). */
  private pending: { jobId: number; mirror: Mirror; outcome?: ValidationOutcome } | null = null;
  /** The last validation outcome and the mirror it describes (reused when nothing changed). */
  private validated: { mirror: Mirror; outcome: ValidationOutcome } | null = null;
  /** ADR-0007 §1: the skip table of the current mirror, built during validation (for the tree). */
  skipTable: { mirror: Mirror; table: SkipTable } | null = null;
  /** ADR-0007 §2: tree queries of the current mirror (with its checkpoints). */
  private tree: { mirror: Mirror; index: TreeIndex } | null = null;
  /** Containers whose checkpoints are still being filled, most recently expanded last (LIFO). */
  private fillStack: ContainerRef[] = [];
  private fillTimer: ReturnType<typeof setTimeout> | null = null;
  /** A validation waiting out its debounce before it joins the queue (it holds no job slot). */
  private delayed: { jobId: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private seedBuilder: MirrorBuilder | null = null;
  private readonly cancelled = new Set<number>();
  private readonly inboxes = new Map<number, TextInbox>();
  private readonly queue: QueuedJob[] = [];
  private running = false;
  private runningJob: number | null = null;
  /** Messages that arrive while a re-seed is in flight, applied after its `end` (review M1). */
  private deferred: ToWorker[] = [];

  /**
   * @param now the clock that time slices and format piece sizes are measured with; injectable so
   *   tests can make slicing deterministic regardless of machine speed.
   */
  constructor(
    readonly post: Post,
    readonly now: () => number = () => performance.now(),
  ) {}

  throwIfCancelled(jobId: number): void {
    if (this.cancelled.has(jobId)) throw new Cancelled();
  }

  /** Test helper: resolves when the job queue is empty. */
  async idle(): Promise<void> {
    while (this.running || this.queue.length || this.delayed) await yieldTick();
  }

  handle(msg: ToWorker): void {
    // While re-seeding, the mirror is incomplete: edits, adopts and jobs wait for the seed `end`.
    if (this.seedBuilder && msg.type !== 'seed' && msg.type !== 'cancel' && msg.type !== 'text') {
      this.deferred.push(msg);
      return;
    }
    switch (msg.type) {
      case 'job':
        this.enqueue(msg.jobId, msg.job);
        break;
      case 'text':
        // Only for a queued or running insertText job; text for a finished, failed or
        // cancelled job is dropped at once (review M6).
        this.inboxes.get(msg.jobId)?.put(msg.text, msg.end);
        break;
      case 'cancel': {
        const inbox = this.inboxes.get(msg.jobId);
        this.inboxes.delete(msg.jobId);
        inbox?.put('', true);
        const queued = this.queue.some((j) => j.jobId === msg.jobId);
        // Remembered only while the job still has to see it (review m9: no unbounded set).
        if (queued || this.runningJob === msg.jobId) this.cancelled.add(msg.jobId);
        if (this.delayed?.jobId === msg.jobId) this.dropDelayed();
        if (this.pending?.jobId === msg.jobId) {
          this.pending = null;
          this.post({ type: 'failed', jobId: msg.jobId, reason: 'cancelled' });
        }
        break;
      }
      case 'edit':
        try {
          this.mirror = this.mirror.apply(ChangeSet.fromJSON(msg.changes));
          this.version = msg.version;
          this.forgetDocument();
        } catch (e) {
          // Out of sync (or out of memory): the client restarts and re-seeds (ADR-0005 §4).
          this.post({ type: 'failed', jobId: -1, reason: 'internal', detail: String(e) });
        }
        break;
      case 'adopt': {
        if (this.pending?.jobId !== msg.jobId) {
          // The main thread committed text the mirror does not have: re-seed (review m1).
          this.post({ type: 'failed', jobId: -1, reason: 'internal', detail: 'nothing to adopt' });
          break;
        }
        this.mirror = this.pending.mirror;
        this.forgetDocument();
        if (this.pending.outcome) {
          this.validated = { mirror: this.mirror, outcome: this.pending.outcome };
          if (this.pending.outcome.skipTable)
            this.skipTable = { mirror: this.mirror, table: this.pending.outcome.skipTable };
        }
        this.pending = null;
        this.version = msg.version;
        this.post({ type: 'adopted', jobId: msg.jobId, version: msg.version });
        break;
      }
      case 'seed':
        if (msg.phase === 'begin') {
          this.seedBuilder = new MirrorBuilder();
          this.pending = null;
        } else if (msg.phase === 'chunk') this.seedBuilder?.push(msg.text ?? '');
        else if (this.seedBuilder) {
          this.mirror = this.seedBuilder.finish();
          this.version = msg.version;
          this.forgetDocument();
          this.seedBuilder = null;
          const later = this.deferred;
          this.deferred = [];
          for (const m of later) this.handle(m);
        }
        break;
    }
  }

  /**
   * Review F-005 M2 (NFR-04): results that describe an earlier mirror are dropped as soon as the
   * mirror changes, so a replaced document is never kept alive through them.
   */
  private forgetDocument(): void {
    this.validated = null;
    this.skipTable = null;
    this.tree = null;
    this.fillStack = [];
  }

  private dropDelayed(detail?: string): void {
    const d = this.delayed;
    if (!d) return;
    clearTimeout(d.timer);
    this.delayed = null;
    this.post(
      detail === undefined
        ? { type: 'failed', jobId: d.jobId, reason: 'cancelled' }
        : { type: 'failed', jobId: d.jobId, reason: 'cancelled', detail },
    );
  }

  private enqueue(jobId: number, job: JobSpec): void {
    let run: () => Promise<void>;
    switch (job.kind) {
      case 'loadFile':
        run = () => this.load(jobId, job.file);
        break;
      case 'loadBlob':
        run = () => this.load(jobId, job.blob);
        break;
      case 'insertText': {
        this.inboxes.set(jobId, new TextInbox());
        run = () => this.insertText(jobId, job.version, job.from, job.to);
        break;
      }
      case 'export': {
        // Capture the mirror now: later edits must not change what is exported.
        const doc = this.mirror;
        const span = job.span;
        // A span belongs to its version (F-006.R5): a newer mirror cannot serve it (INV-05).
        const stale = span !== undefined && job.version !== this.version;
        run = () =>
          stale
            ? Promise.resolve(this.fail(jobId, new Superseded('document changed')))
            : this.exportMirror(jobId, doc, job.eol, span);
        break;
      }
      case 'treeOpen':
        run = () => this.treeOpen(jobId, job.version);
        break;
      case 'treeChildren':
        run = () => this.treeChildren(jobId, job.version, job.container, job.from, job.count);
        break;
      case 'validate':
        run = () => this.validate(jobId, job.version, job.lineEnding, job.skipTable ?? false);
        break;
      case 'reindentPlan':
        run = () => this.reindentPlan(jobId, job.version, job.target);
        break;
      case 'reindent':
        run = () => this.reindent(jobId, job.version, job.target, job.unit);
        break;
      case 'format':
        run = () => this.format(jobId, job.version, job.mode, job.lineEnding, job.nonBreakBytes);
        break;
    }
    const key = job.supersedes;
    if (key !== undefined) {
      // Extension point (F-005): newer work of the same kind drops queued stale work.
      for (const stale of this.queue.filter((j) => j.key === key)) {
        this.queue.splice(this.queue.indexOf(stale), 1);
        this.inboxes.delete(stale.jobId);
        this.post({ type: 'failed', jobId: stale.jobId, reason: 'cancelled', detail: 'superseded' });
      }
      if (job.kind === 'validate') this.dropDelayed('superseded');
    }
    const entry = { jobId, key, run };
    // ADR-0005 §2: validation above ~1 MB waits for ~200 ms of quiet first — on a timer, so it
    // never holds the job slot that tool operations need (review F-005 m4).
    if (
      job.kind === 'validate' &&
      this.mirror.length > VALIDATE_IMMEDIATE_UNITS &&
      this.validated?.mirror !== this.mirror
    ) {
      this.delayed = {
        jobId,
        timer: setTimeout(() => {
          this.delayed = null;
          this.queue.push(entry);
          void this.drain();
        }, VALIDATE_DEBOUNCE_MS),
      };
      return;
    }
    this.queue.push(entry);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let job = this.queue.shift(); job; job = this.queue.shift()) {
        if (this.cancelled.delete(job.jobId)) {
          this.inboxes.delete(job.jobId);
          this.post({ type: 'failed', jobId: job.jobId, reason: 'cancelled' });
          continue;
        }
        this.runningJob = job.jobId;
        try {
          await job.run();
        } finally {
          this.cancelled.delete(job.jobId);
          this.runningJob = null;
        }
      }
    } finally {
      this.running = false;
    }
  }

  private fail(jobId: number, e: unknown): void {
    this.inboxes.delete(jobId);
    this.post({ type: 'failed', jobId, reason: reasonOf(e), detail: e instanceof Error ? e.message : String(e) });
  }

  /** Implements: F-001.R2, F-001.R3, F-001.R5, F-001.R8, F-001.R9; RULE-13 (fatal UTF-8, BOM kept). */
  private async load(jobId: number, source: Blob): Promise<void> {
    try {
      this.pending = null;
      // ignoreBOM keeps a leading byte-order mark as the first character (RULE-03, RULE-13).
      const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
      const scan = new LineBreakScanner();
      const total = source.size;
      // ADR-0005 §2: validate while reading (with the skip table in the large tiers).
      const validator = new Validator({ skipTable: isLargeTier(tierOf(total)), lengthHint: total });
      const builder = new MirrorBuilder((text) => validator.feed(text));
      const fwd = new Forwarder(this, jobId);
      let offset = 0;
      const slicer = new Slicer(this, jobId, () => fwd.flush());
      const decode = (bytes?: Uint8Array): string => {
        try {
          return bytes ? decoder.decode(bytes, { stream: true }) : decoder.decode();
        } catch (e) {
          throw e instanceof TypeError ? new EncodingError(e.message) : e;
        }
      };
      const take = (text: string) => {
        if (!text) return;
        scan.feed(text);
        builder.push(text);
        fwd.add(text);
      };
      while (offset < total) {
        const end = Math.min(total, offset + READ_BYTES);
        const bytes = new Uint8Array(await source.slice(offset, end).arrayBuffer());
        this.throwIfCancelled(jobId);
        take(decode(bytes));
        offset = end;
        await slicer.step(bytes.length, () => offset / total);
      }
      take(decode());
      fwd.flush();
      const mirror = builder.finish();
      this.pending = { jobId, mirror, outcome: validator.end() };
      this.post({ type: 'loaded', jobId, facts: factsOf(scan, mirror.length) });
    } catch (e) {
      this.fail(jobId, e);
    }
  }

  /**
   * Implements: F-005.R1, F-005.R7 — validates the mirror at `version` in ≤ 16 ms / 1 MB slices
   * (debounced above ~1 MB before it is queued), then resolves the reported positions (ENT-Issue). Dropped as soon
   * as the document changes (INV-05: a result always describes the text it was computed for);
   * the outcome of an unchanged mirror (e.g. validated while loading) is reused.
   */
  private async validate(jobId: number, version: number, lineEnding: LineEnding, skipTable: boolean): Promise<void> {
    try {
      const stale = () => this.version !== version;
      if (stale()) throw new Superseded('document changed');
      const doc = this.mirror;
      const total = Math.max(1, doc.length);
      const slicer = new Slicer(this, jobId, () => undefined, stale);
      let outcome = this.validated?.mirror === doc ? this.validated.outcome : null;
      if (!outcome) {
        const validator = new Validator({ skipTable, lengthHint: doc.length });
        let done = 0;
        for (const piece of pieces(doc.chunks)) {
          if (!validator.feed(piece)) break;
          done += piece.length;
          await slicer.step(piece.length, () => (0.9 * done) / total);
        }
        outcome = validator.end();
        this.validated = { mirror: doc, outcome };
      }
      this.skipTable = outcome.skipTable ? { mirror: doc, table: outcome.skipTable } : null;
      const resolver = new PositionResolver(positionsOf(outcome), lineEnding);
      let done = 0;
      if (!resolver.done) {
        for (const piece of pieces(doc.chunks)) {
          if (resolver.feed(piece)) break;
          done += piece.length;
          await slicer.step(piece.length, () => 0.9 + (0.1 * done) / total);
        }
      }
      this.post({ type: 'validation', jobId, version, result: resultOf(outcome, resolver.end()) });
    } catch (e) {
      this.fail(jobId, e);
    }
  }

  /**
   * Implements: F-004.R1, F-004.R3, F-004.R5, F-004.R6, RULE-09 — re-indent pass 1 on the mirror
   * at `version` (valid or not) in ≤ 16 ms / 1 MB slices: the source unit and the exact change
   * in length of the result for `target` (so the RULE-02 check can run before converting,
   * F-004.R7), or `notIndented` when no line is indented.
   */
  private async reindentPlan(jobId: number, version: number, style: IndentStyle): Promise<void> {
    try {
      const target = indentStyle(style); // RULE-01: never an invalid width (review MJ-1)
      if (version !== this.version) throw new Superseded('document changed');
      const doc = this.mirror;
      const total = Math.max(1, doc.length);
      const slicer = new Slicer(
        this,
        jobId,
        () => undefined,
        () => this.version !== version,
      );
      const scan = new IndentScanner();
      let done = 0;
      for (const piece of pieces(doc.chunks)) {
        scan.feed(piece);
        done += piece.length;
        await slicer.step(piece.length, () => done / total);
      }
      const stats = scan.end();
      const unit = detectUnit(stats);
      if (!unit) this.post({ type: 'notIndented', jobId });
      else
        this.post({
          type: 'reindentPlan',
          jobId,
          version,
          unit,
          delta: reindentDelta(stats, unit, target),
          unchanged: reindentIsNoop(stats, unit, target),
        });
    } catch (e) {
      this.fail(jobId, e);
    }
  }

  /**
   * Implements: F-004.R1, F-004.R2, F-004.R6, RULE-09 — re-indent pass 2: converts the mirror at
   * `version` into a pending mirror (adopted on commit, INV-03) and streams the text to the main
   * thread at the end of each slice; only leading indentation changes.
   */
  private async reindent(jobId: number, version: number, style: IndentStyle, unit: SourceUnit): Promise<void> {
    try {
      const target = indentStyle(style);
      this.pending = null;
      if (version !== this.version) throw new Superseded('document changed');
      const doc = this.mirror;
      const total = Math.max(1, doc.length);
      const fwd = new Forwarder(this, jobId);
      const scan = new LineBreakScanner();
      const builder = new MirrorBuilder();
      const slicer = new Slicer(
        this,
        jobId,
        () => fwd.flush(),
        () => this.version !== version,
      );
      const conv = new Reindenter(unit, target);
      const take = (text: string) => {
        if (!text) return;
        scan.feed(text);
        builder.push(text);
        fwd.add(text);
      };
      let done = 0;
      for (const piece of pieces(doc.chunks)) {
        take(conv.feed(piece));
        done += piece.length;
        await slicer.step(piece.length, () => done / total);
      }
      take(conv.end());
      fwd.flush();
      const mirror = builder.finish();
      this.pending = { jobId, mirror };
      this.post({ type: 'loaded', jobId, facts: factsOf(scan, mirror.length) });
    } catch (e) {
      this.fail(jobId, e);
    }
  }

  /**
   * Implements: F-002.R1, F-002.R6, F-003.R1, F-003.R5 (ADR-0005 §2) — beautifies or minifies the
   * mirror at `version` with MOD-Core's formatting validator, in ≤ 16 ms slices that yield so
   * `cancel` gets through. The input is fed in pieces whose size adapts to the time they take, so
   * a slice stays short even when output expands enormously (10,000 levels deep: 20 KB → 200 MB).
   * Output chunks (flat strings) build the pending mirror — adopted on commit, never sent back —
   * and are forwarded at the end of each slice. An invalid document fails with `invalid` and
   * leaves nothing pending (INV-03).
   */
  private async format(
    jobId: number,
    version: number,
    mode: FormatMode,
    lineEnding: LineEnding,
    nonBreakBytes: number,
  ): Promise<void> {
    try {
      this.pending = null;
      const stale = () => this.version !== version;
      if (stale()) throw new Superseded('document changed');
      const doc = this.mirror;
      const total = Math.max(1, doc.length);
      const builder = new MirrorBuilder();
      const fwd = new Forwarder(this, jobId);
      const validator = new Validator({
        warnings: false,
        format: {
          mode,
          // the mirror and the editor hold one '\n' per break; the document keeps its line ending
          eol: '\n',
          chunkUnits: FORWARD_UNITS,
          emit: (chunk) => {
            builder.push(chunk);
            fwd.add(chunk);
          },
        },
      });
      const slicer = new Slicer(this, jobId, () => fwd.flush(), stale);
      let piece = FORMAT_PIECE_MIN;
      let done = 0;
      outer: for (const chunk of doc.chunks) {
        for (let at = 0; at < chunk.length;) {
          const part = at === 0 && piece >= chunk.length ? chunk : chunk.slice(at, at + piece);
          const t0 = this.now();
          if (!validator.feed(part)) break outer;
          const ms = this.now() - t0;
          // ~1–4 ms of work per piece: expansion-heavy input gets small pieces
          if (ms > 4) piece = Math.max(1, piece >> 1);
          else if (ms < 1 && piece < SLICE_UNITS) piece <<= 1;
          at += part.length;
          done += part.length;
          await slicer.step(part.length, () => done / total);
        }
      }
      const outcome = validator.end();
      if (outcome.validity !== 'valid' || !outcome.output) throw new InvalidDocument(outcome.error?.code ?? 'invalid');
      fwd.flush();
      const mirror = builder.finish();
      const out = outcome.output;
      this.pending = { jobId, mirror };
      this.post({
        type: 'formatted',
        jobId,
        facts: {
          length: mirror.length,
          breaks: lineEnding === 'crlf' ? { lf: 0, crlf: out.breaks, cr: 0 } : { lf: out.breaks, crlf: 0, cr: 0 },
          // tokens keep their bytes, blanks are dropped, generated indentation is ASCII
          nonBreakBytes: nonBreakBytes - (outcome.layout?.blanks ?? 0) + out.generated,
          endsWithLineBreak: mode.kind === 'beautify' && (outcome.layout?.endsWithLineBreak ?? false),
        },
      });
    } catch (e) {
      this.fail(jobId, e);
    }
  }

  /** Implements: F-001.R4 (large paste path, ADR-0006 §2). */
  private async insertText(jobId: number, version: number, from: number, to: number): Promise<void> {
    const inbox = this.inboxes.get(jobId)!;
    try {
      this.pending = null;
      if (version !== this.version || to > this.mirror.length)
        throw new Error(`stale insert (v${version} ≠ v${this.version})`);
      const base = this.mirror;
      const scan = new LineBreakScanner();
      const builder = new MirrorBuilder();
      builder.pushMirror(base, 0, from);
      const slicer = new Slicer(this, jobId, () => undefined);
      for await (const text of inbox) {
        this.throwIfCancelled(jobId);
        scan.feed(text);
        builder.push(text);
        await slicer.step(text.length, () => 0);
      }
      this.throwIfCancelled(jobId);
      builder.pushMirror(base, to, base.length);
      const mirror = builder.finish();
      this.inboxes.delete(jobId);
      this.pending = { jobId, mirror };
      // Facts of the inserted text; `length` is the new document's length (a sanity check).
      this.post({ type: 'loaded', jobId, facts: factsOf(scan, mirror.length) });
    } catch (e) {
      this.fail(jobId, e);
    }
  }

  /**
   * Implements: F-007.R6 (whole document), F-006.R5 / RULE-11 (a node's span, ADR-0007 §5) — a
   * UTF-8 Blob of the text with line breaks written as `eol` (ADR-0006 §3), built in slices.
   */
  private async exportMirror(
    jobId: number,
    doc: Mirror,
    eol: '\n' | '\r\n',
    span?: readonly [number, number],
  ): Promise<void> {
    try {
      const enc = new TextEncoder();
      const parts: Uint8Array<ArrayBuffer>[] = [];
      let done = 0;
      const slicer = new Slicer(this, jobId, () => undefined);
      const [from, to] = span ?? [0, doc.length];
      const total = to - from;
      for (const piece of doc.range(from, to)) {
        const chunk = eol === '\n' ? piece : piece.replace(/\n/g, eol);
        parts.push(enc.encode(chunk));
        done += piece.length;
        await slicer.step(piece.length, () => (total ? done / total : 1));
      }
      const blob = new Blob(parts, { type: 'application/json' });
      this.post({ type: 'blob', jobId, blob });
    } catch (e) {
      this.fail(jobId, e);
    }
  }
  // ---- tree queries (F-006, ADR-0007 §2) ---------------------------------------------------

  /**
   * The tree index of the mirror at `version`: built on the skip table from validation when
   * there is one, otherwise after the standalone structural pass — sliced, cancellable, with
   * progress (ADR-0007 §1, NFR-02). Refuses invalid documents (F-006.R7).
   */
  private async ensureTree(jobId: number, version: number): Promise<TreeIndex> {
    const stale = () => this.version !== version;
    if (stale()) throw new Superseded('document changed');
    const doc = this.mirror;
    if (this.tree?.mirror === doc) return this.tree.index;
    if (this.validated?.mirror === doc && this.validated.outcome.validity !== 'valid')
      throw new InvalidDocument(this.validated.outcome.error?.code ?? 'invalid');
    let table = this.skipTable?.mirror === doc ? this.skipTable.table : null;
    if (!table) {
      const validator = new Validator({ skipTable: true, warnings: false, lengthHint: doc.length });
      const slicer = new Slicer(this, jobId, () => undefined, stale);
      const total = Math.max(1, doc.length);
      let done = 0;
      for (const piece of pieces(doc.chunks)) {
        if (!validator.feed(piece)) break;
        done += piece.length;
        await slicer.step(piece.length, () => done / total);
      }
      const outcome = validator.end();
      if (outcome.validity !== 'valid' || !outcome.skipTable)
        throw new InvalidDocument(outcome.error?.code ?? 'invalid');
      table = outcome.skipTable;
      this.skipTable = { mirror: doc, table };
    }
    const index = new TreeIndex(doc.chunks, table);
    this.tree = { mirror: doc, index };
    return index;
  }

  /** Implements: F-006.R1, F-006.R8 — the root node; allocation failures become `too-large`. */
  private async treeOpen(jobId: number, version: number): Promise<void> {
    try {
      const index = await this.ensureTree(jobId, version);
      this.post({ type: 'treeRoot', jobId, version, root: index.root() });
    } catch (e) {
      this.fail(jobId, e);
    }
  }

  /**
   * Implements: F-006.R2, F-006.R3, F-006.R8 — one block of children. A cold scan deep into a
   * huge container first extends its checkpoints in slices that yield (ADR-0007 §2), so edits
   * and cancels interleave; afterwards the container joins the background fill (LIFO).
   */
  private async treeChildren(
    jobId: number,
    version: number,
    c: ContainerRef,
    from: number,
    count: number,
  ): Promise<void> {
    try {
      const index = await this.ensureTree(jobId, version);
      const stale = () => this.version !== version;
      const slicer = new Slicer(this, jobId, () => undefined, stale);
      while (!index.ready(c, from)) {
        index.fill(c, FILL_STEP);
        await slicer.step(0, () => 0);
      }
      const rows = index.children(c, from, Math.min(count, GROUP));
      this.post({ type: 'treeRows', jobId, version, rows });
      if (!index.complete(c)) {
        this.fillStack = this.fillStack.filter((x) => x.s !== c.s);
        this.fillStack.push(c);
        this.scheduleFill();
      }
    } catch (e) {
      this.fail(jobId, e);
    }
  }

  private scheduleFill(delay = 0): void {
    if (this.fillTimer !== null || !this.fillStack.length) return;
    this.fillTimer = setTimeout(() => {
      this.fillTimer = null;
      this.fillSlice();
    }, delay);
  }

  /** ADR-0007 §2: background checkpoint fill in ≤ 8 ms slices, only while no job runs. */
  private fillSlice(): void {
    const tree = this.tree;
    if (!tree || tree.mirror !== this.mirror) {
      this.fillStack = [];
      return;
    }
    if (this.running || this.queue.length) {
      this.scheduleFill(FILL_SLICE_MS / 2);
      return;
    }
    const t0 = performance.now();
    while (this.fillStack.length && performance.now() - t0 < FILL_SLICE_MS) {
      const c = this.fillStack[this.fillStack.length - 1]!;
      if (tree.index.fill(c, FILL_STEP)) this.fillStack.pop();
    }
    this.scheduleFill();
  }
}

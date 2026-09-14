/**
 * Sinks — the redaction boundary wraps WRITERS, not call sites.
 *
 * Every writer here is constructed from a `RedactionBoundary`. A boundary is
 * either `ready` (registry loadable, key loaded, redactor built) or `refused`
 * (with the reason). Writers over a refused boundary throw
 * `RedactionRefusedError` on every write and never invoke the inner writer:
 * the fail-closed rule of the act, "registry/key unloadable → refuse write",
 * holds by construction rather than by every caller remembering it.
 *
 * Three sink classes the act names:
 *   - journal append  — `JournalAppendSink.append(record)`;
 *   - evidence bundle — `EvidenceBundleWriter.write(path, bundle)`;
 *   - harness/fixture log and error paths — `HarnessLogSink.log/error`.
 *
 * Each redacts the VALUE TREE before serialization, so a secret inside a
 * nested field is caught before it is ever a byte on the way out. An inner
 * writer that throws is re-thrown as a `SinkWriteError` carrying the REDACTED
 * message — an error path is a write path too.
 *
 * These are the writers; wiring them under the run-harness CLI, the journal
 * store, and the AE-01 fixture runner is deliberately not done in this lane:
 * doing so without a provisioned key would make those paths refuse every
 * write, which is a live behaviour change the act did not authorize (see the
 * package README, "Not wired").
 */

import { createRedactor, type RedactedError, type RedactionMode, type Redactor } from './redactor.js';
import type { SecretRegistry } from './registry.js';
import type { HmacKeyCustody } from './key-custody.js';

export type RefusalCode =
  | 'registry_unloadable'
  | 'key_absent'
  | 'key_unavailable'
  | 'mode_not_wired'
  | 'redactor_unbuildable';

export class RedactionRefusedError extends Error {
  override readonly name = 'RedactionRefusedError';
  constructor(
    readonly code: RefusalCode,
    readonly detail: string,
  ) {
    super(`redaction boundary refused (${code}): ${detail}`);
  }
}

export class SinkWriteError extends Error {
  override readonly name = 'SinkWriteError';
  constructor(readonly redacted: RedactedError) {
    super(`inner writer failed: ${redacted.message}`);
  }
}

export interface RedactionBoundaryDeps {
  readonly registry: SecretRegistry;
  readonly keyCustody: HmacKeyCustody;
  /** Defaults to `replace`, the only wired mode. */
  readonly mode?: RedactionMode;
}

export type BoundaryState =
  | { readonly kind: 'ready'; readonly redactor: Redactor }
  | { readonly kind: 'refused'; readonly code: RefusalCode; readonly detail: string };

export class RedactionBoundary {
  private constructor(readonly state: BoundaryState) {}

  /**
   * Open a boundary. Never throws: an unopenable boundary is returned in the
   * `refused` state so that writers built over it refuse deterministically.
   */
  static async open(deps: RedactionBoundaryDeps): Promise<RedactionBoundary> {
    if (!deps.registry.isLoadable()) {
      const names = deps.registry.refusedEntries().map((e) => `${e.name} (${e.reason})`).join(', ');
      return new RedactionBoundary({ kind: 'refused', code: 'registry_unloadable', detail: `registry refused: ${names}` });
    }
    let loaded;
    try {
      loaded = await deps.keyCustody.load();
    } catch (error) {
      return new RedactionBoundary({ kind: 'refused', code: 'key_unavailable', detail: error instanceof Error ? error.message : String(error) });
    }
    if (loaded.kind === 'absent') {
      return new RedactionBoundary({ kind: 'refused', code: 'key_absent', detail: loaded.detail });
    }
    if (loaded.kind === 'unavailable') {
      return new RedactionBoundary({ kind: 'refused', code: 'key_unavailable', detail: loaded.detail });
    }
    try {
      const redactor = createRedactor({ mode: deps.mode ?? 'replace', registry: deps.registry, hmacKey: loaded.key });
      return new RedactionBoundary({ kind: 'ready', redactor });
    } catch (error) {
      const code: RefusalCode = error instanceof Error && error.name === 'RedactionModeNotWiredError' ? 'mode_not_wired' : 'redactor_unbuildable';
      return new RedactionBoundary({ kind: 'refused', code, detail: error instanceof Error ? error.message : String(error) });
    }
  }

  get ready(): boolean {
    return this.state.kind === 'ready';
  }

  /** The redactor, or a throw — callers on the write path go through `require()`. */
  require(): Redactor {
    if (this.state.kind === 'refused') {
      throw new RedactionRefusedError(this.state.code, this.state.detail);
    }
    return this.state.redactor;
  }

  journalAppendSink(inner: (line: string) => Promise<void>): JournalAppendSink {
    return new JournalAppendSink(this, inner);
  }

  evidenceBundleWriter(inner: (path: string, content: string) => Promise<void>): EvidenceBundleWriter {
    return new EvidenceBundleWriter(this, inner);
  }

  harnessLogSink(inner: HarnessStreams): HarnessLogSink {
    return new HarnessLogSink(this, inner);
  }
}

async function guarded<T>(boundary: RedactionBoundary, write: (redactor: Redactor) => Promise<T>): Promise<T> {
  const redactor = boundary.require(); // throws RedactionRefusedError before any inner call
  try {
    return await write(redactor);
  } catch (error) {
    if (error instanceof RedactionRefusedError) throw error;
    throw new SinkWriteError(redactor.redactError(error));
  }
}

/** Journal append: one redacted JSON line per record. */
export class JournalAppendSink {
  constructor(
    private readonly boundary: RedactionBoundary,
    private readonly inner: (line: string) => Promise<void>,
  ) {}

  append(record: unknown): Promise<void> {
    return guarded(this.boundary, async (redactor) => {
      const line = `${JSON.stringify(redactor.redactValue(record))}\n`;
      await this.inner(line);
    });
  }
}

/** Evidence bundle: the whole bundle tree is redacted, then serialized. */
export class EvidenceBundleWriter {
  constructor(
    private readonly boundary: RedactionBoundary,
    private readonly inner: (path: string, content: string) => Promise<void>,
  ) {}

  write(path: string, bundle: unknown): Promise<void> {
    return guarded(this.boundary, async (redactor) => {
      const content = `${JSON.stringify(redactor.redactValue(bundle), null, 2)}\n`;
      await this.inner(redactor.redactString(path), content);
    });
  }
}

export interface HarnessStreams {
  out(text: string): void;
  err(text: string): void;
}

/**
 * Harness / fixture log and error paths. Every path redacts: `log` is plain
 * text to the out stream, `err` is plain text to the err stream (v0.1), and
 * `error` flattens an error onto the err stream.
 */
export class HarnessLogSink {
  constructor(
    private readonly boundary: RedactionBoundary,
    private readonly inner: HarnessStreams,
  ) {}

  log(text: string): Promise<void> {
    return guarded(this.boundary, async (redactor) => {
      this.inner.out(redactor.redactString(text));
    });
  }

  /** Redacted plain text to the err stream — guarded exactly like `log`. */
  err(text: string): Promise<void> {
    return guarded(this.boundary, async (redactor) => {
      this.inner.err(redactor.redactString(text));
    });
  }

  error(error: unknown): Promise<RedactedError> {
    return guarded(this.boundary, async (redactor) => {
      const redacted = redactor.redactError(error);
      const line = `${redacted.name}: ${redacted.message}${redacted.stack === null ? '' : `\n${redacted.stack}`}\n`;
      this.inner.err(line);
      return redacted;
    });
  }
}

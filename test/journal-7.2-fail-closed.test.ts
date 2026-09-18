/**
 * Phase 4 stop-gate item 2 (§7.2): a governed command cannot bypass the
 * required journal path.
 *
 * Contract sections under test, per the §10 test map: §1 (singularity) and
 * §5 (command events and the fail-closed rule). §5.1 is the operative
 * clause — a governed command may not be dispatched unless its `journaled`
 * event is durably committed; write failure, timeout, or unavailability
 * means no dispatch, fail closed, never journal-after.
 *
 * The last test in this file is a SOURCE-honesty check. A function that
 * throws cannot prove that no second success path exists; only reading the
 * dispatch module can, and that is what it does.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DispatchError,
  MemoryCommandJournal,
  dispatchGovernedCommand,
  executeWithoutJournal,
  type GovernedCommandRequest,
} from '../packages/journal/src/index.js';
// Test-only: not on the package's public surface, by design.
import { resetActiveJournalForTests } from '../packages/journal/src/store.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DISPATCH_SOURCE = join(REPO_ROOT, 'packages/journal/src/dispatch.ts');

function request(overrides: Partial<GovernedCommandRequest> = {}): GovernedCommandRequest {
  return {
    commandKind: 'planner.invoke',
    argv: ['--goal', 'ship the stop gate'],
    actorId: 'session:test/journal-7.2',
    roleId: 'builder',
    authorizationRef: 'HO-20260831-01',
    repository: 'MADVenturesLLC/founder-os-build-room',
    scopeRef: 'scope/phase4',
    intendedProvider: 'anthropic',
    intendedModel: 'claude-opus-5',
    intendedSurface: 'claude-code',
    recordedAt: '2026-09-17T11:00:00.000000Z',
    commandId: 'cmd_faildosed',
    ...overrides,
  };
}

describe('§7.2 fail-closed dispatch — no bypass of the journal path', () => {
  beforeEach(() => {
    resetActiveJournalForTests();
  });

  afterEach(() => {
    resetActiveJournalForTests();
  });

  it('refuses to dispatch when no journal is open', () => {
    assert.throws(
      () => dispatchGovernedCommand(request()),
      (err: unknown) => err instanceof DispatchError && err.code === 'journal_unavailable',
    );
  });

  it('returns an execution permit only after the journaled row is on the chain', () => {
    const journal = MemoryCommandJournal.open();
    try {
      assert.equal(journal.length, 0);
      const result = dispatchGovernedCommand(request());
      assert.equal(journal.length, 1, 'the journaled row landed before the permit');
      assert.equal(result.executionPermit.journalSeq, '1');
      assert.equal(result.executionPermit.commandId, 'cmd_faildosed');
      assert.equal(result.journalRecord.row.eventType, 'journaled');
      assert.equal(journal.verify().ok, true);
    } finally {
      journal.close();
    }
  });

  it('journals the intended route before contact, per §5.2', () => {
    const journal = MemoryCommandJournal.open();
    try {
      const { journalRecord } = dispatchGovernedCommand(request());
      assert.equal(journalRecord.row.intendedProvider, 'anthropic');
      assert.equal(journalRecord.row.intendedModel, 'claude-opus-5');
      assert.equal(journalRecord.row.intendedSurface, 'claude-code');
      // The observed identity belongs to `dispatched`, never to `journaled`.
      assert.equal(journalRecord.row.provider, undefined);
      assert.equal(journalRecord.row.model, undefined);
      assert.equal(journalRecord.row.executionSurface, undefined);
    } finally {
      journal.close();
    }
  });

  it('yields no permit when the journal append fails', () => {
    const journal = MemoryCommandJournal.open();
    try {
      dispatchGovernedCommand(request());
      journal.corruptChainHashForTest(1, 'c'.repeat(64));
      assert.throws(
        () => dispatchGovernedCommand(request({ commandId: 'cmd_second' })),
        (err: unknown) =>
          err instanceof DispatchError && err.code === 'journal_append_failed',
      );
      assert.equal(journal.length, 1, 'the refused dispatch journalled nothing');
    } finally {
      journal.close();
    }
  });

  it('refuses a bypass even while a journal is open', () => {
    const journal = MemoryCommandJournal.open();
    try {
      assert.throws(
        () => executeWithoutJournal(request()),
        (err: unknown) => err instanceof DispatchError && err.code === 'bypass_forbidden',
      );
      assert.equal(journal.length, 0);
    } finally {
      journal.close();
    }
  });

  it('refuses a bypass when no journal is open', () => {
    assert.throws(
      () => executeWithoutJournal(request()),
      (err: unknown) => err instanceof DispatchError && err.code === 'bypass_forbidden',
    );
  });

  it('source honesty: dispatch.ts has exactly one success path, behind the append', () => {
    const source = readFileSync(DISPATCH_SOURCE, 'utf8');
    // `ok: true,` is the CONSTRUCTION; the `readonly ok: true;` field on
    // DispatchResult is the type declaration and is not a second path.
    const successPaths = source.match(/\bok:\s*true,/g) ?? [];
    assert.equal(
      successPaths.length,
      1,
      `dispatch.ts must have exactly one success construction, found ${successPaths.length}`,
    );
    const appendAt = source.indexOf('journal.append(');
    const successAt = source.search(/\bok:\s*true,/);
    assert.ok(appendAt > -1, 'dispatch.ts must append to the journal');
    assert.ok(
      appendAt < successAt,
      'the only success path must be constructed after the journal append',
    );
    assert.ok(
      source.includes("'journal_unavailable'"),
      'dispatch.ts must carry the §5.1 unavailability refusal',
    );
  });
});

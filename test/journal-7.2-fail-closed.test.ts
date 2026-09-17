/**
 * Phase 4 stop-gate §7.2 — governed commands cannot bypass the journal path.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MemoryCommandJournal,
  resetActiveJournalForTests,
  dispatchGovernedCommand,
  executeWithoutJournal,
  DispatchError,
  type GovernedCommandRequest,
} from '../packages/journal/src/index.js';

const AT = '2026-08-31T18:00:00.000000Z';
const HERE = dirname(fileURLToPath(import.meta.url));
function resolveRepoRoot(): string {
  const candidates = [join(HERE, '..'), join(HERE, '..', '..')];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'packages', 'journal', 'src', 'dispatch.ts'))) {
      return candidate;
    }
  }
  throw new Error('could not locate packages/journal/src/dispatch.ts');
}
const REPO_ROOT = resolveRepoRoot();

function req(overrides: Partial<GovernedCommandRequest> = {}): GovernedCommandRequest {
  return {
    commandKind: 'planner.invoke',
    argv: ['--goal', 'prove-7.2'],
    actorId: 'hephaestus-br',
    roleId: 'builder',
    authorizationRef: 'auth:HO-20260831-01',
    recordedAt: AT,
    commandId: 'cmd_prove720000000001',
    ...overrides,
  };
}

describe('§7.2 fail-closed dispatch', () => {
  afterEach(() => {
    resetActiveJournalForTests();
  });

  it('refuses dispatch when journal is not open', () => {
    assert.throws(
      () => dispatchGovernedCommand(req()),
      (err: unknown) => err instanceof DispatchError && err.code === 'journal_unavailable',
    );
  });

  it('journals before returning an execution permit', () => {
    const journal = MemoryCommandJournal.open();
    const result = dispatchGovernedCommand(req());
    assert.equal(result.ok, true);
    assert.equal(result.executionPermit.commandId, result.commandId);
    assert.equal(result.executionPermit.journalSeq, '1');
    assert.equal(journal.length, 1);
    assert.equal(journal.recordsSnapshot()[0]?.row.eventType, 'journaled');
    assert.equal(journal.verify().ok, true);
    journal.close();
  });

  it('executeWithoutJournal always fails (honesty: bypass path must not succeed)', () => {
    const journal = MemoryCommandJournal.open();
    assert.throws(
      () => executeWithoutJournal(req()),
      (err: unknown) => err instanceof DispatchError && err.code === 'bypass_forbidden',
    );
    // Honesty: journal must still be empty — bypass did not journal either.
    assert.equal(journal.length, 0);
    journal.close();
  });

  it('source honesty: dispatch.ts exports no alternate success path without journal', () => {
    const src = readFileSync(join(REPO_ROOT, 'packages/journal/src/dispatch.ts'), 'utf8');
    // The bypass helper must throw; a success return would be a guard removal.
    assert.match(src, /bypass_forbidden/);
    assert.match(src, /journal_unavailable/);
    assert.doesNotMatch(src, /ok:\s*true[\s\S]{0,80}withoutJournal/i);
    // Sole public success path is dispatchGovernedCommand.
    assert.match(src, /export function dispatchGovernedCommand/);
  });
});

/**
 * Phase 4 stop-gate item 3 (§7.3): secrets and credentials are never
 * persisted in journal records.
 *
 * Contract section under test, per the §10 test map: §6 (secrets and
 * normalization). §6.1 — never persisted, and redaction runs BEFORE the
 * write, never after. §6.3 — the security-negative obligation: seeded
 * credential-shaped values in command envelopes must never reach a
 * persisted row.
 *
 * Every credential-shaped fixture below is assembled at runtime rather
 * than written as a literal, following the convention in
 * `test/redaction.test.ts`: the repository secret scan reads a literal
 * PEM block or a full-length token in a source file as a leak.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import {
  DispatchError,
  JournalAppendError,
  MemoryCommandJournal,
  REDACTED,
  containsCredentialMaterial,
  dispatchGovernedCommand,
  envelopeDigest,
  redactArgv,
  type CommandEventRow,
  type GovernedCommandRequest,
  type NormalizedCommandEnvelope,
} from '../packages/journal/src/index.js';
// Test-only: not on the package's public surface, by design.
import { resetActiveJournalForTests } from '../packages/journal/src/store.js';

const PAT = `ghp_${'Z'.repeat(36)}`;
const FINE_GRAINED_PAT = `github_pat_${'A'.repeat(30)}`;
const API_KEY = `sk-${'q'.repeat(32)}`;
const XAI_KEY = `xai-${'w'.repeat(28)}`;
const DB_URL = `postgres://admin:${'p'.repeat(12)}@db.example.invalid/journal`;
// Assembled for the same reason as the tokens above: the scanner's
// private-key rule would read a literal PEM block in this file as a leak.
const PEM = ['-----BEGIN', 'PRIVATE KEY-----', 'MIIabc', '-----END', 'PRIVATE KEY-----']
  .join('\n')
  .replace('BEGIN\n', 'BEGIN ')
  .replace('END\n', 'END ');

function request(overrides: Partial<GovernedCommandRequest> = {}): GovernedCommandRequest {
  return {
    commandKind: 'planner.invoke',
    argv: ['--goal', 'ship the stop gate'],
    actorId: 'session:test/journal-7.3',
    roleId: 'builder',
    authorizationRef: 'HO-20260831-01',
    repository: 'MADVenturesLLC/founder-os-build-room',
    scopeRef: 'scope/phase4',
    intendedProvider: 'anthropic',
    intendedModel: 'claude-opus-5',
    intendedSurface: 'claude-code',
    recordedAt: '2026-09-17T12:00:00.000000Z',
    commandId: 'cmd_secrets',
    ...overrides,
  };
}

describe('§7.3 secrets are not persisted', () => {
  describe('redaction before the write (§6.1)', () => {
    for (const [name, secret] of [
      ['a GitHub personal access token', PAT],
      ['a fine-grained GitHub PAT', FINE_GRAINED_PAT],
      ['a provider API key', API_KEY],
      ['an xAI key', XAI_KEY],
      ['a PEM private key block', PEM],
      ['a connection string with inline credentials', DB_URL],
    ] as const) {
      it(`strips ${name}`, () => {
        const [redacted] = redactArgv([secret]);
        assert.ok(redacted);
        assert.ok(!redacted.includes(secret), `${name} survived redaction`);
        assert.ok(redacted.includes(REDACTED));
        assert.equal(containsCredentialMaterial([redacted]), false);
      });
    }

    it('strips secret environment bindings by key, keeping the key legible', () => {
      const redacted = redactArgv([`ANTHROPIC_API_KEY=${'x'.repeat(40)}`, 'LOG_LEVEL=debug']);
      assert.deepEqual(redacted, [`ANTHROPIC_API_KEY=${REDACTED}`, 'LOG_LEVEL=debug']);
    });

    it('blanks the argument that follows a secret-bearing flag', () => {
      assert.deepEqual(redactArgv(['--token', PAT, '--verbose']), [
        '--token',
        REDACTED,
        '--verbose',
      ]);
    });

    it('leaves non-credential arguments untouched', () => {
      const argv = ['--goal', 'ship the stop gate', '--repo', 'MADVenturesLLC/founder-os-build-room'];
      assert.deepEqual(redactArgv(argv), argv);
    });

    it('never mutates the caller argv', () => {
      const argv = Object.freeze([PAT]);
      assert.doesNotThrow(() => redactArgv(argv));
      assert.equal(argv[0], PAT);
    });
  });

  describe('the honesty check (§6.3)', () => {
    it('flags unredacted credential material', () => {
      for (const secret of [PAT, FINE_GRAINED_PAT, API_KEY, XAI_KEY, PEM, DB_URL]) {
        assert.equal(containsCredentialMaterial([secret]), true, secret.slice(0, 12));
      }
    });

    it('flags a secret environment binding whose value was left intact', () => {
      assert.equal(containsCredentialMaterial([`GITHUB_TOKEN=${'t'.repeat(20)}`]), true);
    });

    it('clears values that redaction has actually handled', () => {
      for (const secret of [PAT, FINE_GRAINED_PAT, API_KEY, XAI_KEY, PEM, DB_URL]) {
        assert.equal(containsCredentialMaterial(redactArgv([secret])), false);
      }
      assert.equal(containsCredentialMaterial([`GITHUB_TOKEN=${REDACTED}`]), false);
    });

    it('flags a live credential sitting alongside a redaction marker', () => {
      // The defect this guard is written against: testing the raw value and
      // excusing it because a marker appears SOMEWHERE lets a partially
      // redacted argument through carrying a live token.
      for (const secret of [PAT, API_KEY, DB_URL]) {
        assert.equal(containsCredentialMaterial([`${REDACTED} ${secret}`]), true);
        assert.equal(containsCredentialMaterial([`${secret} ${REDACTED}`]), true);
      }
    });

    it('does not flag a label whose value is only the marker', () => {
      // The over-correction in the other direction: `api_key=` with nothing
      // after it is not a credential, and flagging it would make the
      // write-path guard refuse correctly redacted rows.
      for (const clean of [`api_key=${REDACTED}`, `password: ${REDACTED}`, REDACTED]) {
        assert.equal(containsCredentialMaterial([clean]), false, clean);
      }
    });

    it('does not treat a high-entropy blob as evidence of a credential', () => {
      // A digest is 64 hex characters and matches the entropy shape. It is
      // redacted defensively but must never make the write-path guard
      // refuse a legitimate row, or every row carrying a hash would fail.
      const digest = 'a'.repeat(64);
      assert.equal(containsCredentialMaterial([digest]), false);
      assert.equal(redactArgv([digest])[0], REDACTED);
    });
  });

  describe('nothing credential-shaped reaches a persisted row (§6.3)', () => {
    beforeEach(() => {
      resetActiveJournalForTests();
    });

    afterEach(() => {
      resetActiveJournalForTests();
    });

    it('persists no seeded credential in the canonical row bytes', () => {
      const journal = MemoryCommandJournal.open();
      try {
        const result = dispatchGovernedCommand(
          request({ argv: ['--token', PAT, `ANTHROPIC_API_KEY=${'x'.repeat(40)}`, DB_URL] }),
        );
        const persisted = Buffer.from(result.journalRecord.canonicalHex, 'hex').toString('utf8');
        for (const secret of [PAT, DB_URL, 'x'.repeat(40)]) {
          assert.ok(!persisted.includes(secret), 'a seeded credential reached the row bytes');
        }
        assert.ok(persisted.includes(REDACTED));
        assert.deepEqual(result.envelope.argv, [
          '--token',
          REDACTED,
          `ANTHROPIC_API_KEY=${REDACTED}`,
          // The inline `user:password@` is stripped and the host is kept:
          // §6.1 asks for the safe NORMALIZED representation, and the host
          // is not the credential.
          `${REDACTED}db.example.invalid/journal`,
        ]);
      } finally {
        journal.close();
      }
    });

    it('fails closed when credential material sits outside the redacted argv', () => {
      // Defence in depth: `normalizeForJournal` redacts argv, but it checks
      // the command kind too. A credential there is detected, not silently
      // journalled.
      const journal = MemoryCommandJournal.open();
      try {
        assert.throws(
          () => dispatchGovernedCommand(request({ commandKind: `planner.invoke ${PAT}` })),
          (err: unknown) => err instanceof DispatchError && err.code === 'credential_material',
        );
        assert.equal(journal.length, 0, 'the refused dispatch journalled nothing');
      } finally {
        journal.close();
      }
    });

    it('refuses a hand-built row that carries credential material', () => {
      // The store's own guard, independent of the dispatch path: a caller
      // constructing a row directly cannot smuggle a secret past it.
      const journal = MemoryCommandJournal.open();
      try {
        const envelope: NormalizedCommandEnvelope = {
          envelopeVersion: '1',
          commandKind: 'planner.invoke',
          argv: [PAT],
          targetRepository: 'MADVenturesLLC/founder-os-build-room',
          scopeRef: 'scope/phase4',
        };
        const row: Omit<CommandEventRow, 'seq'> = {
          eventType: 'journaled',
          commandId: 'cmd_smuggled',
          actorId: 'session:test/journal-7.3',
          roleId: 'builder',
          repository: 'MADVenturesLLC/founder-os-build-room',
          scopeRef: 'scope/phase4',
          commandEnvelope: envelope,
          envelopeDigest: envelopeDigest(envelope),
          authorizationRef: 'HO-20260831-01',
          intendedProvider: 'anthropic',
          intendedModel: 'claude-opus-5',
          intendedSurface: 'claude-code',
          evidenceRefs: [],
          recordedAt: '2026-09-17T12:00:01.000000Z',
        };
        assert.throws(
          () => journal.append(row),
          (err: unknown) =>
            err instanceof JournalAppendError && err.code === 'credential_material',
        );
        assert.equal(journal.length, 0);
      } finally {
        journal.close();
      }
    });
  });
});

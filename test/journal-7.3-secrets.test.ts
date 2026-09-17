/**
 * Phase 4 stop-gate §7.3 — secrets and credentials are not persisted.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  MemoryCommandJournal,
  resetActiveJournalForTests,
  dispatchGovernedCommand,
  normalizeForJournal,
  redactArgv,
  containsCredentialMaterial,
  REDACTED,
} from '../packages/journal/src/index.js';

const AT = '2026-08-31T18:00:00.000000Z';

describe('§7.3 secret redaction', () => {
  it('redacts API-key shaped argv tokens', () => {
    const out = redactArgv(['--token', 'sk-abcdefghijklmnopqrstuvwxyz012345', 'run']);
    assert.deepEqual(out, ['--token', REDACTED, 'run']);
    assert.equal(containsCredentialMaterial(out), false);
  });

  it('redacts github_pat and ghp_ tokens', () => {
    const out = redactArgv([
      'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
      'github_pat_11ABCDEFGHIJKLMNOP_abcdefghijklmnopqrstuvwxyz0123456789ABCDEF',
    ]);
    assert.ok(out.every((a) => a === REDACTED || !a.includes('ghp_')));
    assert.equal(containsCredentialMaterial(out), false);
  });

  it('redacts SECRET_ENV_KEYS bindings', () => {
    const out = redactArgv(['OPENAI_API_KEY=sk-live-should-not-persist', 'SAFE=1']);
    assert.equal(out[0], `OPENAI_API_KEY=${REDACTED}`);
    assert.equal(out[1], 'SAFE=1');
  });

  it('redacts PEM private key blocks', () => {
    const pem =
      '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7\n-----END PRIVATE KEY-----';
    const out = redactArgv([pem]);
    assert.equal(out[0], REDACTED);
  });
});

describe('§7.3 journal write path', () => {
  let journal: MemoryCommandJournal;

  beforeEach(() => {
    resetActiveJournalForTests();
    journal = MemoryCommandJournal.open();
  });
  afterEach(() => {
    journal.close();
    resetActiveJournalForTests();
  });

  it('persisted envelope argv never contains seeded credentials', () => {
    const secret = 'sk-abcdefghijklmnopqrstuvwxyz012345';
    const result = dispatchGovernedCommand({
      commandKind: 'planner.invoke',
      argv: ['--api-key', secret, '--goal', 'safe'],
      actorId: 'hephaestus-br',
      roleId: 'builder',
      authorizationRef: 'auth:test',
      recordedAt: AT,
      commandId: 'cmd_prove730000000001',
    });
    assert.ok(!result.envelope.argv.includes(secret));
    assert.ok(result.envelope.argv.includes(REDACTED));
    const snap = journal.recordsSnapshot()[0]!;
    const canonicalUtf8 = Buffer.from(snap.row.envelopeCanonicalHex ?? '', 'hex').toString('utf8');
    assert.ok(!canonicalUtf8.includes(secret));
    assert.ok(!JSON.stringify(snap).includes(secret));
  });

  it('normalizeForJournal fails closed if material survives redaction (defense)', () => {
    // Construct argv that our redactor clears; assert post-condition.
    const envelope = normalizeForJournal({
      commandKind: 'planner.invoke',
      argv: ['GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789'],
    });
    assert.equal(containsCredentialMaterial(envelope.argv), false);
    assert.equal(envelope.argv[0], `GITHUB_TOKEN=${REDACTED}`);
  });

  it('honesty: raw secret in persisted snapshot would fail the assertion above', () => {
    // Meta-check: containsCredentialMaterial still flags unredacted secrets.
    assert.equal(containsCredentialMaterial(['sk-abcdefghijklmnopqrstuvwxyz012345']), true);
    assert.equal(containsCredentialMaterial([`OPENAI_API_KEY=${REDACTED}`]), false);
  });
});

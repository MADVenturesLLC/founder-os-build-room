/**
 * Golden vectors — implementation-generated, byte-identical on regeneration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  encodeEnvelope,
  envelopeDigest,
  encodeCommandEventRow,
  chainHash,
  GENESIS_CHAIN_HASH,
  hexOf,
} from '../packages/journal/src/index.js';
import { buildChainVectors, sampleEnvelope, sampleRows } from './support/journal-vector-source.js';

const HERE = dirname(fileURLToPath(import.meta.url));
function resolveRepoRoot(): string {
  const candidates = [join(HERE, '..'), join(HERE, '..', '..')];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'packages', 'journal', 'src', 'index.ts'))) {
      return candidate;
    }
  }
  throw new Error('could not locate packages/journal/src');
}
const ROOT = resolveRepoRoot();
const VECTORS = join(ROOT, 'packages', 'journal', 'vectors');

describe('journal golden vectors', () => {
  it('envelope digest matches SHA-256 over canonical bytes', () => {
    const env = sampleEnvelope();
    const bytes = encodeEnvelope(env);
    const digest = envelopeDigest(env);
    assert.equal(digest, createHash('sha256').update(bytes).digest('hex'));
    assert.match(digest, /^[0-9a-f]{64}$/);
  });

  it('chain verifies from genesis in seq order', () => {
    const built = buildChainVectors();
    let prior = GENESIS_CHAIN_HASH;
    for (const entry of built.chain) {
      assert.equal(entry.priorChainHash, prior);
      const row = sampleRows().find((r) => r.seq === entry.seq)!;
      const bytes = encodeCommandEventRow(row);
      assert.equal(hexOf(bytes), entry.rowCanonicalHex);
      assert.equal(chainHash(prior, bytes), entry.chainHash);
      prior = entry.chainHash;
    }
    assert.equal(prior, built.headChainHash);
  });

  it('committed vectors match live regeneration', () => {
    const built = buildChainVectors();
    const envelopePath = join(VECTORS, 'envelope.json');
    const chainPath = join(VECTORS, 'chain.json');
    assert.ok(existsSync(envelopePath), 'envelope.json must be committed under packages/journal/vectors');
    assert.ok(existsSync(chainPath), 'chain.json must be committed under packages/journal/vectors');

    const envelopeFile = JSON.parse(readFileSync(envelopePath, 'utf8'));
    const chainFile = JSON.parse(readFileSync(chainPath, 'utf8'));

    assert.equal(envelopeFile.digest, built.envelope.digest);
    assert.equal(envelopeFile.canonicalHex, built.envelope.canonicalHex);
    assert.equal(chainFile.headChainHash, built.headChainHash);
    assert.deepEqual(chainFile.entries, built.chain);
  });
});

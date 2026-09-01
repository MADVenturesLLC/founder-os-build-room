/**
 * Golden-vector verification (contract §6.2): the committed vector files
 * under `packages/journal/vectors/` are regenerated from their inputs on
 * every run and must be byte-identical to what the implementation
 * produces today; every hash in them is then re-verified independently
 * against §6.2's exact byte-input definitions using `node:crypto`
 * directly, so a vector can never drift from either the implementation
 * or the ratified hash definitions without failing this suite.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { COMMAND_EVENT_TYPES } from '../packages/journal/src/index.js';
import { buildAllVectorFiles, renderVectorFile } from './support/journal-vector-source.js';

const vectorsDir = fileURLToPath(new URL('../../packages/journal/vectors/', import.meta.url));

const sha256HexOf = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

interface StandaloneVector {
  readonly name: string;
  readonly canonical_hex: string;
  readonly sha256: string;
}

interface ChainVectorRow {
  readonly name: string;
  readonly record_class: string;
  readonly input: { readonly eventType?: string };
  readonly canonical_hex: string;
  readonly row_sha256: string;
  readonly prior_chain_hash: string;
  readonly chain_hash: string;
}

describe('golden vectors — committed files match a fresh build', () => {
  for (const [fileName, built] of buildAllVectorFiles()) {
    it(`packages/journal/vectors/${fileName} is byte-identical to regeneration`, () => {
      const committed = readFileSync(`${vectorsDir}${fileName}`, 'utf8');
      assert.equal(committed, renderVectorFile(built));
    });
  }
});

describe('golden vectors — hashes re-verified against the §6.2 definitions', () => {
  it('every standalone vector sha256 equals SHA-256 over its canonical bytes', () => {
    for (const fileName of ['envelope.json', 'plandoc.json', 'decision-row.json']) {
      const parsed = JSON.parse(readFileSync(`${vectorsDir}${fileName}`, 'utf8')) as {
        vectors: readonly StandaloneVector[];
      };
      assert.ok(parsed.vectors.length >= 1, `${fileName} carries at least one vector`);
      for (const vector of parsed.vectors) {
        const bytes = Buffer.from(vector.canonical_hex, 'hex');
        assert.equal(sha256HexOf(bytes), vector.sha256, `${fileName}: ${vector.name}`);
      }
    }
  });

  it('decision vectors cover both plan_hash presence shapes', () => {
    const parsed = JSON.parse(readFileSync(`${vectorsDir}decision-row.json`, 'utf8')) as {
      vectors: readonly (StandaloneVector & { input: { planHash?: string } })[];
    };
    const present = parsed.vectors.filter((v) => v.input.planHash !== undefined);
    const absent = parsed.vectors.filter((v) => v.input.planHash === undefined);
    assert.ok(present.length >= 1, 'a plan_hash-present shape is committed');
    assert.ok(absent.length >= 1, 'a plan_hash-absent shape is committed');
  });

  it('spec (c) vectors live in the mixed chain: every command event type is covered', () => {
    // There is deliberately no standalone command-row vector file: spec (c)
    // names packages/journal/vectors/chain.json as its vector home, and the
    // chain exercises the full closed event vocabulary under real framing.
    // This assertion is the explicit per-spec coverage floor for (c) — and
    // for (d)'s chained shape — so the "at least one vector per spec"
    // obligation (contract §6.2) is tested, not implied.
    const parsed = JSON.parse(readFileSync(`${vectorsDir}chain.json`, 'utf8')) as {
      rows: readonly ChainVectorRow[];
    };
    const commandRows = parsed.rows.filter((r) => r.record_class === 'command');
    assert.ok(commandRows.length >= 1, 'at least one spec (c) vector on the chain');
    const coveredEventTypes = [...new Set(commandRows.map((r) => r.input.eventType))].sort();
    assert.deepEqual(coveredEventTypes, [...COMMAND_EVENT_TYPES].sort());
    assert.ok(
      parsed.rows.some((r) => r.record_class === 'decision'),
      'at least one spec (d) vector chained by the same framing',
    );
  });

  it('the mixed chain verifies from the 64-zero genesis in seq order', () => {
    const parsed = JSON.parse(readFileSync(`${vectorsDir}chain.json`, 'utf8')) as {
      genesis: string;
      rows: readonly ChainVectorRow[];
    };
    assert.equal(parsed.genesis, '0'.repeat(64));
    let prior = parsed.genesis;
    const classes = new Set<string>();
    for (const row of parsed.rows) {
      classes.add(row.record_class);
      assert.equal(row.prior_chain_hash, prior, `${row.name}: prior linkage`);
      const bytes = Buffer.from(row.canonical_hex, 'hex');
      assert.equal(sha256HexOf(bytes), row.row_sha256, `${row.name}: row hash`);
      const framed = Buffer.concat([Buffer.from(prior, 'ascii'), bytes]);
      assert.equal(sha256HexOf(framed), row.chain_hash, `${row.name}: chain framing`);
      prior = row.chain_hash;
    }
    assert.deepEqual([...classes].sort(), ['command', 'decision'], 'both record classes on one chain');
  });
});

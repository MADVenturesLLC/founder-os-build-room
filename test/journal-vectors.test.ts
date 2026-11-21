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
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { type State } from '../packages/contracts/src/index.js';
import {
  COMMAND_EVENT_TYPES,
  SPEC_ID_C2,
  SPEC_ID_D,
  SPEC_ID_E,
  effectivePlanBearingState,
  journalRowSpec,
  planHashRequired,
} from '../packages/journal/src/index.js';
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

  it('the committed directory holds exactly the files the implementation builds, no fewer and no stale extra', () => {
    const committed = readdirSync(vectorsDir).filter((name) => name.endsWith('.json')).sort();
    assert.deepEqual(committed, [...buildAllVectorFiles().keys()].sort());
  });
});

describe('golden vectors — hashes re-verified against the §6.2 definitions', () => {
  it('every standalone vector sha256 equals SHA-256 over its canonical bytes', () => {
    for (const fileName of ['envelope.json', 'plandoc.json', 'decision-row.json', 'binding-row.json']) {
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

  it('RECONCILING vectors with a resolved prior_state cover both plan_hash derivation branches', () => {
    // plan_hash presence at RECONCILING is derived from the resolved
    // prior_state (contract §2). Every RECONCILING vector is checked
    // against the exported derivation itself — presence must equal
    // planHashRequired(effectivePlanBearingState(...)) — and both
    // branches of that derivation (required → present, not required →
    // absent) must each be witnessed by a committed vector, computed
    // through the same derivation call, never a hand-authored state
    // list.
    const parsed = JSON.parse(readFileSync(`${vectorsDir}decision-row.json`, 'utf8')) as {
      vectors: readonly (StandaloneVector & {
        input: { recordedState?: string; priorState?: State; planHash?: string };
      })[];
    };
    const reconciling = parsed.vectors.filter(
      (v) => v.input.recordedState === 'RECONCILING' && v.input.priorState !== undefined,
    );
    assert.ok(
      reconciling.length >= 1,
      'a RECONCILING vector carrying a resolved prior_state is committed',
    );
    const requiresPlanHash = (v: (typeof reconciling)[number]): boolean =>
      planHashRequired(effectivePlanBearingState('RECONCILING', v.input.priorState));
    for (const v of reconciling) {
      assert.equal(
        v.input.planHash !== undefined,
        requiresPlanHash(v),
        `${v.name}: plan_hash presence must match the derivation over prior_state ${String(v.input.priorState)}`,
      );
    }
    assert.ok(
      reconciling.some((v) => requiresPlanHash(v)),
      'missing shape: RECONCILING over a plan-bearing prior_state with plan_hash present',
    );
    assert.ok(
      reconciling.some((v) => !requiresPlanHash(v)),
      'missing shape: RECONCILING over a no-PlanDoc prior_state with plan_hash absent',
    );
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

  it('the binding chain verifies from the 64-zero genesis, all three record classes on one seq space', () => {
    // Contract §6.2: chain_hash covers each row's bytes per (c), (d) or (e)
    // as its record class determines, under the one framing.
    const parsed = JSON.parse(readFileSync(`${vectorsDir}chain-binding.json`, 'utf8')) as {
      specs: readonly string[];
      genesis: string;
      rows: readonly (ChainVectorRow & { readonly spec: string; readonly input: { readonly seq: string } })[];
    };
    assert.equal(parsed.genesis, '0'.repeat(64));
    assert.deepEqual([...parsed.specs], [SPEC_ID_C2, SPEC_ID_D, SPEC_ID_E]);
    let prior = parsed.genesis;
    const classes = new Set<string>();
    for (const [index, row] of parsed.rows.entries()) {
      classes.add(row.record_class);
      assert.equal(row.input.seq, String(index + 1), `${row.name}: one seq space, no gap`);
      assert.equal(row.prior_chain_hash, prior, `${row.name}: prior linkage`);
      const bytes = Buffer.from(row.canonical_hex, 'hex');
      assert.equal(journalRowSpec(new Uint8Array(bytes)), row.spec, `${row.name}: bytes open with their spec`);
      assert.equal(sha256HexOf(bytes), row.row_sha256, `${row.name}: row hash`);
      assert.equal(sha256HexOf(Buffer.concat([Buffer.from(prior, 'ascii'), bytes])), row.chain_hash, `${row.name}: chain framing`);
      prior = row.chain_hash;
    }
    assert.deepEqual([...classes].sort(), ['binding', 'command', 'decision'], 'three record classes on one chain');
  });
});

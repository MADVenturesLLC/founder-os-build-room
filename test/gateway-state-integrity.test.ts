/**
 * §15 (correction 5, review findings #4 and #14) — state.json is read as
 * untrusted input.
 *
 * `read()` spread whatever `JSON.parse` produced over the defaults, so every
 * member the file got wrong survived the merge: a null `primary` overrode the
 * default lane and crashed the first `state.primary.lane` dereference (which
 * is what `doctor` does), and a partially-written file kept its broken members
 * indefinitely. The file is public metadata the daemon must be able to resume
 * from: a corrupt member is repaired to its default, valid members are kept,
 * and nothing downstream dereferences an unvalidated shape.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ControlPlaneClient,
  Custody,
  GatewayStateStore,
  emptyState,
  gatewayPaths,
  type FetchLike,
} from '../packages/gateway-daemon/src/index.js';
import { runDoctor } from '../packages/gateway-cli/src/doctor.js';
import { FileKeychainRunner } from './fake-keychain.js';

const GATEWAY_ID = '11111111-2222-4333-8444-555555555555';
const HEX64 = 'ab'.repeat(32);

/** A state store whose file already holds `raw`, exactly as a crash may have left it. */
function storeHolding(raw: string): { store: GatewayStateStore; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-state-'));
  const paths = gatewayPaths(join(root, 'gateway'));
  mkdirSync(paths.directory, { recursive: true });
  writeFileSync(paths.statePath, raw, 'utf8');
  return { store: new GatewayStateStore(paths), root };
}

describe('gateway-state · a corrupt state file is repaired, never dereferenced', () => {
  it('read:a-null-primary-member-is-repaired-to-the-default-lane', async () => {
    const f = storeHolding('{"version":1,"primary":null}');
    try {
      const state = await f.store.read();
      assert.equal(state.primary.lane, 'IDLE');
      assert.equal(state.primary.identity.gatewayId, null);
      assert.equal(state.staging.lane, 'INACTIVE');
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('read:valid-members-of-a-partial-file-survive-and-broken-members-are-repaired', async () => {
    const f = storeHolding(
      JSON.stringify({
        version: 1,
        primary: {
          lane: 'HEARTBEATING',
          identity: { gatewayId: GATEWAY_ID, keyId: HEX64, fingerprint: HEX64 },
          lastServerState: 'enrolled',
          lastObservedAt: '2026-08-19T12:00:00.000Z',
        },
        staging: null,
      }),
    );
    try {
      const state = await f.store.read();
      assert.equal(state.primary.lane, 'HEARTBEATING', 'the valid primary member is kept');
      assert.equal(state.primary.identity.gatewayId, GATEWAY_ID);
      assert.equal(
        state.staging.lane,
        'INACTIVE',
        'the broken staging member is repaired, not spread over the default',
      );
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('read:an-out-of-vocabulary-lane-string-is-repaired-to-the-default', async () => {
    const f = storeHolding(JSON.stringify({ version: 1, primary: { lane: 'VIBRATING' } }));
    try {
      const state = await f.store.read();
      assert.equal(state.primary.lane, 'IDLE', 'a lane string outside the vocabulary is not a lane');
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('read:a-file-that-is-not-a-version-1-object-starts-from-empty', async () => {
    // Pinning control: this behaviour predates the correction and must survive it.
    const f = storeHolding(JSON.stringify({ version: 2, primary: { lane: 'HEARTBEATING' } }));
    try {
      const state = await f.store.read();
      assert.equal(state.primary.lane, 'IDLE');
      assert.equal(state.staging.lane, 'INACTIVE');
      assert.equal(state.lastRejection, null);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });

  it('doctor:renders-a-diagnosis-over-a-corrupt-state-file-instead-of-throwing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'buildroom-doctor-'));
    try {
      const paths = gatewayPaths(join(root, 'gateway'));
      mkdirSync(paths.directory, { recursive: true });
      writeFileSync(paths.statePath, '{"version":1,"primary":null}', 'utf8');
      const fetch: FetchLike = async () => new Response('', { status: 503 });
      const report = await runDoctor({
        paths,
        custody: new Custody(new FileKeychainRunner(join(root, 'keychain'))),
        client: new ControlPlaneClient('http://control-plane.invalid', fetch),
        state: new GatewayStateStore(paths),
      });
      assert.equal(report.lanes.primary, 'IDLE', 'doctor reports the repaired lane');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('read:an-empty-state-object-yields-the-empty-state', async () => {
    const f = storeHolding('{"version":1}');
    try {
      const state = await f.store.read();
      assert.equal(state.primary.lane, emptyState().primary.lane);
      assert.equal(state.staging.lane, emptyState().staging.lane);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  });
});

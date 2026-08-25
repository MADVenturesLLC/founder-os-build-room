import assert from 'node:assert/strict';
import { randomUUID, verify as cryptoVerify } from 'node:crypto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import {
  TEST_IP,
  enrollGateway,
  makeSessionNode,
  openSession,
  promoteNode,
  signedBeat,
  type EnrolledGateway,
  type SessionNode,
} from './gateway-session-helpers.js';
import { generateTestKeypair, hex32, makeHeartbeat, publicKeyFromRaw } from './gateway-helpers.js';
import { settleAllNodes } from './gateway-leadership-helpers.js';

let harness: GatewayHarness | undefined;

beforeEach(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('phase3-heartbeat');
});

afterEach(async () => {
  await settleAllNodes();
  await destroyGatewayHarness(harness);
  harness = undefined;
});

beforeEach(async () => {
  if (STORAGE_SKIP !== false) return;
  await harness!.pool.query(
    `UPDATE gateway_current_state SET state = 'revoked', is_currently_enrolled = false
      WHERE is_currently_enrolled`,
  );
  await harness!.pool.query(
    'UPDATE control_plane_lease SET owner_id = NULL, heartbeat_at = NULL WHERE id = 1',
  );
});

async function serving(): Promise<{ node: SessionNode; gateway: EnrolledGateway; epoch: string }> {
  const node = await makeSessionNode(harness!);
  await promoteNode(node);
  const gateway = await enrollGateway(node);
  const epoch = await openSession(node, gateway);
  return { node, gateway, epoch };
}

async function startAttempt(node: SessionNode, gateway: EnrolledGateway): Promise<string> {
  const runAttemptId = randomUUID();
  await node.surface.phase3Runs.createAttempt({
    mode: 'started',
    runAttemptId,
    runLabel: 'Phase3-CR1',
    entryAuthorizationId: 'founder:phase3-cr1:test',
    founderOsSha: '1'.repeat(40),
    buildRoomSha: '2'.repeat(40),
    fixtureRepository: 'MADVenturesLLC/phase3-fixture',
    fixtureSha: '3'.repeat(40),
    gatewayId: gateway.gatewayId,
    expectedEnrollments: [{ gatewayId: gateway.gatewayId, state: 'enrolled' }],
    machineIdentity: 'test-mac',
    entryEvidenceSha256: '4'.repeat(64),
  });
  return runAttemptId;
}

describe('Phase 3 heartbeat evidence — accepted and independently repeatable', { skip: STORAGE_SKIP }, () => {
  it('captures the first accepted beat and lets Tier 2 repeat Ed25519 verification', async () => {
    const { node, gateway, epoch } = await serving();
    const runAttemptId = await startAttempt(node, gateway);
    const envelope = signedBeat(node, gateway, epoch, 1);

    assert.equal((await node.service.heartbeat(envelope, TEST_IP)).status, 200);
    assert.equal((await node.service.heartbeat(signedBeat(node, gateway, epoch, 2), TEST_IP)).status, 200);

    const exported = await node.surface.phase3Runs.exportAttempt(runAttemptId);
    const heartbeat = exported.heartbeat;
    assert.ok(heartbeat !== null);
    assert.equal(
      cryptoVerify(
        null,
        Buffer.from(heartbeat.signedBytesBase64, 'base64'),
        publicKeyFromRaw(Buffer.from(heartbeat.publicKeyBase64, 'base64')),
        Buffer.from(heartbeat.signatureBase64, 'base64'),
      ),
      true,
    );
    assert.equal(Math.abs(heartbeat.freshnessMs) <= heartbeat.freshnessWindowMs, true);
    assert.equal(exported.events.filter((event) => event.eventType === 'heartbeat_verified').length, 1);
  });
});

describe('Phase 3 heartbeat evidence — refusal paths capture nothing', { skip: STORAGE_SKIP }, () => {
  it('does not capture a bad signature', async () => {
    const { node, gateway, epoch } = await serving();
    const runAttemptId = await startAttempt(node, gateway);
    const attacker = generateTestKeypair();
    const envelope = makeHeartbeat(gateway.key, {
      gatewayId: gateway.gatewayId,
      keyId: gateway.keyId,
      epoch,
      sequence: 1,
      nonce: hex32(),
      timestampMs: node.clock.wallNow(),
      signWith: attacker.privateKey,
    });

    assert.equal((await node.service.heartbeat(envelope as unknown as Record<string, unknown>, TEST_IP)).status, 401);
    assert.equal((await node.surface.phase3Runs.exportAttempt(runAttemptId)).heartbeat, null);
  });

  it('does not capture a stale heartbeat', async () => {
    const { node, gateway, epoch } = await serving();
    const runAttemptId = await startAttempt(node, gateway);
    const stale = signedBeat(node, gateway, epoch, 1, {
      timestampMs: node.clock.wallNow() - node.config.gatewayTimestampWindowMs - 1,
    });

    assert.equal((await node.service.heartbeat(stale, TEST_IP)).status, 409);
    assert.equal((await node.surface.phase3Runs.exportAttempt(runAttemptId)).heartbeat, null);
  });

  it('keeps normal heartbeat behavior unchanged when no run attempt is active', async () => {
    const { node, gateway, epoch } = await serving();
    assert.equal((await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP)).status, 200);

    const { rows } = await harness!.pool.query<{ count: string }>(
      `SELECT count(*)
         FROM phase3_run_events e
         JOIN phase3_run_attempts a USING (run_attempt_id)
        WHERE e.event_type = 'heartbeat_verified' AND a.gateway_id = $1`,
      [gateway.gatewayId],
    );
    assert.equal(rows[0]?.count, '0');
  });

  it('rolls back evidence and cursor publication when COMMIT fails', async () => {
    const node = await makeSessionNode(harness!, {
      hooks: {
        heartbeat: {
          commitFault: () => {
            throw new Error('synthetic commit fault');
          },
        },
      },
    });
    await promoteNode(node);
    const gateway = await enrollGateway(node);
    const epoch = await openSession(node, gateway);
    const runAttemptId = await startAttempt(node, gateway);

    const result = await node.service.heartbeat(signedBeat(node, gateway, epoch, 1), TEST_IP);
    assert.equal(result.status, 500);
    assert.equal(node.session.cursorFor(gateway.gatewayId)?.lastSequence, 0);
    assert.equal((await node.surface.phase3Runs.exportAttempt(runAttemptId)).heartbeat, null);
  });
});

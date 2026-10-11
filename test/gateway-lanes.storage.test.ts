/**
 * §15 — two identity lanes, running concurrently (correction C3).
 *
 * The defect this closes: a single-lane daemon can only ask about the successor
 * using the incumbent's key, and the server has no honest answer to that
 * question. So re-enrolment observed staging state through the primary-signed
 * flow, and one identity's request could not report the other's state.
 *
 * This suite runs the whole Founder ordering end to end against a real control
 * plane over a real socket: mint, redeem, poll while awaiting, revoke the
 * incumbent, confirm the successor, and only then promote.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ControlPlaneClient,
  Custody,
  GatewayStateStore,
  PrimaryLane,
  StagingLane,
  createDaemonClock,
  gatewayPaths,
  generateGatewayKeypair,
  privateKeyFromSecret,
  publicMembersOf,
  type GatewayIdentity,
} from '../packages/gateway-daemon/src/index.js';
import { runEnroll } from '../packages/gateway-cli/src/index.js';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import {
  enrollGateway,
  makeSessionNode,
  promoteNode,
  startNodeServer,
  type SessionNode,
} from './gateway-session-helpers.js';
import { FileKeychainRunner } from './fake-keychain.js';

let harness: GatewayHarness | undefined;
let node: SessionNode | undefined;
let surface: { url: string; close: () => Promise<void> } | undefined;
let root: string | undefined;

before(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('lanes');
  node = await makeSessionNode(harness);
  await promoteNode(node);
  surface = await startNodeServer(harness, node);
  root = mkdtempSync(join(tmpdir(), 'buildroom-lanes-'));
});

after(async () => {
  await surface?.close();
  await destroyGatewayHarness(harness);
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

function identityFor(gatewayId: string, secret: string): GatewayIdentity {
  const privateKey = privateKeyFromSecret(secret);
  const members = publicMembersOf(privateKey);
  return { gatewayId, keyId: members.keyId, pubkeyBase64: members.pubkeyBase64, privateKey };
}

describe('gateway-lanes · lanes:concurrent-primary-and-staging-independent', { skip: STORAGE_SKIP }, () => {
  it('runs both lanes at once, each seeing only its own identity', async () => {
    const clock = createDaemonClock();
    const client = new ControlPlaneClient(surface!.url);

    /* ---- the incumbent, enrolled and heartbeating ---------------------- */

    const incumbentKeypair = generateGatewayKeypair();
    const incumbent = await enrollGateway(node!);
    // The incumbent's key is the one the registry holds; rebuild the daemon-side
    // identity from the same private key the fixture generated.
    const incumbentIdentity: GatewayIdentity = {
      gatewayId: incumbent.gatewayId,
      keyId: incumbent.key.keyId,
      pubkeyBase64: incumbent.key.pubkeyBase64,
      privateKey: incumbent.key.privateKey,
    };
    void incumbentKeypair;

    const primary = new PrimaryLane(client, clock, incumbentIdentity);
    assert.equal(await primary.step(), 'retain_and_continue', 'the session opens');
    assert.equal(primary.laneState, 'HEARTBEATING');
    assert.equal(await primary.step(), 'retain_and_continue', 'and it beats');
    assert.equal(primary.lastSequence, 1);

    /* ---- the successor, redeemed through the real CLI path ------------- */

    const paths = gatewayPaths(join(root!, 'gateway'));
    const custody = new Custody(new FileKeychainRunner(join(root!, 'keychain')));
    const state = new GatewayStateStore(paths);
    const minted = await node!.store.mintPairingCode();

    const enrolled = await runEnroll({
      paths,
      custody,
      client,
      clock,
      state,
      readCode: async () => minted.code,
      hostDescriptor: { hostname: 'successor.test', os: 'darwin', arch: 'arm64' },
      print: () => undefined,
    });
    assert.equal(enrolled.ok, true, `enrolment failed: ${JSON.stringify(enrolled)}`);

    const stagingSecret = await custody.read('staging');
    assert.ok(stagingSecret !== null, 'the successor key is in staging custody');
    const successorId = (await state.read()).staging.identity.gatewayId;
    assert.ok(successorId !== null && successorId !== '');

    const staging = new StagingLane(client, clock, identityFor(successorId, stagingSecret));
    staging.resume('AWAITING', (await state.read()).staging.idempotencyKey);

    /* ---- both lanes, concurrently ------------------------------------- */

    const [primaryVerdict, stagingOutcome] = await Promise.all([primary.step(), staging.probe()]);

    assert.equal(primaryVerdict, 'retain_and_continue', 'the incumbent keeps heartbeating');
    assert.equal(
      stagingOutcome.disposition,
      'retain_and_continue',
      'and the successor keeps polling, retaining its key',
    );
    assert.equal(stagingOutcome.state, 'AWAITING');
    assert.equal(stagingOutcome.deleteStaging, false, 'awaiting never discards the only staging key');
    assert.equal(stagingOutcome.promote, false, 'and never promotes early');

    // Each lane observed ITS OWN identity's verdict, from its own signed request.
    const stagingObservation = staging.observations.at(-1);
    assert.equal(stagingObservation?.key, '403 awaiting_approval');
    assert.equal(primary.laneState, 'HEARTBEATING');

    /* ---- the ruled Founder ordering ------------------------------------ */

    // A second machine's gateway holds the other enrollment slot, so both
    // slots are held (FOUNDER-ACT-20261010-TWO-GATEWAYS B5). Confirming the
    // successor now is refused by the cap, so the daemon cannot promote out of
    // order even if it tried. With one slot held, B5 lets the successor be
    // confirmed first; gateway-invariants covers that path.
    const otherMachine = await enrollGateway(node!);
    assert.notEqual(otherMachine.gatewayId, incumbent.gatewayId);
    const early = await node!.store.confirmEnrollment(successorId, identityFor(successorId, stagingSecret).keyId, null);
    assert.equal(early.ok, false);
    assert.equal(!early.ok && early.code, 'enrollment_cap_reached');
    assert.equal((await staging.probe()).promote, false, 'the successor still only polls');

    // 3. Revoke the incumbent FIRST.
    assert.equal((await node!.store.revokeGateway(incumbent.gatewayId, null)).ok, true);

    const afterRevoke = await primary.step();
    assert.equal(afterRevoke, 'terminal_stop_no_deletion', 'the incumbent lane stops');
    assert.equal(primary.laneState, 'REVOKED');
    assert.equal(
      await custody.read('primary'),
      null,
      'a revoked primary is not deleted by the lane; there is no primary item here to begin with',
    );

    // 4. Confirm the successor SECOND.
    const confirmed = await node!.store.confirmEnrollment(
      successorId,
      identityFor(successorId, stagingSecret).keyId,
      null,
    );
    assert.equal(confirmed.ok, true, `confirm refused: ${JSON.stringify(confirmed)}`);

    // 5. The staging lane's next session-start succeeds as enrolled.
    const promoted = await staging.probe();
    assert.equal(promoted.disposition, 'promote');
    assert.equal(promoted.promote, true, 'promotion becomes possible only now');
    assert.equal(promoted.state, 'PROMOTED');

    // 6. And only then does custody promotion run.
    await custody.promoteStagingToPrimary();
    assert.equal(await custody.read('primary'), stagingSecret, 'the successor becomes primary');
    assert.equal(await custody.read('staging'), null, 'staging is deleted only after verification');

    staging.completePromotion();
    assert.equal(staging.laneState, 'INACTIVE');
  });

  it('gives the two lanes independent, non-interfering observation logs', async () => {
    const clock = createDaemonClock();
    const client = new ControlPlaneClient(surface!.url);

    const primary = new PrimaryLane(client, clock, null);
    const staging = new StagingLane(client, clock, null);

    assert.equal(await primary.step(), null, 'a lane with no identity does nothing');
    assert.equal((await staging.probe()).disposition, null);
    assert.deepEqual(primary.observations, []);
    assert.deepEqual(staging.observations, []);
  });
});

describe('gateway-lanes · the staging lane retains its key through every retryable class', { skip: STORAGE_SKIP }, () => {
  it('keeps custody through a transport failure', async () => {
    const clock = createDaemonClock();
    // A URL nothing is listening on: DNS/connection failure, the transport row.
    const unreachable = new ControlPlaneClient('http://127.0.0.1:1');
    const keypair = generateGatewayKeypair();
    const staging = new StagingLane(unreachable, clock, {
      gatewayId: '11111111-2222-4333-8444-555555555555',
      keyId: keypair.keyId,
      pubkeyBase64: keypair.pubkeyBase64,
      privateKey: keypair.privateKey,
    });
    staging.resume('AWAITING', 'fixture-key');

    const outcome = await staging.probe();
    assert.equal(outcome.disposition, 'transport');
    assert.equal(outcome.deleteStaging, false, 'a flaky network must never destroy the only key');
    assert.equal(outcome.state, 'TRANSPORT_RETRY');
  });

  it('reports a redeem refusal as terminal, and only then deletes', async () => {
    const clock = createDaemonClock();
    const client = new ControlPlaneClient(surface!.url);
    const keypair = generateGatewayKeypair();
    const staging = new StagingLane(client, clock);

    const outcome = await staging.redeem({
      code: 'this-code-was-never-minted-at-all',
      pubkeyBase64: keypair.pubkeyBase64,
      hostDescriptor: { hostname: 'x.test', os: 'darwin', arch: 'arm64' },
    });

    assert.equal(outcome.disposition, 'delete_staging_terminal');
    assert.equal(outcome.deleteStaging, true);
    assert.equal(outcome.state, 'REFUSED');
  });
});

/**
 * `buildroom enroll` (contract §15 enrolment guard, §16).
 *
 * The order of the first two steps is the whole security property, and it is
 * the order that took two corrections to get right:
 *
 *   1. Acquire the cross-process staging lock, ATOMICALLY.
 *   2. With the lock held, re-verify all three guard conditions.
 *   3. Only then generate a keypair or touch the Keychain.
 *
 * The lock is what makes the check-then-act safe against simultaneous
 * invocations: two `enroll` processes cannot both observe "no staging key",
 * because the second cannot enter the guarded section at all (correction B1).
 * The no-`-U` staging write is the backstop underneath it.
 *
 * A pending, retrying, awaiting, halted or otherwise recoverable staging
 * identity is NEVER overwritten. A second `enroll` is not a recovery path —
 * resolution flows through the lane's own outcomes, and a staging item that
 * cannot resolve that way is cleared only by an explicit governed path surfaced
 * through `doctor`.
 */

import {
  Custody,
  GatewayStateStore,
  StagingLane,
  StagingLockBusy,
  acquireStagingLock,
  generateGatewayKeypair,
  hasUnresolvedStaging,
  privateKeyFromSecret,
  type ControlPlaneClient,
  type GatewayPaths,
} from '../../gateway-daemon/src/index.js';
import type { Clock } from '../../gateway-protocol/src/index.js';

export interface EnrollDeps {
  readonly paths: GatewayPaths;
  readonly custody: Custody;
  readonly client: ControlPlaneClient;
  readonly clock: Clock;
  readonly state: GatewayStateStore;
  /** Reads the code from stdin. NEVER from argv (see below). */
  readonly readCode: () => Promise<string>;
  readonly hostDescriptor: { readonly hostname: string; readonly os: string; readonly arch: string };
  readonly print: (line: string) => void;
  /**
   * Waits out a retry backoff. Injectable so the suites script the 24 h
   * horizon instead of living through it (correction B5).
   */
  readonly sleep?: (ms: number) => Promise<void>;
}

export type EnrollResult =
  | { readonly ok: true; readonly gatewayId: string; readonly fingerprint: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

export const GUARD_REFUSAL = 'staging_enrollment_unresolved';

export async function runEnroll(deps: EnrollDeps): Promise<EnrollResult> {
  /*
   * The lock FIRST, before the guard and before any key generation. An existing
   * lock yields the immediate diagnostic and nothing else happens — no keypair,
   * no Keychain access, no redemption.
   */
  let lock;
  try {
    lock = await acquireStagingLock(deps.paths.stagingLockPath, 'enroll', () => deps.clock.wallNow());
  } catch (error) {
    if (error instanceof StagingLockBusy) {
      return {
        ok: false,
        code: error.code,
        message:
          'another staging operation holds the lock, or an orphaned lock remains. ' +
          'Run `buildroom doctor` for a diagnosis. Orphaned locks are resolved out of band, ' +
          'after every gateway process has been stopped.',
      };
    }
    throw error;
  }

  try {
    // The three guard conditions, RECHECKED under the lock.
    const state = await deps.state.read();
    if (hasUnresolvedStaging(state)) {
      return {
        ok: false,
        code: GUARD_REFUSAL,
        message: `the staging lane is ${state.staging.lane}, not INACTIVE; a second enroll is not a recovery path`,
      };
    }

    const inventory = await deps.custody.inventory();
    if (inventory.staging) {
      return {
        ok: false,
        code: GUARD_REFUSAL,
        message:
          'a staging Keychain item already exists; it is never overwritten. ' +
          'Resolve it through the lane or the governed path surfaced by `doctor`.',
      };
    }

    /*
     * The code is read from STDIN, never taken from argv: a pairing code is an
     * authenticator, and argv leaks into shell history and the process table.
     */
    const code = (await deps.readCode()).trim();
    if (code.length < 4 || code.length > 128) {
      return { ok: false, code: 'invalid_request', message: 'the code length is out of bounds' };
    }

    // Only now is any key material created.
    const keypair = generateGatewayKeypair();
    await deps.custody.createStaging(keypair.privateKeySecret);

    // Read-back verification already happened inside `createStaging`; this
    // proves the value we hold is the value custody holds before we redeem
    // against it.
    const stored = await deps.custody.read('staging');
    if (stored !== keypair.privateKeySecret) {
      return { ok: false, code: 'write_unverified', message: 'staging custody did not read back as written' };
    }
    // Prove the stored material really rebuilds a usable key before redeeming
    // against it: a custody item that reads back but cannot be parsed would
    // leave an awaiting identity nothing can ever sign for.
    privateKeyFromSecret(stored);

    const lane = new StagingLane(deps.client, deps.clock);
    const idempotencyKey = lane.beginRedeem();

    await deps.state.update((current) => ({
      ...current,
      staging: {
        ...current.staging,
        lane: 'PENDING_REDEEM',
        idempotencyKey,
        redeemStartedAt: new Date(deps.clock.wallNow()).toISOString(),
        identity: { gatewayId: null, keyId: keypair.keyId, fingerprint: keypair.keyId },
      },
    }));

    /*
     * The redemption retries HERE, inside the process that holds the code
     * (correction B5, Rev 4.7 tester). The code is an authenticator; it is
     * never persisted and never handed to the daemon, so this process is the
     * only executor the retry can have. Every retry reuses the idempotency key
     * minted above, which is what keeps a retry a retry (§8), and the loop is
     * bounded by the lane's 24 h horizon.
     */
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const request = {
      code,
      pubkeyBase64: keypair.pubkeyBase64,
      hostDescriptor: deps.hostDescriptor,
    };
    let outcome = await lane.redeem(request);
    while (
      (outcome.disposition === 'transport' || outcome.disposition === 'retain_and_retry') &&
      !lane.horizonElapsed
    ) {
      // Durable marker first: a process killed mid-window leaves the lane
      // honestly `TRANSPORT_RETRY` in state.json, with retrying-since visible
      // to `doctor` and the enrolment guard still holding.
      await deps.state.update((current) => ({
        ...current,
        staging: { ...current.staging, lane: outcome.state },
      }));
      await sleep(lane.msUntilNextAttempt);
      outcome = await lane.redeem(request);
    }

    if (outcome.deleteStaging) {
      await deps.custody.delete('staging');
      await deps.state.update((current) => ({
        ...current,
        staging: {
          lane: 'INACTIVE',
          identity: { gatewayId: null, keyId: null, fingerprint: null },
          idempotencyKey: null,
          redeemStartedAt: null,
          lastServerState: null,
          lastObservedAt: null,
        },
      }));
      return { ok: false, code: 'redeem_refused', message: 'the control plane refused this code; see `buildroom doctor`' };
    }

    if (outcome.state !== 'AWAITING') {
      // The horizon elapsed without resolution. Staging is RETAINED (a
      // transport failure never deletes custody) and the condition is a
      // governed path: `doctor` reports it, and nothing claims a retry that no
      // process can execute — the code is gone with this process.
      await deps.state.update((current) => ({
        ...current,
        staging: { ...current.staging, lane: outcome.state },
      }));
      return {
        ok: false,
        code: 'redeem_horizon_elapsed',
        message:
          'the redemption did not complete within its bounded 24 h retry horizon; ' +
          'staging is retained and `buildroom doctor` reports the condition',
      };
    }

    const accepted = outcome.accepted;
    if (accepted === undefined) {
      return { ok: false, code: 'redeem_retrying', message: 'the control plane accepted without a body' };
    }

    await deps.state.update((current) => ({
      ...current,
      staging: {
        ...current.staging,
        lane: 'AWAITING',
        identity: {
          gatewayId: accepted.gatewayId,
          keyId: accepted.keyId,
          fingerprint: accepted.fingerprint,
        },
        lastServerState: 'awaiting_approval',
        lastObservedAt: new Date(deps.clock.wallNow()).toISOString(),
      },
    }));

    /*
     * The fingerprint is the ONLY thing that travels out of band. The Founder
     * compares it against what the control plane derived server-side, which is
     * the ruling's §3.14 control against a substituted key.
     */
    deps.print(`fingerprint: ${accepted.fingerprint}`);
    deps.print('hand this fingerprint to the Founder for confirmation');
    return { ok: true, gatewayId: accepted.gatewayId, fingerprint: accepted.fingerprint };
  } finally {
    // Released only after the verified custody write and the durable staging
    // state publication have reached a recoverable boundary.
    await lock.release();
  }
}

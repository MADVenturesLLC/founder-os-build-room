/**
 * The enrollment-slot rule in the pure registry reducer
 * (FOUNDER-ACT-20261010-TWO-GATEWAYS B2, amending DEC-20260818-01 clause 5).
 *
 * The control plane takes the lowest free slot when it confirms, and the
 * reducer applies the same rule when it replays, so that replaying the log
 * reproduces the slot column of `gateway_current_state` exactly. These cases
 * pin the rule without a database; the storage suites prove the table agrees.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENROLLMENT_SLOTS,
  MAX_ENROLLED_GATEWAYS,
  ProjectionOrderError,
  currentlyEnrolled,
  lowestFreeSlot,
  projectGatewayRegistry,
  type GatewayEventType,
  type GatewayProjectionRow,
  type GatewayRegistryEvent,
} from '../packages/gateway-registry/src/index.js';

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const C = 'cccccccc-0000-4000-8000-000000000003';

let seq = 0;
function event(eventType: GatewayEventType, gatewayId: string): GatewayRegistryEvent {
  seq += 1;
  return {
    seq,
    eventType,
    gatewayId,
    keyId: eventType === 'key_received' ? `key-${gatewayId}` : null,
    pubkeyBase64: null,
    hostDescriptor: null,
    occurredAt: new Date(Date.UTC(2026, 9, 10, 0, 0, seq)).toISOString(),
    awaitingApprovalExpiresAt: null,
  };
}

function enrolled(gatewayId: string): GatewayRegistryEvent[] {
  return [event('key_received', gatewayId), event('enrolled', gatewayId)];
}

describe('gateway-registry · enrollment slots', () => {
  it('has two slots, so at most two gateways are enrolled', () => {
    assert.deepEqual([...ENROLLMENT_SLOTS], [1, 2]);
    assert.equal(MAX_ENROLLED_GATEWAYS, 2);
  });

  it('takes the lowest free slot, and none when both are held', () => {
    assert.equal(lowestFreeSlot([]), 1);
    assert.equal(lowestFreeSlot([1]), 2);
    assert.equal(lowestFreeSlot([2]), 1);
    assert.equal(lowestFreeSlot([1, 2]), null);
    assert.equal(lowestFreeSlot([2, 1]), null);
  });

  it('assigns slots in replay as the control plane assigns them on confirm', () => {
    const rows = projectGatewayRegistry([
      ...enrolled(A),
      ...enrolled(B),
      event('revoked', A),
      ...enrolled(C),
    ]);
    assert.equal(rows.get(A)?.enrollmentSlot, null, 'a revoked gateway holds no slot');
    assert.equal(rows.get(A)?.isCurrentlyEnrolled, false);
    assert.equal(rows.get(B)?.enrollmentSlot, 2);
    assert.equal(rows.get(C)?.enrollmentSlot, 1, 'the freed slot is taken again');
  });

  it('gives an awaiting, denied or expired gateway no slot', () => {
    const rows = projectGatewayRegistry([
      event('key_received', A),
      event('key_received', B),
      event('denied', B),
      event('key_received', C),
      event('expired', C),
    ]);
    for (const id of [A, B, C]) assert.equal(rows.get(id)?.enrollmentSlot, null);
  });

  it('raises, rather than projects, a log that enrolls a third gateway', () => {
    assert.throws(
      () => projectGatewayRegistry([...enrolled(A), ...enrolled(B), ...enrolled(C)]),
      (error: unknown) => error instanceof ProjectionOrderError && /every enrollment slot is held/.test(error.message),
    );
  });

  it('lists the enrolled gateways in slot order', () => {
    const rows = projectGatewayRegistry([...enrolled(A), ...enrolled(B), event('revoked', A), ...enrolled(C)]);
    assert.deepEqual(
      currentlyEnrolled(rows).map((row) => [row.gatewayId, row.enrollmentSlot]),
      [
        [C, 1],
        [B, 2],
      ],
    );
    assert.deepEqual(currentlyEnrolled(new Map()), []);
  });

  it('raises when the rows it is given break the slot invariant', () => {
    const row = (gatewayId: string, slot: 1 | 2 | null): GatewayProjectionRow => ({
      gatewayId,
      state: 'enrolled',
      keyId: null,
      pubkeyBase64: null,
      hostDescriptor: null,
      stateSince: '2026-10-10T00:00:00.000Z',
      lastEventSeq: 1,
      awaitingApprovalExpiresAt: null,
      isCurrentlyEnrolled: true,
      enrollmentSlot: slot,
    });
    const twoInOneSlot = new Map([
      [A, row(A, 1)],
      [B, row(B, 1)],
    ]);
    const enrolledWithoutSlot = new Map([[A, row(A, null)]]);
    assert.throws(() => currentlyEnrolled(twoInOneSlot), ProjectionOrderError);
    assert.throws(() => currentlyEnrolled(enrolledWithoutSlot), ProjectionOrderError);
  });
});

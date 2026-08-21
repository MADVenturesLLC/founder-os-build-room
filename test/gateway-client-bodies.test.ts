/**
 * §14 (correction T1, Rev 4.7 tester) — a success body is part of the closed
 * vocabulary too.
 *
 * The delivered client checked only that a payload was JSON-parseable. A 202
 * missing `gatewayId` — or carrying a number where the UUID belongs — flowed
 * downstream as a success, and the staging lane's `String(x ?? '')` coercion
 * turned it into an empty-string identity that state then persisted as if the
 * Founder had confirmed it. Per §14 a response outside the declared shapes IS
 * the transport category: retain, bounded retry, surfaced through `doctor`.
 *
 * Every case here is one HTTP exchange against an injected fetch, so the
 * verdict is a fact about the client's classification, not about a server.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ControlPlaneClient,
  type FetchLike,
} from '../packages/gateway-daemon/src/client.js';

const GATEWAY_ID = '11111111-2222-4333-8444-555555555555';
const HEX64 = 'ab'.repeat(32);

function respondsWith(status: number, body: unknown): FetchLike {
  return async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function client(fetchImpl: FetchLike): ControlPlaneClient {
  return new ControlPlaneClient('http://control-plane.invalid', fetchImpl);
}

describe('gateway-client · challenge success bodies', () => {
  const valid = {
    generation: 4,
    challenge: HEX64,
    issuedAt: new Date('2026-08-19T12:00:00Z').toISOString(),
  };

  it('accepts the declared shape', async () => {
    const response = await client(respondsWith(200, valid)).challenge();
    assert.equal(response.transport, false);
    assert.equal(response.status, 200);
  });

  it('rejects a missing challenge member', async () => {
    const response = await client(respondsWith(200, { generation: 4, issuedAt: valid.issuedAt })).challenge();
    assert.equal(response.transport, true, 'an incomplete success body is not a success');
    assert.match(String(response.detail), /invalid success body/);
  });

  it('rejects a non-numeric generation', async () => {
    const response = await client(
      respondsWith(200, { generation: '4', challenge: HEX64, issuedAt: valid.issuedAt }),
    ).challenge();
    assert.equal(response.transport, true);
  });

  it('rejects a challenge that is not 64 lowercase hex', async () => {
    const response = await client(
      respondsWith(200, { generation: 4, challenge: 'AB'.repeat(32), issuedAt: valid.issuedAt }),
    ).challenge();
    assert.equal(response.transport, true);
  });

  it('rejects an issuedAt that is not a timestamp', async () => {
    const response = await client(
      respondsWith(200, { generation: 4, challenge: HEX64, issuedAt: 'not-a-time' }),
    ).challenge();
    assert.equal(response.transport, true);
  });

  it('passes a structured refusal through untouched', async () => {
    const response = await client(respondsWith(503, { error: 'not_leader' })).challenge();
    assert.equal(response.transport, false);
    assert.equal(response.error, 'not_leader');
  });
});

describe('gateway-client · enroll success bodies', () => {
  const valid = {
    gatewayId: GATEWAY_ID,
    keyId: HEX64,
    fingerprint: HEX64,
    awaitingApprovalExpiresAt: new Date('2026-08-19T13:00:00Z').toISOString(),
  };

  it('accepts the declared shape', async () => {
    const response = await client(respondsWith(202, valid)).enroll({});
    assert.equal(response.transport, false);
    assert.equal(response.status, 202);
  });

  it('rejects a gatewayId that is not a canonical UUID', async () => {
    const response = await client(respondsWith(202, { ...valid, gatewayId: 'not-a-uuid' })).enroll({});
    assert.equal(response.transport, true);
    assert.match(String(response.detail), /invalid success body/);
  });

  it('rejects a fingerprint of the wrong length', async () => {
    const response = await client(respondsWith(202, { ...valid, fingerprint: 'ab'.repeat(16) })).enroll({});
    assert.equal(response.transport, true);
  });

  it('rejects a missing keyId', async () => {
    const response = await client(
      respondsWith(202, { gatewayId: GATEWAY_ID, fingerprint: HEX64, awaitingApprovalExpiresAt: valid.awaitingApprovalExpiresAt }),
    ).enroll({});
    assert.equal(response.transport, true);
  });

  it('rejects an awaitingApprovalExpiresAt that is not a timestamp', async () => {
    const response = await client(respondsWith(202, { ...valid, awaitingApprovalExpiresAt: 4711 })).enroll({});
    assert.equal(response.transport, true);
  });

  it('passes a structured refusal through untouched', async () => {
    const response = await client(respondsWith(409, { error: 'code_invalid' })).enroll({});
    assert.equal(response.transport, false);
    assert.equal(response.error, 'code_invalid');
  });
});

describe('gateway-client · session-start success bodies', () => {
  const valid = { ok: true, state: 'enrolled', epoch: HEX64, gatewayId: GATEWAY_ID };

  it('accepts the declared shape', async () => {
    const response = await client(respondsWith(200, valid)).sessionStart({});
    assert.equal(response.transport, false);
  });

  it('rejects a missing epoch', async () => {
    const response = await client(respondsWith(200, { ok: true, state: 'enrolled', gatewayId: GATEWAY_ID })).sessionStart({});
    assert.equal(response.transport, true);
    assert.match(String(response.detail), /invalid success body/);
  });

  it('rejects an epoch that is not 64 lowercase hex', async () => {
    const response = await client(respondsWith(200, { ...valid, epoch: 'short' })).sessionStart({});
    assert.equal(response.transport, true);
  });

  it('rejects a state other than enrolled on a 200', async () => {
    const response = await client(respondsWith(200, { ...valid, state: 'awaiting_approval' })).sessionStart({});
    assert.equal(response.transport, true);
  });

  it('rejects a missing ok member', async () => {
    const response = await client(respondsWith(200, { state: 'enrolled', epoch: HEX64, gatewayId: GATEWAY_ID })).sessionStart({});
    assert.equal(response.transport, true);
  });

  it('passes the state ladder through untouched', async () => {
    const response = await client(respondsWith(403, { error: 'awaiting_approval' })).sessionStart({});
    assert.equal(response.transport, false);
    assert.equal(response.error, 'awaiting_approval');
  });
});

describe('gateway-client · heartbeat success bodies', () => {
  const valid = { ok: true, state: 'enrolled', epoch: HEX64 };

  it('accepts the declared shape', async () => {
    const response = await client(respondsWith(200, valid)).heartbeat({});
    assert.equal(response.transport, false);
  });

  it('rejects a non-string epoch', async () => {
    const response = await client(respondsWith(200, { ok: true, state: 'enrolled', epoch: 7 })).heartbeat({});
    assert.equal(response.transport, true);
    assert.match(String(response.detail), /invalid success body/);
  });

  it('passes a structured refusal through untouched', async () => {
    const response = await client(respondsWith(409, { error: 'session_required' })).heartbeat({});
    assert.equal(response.transport, false);
    assert.equal(response.error, 'session_required');
  });
});

describe('gateway-client · an empty success body is not a success (correction 5, #7)', () => {
  const emptyBody: FetchLike = async () =>
    new Response('', { status: 200, headers: { 'content-type': 'application/json' } });

  it('classifies a 200 challenge with an empty body as transport', async () => {
    const response = await client(emptyBody).challenge();
    assert.equal(response.transport, true, 'an empty body does not satisfy the declared success shape');
    assert.match(String(response.detail), /invalid success body/);
  });

  it('classifies a 200 session-start with an empty body as transport', async () => {
    const response = await client(emptyBody).sessionStart({});
    assert.equal(response.transport, true, 'an empty body does not satisfy the declared success shape');
    assert.match(String(response.detail), /invalid success body/);
  });
});

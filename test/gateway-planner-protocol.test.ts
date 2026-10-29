/**
 * The planner pull channel's wire protocol (plan r1 Q2b): the two
 * session-bound purposes, their signed bytes, and the closed request and
 * report shapes both sides validate against.
 *
 * What is proven: each purpose signs under its own domain tag, so a heartbeat
 * signature never verifies as a poll and a poll's never as a report; a
 * report's signature covers its request id and its payload's digest, not the
 * payload text; the envelope validators refuse unknown members, a missing
 * member, and a cross-purpose envelope as `purpose_mismatch`; the payload
 * bound is enforced in UTF-8 bytes; and the request and report validators
 * accept exactly their shapes, nothing extra and nothing coerced.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, verify } from 'node:crypto';
import {
  MAX_PLANNER_PAYLOAD_BYTES,
  PURPOSES,
  answersRequest,
  heartbeatSignedBytes,
  plannerPollCanonicalArray,
  plannerPollSignedBytes,
  plannerReportCanonicalArray,
  plannerReportSignedBytes,
  validateHeartbeat,
  validatePlannerPoll,
  validatePlannerReport,
  validatePlannerReportPayload,
  validatePlannerRequest,
  CanonicalInputError,
} from '../packages/gateway-protocol/src/index.js';
import { buildHeartbeat, buildPlannerPoll, buildPlannerReport } from '../packages/gateway-daemon/src/index.js';
import { generateTestKeypair, hex32, publicKeyFromRaw, uuid } from './gateway-helpers.js';
import type { GatewayIdentity } from '../packages/gateway-daemon/src/index.js';

const clock = { wallNow: () => 1_770_000_000_000, monotonicNow: () => 1 };

function identity(): { identity: GatewayIdentity; raw: Uint8Array } {
  const key = generateTestKeypair();
  return {
    identity: { gatewayId: uuid(), keyId: key.keyId, pubkeyBase64: key.pubkeyBase64, privateKey: key.privateKey },
    raw: key.rawPublicKey,
  };
}

function verifies(raw: Uint8Array, bytes: Uint8Array, signature: unknown): boolean {
  return verify(null, Buffer.from(bytes), publicKeyFromRaw(raw), Buffer.from(String(signature), 'base64'));
}

function sessionCanonical(envelope: Record<string, unknown>) {
  return {
    gatewayId: envelope['gatewayId'] as string,
    keyId: envelope['keyId'] as string,
    epoch: envelope['epoch'] as string,
    sequence: envelope['sequence'] as number,
    nonce: envelope['nonce'] as string,
    timestampMs: envelope['timestampMs'] as number,
  };
}

const ROUTE = { provider: 'example-provider', model: 'example-model', executionSurface: 'claude-code' };
const WORK = {
  commandId: 'cmd_planner_0123',
  roomId: uuid(),
  repository: 'example-org/example-repo',
  baseSha: 'a'.repeat(40),
  scopePaths: ['src/health.ts'],
  goalEventId: 'evt_goal',
  goal: 'Add a health detail field.',
  goalDigest: 'b'.repeat(64),
};

describe('gateway-planner-protocol · purposes and signed bytes', () => {
  it('has exactly four purposes', () => {
    assert.deepEqual([...PURPOSES], ['session_start', 'heartbeat', 'planner_poll', 'planner_report']);
  });

  it('signs a poll under its own domain tag, so a heartbeat signature never verifies as a poll', () => {
    const { identity: id, raw } = identity();
    const epoch = hex32();
    const beat = buildHeartbeat(id, epoch, 7, clock);
    const canonical = sessionCanonical(beat);
    assert.ok(verifies(raw, heartbeatSignedBytes(canonical), beat['signature']));
    assert.equal(verifies(raw, plannerPollSignedBytes(canonical), beat['signature']), false);

    const poll = buildPlannerPoll(id, epoch, 8, clock);
    assert.ok(verifies(raw, plannerPollSignedBytes(sessionCanonical(poll)), poll['signature']));
    assert.equal(verifies(raw, heartbeatSignedBytes(sessionCanonical(poll)), poll['signature']), false);
    assert.equal(plannerPollCanonicalArray(sessionCanonical(poll))[2], 'planner_poll');
  });

  it('signs a report over its request id and payload digest, not the payload text', () => {
    const { identity: id, raw } = identity();
    const requestId = uuid();
    const payload = JSON.stringify({ kind: 'never_received' });
    const report = buildPlannerReport(id, hex32(), 9, requestId, payload, clock);
    const digest = createHash('sha256').update(payload, 'utf8').digest('hex');
    assert.equal(report['payloadDigest'], digest);
    assert.equal(report['payload'], payload);

    const input = { ...sessionCanonical(report), requestId, payloadDigest: digest };
    assert.ok(verifies(raw, plannerReportSignedBytes(input), report['signature']));
    // A different request id, or a different digest, is a different signed message.
    assert.equal(verifies(raw, plannerReportSignedBytes({ ...input, requestId: uuid() }), report['signature']), false);
    assert.equal(verifies(raw, plannerReportSignedBytes({ ...input, payloadDigest: hex32() }), report['signature']), false);
    assert.deepEqual(plannerReportCanonicalArray(input).slice(-2), [requestId, digest]);
  });

  it('refuses to build canonical bytes from an unvalidated request id', () => {
    const { identity: id } = identity();
    const report = buildPlannerReport(id, hex32(), 1, uuid(), '{"kind":"not_sent"}', clock);
    assert.throws(
      () => plannerReportCanonicalArray({ ...sessionCanonical(report), requestId: 'not-a-uuid', payloadDigest: hex32() }),
      CanonicalInputError,
    );
  });
});

describe('gateway-planner-protocol · envelope validation', () => {
  it('accepts a built poll and a built report', () => {
    const { identity: id } = identity();
    assert.equal(validatePlannerPoll(buildPlannerPoll(id, hex32(), 1, clock)).ok, true);
    assert.equal(validatePlannerReport(buildPlannerReport(id, hex32(), 2, uuid(), '{"kind":"not_sent"}', clock)).ok, true);
  });

  it('reports a cross-purpose envelope as purpose_mismatch, in every direction', () => {
    const { identity: id } = identity();
    const beat = buildHeartbeat(id, hex32(), 1, clock);
    const poll = buildPlannerPoll(id, hex32(), 1, clock);
    const report = buildPlannerReport(id, hex32(), 1, uuid(), '{"kind":"not_sent"}', clock);
    const asPoll = validatePlannerPoll(beat);
    assert.equal(asPoll.ok, false);
    assert.equal(!asPoll.ok && asPoll.error, 'purpose_mismatch');
    const asReport = validatePlannerReport(poll);
    assert.equal(!asReport.ok && asReport.error, 'purpose_mismatch');
    const asBeat = validateHeartbeat(report);
    assert.equal(!asBeat.ok && asBeat.error, 'purpose_mismatch');
  });

  it('refuses an unknown member and a missing member', () => {
    const { identity: id } = identity();
    const poll = buildPlannerPoll(id, hex32(), 1, clock);
    const extra = validatePlannerPoll({ ...poll, request: null });
    assert.equal(!extra.ok && extra.detail, 'unknown field request');
    const report = buildPlannerReport(id, hex32(), 1, uuid(), '{"kind":"not_sent"}', clock);
    const missing: Record<string, unknown> = { ...report };
    delete missing['payload'];
    const result = validatePlannerReport(missing);
    assert.equal(!result.ok && result.detail, 'missing field payload');
  });

  it('bounds the payload in UTF-8 bytes, not characters', () => {
    const { identity: id } = identity();
    // Three bytes per character: under the bound in characters, over it in bytes.
    const wide = '€'.repeat(Math.floor(MAX_PLANNER_PAYLOAD_BYTES / 3) + 1);
    assert.ok(wide.length < MAX_PLANNER_PAYLOAD_BYTES);
    const result = validatePlannerReport(buildPlannerReport(id, hex32(), 1, uuid(), wide, clock));
    assert.equal(!result.ok && result.detail, 'payload');
    const empty = validatePlannerReport(buildPlannerReport(id, hex32(), 1, uuid(), '', clock));
    assert.equal(!empty.ok && empty.detail, 'payload');
  });
});

describe('gateway-planner-protocol · requests and reports', () => {
  it('accepts exactly the three request shapes', () => {
    const requestId = uuid();
    assert.ok(validatePlannerRequest({ requestId, kind: 'attest', commandId: 'cmd_1', role: 'architect', intended: ROUTE }));
    assert.ok(validatePlannerRequest({ requestId, kind: 'execute', commandId: WORK.commandId, executionId: 'exec-1', work: WORK }));
    assert.ok(
      validatePlannerRequest({
        requestId,
        kind: 'execute',
        commandId: WORK.commandId,
        executionId: 'exec-1',
        work: { ...WORK, revision: { feedback: 'Narrower.', revisingPlanHash: 'c'.repeat(64) } },
      }),
    );
    assert.ok(validatePlannerRequest({ requestId, kind: 'status', commandId: 'cmd_1' }));
  });

  it('refuses a request with an extra member, a bad id, an empty scope, or work for another command', () => {
    const requestId = uuid();
    assert.equal(validatePlannerRequest({ requestId, kind: 'status', commandId: 'cmd_1', extra: 1 }), null);
    assert.equal(validatePlannerRequest({ requestId: 'nope', kind: 'status', commandId: 'cmd_1' }), null);
    assert.equal(validatePlannerRequest({ requestId, kind: 'cancel', commandId: 'cmd_1' }), null);
    assert.equal(
      validatePlannerRequest({ requestId, kind: 'execute', commandId: WORK.commandId, executionId: 'e', work: { ...WORK, scopePaths: [] } }),
      null,
    );
    assert.equal(
      validatePlannerRequest({ requestId, kind: 'execute', commandId: 'cmd_other', executionId: 'e', work: WORK }),
      null,
    );
    assert.equal(
      validatePlannerRequest({ requestId, kind: 'attest', commandId: 'cmd_1', role: 'architect', intended: { ...ROUTE, extra: 'x' } }),
      null,
    );
  });

  it('accepts exactly the report shapes, and refuses an unregistered surface', () => {
    const identityWire = { executionId: 'exec-1', role: 'architect', surface: 'antigravity', model: 'm', provider: 'p', effort: 'n/a' };
    assert.ok(validatePlannerReportPayload({ kind: 'attested', identity: identityWire }));
    assert.equal(validatePlannerReportPayload({ kind: 'attested', identity: { ...identityWire, surface: 'other' } }), null);
    for (const kind of ['attest_failed', 'not_sent', 'never_received']) {
      assert.ok(validatePlannerReportPayload({ kind }));
      assert.equal(validatePlannerReportPayload({ kind, note: 'x' }), null);
    }
    assert.ok(validatePlannerReportPayload({ kind: 'accepted', observed: ROUTE }));
    assert.ok(validatePlannerReportPayload({ kind: 'running', executionId: 'exec-1', observed: ROUTE }));
    assert.ok(
      validatePlannerReportPayload({ kind: 'finished', executionId: 'exec-1', observed: ROUTE, result: { kind: 'plan', document: {} } }),
    );
    assert.ok(validatePlannerReportPayload({ kind: 'finished', executionId: 'exec-1', observed: ROUTE, result: { kind: 'failed' } }));
    assert.equal(
      validatePlannerReportPayload({ kind: 'finished', executionId: 'exec-1', observed: ROUTE, result: { kind: 'failed', why: 'x' } }),
      null,
    );
    assert.equal(validatePlannerReportPayload({ kind: 'running', executionId: '', observed: ROUTE }), null);
  });

  it('carries the init model and conversation id on accepted, running and finished, both or neither, bounded (journal act B2)', () => {
    const init = { initModel: 'gemini-4-argon-high', conversationId: '3b2c7a4c-1bda-46b1-8dc1-44641701df02' };
    const answers = [
      { kind: 'accepted', observed: ROUTE },
      { kind: 'running', executionId: 'exec-1', observed: ROUTE },
      { kind: 'finished', executionId: 'exec-1', observed: ROUTE, result: { kind: 'failed' } },
    ];
    for (const answer of answers) {
      assert.ok(validatePlannerReportPayload({ ...answer, ...init }), `${answer.kind} with both`);
      assert.ok(validatePlannerReportPayload(answer), `${answer.kind} with neither`);
      assert.equal(validatePlannerReportPayload({ ...answer, initModel: init.initModel }), null, `${answer.kind} with initModel alone`);
      assert.equal(validatePlannerReportPayload({ ...answer, conversationId: init.conversationId }), null, `${answer.kind} with conversationId alone`);
      assert.equal(validatePlannerReportPayload({ ...answer, ...init, initModel: ' ' }), null, `${answer.kind} with an empty initModel`);
      assert.equal(validatePlannerReportPayload({ ...answer, ...init, conversationId: 'x'.repeat(257) }), null, `${answer.kind} with an overlong conversationId`);
      assert.equal(validatePlannerReportPayload({ ...answer, ...init, initModel: 7 }), null, `${answer.kind} with a non-string initModel`);
    }
    for (const kind of ['attest_failed', 'not_sent', 'never_received']) {
      assert.equal(validatePlannerReportPayload({ kind, ...init }), null, `${kind} carries no init fields`);
    }
  });

  it('pairs each request kind with only its own answers', () => {
    assert.ok(answersRequest('attest', 'attested'));
    assert.ok(answersRequest('execute', 'not_sent'));
    assert.ok(answersRequest('status', 'finished'));
    assert.equal(answersRequest('attest', 'accepted'), false);
    assert.equal(answersRequest('execute', 'never_received'), false);
    assert.equal(answersRequest('status', 'not_sent'), false);
  });
});

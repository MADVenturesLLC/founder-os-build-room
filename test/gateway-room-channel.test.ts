/**
 * The runtime-room channel's control-plane mailbox, without a network
 * (FOUNDER-ACT-20261117-BR-PHASE5-STEP1 B2).
 *
 * What is proven, method by method:
 *   - `requestMint` opens at most one request per (Gateway, lifecycle room)
 *     pair, returning the open one's id when asked again, and refuses a
 *     malformed id;
 *   - `collect` shows a request only to its Gateway, undelivered first, then
 *     the least recently delivered, and re-delivers until answered;
 *   - `recordMinted` accepts only a delivered open request of this Gateway
 *     with the same request id and lifecycle room, and refuses, changing
 *     nothing, anything else, including a runtime room this Gateway already
 *     reported for another lifecycle room;
 *   - `mintedFor` lists what was recorded, per Gateway and lifecycle room;
 *   - `recordOccupancy` records only for a room this Gateway reported minted
 *     for that lifecycle room, and `occupancyOf` reads the latest, with the
 *     monotonic time it was received;
 *   - everything is dropped when the leadership term moves (fail closed).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GatewayRoomChannel,
  RoomChannelInputError,
  type RoomOccupancyReading,
} from '../packages/control-plane/src/gateway/index.js';
import type { RuntimeRoomMintedPayload } from '../packages/gateway-protocol/src/index.js';
import { uuid } from './gateway-helpers.js';

function scriptedClock(start = 5_000): { monotonicNow(): number; advance(ms: number): void } {
  let now = start;
  return {
    monotonicNow: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function roomId(): string {
  return `room-${uuid()}`;
}

/** A request asked, delivered, and answered with a minted room. */
function mint(channel: GatewayRoomChannel, gatewayId: string, lifecycleRoomId: string, runtimeRoomId = roomId()): RuntimeRoomMintedPayload {
  const { requestId } = channel.requestMint(gatewayId, lifecycleRoomId);
  const collected = channel.collect(gatewayId);
  assert.equal(collected?.requestId, requestId);
  const payload: RuntimeRoomMintedPayload = { requestId, lifecycleRoomId, runtimeRoomId, occupancy: 'PREPARED' };
  assert.equal(channel.recordMinted(gatewayId, payload), true);
  return payload;
}

describe('gateway-room-channel · requestMint', () => {
  it('opens a request and returns its id; asking again for the same pair opens nothing', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const first = channel.requestMint(gatewayId, lifecycleRoomId);
    const again = channel.requestMint(gatewayId, lifecycleRoomId);
    assert.equal(again.requestId, first.requestId, 'at most one open request per pair');
    assert.deepEqual(channel.collect(gatewayId), { kind: 'mint', requestId: first.requestId, lifecycleRoomId });
    // Delivered but unanswered is still open: still one request.
    assert.equal(channel.requestMint(gatewayId, lifecycleRoomId).requestId, first.requestId);
  });

  it('opens separate requests for another lifecycle room or another Gateway', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const base = channel.requestMint(gatewayId, lifecycleRoomId).requestId;
    assert.notEqual(channel.requestMint(gatewayId, uuid()).requestId, base);
    assert.notEqual(channel.requestMint(uuid(), lifecycleRoomId).requestId, base);
  });

  it('opens a new request once the earlier one was answered', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const answered = mint(channel, gatewayId, lifecycleRoomId);
    const next = channel.requestMint(gatewayId, lifecycleRoomId);
    assert.notEqual(next.requestId, answered.requestId);
  });

  it('refuses a malformed Gateway id or lifecycle room id', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    for (const [gatewayId, lifecycleRoomId] of [
      ['not-a-uuid', uuid()],
      [uuid().toUpperCase(), uuid()],
      [uuid(), `room-${uuid()}`],
      [uuid(), ''],
    ] as const) {
      assert.throws(() => channel.requestMint(gatewayId, lifecycleRoomId), RoomChannelInputError);
    }
    assert.equal(channel.collect(uuid()), null);
  });
});

describe('gateway-room-channel · collect', () => {
  it('shows a request only to the Gateway it is addressed to', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const mine = uuid();
    const other = uuid();
    channel.requestMint(mine, uuid());
    assert.equal(channel.collect(other), null);
    assert.ok(channel.collect(mine));
  });

  it('re-delivers until answered, undelivered first, then least recently delivered', () => {
    const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
    let next = 0;
    const channel = new GatewayRoomChannel(scriptedClock(), { mintRequestId: () => ids[next++]! });
    const gatewayId = uuid();
    const a = channel.requestMint(gatewayId, uuid()).requestId;
    const b = channel.requestMint(gatewayId, uuid()).requestId;
    assert.equal(channel.collect(gatewayId)?.requestId, a);
    assert.equal(channel.collect(gatewayId)?.requestId, b);
    assert.equal(channel.collect(gatewayId)?.requestId, a, 'unanswered, so re-delivered');
    const c = channel.requestMint(gatewayId, uuid()).requestId;
    assert.equal(channel.collect(gatewayId)?.requestId, c, 'an undelivered request goes first');
    assert.equal(channel.collect(gatewayId)?.requestId, b);
  });

  it('hands out a copy: a caller cannot edit the open request', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    channel.requestMint(gatewayId, lifecycleRoomId);
    const collected = channel.collect(gatewayId);
    assert.ok(collected);
    (collected as { lifecycleRoomId: string }).lifecycleRoomId = uuid();
    assert.equal(channel.collect(gatewayId)?.lifecycleRoomId, lifecycleRoomId);
  });
});

describe('gateway-room-channel · recordMinted and mintedFor', () => {
  it('records a delivered request answered with its own id and lifecycle room, and closes it', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const payload = mint(channel, gatewayId, lifecycleRoomId);
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), [payload.runtimeRoomId]);
    assert.equal(channel.collect(gatewayId), null, 'the answered request is closed');
    assert.equal(channel.recordMinted(gatewayId, payload), false, 'a repeat answers no open request');
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), [payload.runtimeRoomId]);
  });

  it('refuses, changing nothing: an undelivered request, another Gateway, another request id, another lifecycle room', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const { requestId } = channel.requestMint(gatewayId, lifecycleRoomId);
    const payload: RuntimeRoomMintedPayload = { requestId, lifecycleRoomId, runtimeRoomId: roomId(), occupancy: 'PREPARED' };

    assert.equal(channel.recordMinted(gatewayId, payload), false, 'never delivered: nothing can answer it');
    assert.equal(channel.collect(gatewayId)?.requestId, requestId);
    assert.equal(channel.recordMinted(uuid(), payload), false, 'another Gateway');
    assert.equal(channel.recordMinted(gatewayId, { ...payload, requestId: uuid() }), false, 'no such request');
    assert.equal(channel.recordMinted(gatewayId, { ...payload, lifecycleRoomId: uuid() }), false, 'another lifecycle room');
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), []);
    assert.equal(channel.occupancyOf(gatewayId, payload.runtimeRoomId), null);
    // Still open: the right answer is still accepted.
    assert.equal(channel.recordMinted(gatewayId, payload), true);
  });

  it('refuses a runtime room this Gateway already reported for a different lifecycle room', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const first = mint(channel, gatewayId, uuid());
    const otherLifecycle = uuid();
    const { requestId } = channel.requestMint(gatewayId, otherLifecycle);
    channel.collect(gatewayId);
    const reused: RuntimeRoomMintedPayload = { requestId, lifecycleRoomId: otherLifecycle, runtimeRoomId: first.runtimeRoomId, occupancy: 'PREPARED' };
    assert.equal(channel.recordMinted(gatewayId, reused), false);
    assert.deepEqual(channel.mintedFor(gatewayId, otherLifecycle), []);
    assert.deepEqual(channel.mintedFor(gatewayId, first.lifecycleRoomId), [first.runtimeRoomId]);
  });

  it('lists each runtime room once, oldest first, and keeps each Gateway to its own', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const first = mint(channel, gatewayId, lifecycleRoomId);
    // A later request answered with the same room (a Gateway re-answering for the lifecycle room it holds).
    mint(channel, gatewayId, lifecycleRoomId, first.runtimeRoomId);
    const second = mint(channel, gatewayId, lifecycleRoomId);
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), [first.runtimeRoomId, second.runtimeRoomId]);
    assert.deepEqual(channel.mintedFor(uuid(), lifecycleRoomId), [], 'another Gateway reported nothing');
    const listed = channel.mintedFor(gatewayId, lifecycleRoomId) as string[];
    listed.push('room-tampered');
    assert.equal(channel.mintedFor(gatewayId, lifecycleRoomId).length, 2, 'the list handed out is a copy');
  });
});

describe('gateway-room-channel · recordOccupancy and occupancyOf', () => {
  it('records the minted report occupancy first, then each later report, with its receipt time', () => {
    const clock = scriptedClock(1_000);
    const channel = new GatewayRoomChannel(clock);
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const minted = mint(channel, gatewayId, lifecycleRoomId);
    assert.deepEqual(channel.occupancyOf(gatewayId, minted.runtimeRoomId), { occupancy: 'PREPARED', receivedAtMono: 1_000 });

    clock.advance(250);
    assert.equal(channel.recordOccupancy(gatewayId, { lifecycleRoomId, runtimeRoomId: minted.runtimeRoomId, occupancy: 'OCCUPIED' }), true);
    const reading: RoomOccupancyReading | null = channel.occupancyOf(gatewayId, minted.runtimeRoomId);
    assert.deepEqual(reading, { occupancy: 'OCCUPIED', receivedAtMono: 1_250 });

    clock.advance(10);
    assert.equal(channel.recordOccupancy(gatewayId, { lifecycleRoomId, runtimeRoomId: minted.runtimeRoomId, occupancy: 'CLOSED' }), true);
    assert.deepEqual(channel.occupancyOf(gatewayId, minted.runtimeRoomId), { occupancy: 'CLOSED', receivedAtMono: 1_260 });
  });

  it('refuses occupancy for a room not reported minted, for another lifecycle room, or from another Gateway', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const minted = mint(channel, gatewayId, lifecycleRoomId);
    const stranger = roomId();
    assert.equal(channel.recordOccupancy(gatewayId, { lifecycleRoomId, runtimeRoomId: stranger, occupancy: 'CLOSED' }), false);
    assert.equal(channel.occupancyOf(gatewayId, stranger), null);
    assert.equal(
      channel.recordOccupancy(gatewayId, { lifecycleRoomId: uuid(), runtimeRoomId: minted.runtimeRoomId, occupancy: 'CLOSED' }),
      false,
      'the room was minted for another lifecycle room',
    );
    const other = uuid();
    assert.equal(channel.recordOccupancy(other, { lifecycleRoomId, runtimeRoomId: minted.runtimeRoomId, occupancy: 'CLOSED' }), false);
    assert.equal(channel.occupancyOf(other, minted.runtimeRoomId), null, 'what one Gateway reported is not another\'s');
    assert.equal(channel.occupancyOf(gatewayId, minted.runtimeRoomId)?.occupancy, 'PREPARED', 'nothing changed');
  });
});

describe('gateway-room-channel · leader-local: dropped on a leadership change', () => {
  it('drops open requests, minted rooms and occupancy when the term moves, and refuses until reported again', () => {
    let term = 3;
    const channel = new GatewayRoomChannel(scriptedClock(), { leaderTerm: () => term });
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const minted = mint(channel, gatewayId, lifecycleRoomId);
    const pending = channel.requestMint(gatewayId, uuid());
    channel.collect(gatewayId);

    term += 1; // demoted (and perhaps re-acquired): what this process held is gone
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), []);
    assert.equal(channel.occupancyOf(gatewayId, minted.runtimeRoomId), null);
    assert.equal(channel.collect(gatewayId), null, 'the open request is gone too');
    assert.equal(
      channel.recordMinted(gatewayId, { requestId: pending.requestId, lifecycleRoomId, runtimeRoomId: roomId(), occupancy: 'PREPARED' }),
      false,
    );
    assert.equal(channel.recordOccupancy(gatewayId, { lifecycleRoomId, runtimeRoomId: minted.runtimeRoomId, occupancy: 'CLOSED' }), false);

    // A fresh request in the new term works as before.
    const again = mint(channel, gatewayId, lifecycleRoomId, minted.runtimeRoomId);
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), [again.runtimeRoomId]);
  });

  it('keeps everything while the term holds', () => {
    const channel = new GatewayRoomChannel(scriptedClock(), { leaderTerm: () => 7 });
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const minted = mint(channel, gatewayId, lifecycleRoomId);
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), [minted.runtimeRoomId]);
  });
});

describe('gateway-room-channel · cancelMint and the created flag', () => {
  it('says whether requestMint opened a request, and cancelMint withdraws an open one, delivered or not', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const first = channel.requestMint(gatewayId, lifecycleRoomId);
    assert.equal(first.created, true);
    assert.equal(channel.requestMint(gatewayId, lifecycleRoomId).created, false, 'the pair already has one open');
    assert.equal(channel.collect(gatewayId)?.requestId, first.requestId);

    assert.equal(channel.cancelMint(first.requestId), true);
    assert.equal(channel.collect(gatewayId), null, 'no longer delivered');
    assert.equal(
      channel.recordMinted(gatewayId, { requestId: first.requestId, lifecycleRoomId, runtimeRoomId: roomId(), occupancy: 'PREPARED' }),
      false,
      'a minted report answering a withdrawn request is refused',
    );
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), []);
    assert.equal(channel.cancelMint(first.requestId), false, 'nothing open by that id any more');
    assert.equal(channel.requestMint(gatewayId, lifecycleRoomId).created, true, 'the pair can be asked again');
  });
});

describe('gateway-room-channel · sessionStarted (a new session may follow a daemon restart)', () => {
  it("stops believing one Gateway's earlier minted rooms and readings, and nothing of another Gateway's", () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const restarted = uuid();
    const other = uuid();
    const lifecycleRoomId = uuid();
    const earlier = mint(channel, restarted, lifecycleRoomId);
    const kept = mint(channel, other, lifecycleRoomId);

    channel.sessionStarted(restarted);

    assert.deepEqual(channel.mintedFor(restarted, lifecycleRoomId), [], 'a binding needs a mint report from this session');
    assert.equal(channel.occupancyOf(restarted, earlier.runtimeRoomId), null, 'T17 reads no reading from an earlier session');
    assert.deepEqual(channel.mintedFor(other, lifecycleRoomId), [kept.runtimeRoomId]);
    assert.equal(channel.occupancyOf(other, kept.runtimeRoomId)?.occupancy, 'PREPARED');
  });

  it('keeps open requests open, and accepts occupancy of a room minted in an earlier session as this session\'s reading', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const bound = mint(channel, gatewayId, lifecycleRoomId);
    const pending = channel.requestMint(gatewayId, uuid());

    channel.sessionStarted(gatewayId);

    assert.equal(channel.collect(gatewayId)?.requestId, pending.requestId, 'the open request is still delivered');
    assert.equal(
      channel.recordOccupancy(gatewayId, { lifecycleRoomId, runtimeRoomId: bound.runtimeRoomId, occupancy: 'CLOSED' }),
      true,
      'a Gateway that kept the room re-establishes its reading',
    );
    assert.equal(channel.occupancyOf(gatewayId, bound.runtimeRoomId)?.occupancy, 'CLOSED');
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), [], 'occupancy alone does not re-list the room for a binding');
    assert.equal(
      channel.recordOccupancy(gatewayId, { lifecycleRoomId: uuid(), runtimeRoomId: bound.runtimeRoomId, occupancy: 'CLOSED' }),
      false,
      'occupancy is still accepted only for the lifecycle room the room was minted for',
    );
  });

  it('lists the same room again once the Gateway reports it minted in the new session', () => {
    const channel = new GatewayRoomChannel(scriptedClock());
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    const first = mint(channel, gatewayId, lifecycleRoomId);
    channel.sessionStarted(gatewayId);
    mint(channel, gatewayId, lifecycleRoomId, first.runtimeRoomId);
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), [first.runtimeRoomId]);
    assert.equal(channel.occupancyOf(gatewayId, first.runtimeRoomId)?.occupancy, 'PREPARED');
  });

  it('a leadership change drops the session counts with everything else', () => {
    let term = 1;
    const channel = new GatewayRoomChannel(scriptedClock(), { leaderTerm: () => term });
    const gatewayId = uuid();
    const lifecycleRoomId = uuid();
    channel.sessionStarted(gatewayId);
    mint(channel, gatewayId, lifecycleRoomId);
    term = 2;
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), []);
    const again = mint(channel, gatewayId, lifecycleRoomId);
    assert.deepEqual(channel.mintedFor(gatewayId, lifecycleRoomId), [again.runtimeRoomId]);
  });
});

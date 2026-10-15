/**
 * The Founder's plan decision without a database: the body's shape, the
 * route's credential (journal contract §8.2), the cancel's binding under the
 * Q5 ruling, and the event the server builds from the stored plan rather than from anything
 * the caller asserts. `test/plan-decision.storage.test.ts` proves the same
 * path end to end on PostgreSQL.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Pool, PoolClient } from 'pg';
import { createServer } from '../packages/control-plane/src/server.js';
import { createGatewaySurface, type GatewaySurface } from '../packages/control-plane/src/gateway/index.js';
import type { DerivedAppend, PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import { loadConfig } from '../packages/control-plane/src/config.js';
import { initialLedger, type LedgerEntry, type LedgerState, type LifecycleEvent } from '../packages/ledger/src/index.js';
import {
  PLAN_DECISION_AUTHORIZATION_REF,
  FounderCancelUnavailableError,
  PlanHashMismatchError,
  PlanHashNotApplicableError,
  decidePlan,
  validatePlanDecisionBody,
  type PlanDecisionDeps,
} from '../packages/control-plane/src/plan-decision.js';
import type { StoredPlan } from '../packages/control-plane/src/plan-store.js';
import type { CommandHistory, DecisionInput, LaterCommandEvent } from '../packages/control-plane/src/journal-store.js';
import { plannerCommandIdFor } from '../packages/control-plane/src/planner-loop.js';
import type { CommandOutcome } from '../packages/journal/src/index.js';
import { containsCredentialMaterial } from '../packages/journal/src/index.js';
import { closeServer } from './support/close-server.js';

const CONTROL_TOKEN = 'plan-decision-control-token-long-enough';
const ADJUDICATION_TOKEN = 'plan-decision-adjudication-token-long-enough';
const BASE_ENV = {
  DATABASE_URL: 'postgresql://user:secret@host.neon.tech/db?sslmode=require',
  CONTROL_PLANE_TOKEN: CONTROL_TOKEN,
  COMMIT_SHA: 'deadbeef',
};
const ROOM = '0b5e7a3c-1d2f-4a6b-8c9d-0e1f2a3b4c5d';
const HASH = 'a'.repeat(64);

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    decision: 'plan.approved',
    planHash: HASH,
    attribution: { actualModel: 'n/a (human Founder decision)', executionSurface: 'claude-code' },
    ...overrides,
  };
}

describe('plan decision — the authorization reference', () => {
  it('names the credential in a form the journal credential guard accepts', () => {
    assert.equal(containsCredentialMaterial([PLAN_DECISION_AUTHORIZATION_REF]), false);
    assert.equal(containsCredentialMaterial(['credential:PHASE3_ADJUDICATION_TOKEN']), true, 'the spelling it must avoid');
  });
});

describe('plan decision — the body', () => {
  it('accepts an approval and a revision with feedback', () => {
    assert.equal(validatePlanDecisionBody(body()).ok, true);
    assert.equal(validatePlanDecisionBody(body({ decision: 'plan.revision_requested', feedback: 'Narrow the scope.' })).ok, true);
  });

  it('accepts founder.cancel with or without a plan hash, and refuses feedback or a malformed hash on it', () => {
    const bare = validatePlanDecisionBody(body({ decision: 'founder.cancel', planHash: undefined }));
    assert.ok(bare.ok);
    assert.equal(bare.value.planHash, undefined);
    assert.equal(validatePlanDecisionBody(body({ decision: 'founder.cancel' })).ok, true);
    assert.equal(validatePlanDecisionBody(body({ decision: 'founder.cancel', planHash: 'short' })).ok, false);
    assert.equal(validatePlanDecisionBody(body({ decision: 'founder.cancel', feedback: 'x' })).ok, false);
  });

  it('still requires a plan hash for approve and revise', () => {
    assert.equal(validatePlanDecisionBody(body({ planHash: undefined })).ok, false);
    assert.equal(validatePlanDecisionBody(body({ decision: 'plan.revision_requested', feedback: 'x', planHash: undefined })).ok, false);
  });

  for (const [label, candidate, reason] of [
    ['an unknown field', body({ facts: { planHash: HASH } }), /outside the plan-decision shape/],
    ['an unknown decision', body({ decision: 'plan.submitted' }), /decision must be/],
    ['a malformed hash', body({ planHash: 'A'.repeat(64) }), /planHash/],
    ['a revision with no feedback', body({ decision: 'plan.revision_requested' }), /feedback is required/],
    ['an approval carrying feedback', body({ feedback: 'x' }), /revision_requested alone/],
    ['no attribution', body({ attribution: undefined }), /attribution is required/],
    ['an attribution that names a role', body({ attribution: { actualModel: 'm', executionSurface: 's', roleId: 'builder' } }), /outside \{ actualModel/],
  ] as const) {
    it(`refuses ${label}`, () => {
      const verdict = validatePlanDecisionBody(JSON.parse(JSON.stringify(candidate)));
      assert.equal(verdict.ok, false);
      if (!verdict.ok) {
        assert.equal(verdict.status, 400);
        assert.match(verdict.message, reason);
      }
    });
  }
});

/* ---------------- the route's credential ---------------- */

function fakeLeaderPool(): Pool {
  let ownerId: string | null = null;
  const challenge = 'a'.repeat(64);
  const answer = async (sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> => {
    if (/UPDATE control_plane_lease\s+SET owner_id = \$1, generation/.test(sql)) {
      ownerId = String(params[0]);
      return { rows: [{ generation: '1', challenge: String(params[1]) }], rowCount: 1 };
    }
    if (/FROM control_plane_lease WHERE id = 1 FOR UPDATE/.test(sql)) {
      return {
        rows: [{ id: 1, owner_id: ownerId, generation: '1', heartbeat_at: new Date(), challenge, challenge_published_at: new Date() }],
        rowCount: 1,
      };
    }
    if (/SELECT now\(\)/.test(sql)) return { rows: [{ now: new Date() }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };
  const client = { query: (sql: string, params?: unknown[]) => answer(sql, params), release: () => undefined };
  return { query: (sql: string, params?: unknown[]) => answer(sql, params), connect: async () => client, on: () => undefined, end: async () => undefined } as unknown as Pool;
}

const explodingLedgerStore = new Proxy({}, {
  get: () => () => {
    throw new Error('a refused plan decision reached the ledger store');
  },
}) as unknown as PostgresLedgerStore;

const openServers: Server[] = [];
const openGateways: GatewaySurface[] = [];

async function start(env: Record<string, string>): Promise<string> {
  const config = loadConfig(env);
  const gateway = createGatewaySurface({ pool: fakeLeaderPool(), config, log: () => undefined });
  openGateways.push(gateway);
  const app = createServer({
    config,
    pool: { query: async () => ({ rows: [] }) } as unknown as Pool,
    store: explodingLedgerStore,
    startedAt: Date.now(),
    gateway,
  });
  const server = app.listen(0, '127.0.0.1');
  openServers.push(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  await gateway.leadership.attemptAcquisition();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

after(async () => {
  await Promise.all(openGateways.map((gateway) => gateway.stop()));
  await Promise.all(openServers.map((server) => closeServer(server)));
});

const post = (url: string, token: string | null, payload: unknown, room = ROOM): Promise<Response> =>
  fetch(`${url}/control-plane/rooms/${room}/plan-decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token === null ? {} : { authorization: `Bearer ${token}` }) },
    body: JSON.stringify(payload),
  });

describe('plan decision — the ruled credential and nothing else (contract §8.2)', () => {
  it('with PHASE3_ADJUDICATION_TOKEN unset, refuses every request, the control-plane token included', async () => {
    const url = await start(BASE_ENV);
    for (const token of [null, CONTROL_TOKEN, ADJUDICATION_TOKEN]) {
      const response = await post(url, token, body());
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'plan_decision_disabled' });
    }
  });

  it('with the token set, the control-plane token and no token are both unauthorized', async () => {
    const url = await start({ ...BASE_ENV, PHASE3_ADJUDICATION_TOKEN: ADJUDICATION_TOKEN });
    for (const token of [null, CONTROL_TOKEN]) {
      const response = await post(url, token, body());
      assert.equal(response.status, 401);
    }
  });

  it('with the adjudication token: a bad room or body is 400, none reaching the ledger', async () => {
    const url = await start({ ...BASE_ENV, PHASE3_ADJUDICATION_TOKEN: ADJUDICATION_TOKEN });
    assert.equal((await post(url, ADJUDICATION_TOKEN, body({ decision: 'founder.cancel', planHash: 'short' }))).status, 400);
    assert.equal((await post(url, ADJUDICATION_TOKEN, body(), 'not-a-room')).status, 400);
    assert.equal((await post(url, ADJUDICATION_TOKEN, body({ planHash: 'short' }))).status, 400);
  });
});

/* ---------------- the event is the server's ---------------- */

const STORED: StoredPlan = {
  commandId: 'cmd_planner_1',
  roomId: ROOM,
  lifecycleEventId: 'evt_t3',
  planHash: HASH,
  document: {
    repository: 'example-org/example-repo',
    scope_paths: ['src/a.ts', 'src/b.ts'],
  } as unknown as StoredPlan['document'],
  recordedAt: new Date(0),
};

function underReview(): LedgerState {
  const t3 = { seq: 3, eventId: 'evt_t3', transition: 'T3', fromState: 'PLANNING', resultingState: 'PLAN_REVIEW' } as unknown as LedgerEntry;
  return { ...initialLedger(), state: 'PLAN_REVIEW', entries: [t3] };
}

/** A ledger that runs `build`, accepts the event as a transition, then runs `afterTransition`. */
function stubDeps(
  current: LedgerState,
  plan: StoredPlan | null,
  outcomes: Readonly<Record<string, CommandOutcome>> = {},
): { deps: PlanDecisionDeps; built: LifecycleEvent[]; decisions: DecisionInput[]; commandEvents: LaterCommandEvent[] } {
  const built: LifecycleEvent[] = [];
  const decisions: DecisionInput[] = [];
  const commandEvents: LaterCommandEvent[] = [];
  const client = {} as PoolClient;
  const ledger = {
    appendDerived: async <T>(_roomId: string, spec: DerivedAppend<T>) => {
      const event = await spec.build(client, current);
      built.push(event);
      const entry = { seq: 4, eventId: event.eventId, fromState: current.state } as unknown as LedgerEntry;
      const after = await spec.afterTransition(client, { event, seq: 4, entry, state: current });
      return { result: { ok: true, outcome: 'transition', seq: 4, entry, state: current }, event, after };
    },
  } as unknown as PlanDecisionDeps['ledger'];
  const deps: PlanDecisionDeps = {
    ledger,
    plans: { inTransaction: () => ({ planForEvent: async () => plan, recordPlan: async () => { throw new Error('unused'); } }) },
    journal: {
      inTransaction: () => ({
        appendDecision: async (decision: DecisionInput) => {
          decisions.push(decision);
          return { recordClass: 'decision', commandId: decision.commandId, eventType: decision.decision, seq: '9', chainHash: 'c'.repeat(64) };
        },
        appendCommandEvent: async (event: LaterCommandEvent) => {
          commandEvents.push(event);
          return { recordClass: 'command', commandId: event.commandId, eventType: event.eventType, seq: '8', chainHash: 'd'.repeat(64) };
        },
        appendJournaled: async () => {
          throw new Error('unused');
        },
        commandHistory: async (commandId: string): Promise<CommandHistory> => {
          const outcome = outcomes[commandId];
          return {
            commandId,
            entries: [],
            state: outcome === undefined ? null : { dispatchState: outcome === 'pending' ? 'dispatched' : outcome, outcome },
          };
        },
      }),
    },
    now: () => new Date('2026-10-15T12:00:00.000Z'),
  };
  return { deps, built, decisions, commandEvents };
}

describe('plan decision — the server builds the event and binds the decision record', () => {
  it('an approval asserts the stored plan’s hash, the submitted hash, and canonical scope — never the caller’s', async () => {
    const { deps, built, decisions } = stubDeps(underReview(), STORED);
    const request = validatePlanDecisionBody(body({ planHash: 'b'.repeat(64) }));
    assert.ok(request.ok);
    await decidePlan(deps, ROOM, request.value);
    const event = built[0]!;
    assert.deepEqual(event.facts, { planHash: HASH, expectedPlanHash: 'b'.repeat(64), scopePathsCanonical: true });
    assert.equal(event.actor, 'founder');
    assert.deepEqual(event.attribution, { roleId: null, actorId: 'founder', actualModel: 'n/a (human Founder decision)', executionSurface: 'claude-code' });
    assert.deepEqual(event.scope, { roomId: ROOM, repo: 'example-org/example-repo', paths: ['src/a.ts', 'src/b.ts'] });
    assert.deepEqual(event.evidence, [{ kind: 'plandoc', ref: 'cmd_planner_1', digest: HASH }]);
    assert.equal(event.occurredAt, '2026-10-15T12:00:00.000Z');
    assert.deepEqual(decisions[0], {
      commandId: 'cmd_planner_1',
      decision: 'plan.approved',
      recordedState: 'PLAN_REVIEW',
      planHash: HASH,
      authorizationRef: PLAN_DECISION_AUTHORIZATION_REF,
      lifecycleEventRef: { roomId: ROOM, eventId: event.eventId },
    });
  });

  it('a revision carries the feedback and its digest, and refuses a hash that is not the plan under review', async () => {
    const { deps, built } = stubDeps(underReview(), STORED);
    const ok = validatePlanDecisionBody(body({ decision: 'plan.revision_requested', feedback: 'Narrow it.' }));
    assert.ok(ok.ok);
    await decidePlan(deps, ROOM, ok.value);
    assert.deepEqual(built[0]!.facts, { feedbackAttached: true });
    assert.equal((built[0] as LifecycleEvent & { feedback?: string }).feedback, 'Narrow it.');
    assert.equal(built[0]!.evidence[1]?.kind, 'founder_feedback');
    const wrong = validatePlanDecisionBody(body({ decision: 'plan.revision_requested', feedback: 'x', planHash: 'b'.repeat(64) }));
    assert.ok(wrong.ok);
    await assert.rejects(decidePlan(stubDeps(underReview(), STORED).deps, ROOM, wrong.value), PlanHashMismatchError);
  });

  it('outside PLAN_REVIEW there is no plan under review, and the approval asserts no plan hash', async () => {
    const { deps, built } = stubDeps({ ...initialLedger(), state: 'PLANNING' }, STORED);
    const request = validatePlanDecisionBody(body());
    assert.ok(request.ok);
    await assert.rejects(decidePlan(deps, ROOM, request.value), /no stored plan under review/);
    assert.deepEqual(built[0]!.facts, { expectedPlanHash: HASH, scopePathsCanonical: false });
  });
});

/* ---------------- founder.cancel under the Q5 ruling ---------------- */

const T2 = { seq: 2, eventId: 'evt_t2', transition: 'T2', fromState: 'SCOPED', resultingState: 'PLANNING' } as unknown as LedgerEntry;
const T1 = {
  seq: 1, eventId: 'evt_t1', transition: 'T1', fromState: 'ROOM_CREATED', resultingState: 'SCOPED',
  scope: { roomId: ROOM, repo: 'example-org/example-repo', paths: ['src'] },
} as unknown as LedgerEntry;
const ROUND_ONE = plannerCommandIdFor(ROOM, 'evt_t2');

function cancel(planHash?: string) {
  const parsed = validatePlanDecisionBody(body({ decision: 'founder.cancel', planHash }));
  assert.ok(parsed.ok);
  return parsed.value;
}

function room(state: LedgerState['state'], entries: readonly LedgerEntry[], priorState: LedgerState['state'] | null = null): LedgerState {
  return { ...initialLedger(), state, priorState, entries: [...entries] };
}

describe('plan decision — founder.cancel binds to the room’s planner command', () => {
  it('with no planner command (SCOPED, or a round never journaled) it is unavailable and builds no event', async () => {
    for (const current of [room('SCOPED', [T1]), room('PLANNING', [T1, T2])]) {
      const { deps, built } = stubDeps(current, null);
      await assert.rejects(decidePlan(deps, ROOM, cancel()), FounderCancelUnavailableError);
      assert.equal(built.length, 0);
    }
  });

  it('Q6: a pending command is cancelled unconfirmed — recorded unresolved, bound to T22, in the same transaction', async () => {
    const { deps, built, decisions, commandEvents } = stubDeps(room('PLANNING', [T1, T2]), null, { [ROUND_ONE]: 'pending' });
    await decidePlan(deps, ROOM, cancel());
    assert.deepEqual(built[0]!.facts, { unconfirmedCancelRecorded: true });
    assert.deepEqual(commandEvents, [
      { eventType: 'unresolved', commandId: ROUND_ONE, lifecycleEventRef: { roomId: ROOM, eventId: built[0]!.eventId }, evidenceRefs: ['unconfirmed-cancel'] },
    ]);
    assert.equal(decisions[0]?.commandId, ROUND_ONE);
  });

  it('Q6: an already unresolved command stays so; the cancel is unconfirmed and appends nothing to it', async () => {
    const { deps, built, decisions, commandEvents } = stubDeps(room('PLANNING', [T1, T2]), null, { [ROUND_ONE]: 'unresolved' });
    await decidePlan(deps, ROOM, cancel());
    assert.deepEqual(built[0]!.facts, { unconfirmedCancelRecorded: true });
    assert.deepEqual(commandEvents, []);
    assert.equal(decisions[0]?.decision, 'founder.cancel');
  });

  it('in PLANNING after a failed command: no plan hash, bound to that command, G22 fact derived', async () => {
    const { deps, built, decisions } = stubDeps(room('PLANNING', [T1, T2]), null, { [ROUND_ONE]: 'failed' });
    await decidePlan(deps, ROOM, cancel());
    assert.deepEqual(built[0]!.facts, { runningTasksCancelled: true });
    assert.deepEqual(built[0]!.scope, { roomId: ROOM, repo: 'example-org/example-repo', paths: ['src'] });
    assert.deepEqual(built[0]!.evidence, []);
    assert.deepEqual(decisions[0], {
      commandId: ROUND_ONE,
      decision: 'founder.cancel',
      recordedState: 'PLANNING',
      authorizationRef: PLAN_DECISION_AUTHORIZATION_REF,
      lifecycleEventRef: { roomId: ROOM, eventId: built[0]!.eventId },
    });
    await assert.rejects(
      decidePlan(stubDeps(room('PLANNING', [T1, T2]), null, { [ROUND_ONE]: 'failed' }).deps, ROOM, cancel(HASH)),
      PlanHashNotApplicableError,
    );
  });

  it('in PLAN_REVIEW the Founder sends the plan’s hash, and the row carries it', async () => {
    const t3 = { seq: 3, eventId: 'evt_t3', transition: 'T3', fromState: 'PLANNING', resultingState: 'PLAN_REVIEW' } as unknown as LedgerEntry;
    const current = room('PLAN_REVIEW', [T1, T2, t3]);
    const { deps, decisions } = stubDeps(current, STORED, { [ROUND_ONE]: 'completed' });
    await decidePlan(deps, ROOM, cancel(HASH));
    assert.equal(decisions[0]?.planHash, HASH);
    assert.equal(decisions[0]?.commandId, ROUND_ONE);
    await assert.rejects(decidePlan(stubDeps(current, STORED, { [ROUND_ONE]: 'completed' }).deps, ROOM, cancel()), PlanHashMismatchError);
    await assert.rejects(decidePlan(stubDeps(current, STORED, { [ROUND_ONE]: 'completed' }).deps, ROOM, cancel('b'.repeat(64))), PlanHashMismatchError);
  });

  it('binds to the latest journaled round; a running one makes the cancel unconfirmed', async () => {
    const t3 = { seq: 3, eventId: 'evt_t3', transition: 'T3', fromState: 'PLANNING', resultingState: 'PLAN_REVIEW' } as unknown as LedgerEntry;
    const t4 = { seq: 4, eventId: 'evt_t4', transition: 'T4', fromState: 'PLAN_REVIEW', resultingState: 'PLANNING' } as unknown as LedgerEntry;
    const roundTwo = plannerCommandIdFor(ROOM, 'evt_t4');
    const entries = [T1, T2, t3, t4];
    const notYet = stubDeps(room('PLANNING', entries), null, { [ROUND_ONE]: 'completed' });
    await decidePlan(notYet.deps, ROOM, cancel());
    assert.equal(notYet.decisions[0]?.commandId, ROUND_ONE, 'round two never journaled: bound to round one');
    const done = stubDeps(room('PLANNING', entries), null, { [ROUND_ONE]: 'completed', [roundTwo]: 'failed' });
    await decidePlan(done.deps, ROOM, cancel());
    assert.equal(done.decisions[0]?.commandId, roundTwo);
    const running = stubDeps(room('PLANNING', entries), null, { [ROUND_ONE]: 'completed', [roundTwo]: 'pending' });
    await decidePlan(running.deps, ROOM, cancel());
    assert.equal(running.decisions[0]?.commandId, roundTwo);
    assert.deepEqual(running.commandEvents.map((e) => [e.eventType, e.commandId]), [['unresolved', roundTwo]]);
  });

  it('a RECONCILING room records its prior state, and the plan rule follows that state', async () => {
    const t3 = { seq: 3, eventId: 'evt_t3', transition: 'T3', fromState: 'PLANNING', resultingState: 'PLAN_REVIEW' } as unknown as LedgerEntry;
    const current = room('RECONCILING', [T1, T2, t3], 'PLAN_REVIEW');
    const { deps, decisions } = stubDeps(current, STORED, { [ROUND_ONE]: 'completed' });
    await decidePlan(deps, ROOM, cancel(HASH));
    assert.equal(decisions[0]?.recordedState, 'RECONCILING');
    assert.equal(decisions[0]?.priorState, 'PLAN_REVIEW');
    assert.equal(decisions[0]?.planHash, HASH);
  });
});

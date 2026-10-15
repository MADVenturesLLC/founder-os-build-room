/**
 * The Founder's plan decision without a database: the body's shape, the
 * route's credential (journal contract §8.2), the cancel refusal (Q5), and
 * the event the server builds from the stored plan rather than from anything
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
  PlanHashMismatchError,
  decidePlan,
  validatePlanDecisionBody,
  type PlanDecisionDeps,
} from '../packages/control-plane/src/plan-decision.js';
import type { StoredPlan } from '../packages/control-plane/src/plan-store.js';
import type { DecisionInput } from '../packages/control-plane/src/journal-store.js';
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

  it('answers founder.cancel with 501, pending the Founder ruling on Q5', () => {
    const verdict = validatePlanDecisionBody(body({ decision: 'founder.cancel' }));
    assert.deepEqual(verdict.ok ? null : [verdict.status, verdict.error], [501, 'founder_cancel_unavailable']);
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

  it('with the adjudication token: cancel is 501 and a bad room or body is 400, none reaching the ledger', async () => {
    const url = await start({ ...BASE_ENV, PHASE3_ADJUDICATION_TOKEN: ADJUDICATION_TOKEN });
    const cancel = await post(url, ADJUDICATION_TOKEN, body({ decision: 'founder.cancel' }));
    assert.equal(cancel.status, 501);
    assert.equal(((await cancel.json()) as { error: string }).error, 'founder_cancel_unavailable');
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
function stubDeps(current: LedgerState, plan: StoredPlan | null): { deps: PlanDecisionDeps; built: LifecycleEvent[]; decisions: DecisionInput[] } {
  const built: LifecycleEvent[] = [];
  const decisions: DecisionInput[] = [];
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
        appendCommandEvent: async () => {
          throw new Error('unused');
        },
      }),
    },
    now: () => new Date('2026-10-15T12:00:00.000Z'),
  };
  return { deps, built, decisions };
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

/**
 * The Phase 4 counted-run harness (plan r1 slice 10), unit level: the set's
 * closed shape, the entry check, the proposed run unit, the set's progress,
 * and the runner over a scripted driver. No run executes, and nothing here
 * contacts a control plane, a Gateway or a provider.
 *
 * Entry reads the copy of the execution-surface registry the counted run
 * reads, pinned at FounderOS 8146435, where `DEC-20261015-01` registered
 * `build-room-control-plane`. The Seat Registry's r7 copy, from before that
 * registration, stands for a registry without it, and every set is refused
 * against it (`dispatcher_surface_unregistered`). The seat lanes are the
 * pinned registry's own throughout.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { founderGoalDigest } from '../packages/control-plane/src/founder-goal.js';
import { plannerCommandIdFor } from '../packages/control-plane/src/planner-loop.js';
import { RATIFIED_SEATS, type SeatRegistrationV1, type SeatRoutingLane } from '../packages/seat-registry/src/index.js';
import {
  PHASE4_DISPATCHER,
  Phase4Runner,
  Phase4SetNotRunnableError,
  evaluatePhase4Entry,
  evaluatePhase4Run,
  HttpPhase4Driver,
  phase4RecordDigest,
  phase4SetStatus,
  readPhase4Export,
  registeredSurfaceIds,
  validatePhase4RunSet,
  type Phase4EntryObservation,
  type Phase4RecordedEvent,
  type Phase4RunDriver,
  type Phase4RunRecord,
  type Phase4RunSet,
} from '../packages/run-harness/src/phase4/index.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The copy the counted run reads, pinned at FounderOS 8146435 (DEC-20261015-01 registered). */
const REGISTRY_TEXT = readFileSync(join(REPO_ROOT, 'packages', 'control-plane', 'fixtures', 'execution-surface-registry.md'), 'utf8');
/** The Seat Registry's copy now pins the same doctrine text as the counted-run copy. */
const R7_REGISTRY_TEXT = readFileSync(join(REPO_ROOT, 'packages', 'seat-registry', 'fixtures', 'execution-surface-registry.md'), 'utf8');
/** A minimal registry text that omits the control-plane surface; the seat-registry
 *  copy can no longer serve that role now that both copies pin 060a16a4. */
const WITHOUT_CONTROL_PLANE = '```yaml\nsurface_id: antigravity\ncurrent_status: implemented-and-in-governed-use\n```\n';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const GATEWAY = '1880c12d-0000-4000-8000-000000000001';
const DEPLOYMENT = 'dep-0001';
const GOAL = 'Add a health detail field to the status route.';

function set(overrides: Record<string, unknown> = {}): Phase4RunSet {
  const run = (label: string, n: number) => ({
    label,
    roomId: `00000000-0000-4000-8000-00000000000${n}`,
    inputs: { repository: 'example-org/example-repo', baseSha: SHA_A, scopePaths: ['src', 'test'], goal: GOAL },
  });
  return {
    setId: 'FOUNDER-ACT-EXAMPLE-PHASE4-COUNTED-RUNS',
    founderOsSha: SHA_A,
    buildRoomSha: SHA_B,
    controlPlaneOrigin: 'https://control-plane.example',
    gatewayId: GATEWAY,
    planner: { provider: 'google', model: 'gemini-4-argon' },
    seats: { builder: 'codex', reviewer: 'grok-build' },
    founderRelay: { actualModel: 'n/a (human Founder act)', executionSurface: 'claude-code' },
    decisionTimeoutMs: 3_600_000,
    runs: [run('Phase4-CR1', 1), run('Phase4-CR2', 2), run('Phase4-CR3', 3)],
    ...overrides,
  } as Phase4RunSet;
}

function observation(overrides: Partial<Phase4EntryObservation> = {}): Phase4EntryObservation {
  return {
    controlPlane: { status: 200, commit: SHA_B, deploymentId: DEPLOYMENT },
    founderOs: { sha: SHA_A, clean: true },
    enrolledGateways: [GATEWAY, '2222132d-0000-4000-8000-000000000002'],
    gatewayOnline: true,
    executorAvailable: true,
    registeredSurfaces: registeredSurfaceIds(REGISTRY_TEXT),
    ...overrides,
  };
}

/* ---------------- a run record, as a passing run leaves it ---------------- */

const attribution = (roleId: string | null, actorId: string, actualModel: string, executionSurface: string) => ({ roleId, actorId, actualModel, executionSurface });
const PLANNER_ATTRIBUTION = attribution('architect', 'session:planner', 'gemini-4-argon', 'antigravity');
const DISPATCHER_ATTRIBUTION = attribution('builder', `control-plane:${DEPLOYMENT}`, PHASE4_DISPATCHER.actualModel, PHASE4_DISPATCHER.executionSurface);
const FOUNDER_ATTRIBUTION = attribution(null, 'founder', 'n/a (human Founder decision)', 'claude-code');

function event(eventId: string, name: string, actor: string, a: Phase4RecordedEvent['attribution'], extra: Partial<Phase4RecordedEvent> = {}): Phase4RecordedEvent {
  return { eventId, event: name, actor, attribution: a, evidence: [], ...extra };
}

function command(commandId: string, terminal: { eventType: string; failureClassification?: string } = { eventType: 'completed' }) {
  const route = { provider: 'google', model: 'gemini-4-argon', executionSurface: 'antigravity' };
  const journaled = {
    eventType: 'journaled',
    authorizationRef: 'FOUNDER-ACT-EXAMPLE-PHASE4-COUNTED-RUNS',
    intendedProvider: 'google',
    intendedModel: 'gemini-4-argon',
    intendedSurface: 'antigravity',
  };
  const rows = terminal.eventType === 'failed' && terminal.failureClassification === 'not_sent'
    ? [journaled, { eventType: 'identity_bound' }, terminal]
    : [journaled, { eventType: 'identity_bound' }, { eventType: 'dispatched', ...route }, terminal];
  return { commandId, rows };
}

/** One round to approval; `revisions` adds that many revise-and-replan rounds first. */
function passingRecord(revisions = 0): Phase4RunRecord {
  const roomId = set().runs[0]!.roomId;
  // A round's command id is derived from its opening event, as the loop derives it.
  const openingCommand = (r: number) => plannerCommandIdFor(roomId, r === 0 ? 't2' : `t4-${r}`);
  const events: Phase4RecordedEvent[] = [
    event('t1', 'scope.captured', 'founder', attribution(null, 'founder', 'n/a (human Founder act)', 'claude-code'), {
      evidence: [{ kind: 'founder_goal', ref: 'goal', digest: founderGoalDigest(GOAL) }],
    }),
    event('t2', 'task.dispatched.planner', 'control-plane', DISPATCHER_ATTRIBUTION),
    event('t3-0', 'plan.submitted', 'agent.planner', PLANNER_ATTRIBUTION, { planHash: 'h0'.padEnd(64, '0') }),
  ];
  const commands = [command(openingCommand(0))];
  const decisions: Phase4RunRecord['decisions'][number][] = [];
  for (let r = 1; r <= revisions; r += 1) {
    events.push(event(`t4-${r}`, 'plan.revision_requested', 'founder', FOUNDER_ATTRIBUTION));
    decisions.push({ commandId: openingCommand(r - 1), decision: 'plan.revision_requested', planHash: `h${r - 1}`.padEnd(64, '0') });
    events.push(event(`t3-${r}`, 'plan.submitted', 'agent.planner', PLANNER_ATTRIBUTION, { planHash: `h${r}`.padEnd(64, '0') }));
    commands.push(command(openingCommand(r)));
  }
  const reviewed = `h${revisions}`.padEnd(64, '0');
  events.push(event('t5', 'plan.approved', 'founder', FOUNDER_ATTRIBUTION, { planHash: reviewed }));
  decisions.push({ commandId: openingCommand(revisions), decision: 'plan.approved', planHash: reviewed });
  return {
    roomId,
    deploymentIdAtStart: DEPLOYMENT,
    deploymentIdAtEnd: DEPLOYMENT,
    finalState: 'BUILDING',
    events,
    commands,
    decisions,
    journalVerified: true,
  };
}

const judge = (record: Phase4RunRecord, stops = {}) => evaluatePhase4Run(set(), set().runs[0]!, record, stops);

/* ---------------- cases ---------------- */

describe('phase 4 run set · read as a closed shape', () => {
  it('accepts a well-formed set', () => {
    assert.equal(validatePhase4RunSet(set()).ok, true);
  });

  const refusals: [string, unknown, string][] = [
    ['an unknown field', { ...set(), note: 'x' }, 'shape_invalid'],
    ['a short sha', set({ buildRoomSha: 'abc' }), 'governing_sha_invalid'],
    ['a plain-http public origin', set({ controlPlaneOrigin: 'http://control-plane.example' }), 'origin_invalid'],
    ['Auto mode as the active model', set({ planner: { provider: 'google', model: 'Auto' } }), 'seat_models_invalid'],
    ['a decision timeout under a minute', set({ decisionTimeoutMs: 1_000 }), 'timeout_invalid'],
    ['two runs', set({ runs: set().runs.slice(0, 2) }), 'runs_invalid'],
    ['labels out of order', set({ runs: [set().runs[1], set().runs[0], set().runs[2]] }), 'runs_invalid'],
    ['one room named twice', set({ runs: [set().runs[0], { ...set().runs[1]!, roomId: set().runs[0]!.roomId }, set().runs[2]] }), 'runs_invalid'],
    ['a scope path climbing out', set({ runs: [{ ...set().runs[0]!, inputs: { ...set().runs[0]!.inputs, scopePaths: ['../etc'] } }, set().runs[1], set().runs[2]] }), 'scope_paths_invalid'],
    ['a scope path with a backslash', set({ runs: [{ ...set().runs[0]!, inputs: { ...set().runs[0]!.inputs, scopePaths: ['src\\test'] } }, set().runs[1], set().runs[2]] }), 'scope_paths_invalid'],
    ['unsorted scope paths', set({ runs: [{ ...set().runs[0]!, inputs: { ...set().runs[0]!.inputs, scopePaths: ['test', 'src'] } }, set().runs[1], set().runs[2]] }), 'scope_paths_invalid'],
    ['a credential-shaped goal', set({ runs: [{ ...set().runs[0]!, inputs: { ...set().runs[0]!.inputs, goal: 'use password=hunter2-correct-horse' } }, set().runs[1], set().runs[2]] }), 'goal_invalid'],
  ];
  for (const [name, value, failure] of refusals) {
    it(`refuses ${name}`, () => {
      assert.deepEqual(validatePhase4RunSet(value), { ok: false, failure });
    });
  }
});

describe('phase 4 entry · every gap between the act and the live system', () => {
  it('passes once the registry carries the control plane’s surface, with a Q2a Planner on the architect seat’s Antigravity lane', () => {
    assert.deepEqual(evaluatePhase4Entry(set(), observation()), { ok: true, failures: [] });
  });

  it('refuses a Planner when the architect seat has no approved Antigravity lane', () => {
    // The mirror planner check is surface-keyed (BR-PHASE4-SURFACE-KEYED-SEATS-R1):
    // the act's planner surface today is the Antigravity adapter. The r1
    // correction re-keys the check to the set's resolved route: it requires an
    // approved Antigravity lane whose provider and model are the set's planner,
    // so a seat with no approved Antigravity lane at all is refused too.
    const withoutApprovedAntigravity: readonly SeatRegistrationV1[] = RATIFIED_SEATS.map((seat) =>
      seat.seat_id === 'architect'
        ? {
            ...seat,
            routing: seat.routing.map((lane) => (lane.surface_id === 'antigravity' ? { ...lane, binding_status: 'proposed-binding' as SeatRoutingLane['binding_status'] } : lane)),
          }
        : seat,
    );
    assert.deepEqual(evaluatePhase4Entry(set(), observation(), { seats: withoutApprovedAntigravity }).failures, ['planner_lane_not_approved']);
  });

  it('refuses a Planner whose resolved route is off the Antigravity lane (Q2a)', () => {
    // The r1 correction restores the deleted Q2A case: `claude-code` is an
    // approved architect lane (the bounded-reconciliation binding), but the
    // counted run's adapter runs the Antigravity lane, and the set's resolved
    // route must be that lane — an approved lane elsewhere is still refused.
    assert.deepEqual(
      evaluatePhase4Entry(set({ planner: { provider: 'anthropic', model: 'opus-4.7' } }), observation()).failures,
      ['planner_lane_not_approved'],
    );
    // The resolved Antigravity route itself is accepted (the passing case
    // above carries google/gemini-4-argon, the pinned Antigravity lane).
    assert.deepEqual(evaluatePhase4Entry(set(), observation()).failures, []);
  });

  it('refuses a seat surface that is not an approved lane of that seat, and a reviewer on the builder’s surface', () => {
    // 'antigravity' is an architect and reviewer surface, never a builder lane.
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'antigravity', reviewer: 'grok-build' } }), observation()).failures, ['builder_lane_not_approved']);
    // 'hermes-local-code' is a builder surface, never a reviewer lane.
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'codex', reviewer: 'hermes-local-code' } }), observation()).failures, ['reviewer_lane_not_approved']);
    // Distinctness is surface-level: 'codex' carries both seats' lanes, and the
    // reviewer still may not share the builder's surface (the receipt's settled
    // decision; that the two may resolve to one model is the Founder's call).
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'codex', reviewer: 'codex' } }), observation()).failures, ['reviewer_same_as_builder']);
    // claude-code carries no Tier-2 lane (DEC-20261020-01 clause 2 table), and
    // grok-build no builder lane: both are not-approved records, outside routing.
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'codex', reviewer: 'claude-code' } }), observation()).failures, ['reviewer_lane_not_approved']);
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'grok-build', reviewer: 'codex' } }), observation()).failures, ['builder_lane_not_approved']);
    // claude-code is an approved builder surface, on claude-code:anthropic.
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'claude-code', reviewer: 'grok-build' } }), observation()).failures, []);
  });

  it('resolves each seat to its provider and refuses a same-family reviewer on another surface (DEC-20261020-01 clause 7)', () => {
    // A bare surface that carries two approved providers on the seat is ambiguous.
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'claude-code', reviewer: 'antigravity' } }), observation()).failures, ['reviewer_lane_ambiguous']);
    // Claude built, Claude reviewing, on different surfaces: refused.
    assert.deepEqual(
      evaluatePhase4Entry(set({ seats: { builder: 'claude-code', reviewer: 'antigravity:anthropic' } }), observation()).failures,
      ['reviewer_same_family_as_builder'],
    );
    assert.deepEqual(
      evaluatePhase4Entry(set({ seats: { builder: 'claude-code:anthropic', reviewer: 'antigravity:anthropic' } }), observation()).failures,
      ['reviewer_same_family_as_builder'],
    );
    // The other family on the same surface is accepted, qualified or not on the builder side.
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'claude-code', reviewer: 'antigravity:google' } }), observation()).failures, []);
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'codex:openai', reviewer: 'antigravity:anthropic' } }), observation()).failures, []);
    // A provider the seat does not carry on that surface is not an approved lane.
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'codex:google', reviewer: 'grok-build' } }), observation()).failures, ['builder_lane_not_approved']);
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'codex', reviewer: 'grok-build:anthropic' } }), observation()).failures, ['reviewer_lane_not_approved']);
    // The same surface with different providers is still the same surface.
    assert.deepEqual(evaluatePhase4Entry(set({ seats: { builder: 'codex:openai', reviewer: 'codex' } }), observation()).failures, ['reviewer_same_as_builder']);
  });

  it('refuses every set against a registry that carries no build-room-control-plane, and admits it on the pinned copy', () => {
    const verdict = evaluatePhase4Entry(set(), observation({ registeredSurfaces: registeredSurfaceIds(WITHOUT_CONTROL_PLANE) }));
    assert.deepEqual(verdict.failures, ['dispatcher_surface_unregistered']);
    assert.deepEqual(evaluatePhase4Entry(set(), observation()).failures, []);
  });

  it('reports every failure together', () => {
    const verdict = evaluatePhase4Entry(
      // 'antigravity' is no builder lane; as a bare reviewer it is ambiguous,
      // since the reviewer seat carries antigravity:google and
      // antigravity:anthropic; and naming it twice is the surface-level
      // sameness the distinctness check refuses.
      set({ gatewayId: '2222132d-0000-4000-8000-000000000002', seats: { builder: 'antigravity', reviewer: 'antigravity' } }),
      observation({
        controlPlane: { status: 200, commit: SHA_A, deploymentId: DEPLOYMENT },
        founderOs: { sha: SHA_A, clean: false },
        gatewayOnline: false,
        executorAvailable: false,
      }),
    );
    assert.deepEqual(verdict.failures, [
      'build_sha_mismatch',
      'founder_os_mismatch',
      'gateway_not_named',
      'gateway_offline',
      'executor_unavailable',
      'builder_lane_not_approved',
      'reviewer_lane_ambiguous',
      'reviewer_same_as_builder',
    ]);
  });

  it('refuses an unreachable control plane and an unenrolled Gateway', () => {
    const verdict = evaluatePhase4Entry(set(), observation({ controlPlane: { status: 503, commit: '', deploymentId: '' }, enrolledGateways: [] }));
    assert.deepEqual(verdict.failures, ['control_plane_unavailable', 'gateway_not_enrolled']);
  });

  it('reads the registry’s surfaces, leaving out an entry that is proposed and not active', () => {
    const ids = registeredSurfaceIds(REGISTRY_TEXT);
    for (const id of ['claude-code', 'antigravity', 'build-room-gateway', 'build-room-control-plane']) assert.ok(ids.has(id), id);
    assert.equal(
      registeredSurfaceIds(R7_REGISTRY_TEXT).has('build-room-control-plane'),
      true,
      'the seat-registry copy now pins the same doctrine text as the counted-run copy (060a16a4)',
    );
    const proposed = '```yaml\nsurface_id: build-room-control-plane\ncurrent_status: proposed-not-active\n```\n';
    const active = '```yaml\nsurface_id: build-room-control-plane\ncurrent_status: implemented-and-in-governed-use\n```\n';
    assert.equal(registeredSurfaceIds(proposed).has('build-room-control-plane'), false);
    assert.equal(registeredSurfaceIds(active).has('build-room-control-plane'), true);
  });
});

describe('phase 4 run unit · the proposed judgment of one record', () => {
  it('passes the whole boundary, with or without revision rounds', () => {
    assert.deepEqual(judge(passingRecord()), { outcome: 'passed', failures: [] });
    assert.deepEqual(judge(passingRecord(2)), { outcome: 'passed', failures: [] });
  });

  it('passes a round whose first attempt failed not_sent and was retried (Q8)', () => {
    const record = passingRecord();
    assert.deepEqual(judge({ ...record, commands: [command('cmd_a', { eventType: 'failed', failureClassification: 'not_sent' }), ...record.commands] }).outcome, 'passed');
  });

  it('is rejected when the Founder cancels', () => {
    const record = passingRecord();
    const events = [...record.events.slice(0, -1), event('t22', 'founder.cancel', 'founder', FOUNDER_ATTRIBUTION)];
    assert.deepEqual(judge({ ...record, events, finalState: 'CLOSED_ABANDONED', decisions: [{ commandId: 'cmd_0', decision: 'founder.cancel' }] }), { outcome: 'rejected', failures: [] });
  });

  it('is interrupted by a deployment change, an unsettled room, a decision timeout or too many rounds', () => {
    assert.deepEqual(judge({ ...passingRecord(), deploymentIdAtEnd: 'dep-0002' }).failures, ['deployment_changed']);
    assert.equal(judge({ ...passingRecord(), deploymentIdAtEnd: 'dep-0002' }).outcome, 'interrupted');
    const reviewing = passingRecord();
    assert.deepEqual(judge({ ...reviewing, finalState: 'PLAN_REVIEW', events: reviewing.events.slice(0, -1), decisions: [] }, { decisionTimedOut: true }), {
      outcome: 'interrupted',
      failures: ['founder_decision_timeout', 'lifecycle_incomplete'],
    });
    assert.deepEqual(judge(passingRecord(3)), { outcome: 'interrupted', failures: ['too_many_rounds'] });
  });

  const defects: [string, (r: Phase4RunRecord) => Phase4RunRecord, string][] = [
    ['the journal does not verify', (r) => ({ ...r, journalVerified: false }), 'journal_unverified'],
    ['the goal digest is not the act’s goal', (r) => ({ ...r, events: [{ ...r.events[0]!, evidence: [{ kind: 'founder_goal', ref: 'goal', digest: 'f'.repeat(64) }] }, ...r.events.slice(1)] }), 'goal_not_bound'],
    ['T2 names another surface', (r) => ({ ...r, events: r.events.map((e) => (e.event === 'task.dispatched.planner' ? { ...e, attribution: { ...e.attribution, executionSurface: 'claude-code' } } : e)) }), 'dispatcher_attribution_wrong'],
    ['T2 names another deployment', (r) => ({ ...r, events: r.events.map((e) => (e.event === 'task.dispatched.planner' ? { ...e, attribution: { ...e.attribution, actorId: 'control-plane:dep-9' } } : e)) }), 'dispatcher_attribution_wrong'],
    ['T3 names another model', (r) => ({ ...r, events: r.events.map((e) => (e.event === 'plan.submitted' ? { ...e, attribution: { ...e.attribution, actualModel: 'gemini-flash' } } : e)) }), 'planner_attribution_wrong'],
    ['a command is journaled under another authorization', (r) => ({ ...r, commands: [{ ...r.commands[0]!, rows: [{ ...r.commands[0]!.rows[0]!, authorizationRef: 'other' }, ...r.commands[0]!.rows.slice(1)] }] }), 'command_authorization_wrong'],
    ['a command ran on another model', (r) => ({ ...r, commands: [{ ...r.commands[0]!, rows: r.commands[0]!.rows.map((row) => (row.eventType === 'dispatched' ? { ...row, model: 'gemini-flash' } : row)) }] }), 'command_route_wrong'],
    ['a command was once unresolved', (r) => ({ ...r, commands: [{ ...r.commands[0]!, rows: [...r.commands[0]!.rows.slice(0, 3), { eventType: 'unresolved' }, { eventType: 'resolved' }] }] }), 'command_not_clean'],
    ['the last attempt failed not_sent', (r) => ({ ...r, commands: [command('cmd_0', { eventType: 'failed', failureClassification: 'not_sent' })] }), 'command_not_clean'],
    ['the approval names another plan', (r) => ({ ...r, events: r.events.map((e) => (e.event === 'plan.approved' ? { ...e, planHash: 'e'.repeat(64) } : e)) }), 'plan_not_approved_as_reviewed'],
    ['the approval is bound to a command other than the reviewed plan’s', (r) => ({ ...r, decisions: [...r.decisions.slice(0, -1), { ...r.decisions.at(-1)!, commandId: 'cmd_not_the_reviewed_one' }] }), 'plan_not_approved_as_reviewed'],
    ['the rounds left no dispatch events', (r) => ({ ...r, events: r.events.filter((e) => e.event !== 'task.dispatched.planner' && e.event !== 'plan.revision_requested') }), 'round_dispatch_missing'],
    ['a decision is not the Founder’s', (r) => ({ ...r, events: r.events.map((e) => (e.event === 'plan.approved' ? { ...e, actor: 'agent.planner' } : e)) }), 'decision_not_founder'],
    ['something follows approval', (r) => ({ ...r, events: [...r.events, event('t6', 'task.dispatched.builder', 'control-plane', DISPATCHER_ATTRIBUTION)] }), 'activity_after_approval'],
  ];
  for (const [name, mutate, failure] of defects) {
    it(`fails when ${name}`, () => {
      const verdict = judge(mutate(passingRecord()));
      assert.equal(verdict.outcome, 'failed');
      assert.ok(verdict.failures.includes(failure as never), JSON.stringify(verdict));
    });
  }
});

describe('phase 4 set · progress under the proposed set semantics', () => {
  it('runs the labels in order, and three passes satisfy it', () => {
    assert.deepEqual(phase4SetStatus([]), { consecutivePasses: 0, nextLabel: 'Phase4-CR1', spent: false, satisfied: false });
    const three = [
      { label: 'Phase4-CR1', outcome: 'passed' },
      { label: 'Phase4-CR2', outcome: 'passed' },
      { label: 'Phase4-CR3', outcome: 'passed' },
    ] as const;
    assert.deepEqual(phase4SetStatus(three), { consecutivePasses: 3, nextLabel: null, spent: false, satisfied: true });
  });

  it('lets an entry refusal leave its label unconsumed', () => {
    const status = phase4SetStatus([{ label: 'Phase4-CR1', outcome: 'not_started' }, { label: 'Phase4-CR1', outcome: 'passed' }]);
    assert.equal(status.nextLabel, 'Phase4-CR2');
  });

  for (const outcome of ['failed', 'interrupted', 'rejected'] as const) {
    it(`is spent by a run that ${outcome === 'rejected' ? 'was rejected' : outcome}`, () => {
      assert.deepEqual(phase4SetStatus([{ label: 'Phase4-CR1', outcome: 'passed' }, { label: 'Phase4-CR2', outcome }]), {
        consecutivePasses: 0,
        nextLabel: null,
        spent: true,
        satisfied: false,
      });
    });
  }

  it('refuses a label out of order', () => {
    assert.throws(() => phase4SetStatus([{ label: 'Phase4-CR2', outcome: 'passed' }]), /expected Phase4-CR1/);
  });
});

/* ---------------- the runner over a scripted driver ---------------- */

class ScriptedDriver implements Phase4RunDriver {
  readonly calls: string[] = [];
  states: string[] = ['BUILDING'];
  record: Phase4RunRecord = passingRecord();
  entry: Phase4EntryObservation = observation();
  round: { kind: string } = { kind: 'plan_review' };

  async observeEntry(): Promise<Phase4EntryObservation> {
    this.calls.push('observeEntry');
    return this.entry;
  }
  async createRoom(roomId: string): Promise<void> {
    this.calls.push(`createRoom ${roomId}`);
  }
  async captureScope(roomId: string): Promise<void> {
    this.calls.push(`captureScope ${roomId}`);
  }
  async runRound(): Promise<{ kind: string }> {
    this.calls.push('runRound');
    return this.round;
  }
  async roomState(): Promise<string> {
    this.calls.push('roomState');
    return this.states.length > 1 ? this.states.shift()! : this.states[0]!;
  }
  async collectRecord(roomId: string, deploymentIdAtStart: string): Promise<Phase4RunRecord> {
    this.calls.push(`collectRecord ${deploymentIdAtStart}`);
    return { ...this.record, roomId };
  }
}

function runner(driver: Phase4RunDriver, clock = { t: 0 }): Phase4Runner {
  return new Phase4Runner(driver, {
    pollMs: 1_000,
    now: () => clock.t,
    sleep: async (ms) => {
      clock.t += ms;
    },
  });
}

describe('phase 4 runner · one run of the set, over a scripted driver', () => {
  it('runs the next label to a pass, watching the room until the Founder decides', async () => {
    const driver = new ScriptedDriver();
    driver.states = ['PLAN_REVIEW', 'PLAN_REVIEW', 'BUILDING'];
    const result = await runner(driver).runNext(set(), []);
    assert.equal(result.outcome, 'passed', JSON.stringify(result));
    assert.equal(result.label, 'Phase4-CR1');
    assert.equal(result.recordDigest, phase4RecordDigest(result.record!));
    const roomId = set().runs[0]!.roomId;
    assert.deepEqual(driver.calls, ['observeEntry', `createRoom ${roomId}`, `captureScope ${roomId}`, 'runRound', 'roomState', 'roomState', 'roomState', `collectRecord ${DEPLOYMENT}`]);
  });

  it('opens another round after a revision, and only after one', async () => {
    const driver = new ScriptedDriver();
    driver.states = ['PLANNING', 'BUILDING'];
    driver.record = passingRecord(1);
    const result = await runner(driver).runNext(set(), []);
    assert.equal(result.outcome, 'passed');
    assert.equal(driver.calls.filter((c) => c === 'runRound').length, 2);
  });

  it('starts nothing when entry is refused, and the label stays next', async () => {
    const driver = new ScriptedDriver();
    driver.entry = observation({ gatewayOnline: false });
    const result = await runner(driver).runNext(set(), []);
    assert.deepEqual([result.outcome, result.entryFailures], ['not_started', ['gateway_offline']]);
    assert.deepEqual(driver.calls, ['observeEntry']);
    assert.equal(phase4SetStatus([result]).nextLabel, 'Phase4-CR1');
  });

  it('is interrupted when the Founder does not decide in time', async () => {
    const driver = new ScriptedDriver();
    driver.states = ['PLAN_REVIEW'];
    const reviewing = passingRecord();
    driver.record = { ...reviewing, finalState: 'PLAN_REVIEW', events: reviewing.events.slice(0, -1), decisions: [] };
    const result = await runner(driver).runNext(set({ decisionTimeoutMs: 60_000 }), []);
    assert.equal(result.outcome, 'interrupted');
    assert.ok(result.failures.includes('founder_decision_timeout'));
    assert.equal(driver.calls.filter((c) => c === 'roomState').length, 61);
  });

  it('stops at the round bound, and a round that does not reach review is judged as it stands', async () => {
    const revising = new ScriptedDriver();
    revising.states = ['PLANNING'];
    revising.record = passingRecord(3);
    const bounded = await runner(revising).runNext(set(), []);
    assert.equal(bounded.outcome, 'interrupted');
    assert.equal(revising.calls.filter((c) => c === 'runRound').length, 3);

    const failing = new ScriptedDriver();
    failing.round = { kind: 'failed' };
    failing.record = { ...passingRecord(), finalState: 'PLANNING', events: passingRecord().events.slice(0, 2), commands: [command('cmd_0', { eventType: 'failed', failureClassification: 'route_mismatch' })], decisions: [] };
    const failed = await runner(failing).runNext(set(), []);
    assert.equal(failed.outcome, 'interrupted');
    assert.ok(failed.failures.includes('command_not_clean'));
    assert.equal(failing.calls.includes('roomState'), false, 'nothing to wait on');
    assert.equal(failing.calls.filter((c) => c === 'runRound').length, 1, 'the runner retries no round');
  });

  it('runs no label the set does not allow, and no room twice', async () => {
    const driver = new ScriptedDriver();
    await assert.rejects(runner(driver).runNext(set(), [{ label: 'Phase4-CR1', outcome: 'failed' }]), Phase4SetNotRunnableError);
    const reuse = set({ runs: [set().runs[0], { ...set().runs[1]! }, set().runs[2]] });
    const sameRoom = { ...reuse, runs: [reuse.runs[0]!, { ...reuse.runs[1]!, roomId: reuse.runs[0]!.roomId }, reuse.runs[2]!] };
    await assert.rejects(runner(driver).runNext(sameRoom, [{ label: 'Phase4-CR1', outcome: 'passed' }]), /already used/);
    assert.deepEqual(driver.calls, []);
  });

  it('offers the driver no way to decide a plan', () => {
    const methods = Object.getOwnPropertyNames(ScriptedDriver.prototype).filter((m) => m !== 'constructor').sort();
    assert.deepEqual(methods, ['captureScope', 'collectRecord', 'createRoom', 'observeEntry', 'roomState', 'runRound']);
  });
});

describe('phase 4 export reader · the room export, read whole or refused', () => {
  const roomId = '00000000-0000-4000-8000-000000000001';
  const row = (over: Record<string, unknown> = {}) => ({
    seq: 1,
    event_id: 't3',
    event: 'plan.submitted',
    outcome: 'transition',
    actor: 'agent.planner',
    attribution: PLANNER_ATTRIBUTION,
    evidence: [{ kind: 'plan', ref: 'p', digest: 'd'.repeat(64) }],
    payload: { facts: { planHash: 'e'.repeat(64) } },
    ...over,
  });
  const body = (events: unknown[]) => ({ roomId, snapshot: { state: 'PLAN_REVIEW' }, events });

  it('keeps applied transitions in order, with the plan hash from the facts', () => {
    const reading = readPhase4Export(body([row({ seq: 1, event_id: 'x', outcome: 'rejected' }), row()]), roomId);
    assert.equal(reading.finalState, 'PLAN_REVIEW');
    assert.deepEqual(reading.events, [
      { eventId: 't3', event: 'plan.submitted', actor: 'agent.planner', attribution: PLANNER_ATTRIBUTION, evidence: [{ kind: 'plan', ref: 'p', digest: 'd'.repeat(64) }], planHash: 'e'.repeat(64) },
    ]);
  });

  it('refuses another room’s export, a row missing its attribution, and unreadable evidence', () => {
    assert.throws(() => readPhase4Export({ ...body([]), roomId: 'other' }, roomId), /not this room/);
    assert.throws(() => readPhase4Export(body([row({ attribution: { actorId: 'x' } })]), roomId), /not readable whole/);
    assert.throws(() => readPhase4Export(body([row({ evidence: [{ kind: 1 }] })]), roomId), /unreadable evidence/);
  });
});

describe('phase 4 http driver · bound to the act it drives', () => {
  const ok201 = { status: 201, json: async () => ({}) } as unknown as Response;
  const base = {
    apiToken: 'api-token',
    countedRunToken: 'counted-run-token',
    founderOs: { sha: SHA_A, clean: true },
    executorAvailable: true,
  };
  const fakeFetch = ok201 as unknown as typeof fetch;

  it('refuses an entry whose act names another control plane', async () => {
    const driver = new HttpPhase4Driver({ ...base, origin: 'https://other.example', fetch: fakeFetch });
    await assert.rejects(driver.observeEntry(set()), /names control plane/);
  });

  it('refuses to capture scope without a remote-head observer', async () => {
    const driver = new HttpPhase4Driver({ ...base, origin: 'https://control-plane.example', fetch: fakeFetch });
    const run = set().runs[0]!;
    await assert.rejects(driver.captureScope(run.roomId, run, set().founderRelay), /observer/);
  });

  it('refuses a remote head that is not the act’s base', async () => {
    const driver = new HttpPhase4Driver({
      ...base,
      origin: 'https://control-plane.example',
      observeRemoteHead: async () => SHA_B,
      fetch: fakeFetch,
    });
    const run = set().runs[0]!;
    await assert.rejects(driver.captureScope(run.roomId, run, set().founderRelay), /does not match/);
  });

  it('sends the observed head as T1’s remote-head fact, never the base asserted back', async () => {
    let sent: { facts?: Record<string, unknown> } | undefined;
    const recordingFetch = (async (_url: unknown, init?: RequestInit) => {
      if (typeof init?.body === 'string') sent = JSON.parse(init.body) as { facts?: Record<string, unknown> };
      return ok201 as unknown as Response;
    }) as unknown as typeof fetch;
    const driver = new HttpPhase4Driver({
      ...base,
      origin: 'https://control-plane.example',
      observeRemoteHead: async () => SHA_A,
      fetch: recordingFetch,
    });
    const run = set().runs[0]!;
    await driver.captureScope(run.roomId, run, set().founderRelay);
    assert.equal((sent?.facts as Record<string, string>)['remoteHeadSha'], SHA_A);
  });

  it('names the refusal when the observer throws, a route rejects, or a round settles refused, errored, or timed out', async () => {
    const run = set().runs[0]!;
    const respond = (status: number, body: Record<string, unknown>): typeof fetch =>
      (async () => ({ status, json: async () => body }) as unknown as Response) as unknown as typeof fetch;

    const throwingObserver = new HttpPhase4Driver({
      ...base,
      origin: 'https://control-plane.example',
      observeRemoteHead: async () => {
        throw new Error('git ls-remote failed');
      },
      fetch: fakeFetch,
    });
    await assert.rejects(
      throwingObserver.captureScope(run.roomId, run, set().founderRelay),
      /remote head not observed for example-org\/example-repo: git ls-remote failed/,
    );

    const guardRejected = new HttpPhase4Driver({
      ...base,
      origin: 'https://control-plane.example',
      observeRemoteHead: async () => SHA_A,
      fetch: respond(409, { outcome: 'rejected', code: 'GUARD_FAILED', reason: 'Guard G1 failed for T1 (scope.captured)' }),
    });
    await assert.rejects(
      guardRejected.captureScope(run.roomId, run, set().founderRelay),
      /scope capture answered 409: GUARD_FAILED — Guard G1 failed for T1 \(scope\.captured\)/,
    );

    const startRefused = new HttpPhase4Driver({
      ...base,
      origin: 'https://control-plane.example',
      fetch: respond(503, { error: 'dispatcher_surface_unregistered', message: 'not in registry' }),
    });
    await assert.rejects(
      startRefused.runRound(run.roomId),
      /planner-round start answered 503: dispatcher_surface_unregistered — not in registry/,
    );

    const settledOutcome = (outcome: Record<string, unknown>): typeof fetch =>
      (async (_url: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') return { status: 202, json: async () => ({ status: 'running' }) } as unknown as Response;
        return {
          status: 200,
          json: async () => ({
            deploymentId: DEPLOYMENT,
            gateway: { id: GATEWAY, online: true },
            dispatcherSurfaceRegistered: true,
            round: { status: 'settled', roomId: run.roomId, outcome },
          }),
        } as unknown as Response;
      }) as unknown as typeof fetch;

    const roundRefused = new HttpPhase4Driver({
      ...base,
      origin: 'https://control-plane.example',
      fetch: settledOutcome({ kind: 'refused', code: 'guard_failed', reason: 'Gateway offline' }),
    });
    await assert.rejects(roundRefused.runRound(run.roomId), /planner-round refused: guard_failed — Gateway offline/);

    const roundErrored = new HttpPhase4Driver({
      ...base,
      origin: 'https://control-plane.example',
      fetch: settledOutcome({ kind: 'error', reason: 'PlannerLoopUnfencedError' }),
    });
    await assert.rejects(roundErrored.runRound(run.roomId), /planner-round error: PlannerLoopUnfencedError/);

    let clock = 0;
    const roundTimedOut = new HttpPhase4Driver({
      ...base,
      origin: 'https://control-plane.example',
      roundTimeoutMs: 100,
      pollMs: 50,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      fetch: (async (_url: unknown, init?: RequestInit) => {
        if (init?.method === 'POST') return { status: 202, json: async () => ({ status: 'running' }) } as unknown as Response;
        return {
          status: 200,
          json: async () => ({
            deploymentId: DEPLOYMENT,
            gateway: { id: GATEWAY, online: true },
            dispatcherSurfaceRegistered: true,
            round: { status: 'running', roomId: run.roomId },
          }),
        } as unknown as Response;
      }) as unknown as typeof fetch,
    });
    await assert.rejects(
      roundTimedOut.runRound(run.roomId),
      /planner-round timed out after 100ms in room 00000000-0000-4000-8000-000000000001 \(status: running\)/,
    );
  });
});

/**
 * `npm run phase4:counted-run` (FOUNDER-ACT-20261102-BR-PHASE4-COUNTED-RUNS
 * D2): the live check of the act's E2, the runner's two hooks, the set's
 * attempt log, and the command end to end against a scripted control plane.
 * Nothing here contacts a control plane, a Gateway, GitHub or a provider:
 * `fetch` and `git` are fakes, and every file is written under a temporary
 * directory.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { founderGoalDigest } from '../packages/control-plane/src/founder-goal.js';
import { plannerCommandIdFor } from '../packages/control-plane/src/planner-loop.js';
import {
  PHASE4_CLI_EXIT,
  phase4CountedRunMain,
  scrubTokens,
  holdsSecret,
  leaksSecret,
} from '../packages/run-harness/src/phase4/cli.js';
import {
  PHASE4_LOCK_FILE,
  Phase4AttemptStoreError,
  Phase4Runner,
  acquirePhase4Lock,
  evaluatePhase4LiveCheck,
  loadPhase4Attempts,
  phase4RecordDigest,
  phase4RecordFileName,
  PHASE4_DISPATCHER,
  registeredSurfaceIds,
  savePhase4Attempts,
  writePhase4EvidenceFile,
  type Phase4EntryObservation,
  type Phase4RunDriver,
  type Phase4RunRecord,
  type Phase4RunSet,
} from '../packages/run-harness/src/phase4/index.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REGISTRY_TEXT = readFileSync(join(REPO_ROOT, 'packages', 'control-plane', 'fixtures', 'execution-surface-registry.md'), 'utf8');

const SHA_FOUNDEROS = 'a'.repeat(40);
const SHA_BUILDROOM = 'b'.repeat(40);
const SHA_BASE = 'c'.repeat(40);
const GATEWAY = '1880c12d-d98d-4a91-b25a-23320aa7f58a';
const DEPLOYMENT = 'dep-0001';
const ORIGIN = 'https://control-plane.example';
const API_TOKEN = 'api-token-0123456789abcdef0123456789abcdef';
const COUNTED_TOKEN = 'counted-token-0123456789abcdef0123456789ab';
const ROOM_1 = '1086e073-e181-49a9-a275-cd1e35541f7c';
const ROOM_2 = 'c7d6bd4f-607b-4753-9430-9a16fc46356e';
const PASSED_CHECK = { passed: true, commandId: 'cmd-1', initModel: 'gemini-4-argon-high', providerConversationId: 'conv-1', readAt: '2026-11-02T14:30:00.000Z' };

/** A record the run unit judges passed: one round to the Founder's approval, its dispatch carrying both init fields. */
function passingRecordFor(label: 'Phase4-CR1' | 'Phase4-CR2' | 'Phase4-CR3', dispatched: Record<string, unknown> = { initModel: 'gemini-4-argon-high', providerConversationId: 'conv-1' }): Phase4RunRecord {
  const run = runSet().runs.find((r) => r.label === label)!;
  const a = (roleId: string | null, actorId: string, actualModel: string, executionSurface: string) => ({ roleId, actorId, actualModel, executionSurface });
  const planner = a('architect', 'session:planner', 'gemini-4-argon', 'antigravity');
  const founder = a(null, 'founder', 'n/a (human Founder decision)', 'claude-code');
  const commandId = plannerCommandIdFor(run.roomId, 't2');
  const planHash = 'a1'.padEnd(64, '0');
  return {
    roomId: run.roomId,
    deploymentIdAtStart: DEPLOYMENT,
    deploymentIdAtEnd: DEPLOYMENT,
    finalState: 'BUILDING',
    events: [
      { eventId: 't1', event: 'scope.captured', actor: 'founder', attribution: a(null, 'founder', 'n/a (the Founder’s words, relayed verbatim)', 'claude-code'), evidence: [{ kind: 'founder_goal', ref: 'goal', digest: founderGoalDigest(run.inputs.goal) }] },
      { eventId: 't2', event: 'task.dispatched.planner', actor: 'control-plane', attribution: a('builder', `control-plane:${DEPLOYMENT}`, PHASE4_DISPATCHER.actualModel, PHASE4_DISPATCHER.executionSurface), evidence: [] },
      { eventId: 't3', event: 'plan.submitted', actor: 'agent.planner', attribution: planner, evidence: [], planHash },
      { eventId: 't5', event: 'plan.approved', actor: 'founder', attribution: founder, evidence: [], planHash },
    ],
    commands: [
      {
        commandId,
        rows: [
          { eventType: 'journaled', authorizationRef: runSet().setId, intendedProvider: 'google', intendedModel: 'gemini-4-argon', intendedSurface: 'antigravity' },
          { eventType: 'identity_bound' },
          { eventType: 'dispatched', provider: 'google', model: 'gemini-4-argon', executionSurface: 'antigravity', ...dispatched },
          { eventType: 'completed' },
        ] as Phase4RunRecord['commands'][number]['rows'],
      },
    ],
    decisions: [{ commandId, decision: 'plan.approved', planHash }],
    journalVerified: true,
  };
}

/** Write a record beside the log, as the command does, and answer its digest. */
async function writeRecord(dir: string, label: 'Phase4-CR1' | 'Phase4-CR2' | 'Phase4-CR3', roomId: string, given?: Phase4RunRecord): Promise<string> {
  const record: Phase4RunRecord = given ?? { roomId, deploymentIdAtStart: 'dep-0001', deploymentIdAtEnd: 'dep-0001', finalState: 'BUILDING', events: [], commands: [], decisions: [], journalVerified: true };
  await writePhase4EvidenceFile(dir, phase4RecordFileName(label, roomId), `${JSON.stringify(record, null, 2)}\n`);
  return phase4RecordDigest(record);
}

function runSet(overrides: Record<string, unknown> = {}): Phase4RunSet {
  const run = (label: string, roomId: string, path: string) => ({
    label,
    roomId,
    inputs: { repository: 'MADVenturesLLC/founder-os-build-room', baseSha: SHA_BASE, scopePaths: [path], goal: `Plan a section for ${path}.` },
  });
  return {
    setId: 'FOUNDER-ACT-20261102-BR-PHASE4-COUNTED-RUNS',
    founderOsSha: SHA_FOUNDEROS,
    buildRoomSha: SHA_BUILDROOM,
    controlPlaneOrigin: ORIGIN,
    gatewayId: GATEWAY,
    planner: { provider: 'google', model: 'gemini-4-argon' },
    seats: { builder: 'claude-code:anthropic', reviewer: 'codex:openai' },
    founderRelay: { actualModel: 'n/a (the Founder’s words, relayed verbatim)', executionSurface: 'claude-code' },
    decisionTimeoutMs: 60_000,
    runs: [
      run('Phase4-CR1', ROOM_1, 'README.md'),
      run('Phase4-CR2', 'c7d6bd4f-607b-4753-9430-9a16fc46356e', 'docs/command-journal-contract.md'),
      run('Phase4-CR3', 'c5442130-2afd-4c0f-a294-62beddeef06e', 'docs/gateway-ops-actions-log-runbook.md'),
    ],
    ...overrides,
  } as Phase4RunSet;
}

/* ---------------- the live check ---------------- */

describe('the live check (act E2, readiness act Part B)', () => {
  const dispatched = (fields: Record<string, unknown>) => [{ commandId: 'cmd-1', rows: [{ eventType: 'journaled' }, { eventType: 'dispatched', ...fields }] }];

  it('passes only when the first command’s dispatched row carries both fields, non-empty', () => {
    const reading = evaluatePhase4LiveCheck(dispatched({ initModel: 'gemini-4-argon-high', providerConversationId: 'conv-1' }));
    assert.deepEqual(reading, { passed: true, commandId: 'cmd-1', initModel: 'gemini-4-argon-high', providerConversationId: 'conv-1' });
  });

  it('fails with no journaled command, no dispatched row, or either field absent or blank', () => {
    assert.equal(evaluatePhase4LiveCheck([]).passed, false);
    assert.match(evaluatePhase4LiveCheck([{ commandId: 'cmd-1', rows: [{ eventType: 'journaled' }] }]).reason ?? '', /no dispatched row/);
    assert.match(evaluatePhase4LiveCheck(dispatched({ providerConversationId: 'conv-1' })).reason ?? '', /lacks init_model$/);
    assert.match(evaluatePhase4LiveCheck(dispatched({ initModel: 'gemini-4-argon-high', providerConversationId: '  ' })).reason ?? '', /lacks provider_conversation_id$/);
    assert.match(evaluatePhase4LiveCheck(dispatched({})).reason ?? '', /lacks init_model and provider_conversation_id/);
  });

  it('reads only the room’s first command', () => {
    const commands = [
      { commandId: 'cmd-1', rows: [{ eventType: 'dispatched' }] },
      { commandId: 'cmd-2', rows: [{ eventType: 'dispatched', initModel: 'gemini-4-argon-high', providerConversationId: 'conv-2' }] },
    ];
    assert.equal(evaluatePhase4LiveCheck(commands).passed, false);
  });
});

/* ---------------- the runner's hooks ---------------- */

function observation(overrides: Partial<Phase4EntryObservation> = {}): Phase4EntryObservation {
  return {
    controlPlane: { status: 200, commit: SHA_BUILDROOM, deploymentId: DEPLOYMENT },
    founderOs: { sha: SHA_FOUNDEROS, clean: true },
    enrolledGateways: [GATEWAY],
    gatewayOnline: true,
    executorAvailable: true,
    registeredSurfaces: registeredSurfaceIds(REGISTRY_TEXT),
    ...overrides,
  };
}

class ScriptedDriver implements Phase4RunDriver {
  readonly calls: string[] = [];
  entry: Phase4EntryObservation = observation();
  async observeEntry(): Promise<Phase4EntryObservation> {
    this.calls.push('observeEntry');
    return this.entry;
  }
  async createRoom(): Promise<void> {
    this.calls.push('createRoom');
  }
  async captureScope(): Promise<void> {
    this.calls.push('captureScope');
  }
  async runRound(): Promise<{ kind: string }> {
    this.calls.push('runRound');
    return { kind: 'plan_review' };
  }
  async roomState(): Promise<string> {
    this.calls.push('roomState');
    return 'PLAN_REVIEW';
  }
  async collectRecord(roomId: string, deploymentIdAtStart: string): Promise<Phase4RunRecord> {
    this.calls.push('collectRecord');
    return { roomId, deploymentIdAtStart, deploymentIdAtEnd: deploymentIdAtStart, finalState: 'PLAN_REVIEW', events: [], commands: [], decisions: [], journalVerified: true };
  }
}

describe('the runner’s hooks', () => {
  it('calls onEntryPassed after entry and before the room is created', async () => {
    const driver = new ScriptedDriver();
    const runner = new Phase4Runner(driver, {
      onEntryPassed: async () => {
        driver.calls.push('onEntryPassed');
      },
      afterRound: async () => 'stop',
    });
    await runner.runNext(runSet(), []);
    assert.deepEqual(driver.calls.slice(0, 3), ['observeEntry', 'onEntryPassed', 'createRoom']);
  });

  it('does not call onEntryPassed when entry refuses', async () => {
    const driver = new ScriptedDriver();
    driver.entry = observation({ gatewayOnline: false });
    let called = false;
    const result = await new Phase4Runner(driver, {
      onEntryPassed: async () => {
        called = true;
      },
    }).runNext(runSet(), []);
    assert.equal(result.outcome, 'not_started');
    assert.equal(called, false);
    assert.deepEqual(driver.calls, ['observeEntry']);
  });

  it('stops after a round when afterRound answers stop, without waiting on the Founder', async () => {
    const driver = new ScriptedDriver();
    const rounds: number[] = [];
    const result = await new Phase4Runner(driver, {
      afterRound: async ({ round }) => {
        rounds.push(round);
        return 'stop';
      },
    }).runNext(runSet(), []);
    assert.deepEqual(rounds, [1]);
    assert.equal(driver.calls.includes('roomState'), false);
    assert.notEqual(result.outcome, 'passed');
  });
});

/* ---------------- the attempt log ---------------- */

describe('the set’s attempt log', () => {
  it('reads an empty log for a set that has not run, and reads back what it wrote', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'phase4-attempts-'));
    const empty = await loadPhase4Attempts(dir, 'SET', 'f'.repeat(64));
    assert.deepEqual(empty.attempts, []);
    const recordDigest = await writeRecord(dir, 'Phase4-CR1', ROOM_1);
    const log = { setId: 'SET', termsSha256: 'f'.repeat(64), attempts: [{ label: 'Phase4-CR1' as const, roomId: ROOM_1, outcome: 'passed' as const, pending: false, startedAt: '2026-11-02T14:00:00.000Z', endedAt: '2026-11-02T15:00:00.000Z', entryFailures: [], failures: [], recordDigest, liveCheck: PASSED_CHECK }] };
    await savePhase4Attempts(dir, log);
    assert.deepEqual(await loadPhase4Attempts(dir, 'SET', 'f'.repeat(64)), log);
  });

  it('refuses a log bound to another set or to other terms', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'phase4-attempts-'));
    await savePhase4Attempts(dir, { setId: 'SET', termsSha256: 'f'.repeat(64), attempts: [] });
    await assert.rejects(loadPhase4Attempts(dir, 'OTHER', 'f'.repeat(64)), Phase4AttemptStoreError);
    await assert.rejects(loadPhase4Attempts(dir, 'SET', 'e'.repeat(64)), Phase4AttemptStoreError);
  });

  it('refuses a malformed attempt rather than trust it as progress', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'phase4-attempts-'));
    const recordDigest = await writeRecord(dir, 'Phase4-CR1', ROOM_1);
    const good = { label: 'Phase4-CR1', roomId: ROOM_1, outcome: 'passed', pending: false, startedAt: '2026-11-02T14:00:00Z', endedAt: '2026-11-02T15:00:00Z', entryFailures: [], failures: [], recordDigest, liveCheck: PASSED_CHECK };
    const bad: Record<string, unknown>[] = [
      // Codex's cases (PR 141): an optional field of the wrong type, a pass whose live check failed, a pass with entry failures.
      { ...good, liveCheck: 7 },
      { ...good, liveCheck: { ...PASSED_CHECK, passed: false, reason: 'the dispatched row lacks init_model' } },
      { ...good, entryFailures: ['gateway_offline'] },
      { ...good, liveCheck: undefined },
      { ...good, liveCheck: { ...PASSED_CHECK, providerConversationId: '' } },
      { ...good, liveCheck: { ...PASSED_CHECK, extra: true } },
      { ...good, recordDigest: 'd'.repeat(64) },
      { ...good, label: 'Phase4-CR2' },
      { ...good, error: 'boom' },
      { ...good, endedAt: 'not a time' },
      { label: 'Phase4-CR1', roomId: ROOM_1, outcome: 'not_started', pending: false, startedAt: '2026-11-02T14:00:00Z', entryFailures: [], failures: [], recordDigest },
      { ...good, recordDigest: undefined },
      { ...good, endedAt: undefined },
      { ...good, pending: true },
      { ...good, failures: ['journal_unverified'] },
      { ...good, extra: 'field' },
      { ...good, outcome: 'won' },
      { ...good, roomId: 'not-a-room' },
      { ...good, outcome: 'failed', pending: true },
    ];
    await writeFile(join(dir, 'attempts.json'), JSON.stringify({ setId: 'SET', termsSha256: 'f'.repeat(64), attempts: [good] }));
    assert.equal((await loadPhase4Attempts(dir, 'SET', 'f'.repeat(64))).attempts.length, 1);
    for (const attempt of bad) {
      await writeFile(join(dir, 'attempts.json'), JSON.stringify({ setId: 'SET', termsSha256: 'f'.repeat(64), attempts: [attempt] }));
      await assert.rejects(loadPhase4Attempts(dir, 'SET', 'f'.repeat(64)), Phase4AttemptStoreError, JSON.stringify(attempt));
    }
  });

  it('holds one lock per evidence directory, refusing a second holder until it is released', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'phase4-lock-'));
    const release = await acquirePhase4Lock(dir, 'first');
    await assert.rejects(acquirePhase4Lock(dir, 'second'), /is held/);
    await release();
    const again = await acquirePhase4Lock(dir, 'third');
    await again();
  });

  it('never overwrites an evidence file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'phase4-evidence-'));
    await writePhase4EvidenceFile(dir, 'r.json', 'first\n');
    await assert.rejects(writePhase4EvidenceFile(dir, 'r.json', 'second\n'), /never overwritten/);
    assert.equal(await readFile(join(dir, 'r.json'), 'utf8'), 'first\n');
  });
});

/* ---------------- the command, end to end ---------------- */

interface FakeControlPlane {
  readonly fetch: typeof fetch;
  readonly requests: { method: string; path: string; authorization: string | null }[];
}

function fakeControlPlane(options: { online?: boolean; dispatched?: Record<string, unknown>; actId?: string; roundStartError?: string; journalError?: string; exportState?: string; served?: Record<string, Phase4RunRecord> } = {}): FakeControlPlane {
  const requests: FakeControlPlane['requests'] = [];
  let round: Record<string, unknown> = { status: 'idle' };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    requests.push({ method, path: url.pathname, authorization: headers['authorization'] ?? null });
    const path = url.pathname;
    const servedRoom = options.served?.[path.split('/')[path.startsWith('/control-plane/') ? 3 : 2] ?? ''];
    if (servedRoom !== undefined && method === 'GET' && /\/export$/.test(path)) {
      return json(200, {
        roomId: servedRoom.roomId,
        snapshot: { state: servedRoom.finalState },
        events: servedRoom.events.map((e, seq) => ({ seq, outcome: 'transition', event_id: e.eventId, event: e.event, actor: e.actor, attribution: e.attribution, evidence: e.evidence, payload: { facts: e.planHash === undefined ? {} : { planHash: e.planHash } } })),
      });
    }
    if (servedRoom !== undefined && method === 'GET' && /\/journal$/.test(path)) {
      return json(200, { commands: servedRoom.commands, decisions: servedRoom.decisions, journal: { verified: servedRoom.journalVerified, headSeq: 9 } });
    }
    if (method === 'GET' && path === '/version') return json(200, { commit: SHA_BUILDROOM });
    if (method === 'GET' && path === '/control-plane/enrollments') return json(200, { enrollments: [{ gatewayId: GATEWAY, state: 'enrolled' }] });
    if (method === 'POST' && path === '/rooms') return json(201, {});
    if (method === 'POST' && /^\/rooms\/[^/]+\/events$/.test(path)) return json(201, {});
    if (method === 'POST' && /\/planner-round$/.test(path)) {
      if (options.roundStartError !== undefined) return json(500, { error: 'internal', message: options.roundStartError });
      round = { status: 'settled', roomId: path.split('/')[3], outcome: { kind: 'plan_review' } };
      return json(202, { status: 'running' });
    }
    if (method === 'GET' && /\/planner-round$/.test(path)) {
      return json(200, { actId: options.actId ?? 'FOUNDER-ACT-20261102-BR-PHASE4-COUNTED-RUNS', deploymentId: DEPLOYMENT, gateway: { id: GATEWAY, online: options.online ?? true }, dispatcherSurfaceRegistered: true, round });
    }
    if (method === 'GET' && /^\/rooms\/[^/]+$/.test(path)) return json(200, { snapshot: { state: 'PLAN_REVIEW' } });
    if (method === 'GET' && /\/export$/.test(path)) return json(200, { roomId: path.split('/')[2], snapshot: { state: options.exportState ?? 'PLAN_REVIEW' }, events: [] });
    if (method === 'GET' && /\/journal$/.test(path)) {
      if (options.journalError !== undefined) return json(500, { error: 'internal', message: options.journalError });
      return json(200, {
        commands: [{ commandId: 'cmd-1', rows: [{ eventType: 'journaled' }, { eventType: 'dispatched', ...(options.dispatched ?? {}) }] }],
        decisions: [],
        journal: { verified: true, headSeq: 3 },
      });
    }
    return json(404, { error: 'not_found' });
  };
  return { fetch: fake as typeof fetch, requests };
}

function fakeGit(head = SHA_BASE) {
  return async (args: readonly string[]): Promise<string> => {
    if (args.includes('rev-parse')) return `${SHA_FOUNDEROS}\n`;
    if (args.includes('status')) return '';
    if (args[0] === 'ls-remote') return `${head}\tHEAD\n`;
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

async function workspace(set: Phase4RunSet = runSet()) {
  const dir = await mkdtemp(join(tmpdir(), 'phase4-cli-'));
  const termsFile = join(dir, 'terms.json');
  const text = `${JSON.stringify(set, null, 2)}\n`;
  await writeFile(termsFile, text);
  const env = {
    PHASE4_TERMS_FILE: termsFile,
    PHASE4_TERMS_SHA256: createHash('sha256').update(text).digest('hex'),
    PHASE4_EVIDENCE_DIR: join(dir, 'evidence'),
    CONTROL_PLANE_TOKEN: API_TOKEN,
    PHASE4_COUNTED_RUN_TOKEN: COUNTED_TOKEN,
    FOUNDEROS_PATH: join(dir, 'founderos'),
    PHASE4_EXECUTOR_CONFIRMED: 'yes',
  };
  return { dir, env };
}

function clock() {
  const state = { t: Date.parse('2026-11-02T14:00:00Z') };
  return {
    now: () => state.t,
    sleep: async (ms: number) => {
      state.t += ms;
    },
  };
}

async function evidenceText(dir: string): Promise<string> {
  const evidence = join(dir, 'evidence');
  const names = await readdir(evidence).catch(() => [] as string[]);
  const texts = await Promise.all(names.map((name) => readFile(join(evidence, name), 'utf8')));
  return texts.join('\n');
}

/** Record CR1 as the command would after a pass: its record beside the log, and the attempt. */
async function recordPass(env: { PHASE4_EVIDENCE_DIR: string; PHASE4_TERMS_SHA256: string }, record: Phase4RunRecord, liveCheck = { ...PASSED_CHECK, commandId: plannerCommandIdFor(ROOM_1, 't2') }): Promise<void> {
  const recordDigest = await writeRecord(env.PHASE4_EVIDENCE_DIR, 'Phase4-CR1', ROOM_1, record);
  await savePhase4Attempts(env.PHASE4_EVIDENCE_DIR, {
    setId: runSet().setId,
    termsSha256: env.PHASE4_TERMS_SHA256,
    attempts: [{ label: 'Phase4-CR1', roomId: ROOM_1, outcome: 'passed', pending: false, startedAt: '2026-11-02T14:00:00.000Z', endedAt: '2026-11-02T15:00:00.000Z', entryFailures: [], failures: [], recordDigest, liveCheck }],
  });
}

describe('npm run phase4:counted-run', () => {
  it('refuses, running nothing, without its configuration', async () => {
    const { env } = await workspace();
    const plane = fakeControlPlane();
    const lines: string[] = [];
    const cases: Record<string, string | undefined>[] = [
      { ...env, PHASE4_COUNTED_RUN_TOKEN: '' },
      { ...env, PHASE4_EXECUTOR_CONFIRMED: 'true' },
      { ...env, PHASE4_COUNTED_RUN_TOKEN: API_TOKEN },
      { ...env, PHASE4_TERMS_SHA256: 'd'.repeat(64) },
    ];
    for (const config of cases) {
      const code = await phase4CountedRunMain(config, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l) });
      assert.equal(code, PHASE4_CLI_EXIT.refused);
    }
    assert.equal(plane.requests.length, 0);
    assert.ok(lines.every((l) => l.startsWith('phase4:counted-run: refused, nothing ran')));
  });

  it('refuses a terms file that is not a run set', async () => {
    const { env } = await workspace({ ...runSet(), decisionTimeoutMs: 5 } as Phase4RunSet);
    const lines: string[] = [];
    const code = await phase4CountedRunMain(env, { fetch: fakeControlPlane().fetch, git: fakeGit(), out: (l) => lines.push(l) });
    assert.equal(code, PHASE4_CLI_EXIT.refused);
    assert.match(lines.join('\n'), /timeout_invalid/);
  });

  it('stops Phase4-CR1 at a failed live check, spends the set, and never prints or writes a token', async () => {
    const { dir, env } = await workspace();
    const plane = fakeControlPlane({ dispatched: { initModel: 'gemini-4-argon-high' } });
    const lines: string[] = [];
    const code = await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock(), pollMs: 1_000 });
    assert.equal(code, PHASE4_CLI_EXIT.notPassed);
    const output = lines.join('\n');
    assert.match(output, /LIVE CHECK at 2026-11-02T14:00:00\.000Z: command cmd-1; init_model gemini-4-argon-high; provider_conversation_id absent/);
    assert.match(output, /LIVE CHECK FAILED \(the dispatched row lacks provider_conversation_id\)/);
    assert.match(output, /The set is spent/);
    // It stopped before waiting on the Founder: the room's state was never polled.
    assert.equal(plane.requests.some((r) => r.method === 'GET' && /^\/rooms\/[^/]+$/.test(r.path)), false);

    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.equal(log.attempts.length, 1);
    const attempt = log.attempts[0]!;
    assert.equal(attempt.label, 'Phase4-CR1');
    assert.equal(attempt.pending, false);
    assert.notEqual(attempt.outcome, 'passed');
    assert.equal(attempt.liveCheck?.passed, false);
    assert.equal(typeof attempt.recordDigest, 'string');

    const evidence = await evidenceText(dir);
    for (const token of [API_TOKEN, COUNTED_TOKEN]) {
      assert.equal(output.includes(token), false);
      assert.equal(evidence.includes(token), false);
    }

    const again: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => again.push(l) }), PHASE4_CLI_EXIT.refused);
    assert.match(again.join('\n'), /the set is spent/);
  });

  it('sends each token only to the routes it opens', async () => {
    const { env } = await workspace();
    const plane = fakeControlPlane({ dispatched: {} });
    await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: () => undefined, ...clock() });
    for (const request of plane.requests) {
      const expected = request.path === '/version' ? null : request.path.startsWith('/control-plane/rooms/') ? `Bearer ${COUNTED_TOKEN}` : `Bearer ${API_TOKEN}`;
      assert.equal(request.authorization, expected, `${request.method} ${request.path}`);
    }
  });

  it('continues past a passing live check and records it with the run', async () => {
    const { env } = await workspace();
    const plane = fakeControlPlane({ dispatched: { initModel: 'gemini-4-argon-high', providerConversationId: 'conv-1' } });
    const lines: string[] = [];
    const code = await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock(), pollMs: 10_000 });
    assert.match(lines.join('\n'), /LIVE CHECK PASSED/);
    // It waited on the Founder's decision; none came within the act's time, so the run did not pass.
    assert.equal(plane.requests.some((r) => r.method === 'GET' && /^\/rooms\/[^/]+$/.test(r.path)), true);
    assert.equal(code, PHASE4_CLI_EXIT.notPassed);
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.equal(log.attempts[0]?.liveCheck?.passed, true);
    assert.equal(log.attempts[0]?.liveCheck?.providerConversationId, 'conv-1');
  });

  it('leaves the set unspent when entry refuses, writing nothing to the control plane', async () => {
    const { env } = await workspace();
    const plane = fakeControlPlane({ online: false });
    const lines: string[] = [];
    const code = await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock() });
    assert.equal(code, PHASE4_CLI_EXIT.notStarted);
    assert.match(lines.join('\n'), /gateway_offline/);
    assert.equal(plane.requests.some((r) => r.method === 'POST'), false);
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.equal(log.attempts.some((a) => a.outcome !== 'not_started'), false);
  });

  it('records a run that fails after entry as interrupted, which spends the set', async () => {
    const { env } = await workspace();
    const plane = fakeControlPlane();
    const lines: string[] = [];
    const code = await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit('d'.repeat(40)), out: (l) => lines.push(l), ...clock() });
    assert.equal(code, PHASE4_CLI_EXIT.notPassed);
    assert.match(lines.join('\n'), /does not match the act's base/);
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.equal(log.attempts.length, 1);
    assert.equal(log.attempts[0]?.outcome, 'interrupted');
    assert.equal(log.attempts[0]?.pending, false);
    assert.match(log.attempts[0]?.error ?? '', /does not match the act's base/);
  });

  it('refuses to run while another invocation holds the lock, and releases its own when done', async () => {
    const { env } = await workspace();
    const release = await acquirePhase4Lock(env.PHASE4_EVIDENCE_DIR, 'another invocation');
    const plane = fakeControlPlane({ dispatched: {} });
    const lines: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l) }), PHASE4_CLI_EXIT.refused);
    assert.match(lines.join('\n'), /is held/);
    assert.equal(plane.requests.length, 0);
    await release();

    await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: () => undefined, ...clock() });
    assert.equal((await readdir(env.PHASE4_EVIDENCE_DIR)).includes(PHASE4_LOCK_FILE), false);
  });

  it('refuses, writing nothing, when the control plane is configured for another act', async () => {
    const { env } = await workspace();
    const plane = fakeControlPlane({ actId: 'FOUNDER-ACT-SOMETHING-ELSE' });
    const lines: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock() }), PHASE4_CLI_EXIT.refused);
    assert.match(lines.join('\n'), /configured for act FOUNDER-ACT-SOMETHING-ELSE/);
    assert.equal(plane.requests.some((r) => r.method === 'POST'), false);
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.deepEqual(log.attempts, []);
  });

  it('withholds and fails a live check whose journal values carry a token', async () => {
    const { dir, env } = await workspace();
    const plane = fakeControlPlane({ dispatched: { initModel: 'gemini-4-argon-high', providerConversationId: `conv-${COUNTED_TOKEN}` } });
    const lines: string[] = [];
    // The journal's rows are also the run's record, so the record holds the token too: it is never written.
    await assert.rejects(phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock() }), /holds a token/);
    assert.match(lines.join('\n'), /LIVE CHECK FAILED \(a journal value holds credential material/);
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.equal(log.attempts[0]?.pending, true);
    for (const text of [lines.join('\n'), await evidenceText(dir)]) assert.equal(text.includes(COUNTED_TOKEN), false);
  });

  it('scrubs a token out of an error before printing or keeping it', async () => {
    const { dir, env } = await workspace();
    const plane = fakeControlPlane({ roundStartError: `upstream echoed Bearer ${API_TOKEN}` });
    const lines: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock() }), PHASE4_CLI_EXIT.notPassed);
    assert.match(lines.join('\n'), /Bearer \[withheld\]/);
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.match(log.attempts[0]?.error ?? '', /Bearer \[withheld\]/);
    for (const text of [lines.join('\n'), await evidenceText(dir)]) assert.equal(text.includes(API_TOKEN), false);
  });

  it('keeps the attempt pending when its record cannot be written, so the set refuses to run again', async () => {
    const { env } = await workspace();
    await writePhase4EvidenceFile(env.PHASE4_EVIDENCE_DIR, `Phase4-CR1-${ROOM_1}.record.json`, 'in the way\n');
    const plane = fakeControlPlane({ dispatched: {} });
    await assert.rejects(phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: () => undefined, ...clock() }), /never overwritten/);
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.equal(log.attempts[0]?.pending, true);
    const lines: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l) }), PHASE4_CLI_EXIT.refused);
    assert.match(lines.join('\n'), /still marked under way/);
  });

  it('scrubs a token out of a failed journal read before keeping the live check', async () => {
    const { dir, env } = await workspace();
    const plane = fakeControlPlane({ journalError: `upstream echoed ${COUNTED_TOKEN}` });
    const lines: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock() }), PHASE4_CLI_EXIT.notPassed);
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.match(log.attempts[0]?.liveCheck?.reason ?? '', /upstream echoed \[withheld\]/);
    for (const text of [lines.join('\n'), await evidenceText(dir)]) assert.equal(text.includes(COUNTED_TOKEN), false);
  });

  it('never writes a record that holds a token, leaving the attempt pending', async () => {
    const { dir, env } = await workspace();
    const plane = fakeControlPlane({ dispatched: {}, exportState: `PLAN_REVIEW ${API_TOKEN}` });
    await assert.rejects(phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: () => undefined, ...clock() }), /holds a token/);
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.equal(log.attempts[0]?.pending, true);
    assert.equal(await evidenceText(dir).then((t) => t.includes(API_TOKEN)), false);
  });

  it('scrubs both tokens from text printed outside the command', () => {
    const env = { CONTROL_PLANE_TOKEN: API_TOKEN, PHASE4_COUNTED_RUN_TOKEN: COUNTED_TOKEN };
    assert.equal(scrubTokens(`a ${API_TOKEN} b ${COUNTED_TOKEN}`, env), 'a [withheld] b [withheld]');
    assert.equal(scrubTokens('nothing here', {}), 'nothing here');
  });

  it('finds a token in decoded values however JSON would escape it, and refuses such tokens outright', async () => {
    const token = 'tok\\en"with-escapes-0123456789abcdef0123456789';
    assert.equal(JSON.stringify({ v: `x${token}` }).includes(token), false);
    assert.equal(holdsSecret({ rows: [{ providerConversationId: `x${token}` }] }, [token]), true);
    assert.equal(holdsSecret({ [`k${token}`]: 1 }, [token]), true);
    assert.equal(holdsSecret({ rows: [{ v: 'clean' }] }, [token]), false);

    // A token JSON would spell differently is refused before anything runs (Codex third review, PR 141).
    const { env } = await workspace();
    for (const bad of [token, 'quote"0123456789abcdef0123456789abcdef', 'tab\t0123456789abcdef0123456789abcdef']) {
      for (const name of ['CONTROL_PLANE_TOKEN', 'PHASE4_COUNTED_RUN_TOKEN']) {
        const plane = fakeControlPlane();
        const lines: string[] = [];
        assert.equal(await phase4CountedRunMain({ ...env, [name]: bad }, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l) }), PHASE4_CLI_EXIT.refused);
        assert.match(lines.join('\n'), new RegExp(`${name} holds a quote, a backslash or a control character`));
        assert.equal(plane.requests.length, 0);
        assert.equal(lines.join('\n').includes(bad), false);
      }
    }
  });

  it('refuses a pass whose record is missing or does not hash to its digest', async () => {
    const { env } = await workspace();
    const digest = await writeRecord(env.PHASE4_EVIDENCE_DIR, 'Phase4-CR1', ROOM_1);
    const pass = { label: 'Phase4-CR1' as const, roomId: ROOM_1, outcome: 'passed' as const, pending: false, startedAt: '2026-11-02T14:00:00.000Z', endedAt: '2026-11-02T15:00:00.000Z', entryFailures: [], failures: [], recordDigest: digest, liveCheck: PASSED_CHECK };
    await savePhase4Attempts(env.PHASE4_EVIDENCE_DIR, { setId: runSet().setId, termsSha256: env.PHASE4_TERMS_SHA256, attempts: [{ ...pass, recordDigest: 'd'.repeat(64) }] });
    await assert.rejects(loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256), /does not hash to its digest/);
    await savePhase4Attempts(env.PHASE4_EVIDENCE_DIR, { setId: runSet().setId, termsSha256: env.PHASE4_TERMS_SHA256, attempts: [{ ...pass, roomId: ROOM_2 }] });
    await assert.rejects(loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256), /missing or unreadable/);
  });

  it('writes a record that hashes to the digest it keeps', async () => {
    const { env } = await workspace();
    await phase4CountedRunMain(env, { fetch: fakeControlPlane({ dispatched: {} }).fetch, git: fakeGit(), out: () => undefined, ...clock() });
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    const attempt = log.attempts[0]!;
    const written = JSON.parse(await readFile(join(env.PHASE4_EVIDENCE_DIR, phase4RecordFileName(attempt.label, attempt.roomId)), 'utf8')) as Phase4RunRecord;
    assert.equal(phase4RecordDigest(written), attempt.recordDigest);
  });

  it('makes the live check for Phase4-CR1 only: Phase4-CR2 waits on the Founder without reading the journal first', async () => {
    const { env } = await workspace();
    const cr1 = passingRecordFor('Phase4-CR1');
    await recordPass(env, cr1);
    const plane = fakeControlPlane({ dispatched: {}, served: { [ROOM_1]: cr1 } });
    const lines: string[] = [];
    await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock(), pollMs: 10_000 });
    assert.equal(lines.some((l) => l.includes('LIVE CHECK')), false);
    // CR1's journal is read first, to check its pass; CR2's only for its record, after the wait.
    const firstJournal = plane.requests.findIndex((r) => r.path === `/control-plane/rooms/${ROOM_2}/journal`);
    const firstRoomPoll = plane.requests.findIndex((r) => r.method === 'GET' && r.path === `/rooms/${ROOM_2}`);
    assert.ok(firstRoomPoll !== -1 && firstJournal > firstRoomPoll, 'the journal is read only for the record, after the wait');
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.equal(log.attempts[1]?.label, 'Phase4-CR2');
    assert.equal('liveCheck' in log.attempts[1]!, false);
  });

  it('advances past a pass the record and the control plane both support', async () => {
    const { env } = await workspace();
    const cr1 = passingRecordFor('Phase4-CR1');
    await recordPass(env, cr1);
    const plane = fakeControlPlane({ dispatched: {}, served: { [ROOM_1]: cr1 } });
    const lines: string[] = [];
    await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock(), pollMs: 10_000 });
    assert.ok(lines.some((l) => l.startsWith('Phase4-CR2: entry passed')), lines.join('\n'));
  });

  it('refuses a pass the log claims but its record does not support (Codex confirmation, PR 141)', async () => {
    const { env } = await workspace();
    // CR1 stopped at a failed live check; only attempts.json was then edited to claim a pass.
    const stopped: Phase4RunRecord = { ...passingRecordFor('Phase4-CR1', {}), finalState: 'PLAN_REVIEW', events: passingRecordFor('Phase4-CR1').events.slice(0, 3), decisions: [] };
    await recordPass(env, stopped);
    const plane = fakeControlPlane({ served: { [ROOM_1]: stopped } });
    const lines: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock() }), PHASE4_CLI_EXIT.refused);
    assert.match(lines.join('\n'), /Phase4-CR1 is recorded as passed, but its record judges/);
    assert.equal(plane.requests.some((r) => r.method === 'POST'), false);
  });

  it('refuses a pass whose live check the record does not carry', async () => {
    const { env } = await workspace();
    const cr1 = passingRecordFor('Phase4-CR1');
    await recordPass(env, cr1, { ...PASSED_CHECK, commandId: plannerCommandIdFor(ROOM_1, 't2'), providerConversationId: 'conv-forged' });
    const plane = fakeControlPlane({ served: { [ROOM_1]: cr1 } });
    const lines: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock() }), PHASE4_CLI_EXIT.refused);
    assert.match(lines.join('\n'), /does not carry the passing live check it names/);
  });

  it('refuses a pass whose record the control plane does not hold', async () => {
    const { env } = await workspace();
    const cr1 = passingRecordFor('Phase4-CR1');
    await recordPass(env, cr1);
    const elsewhere: Phase4RunRecord = { ...cr1, decisions: [...cr1.decisions, { commandId: 'other', decision: 'plan.approved' }] };
    const plane = fakeControlPlane({ served: { [ROOM_1]: elsewhere } });
    const lines: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock() }), PHASE4_CLI_EXIT.refused);
    assert.match(lines.join('\n'), /control plane does not hold the record it names/);
  });

  it('finds a token that JSON would spell out of an escape (Codex confirmation, PR 141)', async () => {
    // A token of plain characters can still be spelled out of an escape: a newline before 'y' serializes as backslash-n-y.
    const tail = 'y-'.concat('z'.repeat(32));
    const probe = `n${tail}`;
    const value = { providerConversationId: `x\n${tail}` };
    assert.equal(holdsSecret(value, [probe]), false);
    assert.equal(leaksSecret(value, [probe]), true);
    assert.equal(leaksSecret({ v: 'clean' }, [probe]), false);

    const { dir, env } = await workspace();
    const plane = fakeControlPlane({ dispatched: { initModel: 'gemini-4-argon-high', providerConversationId: `x\n${tail}` } });
    await assert.rejects(phase4CountedRunMain({ ...env, PHASE4_COUNTED_RUN_TOKEN: probe }, { fetch: plane.fetch, git: fakeGit(), out: () => undefined, ...clock() }), /holds a token/);
    assert.equal((await evidenceText(dir)).includes(probe), false);
  });

  it('withholds an error whose JSON would spell out a token, and still records the attempt', async () => {
    const tail = 'q-'.concat('w'.repeat(32));
    const probe = `n${tail}`;
    const { dir, env } = await workspace();
    const plane = fakeControlPlane({ roundStartError: `upstream said p\n${tail}` });
    const code = await phase4CountedRunMain({ ...env, CONTROL_PLANE_TOKEN: probe }, { fetch: plane.fetch, git: fakeGit(), out: () => undefined, ...clock() });
    assert.equal(code, PHASE4_CLI_EXIT.notPassed);
    const log = await loadPhase4Attempts(env.PHASE4_EVIDENCE_DIR, runSet().setId, env.PHASE4_TERMS_SHA256);
    assert.equal(log.attempts[0]?.error, '[withheld: credential material]');
    assert.equal((await evidenceText(dir)).includes(probe), false);
  });

  it('checks every pass before calling the set complete (Codex third review, PR 141)', async () => {
    const { env } = await workspace();
    const stub = (label: 'Phase4-CR1' | 'Phase4-CR2' | 'Phase4-CR3', roomId: string, digest: string) => ({
      label, roomId, outcome: 'passed' as const, pending: false, startedAt: '2026-11-02T14:00:00.000Z', endedAt: '2026-11-02T15:00:00.000Z', entryFailures: [], failures: [], recordDigest: digest,
      ...(label === 'Phase4-CR1' ? { liveCheck: { ...PASSED_CHECK, commandId: plannerCommandIdFor(ROOM_1, 't2') } } : {}),
    });
    const rooms = runSet().runs.map((r) => r.roomId);
    const digests = await Promise.all((['Phase4-CR1', 'Phase4-CR2', 'Phase4-CR3'] as const).map((label, i) => writeRecord(env.PHASE4_EVIDENCE_DIR, label, rooms[i]!)));
    await savePhase4Attempts(env.PHASE4_EVIDENCE_DIR, {
      setId: runSet().setId,
      termsSha256: env.PHASE4_TERMS_SHA256,
      attempts: (['Phase4-CR1', 'Phase4-CR2', 'Phase4-CR3'] as const).map((label, i) => stub(label, rooms[i]!, digests[i]!)),
    });
    const lines: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: fakeControlPlane().fetch, git: fakeGit(), out: (l) => lines.push(l), ...clock() }), PHASE4_CLI_EXIT.refused);
    const output = lines.join('\n');
    assert.match(output, /Phase4-CR1 is recorded as passed, but its record judges/);
    assert.equal(/the set is complete/.test(output), false);
  });

  it('refuses to run while an attempt is still marked under way', async () => {
    const { env } = await workspace();
    await savePhase4Attempts(env.PHASE4_EVIDENCE_DIR, {
      setId: runSet().setId,
      termsSha256: env.PHASE4_TERMS_SHA256,
      attempts: [{ label: 'Phase4-CR1', roomId: ROOM_1, outcome: 'interrupted', pending: true, startedAt: '2026-11-02T14:00:00.000Z', entryFailures: [], failures: [] }],
    });
    const plane = fakeControlPlane();
    const lines: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l) }), PHASE4_CLI_EXIT.refused);
    assert.match(lines.join('\n'), /still marked under way/);
    assert.equal(plane.requests.length, 0);
  });
});

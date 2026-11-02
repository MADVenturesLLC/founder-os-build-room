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
import {
  PHASE4_CLI_EXIT,
  phase4CountedRunMain,
} from '../packages/run-harness/src/phase4/cli.js';
import {
  Phase4AttemptStoreError,
  Phase4Runner,
  evaluatePhase4LiveCheck,
  loadPhase4Attempts,
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
    const log = { setId: 'SET', termsSha256: 'f'.repeat(64), attempts: [{ label: 'Phase4-CR1' as const, roomId: ROOM_1, outcome: 'passed' as const, pending: false, startedAt: 't0', entryFailures: [], failures: [] }] };
    await savePhase4Attempts(dir, log);
    assert.deepEqual(await loadPhase4Attempts(dir, 'SET', 'f'.repeat(64)), log);
  });

  it('refuses a log bound to another set or to other terms', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'phase4-attempts-'));
    await savePhase4Attempts(dir, { setId: 'SET', termsSha256: 'f'.repeat(64), attempts: [] });
    await assert.rejects(loadPhase4Attempts(dir, 'OTHER', 'f'.repeat(64)), Phase4AttemptStoreError);
    await assert.rejects(loadPhase4Attempts(dir, 'SET', 'e'.repeat(64)), Phase4AttemptStoreError);
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

function fakeControlPlane(options: { online?: boolean; dispatched?: Record<string, unknown> } = {}): FakeControlPlane {
  const requests: FakeControlPlane['requests'] = [];
  let round: Record<string, unknown> = { status: 'idle' };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    requests.push({ method, path: url.pathname, authorization: headers['authorization'] ?? null });
    const path = url.pathname;
    if (method === 'GET' && path === '/version') return json(200, { commit: SHA_BUILDROOM });
    if (method === 'GET' && path === '/control-plane/enrollments') return json(200, { enrollments: [{ gatewayId: GATEWAY, state: 'enrolled' }] });
    if (method === 'POST' && path === '/rooms') return json(201, {});
    if (method === 'POST' && /^\/rooms\/[^/]+\/events$/.test(path)) return json(201, {});
    if (method === 'POST' && /\/planner-round$/.test(path)) {
      round = { status: 'settled', roomId: ROOM_1, outcome: { kind: 'plan_review' } };
      return json(202, { status: 'running' });
    }
    if (method === 'GET' && /\/planner-round$/.test(path)) {
      return json(200, { deploymentId: DEPLOYMENT, gateway: { id: GATEWAY, online: options.online ?? true }, dispatcherSurfaceRegistered: true, round });
    }
    if (method === 'GET' && /^\/rooms\/[^/]+$/.test(path)) return json(200, { snapshot: { state: 'PLAN_REVIEW' } });
    if (method === 'GET' && /\/export$/.test(path)) return json(200, { roomId: ROOM_1, snapshot: { state: 'PLAN_REVIEW' }, events: [] });
    if (method === 'GET' && /\/journal$/.test(path)) {
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

  it('refuses to run while an attempt is still marked under way', async () => {
    const { env } = await workspace();
    await savePhase4Attempts(env.PHASE4_EVIDENCE_DIR, {
      setId: runSet().setId,
      termsSha256: env.PHASE4_TERMS_SHA256,
      attempts: [{ label: 'Phase4-CR1', roomId: ROOM_1, outcome: 'interrupted', pending: true, startedAt: 't0', entryFailures: [], failures: [] }],
    });
    const plane = fakeControlPlane();
    const lines: string[] = [];
    assert.equal(await phase4CountedRunMain(env, { fetch: plane.fetch, git: fakeGit(), out: (l) => lines.push(l) }), PHASE4_CLI_EXIT.refused);
    assert.match(lines.join('\n'), /still marked under way/);
    assert.equal(plane.requests.length, 0);
  });
});

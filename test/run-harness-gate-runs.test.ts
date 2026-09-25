/**
 * Phase 2 known limit §2 — the harness reads and extends the PERSISTED gate
 * sequence.
 *
 * Before this, `npm run phase2:runs` started from `emptySequence()` every
 * time, so a re-run restarted the record and a bundle read alone could show a
 * satisfied gate that an earlier invocation's failure contradicted. Now:
 *
 * - the CLI loads the persisted history BEFORE the run loop;
 * - each run is appended as it completes and takes the store-assigned `seq`,
 *   so a re-run CONTINUES the sequence;
 * - an interrupted run (one that throws mid-flight) is appended as a failed
 *   run — an interruption of the sequence, not absent from it;
 * - `gateStatus` is computed over the sequence the store holds after the
 *   loop, not over anything this process remembers;
 * - an unreachable store — at load or at append — is a hard failure with its
 *   own exit code; there is no fallback to memory;
 * - what leaves the process for the store has passed the redaction boundary.
 *
 * The store here is an in-memory TEST DOUBLE standing in for the control
 * plane. The CLI itself has no in-memory path.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { InMemoryHmacKeyCustody } from '../packages/redaction/src/index.js';
import { main as phase2Main } from '../packages/run-harness/src/cli.js';
import type { ControlPlaneClient, Probe } from '../packages/run-harness/src/client.js';
import {
  GATE_STORE_UNAVAILABLE_EXIT,
  GateRunHistoryError,
  HttpGateRunStore,
  PHASE2_GATE,
  type GateRunStore,
  type UnsequencedRunRecord,
} from '../packages/run-harness/src/gate-runs.js';
import type { RunRecord } from '../packages/run-harness/src/record.js';
import type { RunnerDeps } from '../packages/run-harness/src/runner.js';
import { recordFor, type RunSequence } from '../packages/run-harness/src/sequence.js';

const TOKEN = ['fixture', 'cp', 'Gt5Rn8Kq2Wm6Zp3Y'].join('-');
const KEY = Buffer.alloc(32, 9);

const ok = (body: unknown): Probe => ({ ok: true, status: 200, body, latencyMs: 1 });

/** A persisted run as the store would return it. */
function stored(seq: number, verdict: 'passed' | 'failed'): RunRecord {
  const held = verdict === 'passed';
  const run = recordFor({
    runId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    startedAt: '2026-09-20T00:00:00.000Z',
    endedAt: '2026-09-20T00:01:00.000Z',
    commit: 'prior',
    steps: [],
    conditions: [
      { condition: 'deploys_and_stays_up', held: true, evidence: 'healthy' },
      { condition: 'reads_and_writes', held: true, evidence: 'round-trip' },
      { condition: 'survives_restart', held, evidence: held ? 'replayed' : 'lost a row' },
    ],
  });
  return { seq, ...run };
}

/** The control plane's gate-run store, as a test double: seq assigned on append. */
class FakeGateRunStore implements GateRunStore {
  readonly runs: RunRecord[];
  readonly calls: string[] = [];
  readonly appended: UnsequencedRunRecord[] = [];
  failLoad = false;
  failAppendAt: number | null = null;
  /** Rows another writer adds after this process's appends, before the final load. */
  injectBeforeFinalLoad: RunRecord['verdict'][] = [];
  private loads = 0;

  constructor(initial: readonly RunRecord[] = []) {
    this.runs = [...initial];
  }

  async load(): Promise<RunSequence> {
    this.calls.push('load');
    this.loads += 1;
    if (this.failLoad) throw new GateRunHistoryError('store_unavailable', 'load', 'fixture: unreachable');
    if (this.loads > 1) {
      for (const verdict of this.injectBeforeFinalLoad.splice(0)) {
        this.runs.push(stored(this.runs.length + 1, verdict));
      }
    }
    return { runs: [...this.runs] };
  }

  async append(run: UnsequencedRunRecord): Promise<RunRecord> {
    this.calls.push('append');
    if (this.failAppendAt !== null && this.appended.length + 1 >= this.failAppendAt) {
      throw new GateRunHistoryError('store_unavailable', 'append', 'fixture: unreachable');
    }
    this.appended.push(run);
    const persisted = { seq: this.runs.length + 1, ...run };
    this.runs.push(persisted);
    return persisted;
  }
}

/** A scripted control plane. `throwOnVersionCall` makes that /version call throw — an interruption. */
function fakeDeps(options: { readonly calls?: string[]; readonly throwOnVersionCall?: number; readonly commit?: string } = {}): RunnerDeps {
  let restarts = 0;
  let tick = 0;
  let ids = 0;
  let versionCalls = 0;
  const room = { logLength: 1, entryCount: 1, snapshot: { state: 'SCOPED' } };
  const client = {
    health: async () => {
      options.calls?.push('health');
      return ok({ status: 'ok' });
    },
    ready: async () => ok({ status: 'ready' }),
    version: async () => {
      versionCalls += 1;
      if (options.throwOnVersionCall === versionCalls) throw new Error('fixture: the harness itself threw mid-run');
      const version = { commit: options.commit ?? 'abc1234', startedAt: `T${restarts + 1}` };
      return { ...ok(version), version };
    },
    createRoom: async () => ok({ created: true }),
    appendEvent: async () => ok({ outcome: 'transition' }),
    getRoom: async () => ok(room),
    exportRoom: async () => ok({ events: [{ event_id: 'evt-1' }], rejections: [] }),
  } as unknown as ControlPlaneClient;
  return {
    client,
    platform: {
      kind: 'test',
      deploy: async (now) => ({ action: 'deploy', actor: 'performed_externally', requestedAt: now(), detail: 'test' }),
      restart: async (now) => {
        restarts += 1;
        return { action: 'restart', actor: 'performed_externally', requestedAt: now(), detail: 'test' };
      },
    },
    now: () => {
      tick += 1;
      return `2026-09-25T03:00:${String(tick % 60).padStart(2, '0')}.000Z`;
    },
    sleep: async () => undefined,
    newId: () => {
      ids += 1;
      return `11111111-2222-4333-8444-${String(ids).padStart(12, '0')}`;
    },
  };
}

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function evidenceDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gate-runs-cli-'));
  scratch.push(dir);
  return join(dir, 'evidence');
}

function env(evidencePath: string, runs = 3): Record<string, string> {
  return {
    CONTROL_PLANE_URL: 'http://fake',
    CONTROL_PLANE_TOKEN: TOKEN,
    PHASE2_RUNS: String(runs),
    PHASE2_DWELL_MS: '1',
    PHASE2_SAMPLE_INTERVAL_MS: '1',
    PHASE2_RESTART_TIMEOUT_MS: '1',
    PHASE2_DEPLOY_TIMEOUT_MS: '1',
    PHASE2_EVIDENCE_PATH: evidencePath,
    PHASE2_ACTOR_ID: 'session:test',
    PHASE2_ACTUAL_MODEL: 'fixture-model',
  };
}

function capture(): { streams: { out(t: string): void; err(t: string): void }; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { streams: { out: (t) => void out.push(t), err: (t) => void err.push(t) }, out, err };
}

async function run(
  store: GateRunStore,
  evidencePath: string,
  options: { readonly runs?: number; readonly deps?: () => RunnerDeps; readonly onDeps?: () => void } = {},
): Promise<{ code: number; err: string[]; out: string[] }> {
  const c = capture();
  const code = await phase2Main(env(evidencePath, options.runs), {
    keyCustody: new InMemoryHmacKeyCustody(KEY),
    streams: c.streams,
    gateRuns: () => store,
    deps: () => {
      options.onDeps?.();
      return options.deps ? options.deps() : fakeDeps();
    },
  });
  return { code, err: c.err, out: c.out };
}

async function readBundle(evidencePath: string): Promise<{ schema: string; runs: RunRecord[]; gate: { satisfied: boolean; totalRuns: number; failedRuns: number }; sequenceSource: unknown }> {
  const files = await readdir(evidencePath);
  assert.equal(files.length, 1, `exactly one bundle expected, found ${files.join(', ')}`);
  return JSON.parse(await readFile(join(evidencePath, files[0]!), 'utf8'));
}

describe('gate runs — the CLI continues the persisted sequence', () => {
  it('loads history BEFORE the run loop and appends each run with the next store seq', async () => {
    const store = new FakeGateRunStore([stored(1, 'failed'), stored(2, 'passed')]);
    const calls = store.calls;
    const evidencePath = await evidenceDir();
    const result = await run(store, evidencePath, { onDeps: () => calls.push('deps') });

    assert.equal(calls[0], 'load', 'history is read first');
    assert.ok(calls.indexOf('load') < calls.indexOf('deps'), 'history is read before any run collaborator exists');
    assert.deepEqual(store.runs.map((r) => r.seq), [1, 2, 3, 4, 5], 'appended at 3, 4, 5 — never restarted at 1');
    assert.equal(result.code, 0, result.err.join(''));

    const bundle = await readBundle(evidencePath);
    assert.equal(bundle.schema, 'build-room/phase-2-run-evidence@2');
    assert.deepEqual(bundle.runs.map((r) => r.seq), [1, 2, 3, 4, 5], 'the bundle carries the whole persisted record');
    assert.equal(bundle.gate.failedRuns, 1, 'the earlier failure stays visible');
    assert.deepEqual(bundle.sequenceSource, { kind: 'persisted', gate: PHASE2_GATE, route: '/gate/runs' });
  });

  it('a second invocation appends after the first — the record never restarts', async () => {
    const store = new FakeGateRunStore();
    const first = await run(store, await evidenceDir(), { runs: 2 });
    assert.equal(first.code, 1, 'two passes do not satisfy a three-run gate');
    const second = await run(store, await evidenceDir(), { runs: 1 });
    assert.deepEqual(store.runs.map((r) => r.seq), [1, 2, 3]);
    assert.equal(second.code, 0, 'the gate counts across invocations: #1, #2 and #3 are three consecutive passes');
  });

  it('computes the gate from the PERSISTED sequence after the loop, not from what this process appended', async () => {
    const store = new FakeGateRunStore();
    store.injectBeforeFinalLoad = ['failed']; // another writer's failure lands after this process's three passes
    const evidencePath = await evidenceDir();
    const result = await run(store, evidencePath);
    assert.equal(result.code, 1, 'the persisted tail is a failure, so the gate is not satisfied');
    const bundle = await readBundle(evidencePath);
    assert.deepEqual(bundle.runs.map((r) => r.verdict), ['passed', 'passed', 'passed', 'failed']);
    assert.equal(bundle.gate.satisfied, false);
  });

  it('appends an interrupted run as a failure — an interruption of the sequence, not absent from it', async () => {
    const store = new FakeGateRunStore();
    const evidencePath = await evidenceDir();
    const result = await run(store, evidencePath, { deps: () => fakeDeps({ throwOnVersionCall: 1 }) });
    assert.equal(store.runs.length, 3, 'all three attempts are on record');
    assert.equal(store.runs[0]?.verdict, 'failed');
    assert.match(store.runs[0]?.failureReason ?? '', /^run interrupted: fixture: the harness itself threw mid-run/);
    assert.equal(result.code, 1, 'an interruption resets the streak');
  });

  it('sends the store a redacted record — the token never leaves the process', async () => {
    const store = new FakeGateRunStore();
    await run(store, await evidenceDir(), { deps: () => fakeDeps({ commit: `c-${TOKEN}` }) });
    assert.equal(store.appended.length, 3);
    for (const record of store.appended) {
      assert.ok(!JSON.stringify(record).includes(TOKEN), 'the appended record carries the token');
    }
  });
});

describe('gate runs — an unreachable store is a hard failure, never a memory fallback', () => {
  it('refuses to start when history cannot be loaded: no run, no collaborator, no bundle', async () => {
    const store = new FakeGateRunStore();
    store.failLoad = true;
    const evidencePath = await evidenceDir();
    let depsBuilt = 0;
    const result = await run(store, evidencePath, { onDeps: () => void (depsBuilt += 1) });
    assert.equal(result.code, GATE_STORE_UNAVAILABLE_EXIT);
    assert.equal(depsBuilt, 0, 'no run collaborator is constructed');
    assert.deepEqual(store.appended, []);
    await assert.rejects(readdir(evidencePath), /ENOENT/, 'no evidence directory is created');
    assert.match(result.err.join(''), /gate run history: store_unavailable during load/);
  });

  it('stops at the first append the store refuses: no further run, no bundle', async () => {
    const store = new FakeGateRunStore();
    store.failAppendAt = 2;
    const evidencePath = await evidenceDir();
    let deploys = 0; // performRun deploys exactly once per run
    const result = await run(store, evidencePath, {
      deps: () => {
        const deps = fakeDeps();
        return {
          ...deps,
          platform: {
            ...deps.platform,
            deploy: async (now) => {
              deploys += 1;
              return deps.platform.deploy(now);
            },
          },
        };
      },
    });
    assert.equal(result.code, GATE_STORE_UNAVAILABLE_EXIT);
    assert.equal(store.appended.length, 1, 'only the first run was recorded');
    assert.equal(deploys, 2, 'the second run was performed and refused; the third never started');
    await assert.rejects(readdir(evidencePath), /ENOENT/, 'no bundle claims a sequence the store does not hold');
  });

  it('treats a persisted history that is not gapless from 1 as a hard failure', async () => {
    const store = new FakeGateRunStore([stored(1, 'passed'), stored(3, 'passed')]);
    const result = await run(store, await evidenceDir());
    assert.equal(result.code, GATE_STORE_UNAVAILABLE_EXIT);
    assert.deepEqual(store.appended, []);
    assert.match(result.err.join(''), /history_invalid/);
  });
});

describe('gate runs — the HTTP store', () => {
  function client(responses: { list?: Probe; append?: Probe }): ControlPlaneClient {
    return {
      listGateRuns: async () => responses.list ?? { ok: false, status: 0, body: null, latencyMs: 1, error: 'refused' },
      appendGateRun: async () => responses.append ?? { ok: false, status: 0, body: null, latencyMs: 1, error: 'refused' },
    } as unknown as ControlPlaneClient;
  }

  it('maps a transport failure or a non-2xx answer to a typed store_unavailable error', async () => {
    const store = new HttpGateRunStore(client({}));
    await assert.rejects(store.load(), (error: unknown) => error instanceof GateRunHistoryError && error.code === 'store_unavailable');
    const unavailable = new HttpGateRunStore(client({ list: { ok: false, status: 503, body: { error: 'gate_run_store_unavailable' }, latencyMs: 1 } }));
    await assert.rejects(unavailable.load(), (error: unknown) => error instanceof GateRunHistoryError && error.code === 'store_unavailable');
  });

  it('loads the listed runs in order, and refuses a malformed listing', async () => {
    const runs = [stored(1, 'failed'), stored(2, 'passed')];
    const good = new HttpGateRunStore(client({ list: ok({ gate: PHASE2_GATE, runs }) }));
    assert.deepEqual((await good.load()).runs.map((r) => r.seq), [1, 2]);
    const bad = new HttpGateRunStore(client({ list: ok({ gate: PHASE2_GATE, runs: [{ seq: 1 }] }) }));
    await assert.rejects(bad.load(), (error: unknown) => error instanceof GateRunHistoryError && error.code === 'history_invalid');
  });

  it('returns the store-assigned run on append', async () => {
    const persisted = stored(9, 'passed');
    const store = new HttpGateRunStore(client({ append: { ok: true, status: 201, body: { run: persisted }, latencyMs: 1 } }));
    const { seq, ...unsequenced } = persisted;
    assert.equal((await store.append(unsequenced)).seq, seq);
  });
});

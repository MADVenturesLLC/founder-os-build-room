/**
 * Lane B wiring — the secret boundary under the run-harness writers.
 *
 * T1 Phase 2: a fixture token in the environment never reaches the bundle
 *    file or stdout; the registry holds the TRIMMED value the client uses.
 * T2 Phase 2 refusal: no key → exit 3, one refusal line, no file, no
 *    collaborator constructed, no secret on stderr.
 * T3 Phase 3: a refusal happens after the pure plan validation and before
 *    the first side effect — no evidence directory, no reservation, no
 *    client; the ready path hands the writer an already-redacted tree and
 *    the untouched read-back path still passes.
 * T4 Static: the harness-side factory imports nothing from the daemon; the
 *    redaction package is byte-pinned at the Lane B merge; no process
 *    environment read inside the package.
 *
 * Fixture secrets are assembled at runtime so no credential-shaped literal
 * sits in the tree (the same discipline as `test/redaction.test.ts`).
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { main as phase2Main } from '../packages/run-harness/src/cli.js';
import type { ControlPlaneClient, Probe } from '../packages/run-harness/src/client.js';
import { loadPhase3CliConfig } from '../packages/run-harness/src/phase3/cli-config.js';
import { main as phase3Main } from '../packages/run-harness/src/phase3/cli.js';
import {
  PHASE3_LOCAL_FAILURE_AUTHORIZES,
  disposePhase3EvidenceReservation,
  reservePhase3EvidenceFile,
  securePhase3EvidenceDirectory,
  serializePhase3Evidence,
  type Phase3EvidenceReservation,
} from '../packages/run-harness/src/phase3/evidence.js';
import { writeRedactedPhase3Evidence } from '../packages/run-harness/src/phase3/redacted-evidence.js';
import {
  HARNESS_MANIFEST_NAMES,
  REDACTION_REFUSED_EXIT,
  harnessKeyCustody,
  normalizeHarnessEnvironment,
  openHarnessRedactionBoundary,
} from '../packages/run-harness/src/redaction-boundary.js';
import type { RunnerDeps } from '../packages/run-harness/src/runner.js';
import {
  InMemoryHmacKeyCustody,
  KeychainHmacKeyCustody,
  RedactionRefusedError,
  UnavailableHmacKeyCustody,
} from '../packages/redaction/src/index.js';

const TOKEN = ['fixture', 'cp', 'Xy7Qm2Lp9Rt4Vw1Z'].join('-');
const KEY = Buffer.alloc(32, 7);
const REDACTED_PREFIX = '[REDACTED:CONTROL_PLANE_TOKEN:';
const SHA_A = 'a'.repeat(40);
const RUN_ID = '11111111-2222-4333-8444-555555555555';

function capture(): { streams: { out(t: string): void; err(t: string): void }; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    streams: {
      out: (t) => {
        out.push(t);
      },
      err: (t) => {
        err.push(t);
      },
    },
    out,
    err,
  };
}

const ok = (body: unknown): Probe => ({ ok: true, status: 200, body, latencyMs: 1 });

/** A happy-path scripted control plane, the same shape `run-harness-runner.test.ts` uses. */
function fakeDeps(): RunnerDeps {
  let restarts = 0; // one deps instance serves every run, so "a new process" must be counted, not flagged
  let tick = 0;
  const room = { logLength: 1, entryCount: 1, snapshot: { state: 'SCOPED' } };
  const client = {
    health: async () => ok({ status: 'ok' }),
    ready: async () => ok({ status: 'ready' }),
    version: async () => {
      const version = { commit: 'abc1234', startedAt: `T${restarts + 1}` };
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
      return `2026-09-14T03:00:${String(tick).padStart(2, '0')}.000Z`;
    },
    sleep: async () => undefined,
    newId: () => RUN_ID,
  };
}

const scratch: string[] = [];
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'lane-b-wiring-'));
  scratch.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function phase2Env(evidencePath: string, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    CONTROL_PLANE_URL: 'http://fake',
    CONTROL_PLANE_TOKEN: `  ${TOKEN}  `, // surrounding whitespace: the client trims; the registry must too
    PHASE2_RUNS: '3', // the gate wants three consecutive passes; fewer exits 1 by design
    PHASE2_DWELL_MS: '1',
    PHASE2_SAMPLE_INTERVAL_MS: '1',
    PHASE2_RESTART_TIMEOUT_MS: '1',
    PHASE2_DEPLOY_TIMEOUT_MS: '1',
    PHASE2_EVIDENCE_PATH: evidencePath,
    PHASE2_ACTOR_ID: 'session:test',
    PHASE2_ACTUAL_MODEL: 'fixture-model',
    PHASE2_ENVIRONMENT: `fixture-${TOKEN}`, // the secret lands in the bundle context on purpose
    ...overrides,
  };
}

describe('boundary factory (W3)', () => {
  it('registers CONTROL_PLANE_TOKEN once, through the manifest, and opens ready', async () => {
    const boundary = await openHarnessRedactionBoundary(
      { CONTROL_PLANE_TOKEN: TOKEN, HOME: '/nowhere' },
      { keyCustody: new InMemoryHmacKeyCustody(KEY) },
    );
    assert.equal(boundary.state.kind, 'ready', JSON.stringify(boundary.state));
    assert.deepEqual([...HARNESS_MANIFEST_NAMES], ['CONTROL_PLANE_TOKEN']);
    const redacted = boundary.require().redactString(`before ${TOKEN} after`);
    assert.ok(!redacted.includes(TOKEN));
    assert.ok(redacted.includes(REDACTED_PREFIX));
  });

  it('holds the trimmed value: a token with surrounding whitespace still redacts the bare token', async () => {
    assert.deepEqual(normalizeHarnessEnvironment({ A: '  x  ', B: undefined }), { A: 'x', B: undefined });
    const boundary = await openHarnessRedactionBoundary(
      { CONTROL_PLANE_TOKEN: `\t${TOKEN}\n` },
      { keyCustody: new InMemoryHmacKeyCustody(KEY) },
    );
    assert.equal(boundary.state.kind, 'ready');
    assert.ok(!boundary.require().redactString(`x${TOKEN}y`).includes(TOKEN));
  });

  it('refuses when the manifest-named secret is unset, and when a heuristic match is too short', async () => {
    const unset = await openHarnessRedactionBoundary({}, { keyCustody: new InMemoryHmacKeyCustody(KEY) });
    assert.equal(unset.state.kind, 'refused');
    assert.equal(unset.state.kind === 'refused' && unset.state.code, 'registry_unloadable');
    const short = await openHarnessRedactionBoundary(
      { CONTROL_PLANE_TOKEN: TOKEN, NPM_TOKEN: 'short' },
      { keyCustody: new InMemoryHmacKeyCustody(KEY) },
    );
    assert.equal(short.state.kind === 'refused' && short.state.code, 'registry_unloadable');
  });

  it('chooses Keychain custody on darwin and no key source anywhere else', async () => {
    assert.ok(harnessKeyCustody('darwin') instanceof KeychainHmacKeyCustody);
    const linux = await harnessKeyCustody('linux').load();
    assert.equal(linux.kind, 'unavailable');
    const boundary = await openHarnessRedactionBoundary(
      { CONTROL_PLANE_TOKEN: TOKEN },
      { platformName: 'linux' },
    );
    assert.equal(boundary.state.kind === 'refused' && boundary.state.code, 'key_unavailable');
    assert.equal(REDACTION_REFUSED_EXIT, 3, 'Phase 3 already returns 2 for awaiting_adjudication');
  });
});

describe('Phase 2 bundle writer (W1, T1)', () => {
  it('writes a bundle with the token replaced, and keeps it off stdout', async () => {
    const dir = await tmp();
    const evidencePath = join(dir, 'evidence');
    const c = capture();
    let receivedToken: string | null = null;
    const code = await phase2Main(phase2Env(evidencePath), {
      keyCustody: new InMemoryHmacKeyCustody(KEY),
      streams: c.streams,
      deps: (_config, _platform, token) => {
        receivedToken = token;
        return fakeDeps();
      },
    });
    assert.equal(code, 0, c.err.join(''));
    assert.equal(receivedToken, TOKEN, 'the client gets the trimmed token');

    const files = await readdir(evidencePath);
    assert.equal(files.length, 1);
    const content = await readFile(join(evidencePath, files[0] as string), 'utf8');
    assert.ok(!content.includes(TOKEN), 'the token must not be in the evidence file');
    assert.ok(content.includes(REDACTED_PREFIX), 'the token must be replaced, not dropped');
    const parsed = JSON.parse(content) as { context: { environment: string }; runs: unknown[] };
    assert.ok(parsed.context.environment.startsWith(`fixture-${REDACTED_PREFIX}`));
    assert.equal(parsed.runs.length, 3);
    assert.ok(content.endsWith('\n'), 'serialized as serializeBundle does');

    const stdout = c.out.join('');
    assert.ok(!stdout.includes(TOKEN), 'the token must not be on stdout');
    assert.ok(stdout.includes('evidence written to '));
    assert.equal(c.err.length, 0);
  });
});

describe('Phase 2 refusal (W1, T2)', () => {
  for (const [custody, expected] of [
    [new UnavailableHmacKeyCustody('broken keychain'), 'key_unavailable'],
    [new InMemoryHmacKeyCustody(null), 'key_absent'],
  ] as const) {
    it(`exits 3 with one line and touches nothing (${expected})`, async () => {
      const dir = await tmp();
      const evidencePath = join(dir, 'evidence');
      const c = capture();
      let depsCalls = 0;
      let writes = 0;
      const code = await phase2Main(phase2Env(evidencePath), {
        keyCustody: custody,
        streams: c.streams,
        deps: () => {
          depsCalls += 1;
          return fakeDeps();
        },
        writeBundle: async () => {
          writes += 1;
        },
      });
      assert.equal(code, REDACTION_REFUSED_EXIT);
      assert.deepEqual(c.err, [`redaction refused: ${expected}\n`]);
      assert.equal(c.out.length, 0);
      assert.equal(depsCalls, 0, 'no collaborator is constructed');
      assert.equal(writes, 0);
      await assert.rejects(stat(evidencePath), 'no evidence directory is created');
      assert.ok(!c.err.join('').includes(TOKEN));
    });
  }

  it('refuses on an unloadable registry without naming any value', async () => {
    const dir = await tmp();
    const c = capture();
    const code = await phase2Main(phase2Env(join(dir, 'evidence'), { NPM_TOKEN: 'short' }), {
      keyCustody: new InMemoryHmacKeyCustody(KEY),
      streams: c.streams,
      deps: () => assert.fail('must not construct collaborators'),
    });
    assert.equal(code, REDACTION_REFUSED_EXIT);
    assert.deepEqual(c.err, ['redaction refused: registry_unloadable\n']);
  });
});

/** A valid, strict, nonsecret Phase 3 plan over two fresh git roots — the shape `phase3-cli-config.test.ts` uses. */
async function phase3PlanEnvironment(): Promise<{ env: Record<string, string>; evidencePath: string }> {
  const directory = await tmp();
  const execute = promisify(execFile);
  const founderOsPath = join(directory, 'founder-os');
  const fixturePath = join(directory, 'fixture');
  for (const path of [founderOsPath, fixturePath]) {
    await mkdir(path, { recursive: true });
    await execute('git', ['init', '-q', path]);
  }
  const planPath = join(directory, 'plan.json');
  await writeFile(
    planPath,
    `${JSON.stringify({
      runAttemptId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      label: 'Phase3-CR1',
      entryAuthorizationId: 'founder:phase3-cr1:test',
      founderOsSha: '1'.repeat(40),
      founderOs: { repository: 'MADVenturesLLC/FounderOS', path: founderOsPath },
      buildRoomSha: '2'.repeat(40),
      controlPlaneOrigin: 'http://127.0.0.1:8080',
      gatewayId: RUN_ID,
      expectedEnrollments: [{ gatewayId: RUN_ID, state: 'enrolled' }],
      fixture: { repository: 'MADVenturesLLC/phase3-fixture', path: fixturePath, sha: '3'.repeat(40) },
      environment: 'test',
      machine: 'test-mac',
      heartbeatFreshnessMs: 300_000,
    })}\n`,
    'utf8',
  );
  const evidencePath = join(directory, 'evidence');
  return {
    env: {
      CONTROL_PLANE_URL: 'http://127.0.0.1:8080',
      CONTROL_PLANE_TOKEN: TOKEN,
      PHASE3_BUILD_VERIFIED_SHA: '2'.repeat(40),
      PHASE3_PLAN_PATH: planPath,
      PHASE3_EVIDENCE_PATH: evidencePath,
    },
    evidencePath,
  };
}

describe('Phase 3 ordering and evidence (W2, T3)', () => {
  it('the loader validates the plan, then refuses before the evidence directory or a reservation exists', async () => {
    const { env, evidencePath } = await phase3PlanEnvironment();
    let reservations = 0;
    await assert.rejects(
      loadPhase3CliConfig(env, process.cwd(), {
        keyCustody: new UnavailableHmacKeyCustody('no keychain'),
        reserveEvidenceFile: async () => {
          reservations += 1;
          return assert.fail('must not reserve');
        },
      }),
      (error: unknown) => error instanceof RedactionRefusedError && error.code === 'key_unavailable',
    );
    assert.equal(reservations, 0);
    await assert.rejects(stat(evidencePath), 'the evidence directory must not be created');

    // The same environment with a broken plan reports the plan, not the key:
    // validation is pure and runs first, so a keyless host still sees it.
    await assert.rejects(
      loadPhase3CliConfig({ ...env, PHASE3_BUILD_VERIFIED_SHA: SHA_A }, process.cwd(), {
        keyCustody: new UnavailableHmacKeyCustody('no keychain'),
      }),
      /PHASE3_BUILD_VERIFIED_SHA does not match the plan SHA/,
    );
  });

  it('main exits 3 with one line; no reservation and no client is constructed', async () => {
    const { env, evidencePath } = await phase3PlanEnvironment();
    const c = capture();
    let reservations = 0;
    let clients = 0;
    const code = await phase3Main(env, {
      keyCustody: new InMemoryHmacKeyCustody(null),
      streams: c.streams,
      reserveEvidenceFile: async () => {
        reservations += 1;
        return assert.fail('must not reserve');
      },
      clients: () => {
        clients += 1;
        return assert.fail('must not construct clients');
      },
    });
    assert.equal(code, REDACTION_REFUSED_EXIT);
    assert.deepEqual(c.err, ['redaction refused: key_absent\n']);
    assert.equal(c.out.length, 0);
    assert.equal(reservations, 0);
    assert.equal(clients, 0);
    await assert.rejects(stat(evidencePath));
  });

  it('hands the writer an already-redacted tree, and never calls it under a refused boundary', async () => {
    const ready = await openHarnessRedactionBoundary(
      { CONTROL_PLANE_TOKEN: TOKEN },
      { keyCustody: new InMemoryHmacKeyCustody(KEY) },
    );
    const fakeReservation = { path: '/fake' } as unknown as Phase3EvidenceReservation;
    const received: unknown[] = [];
    const path = await writeRedactedPhase3Evidence(
      ready,
      fakeReservation,
      { schema: 'fixture', note: `x ${TOKEN} y`, nested: [{ deep: TOKEN }] },
      async (reservation, evidence) => {
        received.push(evidence);
        return reservation.path;
      },
    );
    assert.equal(path, '/fake');
    const text = JSON.stringify(received[0]);
    assert.ok(!text.includes(TOKEN));
    assert.equal(text.split(REDACTED_PREFIX).length - 1, 2, 'both occurrences replaced');

    const refused = await openHarnessRedactionBoundary(
      { CONTROL_PLANE_TOKEN: TOKEN },
      { keyCustody: new InMemoryHmacKeyCustody(null) },
    );
    let writes = 0;
    await assert.rejects(
      writeRedactedPhase3Evidence(refused, fakeReservation, {}, async () => {
        writes += 1;
        return '/never';
      }),
      RedactionRefusedError,
    );
    assert.equal(writes, 0);
  });

  it('the real write path (reservation, closed shape, read-back) passes unchanged under the boundary', async () => {
    const dir = await tmp();
    const identity = await securePhase3EvidenceDirectory(join(dir, 'evidence'));
    const reservation = await reservePhase3EvidenceFile(identity, 'Phase3-CR1', RUN_ID);
    const evidence = {
      schema: 'build-room/phase3-local-failure@1',
      attempt: {
        runAttemptId: RUN_ID,
        runLabel: 'Phase3-CR1',
        buildRoomSha: SHA_A,
        fixtureSha: SHA_A,
        outcome: 'failed',
        reasonCode: 'internal_error',
      },
      authorizes: PHASE3_LOCAL_FAILURE_AUTHORIZES,
    };
    const boundary = await openHarnessRedactionBoundary(
      { CONTROL_PLANE_TOKEN: TOKEN },
      { keyCustody: new InMemoryHmacKeyCustody(KEY) },
    );
    try {
      const path = await writeRedactedPhase3Evidence(boundary, reservation, evidence);
      assert.equal(path, reservation.path);
      assert.equal(await readFile(path, 'utf8'), serializePhase3Evidence(evidence));
    } finally {
      await disposePhase3EvidenceReservation(reservation);
    }
  });
});

describe('static boundaries (T4)', () => {
  const root = new URL('../../', import.meta.url);
  const read = (path: string) => readFile(new URL(path, root), 'utf8');

  it('the harness-side factory and the Phase 3 evidence wrapper import nothing from the daemon', async () => {
    for (const file of [
      'packages/run-harness/src/redaction-boundary.ts',
      'packages/run-harness/src/phase3/redacted-evidence.ts',
    ]) {
      const source = await read(file);
      const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] ?? '');
      assert.ok(imports.length > 0, `${file} has imports to check`);
      assert.ok(
        imports.every((specifier) => !specifier.includes('gateway-daemon')),
        `${file} must not import daemon custody: ${imports.join(', ')}`,
      );
    }
  });

  it('the redaction package is byte-pinned at redaction v0.1 (stderr path act, base d052cb4) plus the BUILTIN_SHAPES anchoring amendment, and reads no process environment', async () => {
    // Base pin: redaction v0.1, stderr path act, base d052cb4. `registry.ts`
    // is re-pinned above that base for one security amendment: BUILTIN_SHAPES
    // anchored every prefixed shape on `\b`, which does not fire between `_`
    // and a letter, so a token glued after a namespace prefix evaded all five.
    // The pin is the control that made that hole hold still — re-pinning it
    // is the deliberate, visible act it is meant to force, not a bypass.
    // Every other file remains at the v0.1 digest.
    // Parallel arrays, not a name→digest map: a file name containing "key"
    // next to a hex digest reads as a credential to the secret scanner.
    const pinnedFiles = ['index.ts', 'key-custody.ts', 'redactor.ts', 'registry.ts', 'sinks.ts'];
    const pinnedDigests = [
      '23ae58a6b84d3c1f828c0f9e1d4d776acc7ae095e9e98540a4b8a2419af8d652',
      '4d62f9d792a28f268ebad4953101455a08bcac0f13a6b6f0d422990417f28151',
      'a3b108aedb6d162fd8e9fe51cf87ab943b085f28c26026a9c07e940e90610b2d',
      'e151d67f9d6a86df570ca50918f11ea7c7a9b64670d24ad2043fe9e792bbeacd',
      'ccc06b573140db5b7d2d3a1f2bfb4cc139527196890fb927166571e7107ef1d6',
    ];
    const forbidden = ['process', 'env'].join('.');
    for (const [index, name] of pinnedFiles.entries()) {
      const expected = pinnedDigests[index];
      const source = await read(`packages/redaction/src/${name}`);
      assert.equal(createHash('sha256').update(source).digest('hex'), expected, `${name} changed`);
      assert.ok(!source.includes(forbidden), `${name} reads the process environment`);
    }
  });
});

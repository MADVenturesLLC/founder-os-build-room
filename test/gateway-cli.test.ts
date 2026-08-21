/**
 * §14, §15, §16 — the CLI, the enrolment guard, and the staging lock.
 *
 * The centre of gravity here is one question: can a second `enroll` ever
 * destroy the only private key of an identity that is already waiting for the
 * Founder? Every answer in this file is no, and each one closes a different
 * route to yes — a check-then-act race, an `-U` write that would update rather
 * than fail, a recovery deletion that would break mutual exclusion, and an
 * owner release that would remove a successor's lock.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import {
  ControlPlaneClient,
  Custody,
  GatewayStateStore,
  PRIMARY_TABLE,
  PROTOCOL_INTEGRITY_CODES,
  RingBuffer,
  SERVER_VOCABULARY,
  STAGING_PROBE_TABLE,
  STAGING_REDEEM_TABLE,
  acquireStagingLock,
  createDaemonClock,
  gatewayPaths,
  readStagingLock,
  stagingLockExists,
  type GatewayPaths,
} from '../packages/gateway-daemon/src/index.js';
import {
  GUARD_REFUSAL,
  USAGE,
  VERBS,
  renderDoctor,
  runDoctor,
  runEnroll,
  runProviders,
  runTail,
  isVerb,
} from '../packages/gateway-cli/src/index.js';
import { FileKeychainRunner } from './fake-keychain.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHILD = join(HERE, 'support', 'enroll-child.js');

/** A control plane that accepts one redemption and then refuses replays. */
let server: Server | undefined;
let baseUrl = '';
let acceptedCodes: string[] = [];

/*
 * An armable gate on `/gateway/enroll` (correction T3, Rev 4.7 tester): while
 * armed, the server announces the request and holds its answer until the test
 * releases it. That is what lets the concurrency test PROVE the winner is
 * inside the critical section — lock held, mid-redemption — before the second
 * process is admitted, instead of releasing both together and hoping the
 * interleaving lands the ruled diagnostic.
 */
let enrollGate: {
  readonly notifyArrived: () => void;
  readonly released: Promise<void>;
  readonly release: () => void;
} | null = null;

function armEnrollGate(): { readonly arrived: Promise<void>; readonly release: () => void } {
  let notifyArrived!: () => void;
  let release!: () => void;
  const arrived = new Promise<void>((resolve) => {
    notifyArrived = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  enrollGate = { notifyArrived, released, release };
  return { arrived, release };
}

before(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8');
    });
    req.on('end', () => {
      if (req.url === '/gateway/enroll') {
        const body = JSON.parse(raw === '' ? '{}' : raw) as Record<string, unknown>;
        acceptedCodes.push(String(body['code']));
        void (async () => {
          const gate = enrollGate;
          if (gate !== null) {
            gate.notifyArrived();
            await gate.released;
          }
          res.writeHead(202, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              gatewayId: '11111111-2222-4333-8444-555555555555',
              keyId: 'a'.repeat(64),
              fingerprint: 'a'.repeat(64),
              awaitingApprovalExpiresAt: new Date().toISOString(),
            }),
          );
        })();
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
});

after(async () => {
  if (server !== undefined) await new Promise<void>((resolve) => server!.close(() => resolve()));
});

interface Fixture {
  readonly paths: GatewayPaths;
  readonly keychainDirectory: string;
  readonly custody: Custody;
  readonly runner: FileKeychainRunner;
  readonly state: GatewayStateStore;
  readonly client: ControlPlaneClient;
  readonly cleanup: () => void;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'buildroom-cli-'));
  const keychainDirectory = join(root, 'keychain');
  const paths = gatewayPaths(join(root, 'gateway'));
  const runner = new FileKeychainRunner(keychainDirectory);
  // The gateway directory, mode 0700, as the real one is: cases that plant a
  // lock file write into it before any code has had a reason to create it.
  mkdirSync(paths.directory, { recursive: true, mode: 0o700 });

  return {
    paths,
    keychainDirectory,
    runner,
    custody: new Custody(runner),
    state: new GatewayStateStore(paths),
    client: new ControlPlaneClient(baseUrl),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

const CODE = 'ZmFrZS1jb2RlLWZvci10ZXN0aW5nLW9ubHktbm90LXJlYWw';

async function enroll(f: Fixture, code = CODE, print: (line: string) => void = () => undefined) {
  return runEnroll({
    paths: f.paths,
    custody: f.custody,
    client: f.client,
    clock: createDaemonClock(),
    state: f.state,
    readCode: async () => code,
    hostDescriptor: { hostname: 'example-host.test', os: 'darwin', arch: 'arm64' },
    print,
  });
}

describe('gateway-cli · five-verb-surface-exact', () => {
  it('offers exactly the five ruled verbs', () => {
    assert.deepEqual([...VERBS], ['enroll', 'status', 'doctor', 'providers', 'tail']);
    assert.equal(VERBS.length, 5);
  });

  it('recognizes only those five', () => {
    for (const verb of VERBS) assert.equal(isVerb(verb), true);
    for (const other of ['revoke', 'confirm', 'mint', 'promote', 'reset', '']) {
      assert.equal(isVerb(other), false, other);
    }
  });

  it('documents exactly the five in its usage text', () => {
    for (const verb of VERBS) assert.match(USAGE, new RegExp(`\\b${verb}\\b`));
    assert.equal(USAGE.match(/^ {2}\w+/gm)?.length, 5, 'the usage lists five verbs and no more');
  });
});

describe('gateway-cli · providers-stub-refuses', () => {
  it('exits 1 with a reason, and promises nothing for later', () => {
    const refusal = runProviders();
    assert.equal(refusal.exitCode, 1);
    assert.match(refusal.message, /refused/);
    assert.match(refusal.message, /no provider registry is authorized in Phase 3/i);
    assert.match(refusal.message, /confers no provider access/i);
  });
});

describe('gateway-cli · tail-reads-ring-buffer', () => {
  it('reports plainly when no daemon is listening', async () => {
    const f = fixture();
    try {
      const result = await runTail({ paths: f.paths });
      assert.equal(result.exitCode, 1);
      assert.match(result.rendered, /daemon not running/);
    } finally {
      f.cleanup();
    }
  });

  it('returns recent entries from a real ring buffer over IPC', async () => {
    const { IpcServer } = await import('../packages/gateway-daemon/src/index.js');
    const f = fixture();
    const ring = new RingBuffer();
    ring.push({ at: new Date().toISOString(), level: 'info', at_: 'primary.step', fields: { verdict: 'ok' } });
    ring.push({ at: new Date().toISOString(), level: 'warn', at_: 'staging.step', fields: { verdict: 'retry' } });

    const ipc = new IpcServer(f.paths, {
      status: () => ({ primary: { lane: 'HEARTBEATING' }, staging: { lane: 'INACTIVE' } }),
      ring: () => ring,
    });
    await ipc.start();
    try {
      const result = await runTail({ paths: f.paths });
      assert.equal(result.exitCode, 0);
      assert.equal(result.entries.length, 2);
      assert.match(result.rendered, /primary\.step/);
    } finally {
      await ipc.stop();
      f.cleanup();
    }
  });
});

describe('gateway-cli · the enrolment guard', () => {
  it('enroll-refuses-while-staging-pending', async () => {
    const f = fixture();
    try {
      await f.state.update((current) => ({
        ...current,
        staging: { ...current.staging, lane: 'AWAITING' },
      }));

      const result = await enroll(f);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.code, GUARD_REFUSAL);
      assert.equal((await f.custody.inventory()).staging, false, 'no key was generated');
    } finally {
      f.cleanup();
    }
  });

  it('refuses for every non-INACTIVE staging lane, halted included', async () => {
    for (const lane of ['PENDING_REDEEM', 'AWAITING', 'PROMOTED', 'REFUSED', 'TRANSPORT_RETRY', 'HALTED'] as const) {
      const f = fixture();
      try {
        await f.state.update((current) => ({ ...current, staging: { ...current.staging, lane } }));
        const result = await enroll(f);
        assert.equal(result.ok, false, lane);
        assert.equal(!result.ok && result.code, GUARD_REFUSAL, lane);
      } finally {
        f.cleanup();
      }
    }
  });

  it('enroll-refuses-when-staging-key-exists-with-missing-state', async () => {
    const f = fixture();
    try {
      // A staging Keychain item with NO persisted state: the case where a
      // state-only guard would have waved a second enrolment through.
      await f.custody.createStaging('ZXhpc3Rpbmctc3RhZ2luZy1zZWNyZXQ');
      const before = await f.custody.read('staging');

      const result = await enroll(f);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.code, GUARD_REFUSAL);
      assert.equal(await f.custody.read('staging'), before, 'the existing key is untouched');
    } finally {
      f.cleanup();
    }
  });

  it('enroll-refusal-does-not-mutate-primary-or-staging-custody', async () => {
    const f = fixture();
    try {
      await f.custody.createStaging('staging-secret');
      await f.custody.promoteStagingToPrimary();
      await f.custody.createStaging('second-staging-secret');

      const primaryBefore = await f.custody.read('primary');
      const stagingBefore = await f.custody.read('staging');

      const result = await enroll(f);
      assert.equal(result.ok, false);

      assert.equal(await f.custody.read('primary'), primaryBefore, 'primary is untouched');
      assert.equal(await f.custody.read('staging'), stagingBefore, 'staging is untouched');
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-cli · the cross-process staging lock', () => {
  it('enroll:existing-staging-lock-fails-before-key-generation', async () => {
    const f = fixture();
    try {
      const held = await acquireStagingLock(f.paths.stagingLockPath, 'enroll', () => Date.now());
      const argvBefore = f.runner.argvLog.length;

      const result = await enroll(f);

      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.code, 'staging_busy_or_recovery_required');
      assert.equal(f.runner.argvLog.length, argvBefore, 'no Keychain access happened at all');
      assert.equal((await f.custody.inventory()).staging, false, 'and no key was generated');
      await held.release();
    } finally {
      f.cleanup();
    }
  });

  it('enroll:crash-leaves-orphaned-lock-and-fails-closed', async () => {
    const f = fixture();
    try {
      // A crashed holder: the lock file exists and nothing released it.
      await acquireStagingLock(f.paths.stagingLockPath, 'enroll', () => Date.now());
      assert.equal(await stagingLockExists(f.paths.stagingLockPath), true);

      const result = await enroll(f);
      assert.equal(result.ok, false, 'no automatic release, no heuristic cleanup');
      assert.equal(!result.ok && result.code, 'staging_busy_or_recovery_required');
      assert.equal(await stagingLockExists(f.paths.stagingLockPath), true, 'the lock is still there');
    } finally {
      f.cleanup();
    }
  });

  it('enroll:orphaned-lock-fails-closed-before-key-generation', async () => {
    const f = fixture();
    try {
      // An orphan whose recorded pid is certainly dead.
      writeFileSync(
        f.paths.stagingLockPath,
        JSON.stringify({ pid: 2 ** 22, ownerToken: 'x'.repeat(64), acquiredAt: new Date().toISOString(), operation: 'enroll' }),
        { mode: 0o600 },
      );
      const argvBefore = f.runner.argvLog.length;

      const result = await enroll(f);

      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.code, 'staging_busy_or_recovery_required');
      assert.match(!result.ok ? result.message : '', /doctor/);
      assert.equal(f.runner.argvLog.length, argvBefore, 'before any key generation or Keychain access');
    } finally {
      f.cleanup();
    }
  });

  it('enroll:owner-release-cannot-remove-foreign-lock', async () => {
    const f = fixture();
    try {
      const mine = await acquireStagingLock(f.paths.stagingLockPath, 'enroll', () => Date.now());
      const myToken = mine.metadata.ownerToken;

      // A successor's lock appears at the same path.
      writeFileSync(
        f.paths.stagingLockPath,
        JSON.stringify({
          pid: process.pid,
          ownerToken: 'b'.repeat(64),
          acquiredAt: new Date().toISOString(),
          operation: 'promotion',
        }),
        { mode: 0o600 },
      );

      await mine.release();

      const present = await readStagingLock(f.paths.stagingLockPath);
      assert.ok(present !== null, "the successor's lock survives the old owner's release");
      assert.notEqual(present.ownerToken, myToken);
      assert.equal(present.operation, 'promotion');
    } finally {
      f.cleanup();
    }
  });

  it('enroll:two-concurrent-invocations-exactly-one-writes-staging', async () => {
    const f = fixture();
    acceptedCodes = [];
    try {
      /*
       * Two REAL processes. A single-process test with two promises would
       * exercise a different mechanism entirely — the property here is what
       * `fs.open(..., 'wx')` guarantees between processes.
       */
      const spawnChild = () =>
        spawn(process.execPath, [CHILD], {
          env: {
            ...process.env,
            BUILDROOM_TEST_DIR: f.paths.directory,
            BUILDROOM_TEST_KEYCHAIN: f.keychainDirectory,
            BUILDROOM_TEST_URL: baseUrl,
            BUILDROOM_TEST_CODE: CODE,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

      const children = [spawnChild(), spawnChild()];
      const outputs = children.map(
        (child) =>
          new Promise<{ code: number; stdout: string }>((resolve) => {
            let stdout = '';
            child.stdout.on('data', (chunk: Buffer) => {
              stdout += chunk.toString('utf8');
            });
            child.on('close', (code) => resolve({ code: code ?? -1, stdout }));
          }),
      );

      /*
       * Deterministic coordination (correction T3, Rev 4.7 tester). The
       * delivered test released both children together and asserted the
       * loser's diagnostic — but that diagnostic depends on the loser arriving
       * while the lock is still held, which the ordering does not guarantee: a
       * loser admitted after the release passes the lock and is stopped by the
       * enrolment guard instead, with a different code and the same mutual
       * exclusion. (test/support/t3-red-probe.ts demonstrates that ordering
       * deterministically against the same assertion.)
       *
       * Here the stub server gates the redemption: the first child is admitted
       * alone, and the gate's "arrived" proves it is INSIDE the critical
       * section — past the guard, keypair generated, staging custody written,
       * lock held — before the second child is admitted at all. The loser then
       * meets the held `wx` lock by construction, not by luck.
       */
      const gate = armEnrollGate();
      children[0]!.stdin.write('go\n');
      children[0]!.stdin.end();
      await gate.arrived;

      children[1]!.stdin.write('go\n');
      children[1]!.stdin.end();

      // The loser meets the HELD lock and exits without any network work;
      // only its result is awaited while the winner is still gated.
      const loserOutput = await outputs[1]!;
      const loserParsed = JSON.parse(loserOutput.stdout.trim() || '{}') as Record<string, unknown>;

      // Now the winner may finish its redemption.
      enrollGate = null;
      gate.release();
      const winnerOutput = await outputs[0]!;
      const winnerParsed = JSON.parse(winnerOutput.stdout.trim() || '{}') as Record<string, unknown>;

      const results = [
        { ...winnerOutput, parsed: winnerParsed },
        { ...loserOutput, parsed: loserParsed },
      ];

      const winners = results.filter((result) => result.parsed['ok'] === true);
      const losers = results.filter((result) => result.parsed['ok'] !== true);

      assert.equal(winners.length, 1, `exactly one must win: ${JSON.stringify(results.map((r) => r.parsed))}`);
      assert.equal(losers.length, 1);
      assert.equal(
        losers[0]!.parsed['code'],
        'staging_busy_or_recovery_required',
        'the loser reports the ruled diagnostic',
      );

      assert.equal(acceptedCodes.length, 1, 'the loser performed no redemption');

      // Exactly one staging item, and it matches the winner's enrolment.
      const staging = await f.custody.read('staging');
      assert.ok(staging !== null, 'exactly one staging item exists');
      const state = await f.state.read();
      assert.equal(state.staging.lane, 'AWAITING');
      assert.equal(state.staging.identity.fingerprint, winners[0]!.parsed['fingerprint']);
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-cli · doctor is diagnostic only', () => {
  it('doctor:orphaned-lock-is-diagnostic-only', async () => {
    const f = fixture();
    try {
      writeFileSync(
        f.paths.stagingLockPath,
        JSON.stringify({
          pid: 2 ** 22,
          ownerToken: 'c'.repeat(64),
          acquiredAt: new Date().toISOString(),
          operation: 'enroll',
        }),
        { mode: 0o600 },
      );
      await f.custody.createStaging('orphan-era-secret');

      const report = await runDoctor({
        paths: f.paths,
        custody: f.custody,
        client: f.client,
        state: f.state,
      });

      assert.equal(report.stagingLock.present, true);
      assert.equal(report.stagingLock.recordedPidLive, false, 'PID liveness is diagnosed');
      assert.equal(report.stagingLock.stopCondition, true, 'and reported as a stop condition');
      assert.match(String(report.stagingLock.guidance), /out-of-band/);
      assert.match(String(report.stagingLock.guidance), /after every gateway/i);
      assert.equal(report.stagingInventory.keychainItem, true, 'the staging inventory is reported');
      assert.equal(report.stagingInventory.persistedState, 'INACTIVE');

      // The lock is untouched by the diagnosis.
      assert.equal(existsSync(f.paths.stagingLockPath), true, 'doctor removed nothing');
      assert.equal(await f.custody.read('staging'), 'orphan-era-secret', 'and deleted no custody');

      const rendered = renderDoctor(report);
      assert.match(rendered, /staging lock/);
      assert.ok(!rendered.includes('c'.repeat(64)), 'the owner token is never displayed');
    } finally {
      f.cleanup();
    }
  });

  it('doctor:never-removes-unowned-lock — under any input, there is no deletion path', async () => {
    const f = fixture();
    try {
      const held = await acquireStagingLock(f.paths.stagingLockPath, 'promotion', () => Date.now());

      // Every argument shape the CLI accepts for `doctor`: there is exactly one,
      // because no flag, confirmation path or age heuristic exists to add.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await runDoctor({ paths: f.paths, custody: f.custody, client: f.client, state: f.state });
        assert.equal(existsSync(f.paths.stagingLockPath), true, `attempt ${attempt}`);
      }

      /*
       * The absence of a deletion path is checked against the CODE, with
       * comments stripped — this file talks about deletion at length precisely
       * because it must not perform any, and a naive text scan would match the
       * prose explaining that.
       */
      const source = readFileSync(
        join(HERE, '..', '..', 'packages', 'gateway-cli', 'src', 'doctor.ts'),
        'utf8',
      );
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

      for (const forbidden of ['unlink(', 'rmSync(', 'rmdir(', 'truncate(', 'writeFile(']) {
        assert.ok(!code.includes(forbidden), `doctor must contain no ${forbidden} call`);
      }
      assert.ok(!/--[a-z-]*(clear|force|remove|delete)/i.test(code), 'and no recovery flag');

      // And the CLI hands `doctor` no arguments at all, so there is nothing a
      // caller could pass to reach a deletion that does not exist.
      const bin = readFileSync(join(HERE, '..', '..', 'packages', 'gateway-cli', 'src', 'bin.ts'), 'utf8');
      assert.match(bin, /runDoctor\(\{ paths, custody, client, state \}\)/);

      await held.release();
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-cli · enroll-never-puts-code-in-argv', () => {
  it('never passes the pairing code to a spawned process', async () => {
    const f = fixture();
    try {
      const result = await enroll(f);
      assert.equal(result.ok, true, 'the fixture enrolment must succeed for this to mean anything');

      const flattened = JSON.stringify(f.runner.argvLog);
      assert.ok(!flattened.includes(CODE), 'the code appeared in a spawned argv');
      assert.ok(f.runner.argvLog.length > 0, 'the Keychain really was invoked');

      // The secret is not in argv either; it goes on stdin.
      for (const argv of f.runner.argvLog) {
        assert.ok(
          !argv.some((token) => token.includes('PRIVATE KEY')),
          'private key material appeared in argv',
        );
      }
    } finally {
      f.cleanup();
    }
  });

  it('writes staging with the no-U create form, and uses -U only for promotion', async () => {
    const f = fixture();
    try {
      await enroll(f);

      const adds = f.runner.argvLog.filter((argv) => argv[0] === 'add-generic-password');
      const stagingWrites = adds.filter((argv) => argv.includes('staging'));
      assert.ok(stagingWrites.length > 0);
      for (const argv of stagingWrites) {
        assert.ok(!argv.includes('-U'), 'a staging write must fail on an existing item, never update it');
      }

      await f.custody.promoteStagingToPrimary();
      const primaryWrites = f.runner.argvLog
        .filter((argv) => argv[0] === 'add-generic-password')
        .filter((argv) => argv.includes('primary'));
      assert.ok(primaryWrites.length > 0);
      for (const argv of primaryWrites) {
        assert.ok(argv.includes('-U'), 'promotion is the sole permitted -U use');
      }
    } finally {
      f.cleanup();
    }
  });
});

describe('gateway-cli · staging-response-disposition-table', () => {
  /**
   * The vocabulary is declared HERE, as a literal list, rather than imported
   * from the implementation. A test that imported the implementation's own set
   * would agree with it about a vocabulary they had both got wrong, which is
   * the one thing this test exists to prevent.
   */
  const DECLARED_VOCABULARY: Readonly<Record<string, readonly string[]>> = {
    'POST /gateway/enroll': [
      '202',
      '400 invalid_request',
      '400 malformed_pubkey',
      '409 unknown_code',
      '409 code_expired',
      '409 code_consumed',
      '409 idempotency_key_mismatch',
      '413 payload_too_large',
      '429 rate_limited',
      '5xx',
    ],
    'GET /gateway/session-challenge': ['200', '429 rate_limited', '5xx'],
    'POST /gateway/session-start': [
      '200',
      '400 invalid_request',
      '401 unknown_key',
      '401 bad_signature',
      '401 purpose_mismatch',
      '403 awaiting_approval',
      '403 denied',
      '403 expired',
      '403 revoked',
      '409 stale_generation',
      '409 stale_challenge',
      '409 stale_timestamp',
      '409 nonce_replay',
      '413 payload_too_large',
      '429 rate_limited',
      '503 not_leader',
      '503 clock_unreliable',
      '503 nonce_capacity',
      '503 challenge_overdue',
      '5xx',
    ],
    'POST /gateway/heartbeat': [
      '200',
      '400 invalid_request',
      '401 unknown_key',
      '401 bad_signature',
      '401 purpose_mismatch',
      '403 revoked',
      '403 awaiting_approval',
      '403 denied',
      '403 expired',
      '409 session_required',
      '409 stale_sequence',
      '409 stale_timestamp',
      '413 payload_too_large',
      '429 rate_limited',
      '503 not_leader',
      '503 clock_unreliable',
      '5xx',
    ],
  };

  it('the implementation emits exactly the declared vocabulary', () => {
    assert.deepEqual(
      Object.keys(SERVER_VOCABULARY).sort(),
      Object.keys(DECLARED_VOCABULARY).sort(),
      'the endpoint set must match',
    );
    for (const endpoint of Object.keys(DECLARED_VOCABULARY)) {
      assert.deepEqual(
        [...(SERVER_VOCABULARY[endpoint] ?? [])].sort(),
        [...DECLARED_VOCABULARY[endpoint]!].sort(),
        endpoint,
      );
    }
  });

  it('includes 413 payload_too_large on every body-bearing endpoint', () => {
    for (const endpoint of Object.keys(DECLARED_VOCABULARY)) {
      if (endpoint.startsWith('GET ')) continue;
      assert.ok(
        DECLARED_VOCABULARY[endpoint]!.includes('413 payload_too_large'),
        `${endpoint} must carry the structured body-limit refusal`,
      );
    }
  });

  it('maps every vocabulary member to exactly one disposition, in each applicable table', () => {
    const cases: readonly { endpoint: string; table: Readonly<Record<string, string>>; name: string }[] = [
      { endpoint: 'POST /gateway/enroll', table: STAGING_REDEEM_TABLE, name: 'stagingRedeem' },
      { endpoint: 'POST /gateway/session-start', table: STAGING_PROBE_TABLE, name: 'stagingProbe' },
      { endpoint: 'POST /gateway/session-start', table: PRIMARY_TABLE, name: 'primary(session-start)' },
      { endpoint: 'POST /gateway/heartbeat', table: PRIMARY_TABLE, name: 'primary(heartbeat)' },
    ];

    for (const { endpoint, table, name } of cases) {
      for (const member of DECLARED_VOCABULARY[endpoint]!) {
        assert.ok(
          Object.prototype.hasOwnProperty.call(table, member),
          `${name} has no disposition for ${member}`,
        );
      }
    }
  });

  it('lets no unlisted code fall through to a catch-all', () => {
    // Every key in every table is a declared vocabulary member. A table entry
    // for something the server cannot emit would be a catch-all in disguise.
    const declared = new Set(Object.values(DECLARED_VOCABULARY).flat());
    for (const [name, table] of [
      ['stagingRedeem', STAGING_REDEEM_TABLE],
      ['stagingProbe', STAGING_PROBE_TABLE],
      ['primary', PRIMARY_TABLE],
    ] as const) {
      for (const key of Object.keys(table)) {
        assert.ok(declared.has(key), `${name} disposition table carries undeclared code ${key}`);
      }
    }
  });

  it('contains no session_required on the staging probe table', () => {
    // `session_required` is heartbeat-only by the vocabulary's own definition;
    // assigning it to a session-start probe was correction T3.
    assert.equal(Object.prototype.hasOwnProperty.call(STAGING_PROBE_TABLE, '409 session_required'), false);
    assert.equal(
      DECLARED_VOCABULARY['POST /gateway/session-start']!.includes('409 session_required'),
      false,
    );
    assert.ok(DECLARED_VOCABULARY['POST /gateway/heartbeat']!.includes('409 session_required'));
  });

  it('retains the awaiting-approval polling row rather than discarding staging', () => {
    // The deleted blanket rule would have discarded the only staging private key
    // during the normal polling state (correction F2).
    assert.equal(STAGING_PROBE_TABLE['403 awaiting_approval'], 'retain_and_continue');
  });

  it('halts on exactly the enumerated protocol-integrity set, and nothing else', () => {
    for (const code of PROTOCOL_INTEGRITY_CODES) {
      assert.equal(STAGING_PROBE_TABLE[code], 'halt_fail_closed', code);
      assert.equal(PRIMARY_TABLE[code], 'halt_fail_closed', code);
    }
    const haltingInProbe = Object.entries(STAGING_PROBE_TABLE)
      .filter(([, value]) => value === 'halt_fail_closed')
      .map(([key]) => key);
    assert.deepEqual(haltingInProbe.sort(), [...PROTOCOL_INTEGRITY_CODES].sort());
  });

  it('dispositions nonce_replay as resynchronization, not accusation', () => {
    assert.equal(STAGING_PROBE_TABLE['409 nonce_replay'], 'retain_and_retry');
    assert.equal(PRIMARY_TABLE['409 nonce_replay'], 'retain_and_retry');
  });

  it('never deletes staging on a transport failure or a retryable class', () => {
    for (const [code, verdict] of Object.entries(STAGING_PROBE_TABLE)) {
      if (verdict !== 'delete_staging_terminal') continue;
      assert.ok(
        code.startsWith('403 denied') || code.startsWith('403 expired') || code.startsWith('403 revoked'),
        `${code} must not be a staging-deleting class on the probe table`,
      );
    }
    assert.equal(PRIMARY_TABLE['403 revoked'], 'terminal_stop_no_deletion', 'no key deletion on the primary lane');
  });
});

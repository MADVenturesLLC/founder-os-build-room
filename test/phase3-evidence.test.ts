import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { phase3RequestSha256 } from '../packages/control-plane/src/phase3-run.js';
import {
  PHASE3_LOCAL_FAILURE_AUTHORIZES,
  PHASE3_LOCAL_UNRESOLVED_AUTHORIZES,
  securePhase3EvidenceDirectory,
  disposePhase3EvidenceReservation,
  reservePhase3EvidenceFile,
  serializePhase3Evidence,
  writePhase3Evidence,
} from '../packages/run-harness/src/phase3/evidence.js';

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

const EVIDENCE = {
  schema: 'build-room/phase3-local-failure@1',
  attempt: {
    runAttemptId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    runLabel: 'Phase3-CR1',
    buildRoomSha: '1'.repeat(40),
    fixtureSha: '2'.repeat(40),
    outcome: 'failed',
    reasonCode: 'internal_error',
  },
  authorizes: PHASE3_LOCAL_FAILURE_AUTHORIZES,
};

const UNRESOLVED_V2 = {
  schema: 'build-room/phase3-local-unresolved@2',
  outcome: 'unresolved_commit',
  reasonCode: 'commit_outcome_unresolved',
  remoteState: 'unknown',
  expected: {
    runAttemptId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    runLabel: 'Phase3-CR1',
    entryAuthorizationId: 'founder:phase3-cr1:test',
    revocationAuthorizationId: null,
    founderOsSha: '1'.repeat(40),
    buildRoomSha: '2'.repeat(40),
    fixtureRepository: 'MADVenturesLLC/phase3-fixture',
    fixtureSha: '3'.repeat(40),
    gatewayId: '11111111-2222-4333-8444-555555555555',
    enrollmentProjectionSha256: '4'.repeat(64),
    machineIdentity: 'synthetic-mac',
    environmentLabel: 'synthetic-test',
    entryEvidenceSha256: '5'.repeat(64),
  },
  diagnostic: {
    operationStage: 'attempt_create',
    failureClass: 'dns_resolution',
  },
  authorizes: PHASE3_LOCAL_UNRESOLVED_AUTHORIZES,
};

describe('Phase 3 local evidence boundary', () => {
  it('accepts only the closed redacted unresolved diagnostic schema', () => {
    assert.deepEqual(JSON.parse(serializePhase3Evidence(UNRESOLVED_V2)), UNRESOLVED_V2);
    for (const diagnostic of [
      { ...UNRESOLVED_V2.diagnostic, operationStage: 'raw_fetch_stack' },
      { ...UNRESOLVED_V2.diagnostic, failureClass: 'Bearer must-not-land' },
      { ...UNRESOLVED_V2.diagnostic, rawMessage: 'must-not-land' },
    ]) {
      assert.throws(
        () => serializePhase3Evidence({ ...UNRESOLVED_V2, diagnostic }),
        /closed schema/,
      );
    }
  });

  it('writes one private, non-overwritable redacted export', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'phase3-evidence-'));
    directories.push(directory);
    const identity = await securePhase3EvidenceDirectory(directory);
    const reservation = await reservePhase3EvidenceFile(
      identity,
      'Phase3-CR1',
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    );
    const path = await writePhase3Evidence(reservation, EVIDENCE);

    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), EVIDENCE);
    await assert.rejects(
      reservePhase3EvidenceFile(
        identity,
        'Phase3-CR1',
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      ),
      /EEXIST/,
    );
  });

  it('refuses secret-bearing keys and evidence that omits non-authorization', () => {
    assert.throws(
      () => serializePhase3Evidence({ ...EVIDENCE, nested: { controlPlaneToken: 'secret' } }),
      /forbidden evidence key/,
    );
    for (const key of ['apiKey', 'authorization', 'secret', 'cookie']) {
      assert.throws(
        () => serializePhase3Evidence({ ...EVIDENCE, [key]: 'synthetic-sensitive-value' }),
        /forbidden evidence key/,
      );
    }
    assert.throws(
      () =>
        serializePhase3Evidence({
          ...EVIDENCE,
          toJSON: () => ({ ...EVIDENCE, apiKey: 'synthetic-sensitive-value' }),
        }),
      /forbidden evidence key/,
    );
    assert.throws(
      () => serializePhase3Evidence({ ...EVIDENCE, unexpected: 'synthetic-value' }),
      /closed schema/,
    );
    for (const attempt of [
      { ...EVIDENCE.attempt, runAttemptId: 7 },
      { ...EVIDENCE.attempt, runLabel: null },
      { ...EVIDENCE.attempt, buildRoomSha: ['1'.repeat(40)] },
      { ...EVIDENCE.attempt, outcome: 'passed' },
      { ...EVIDENCE.attempt, reasonCode: ['internal_error'] },
    ]) {
      assert.throws(
        () => serializePhase3Evidence({ ...EVIDENCE, attempt }),
        /closed schema/,
      );
    }
    for (const authorizes of [
      'Nothing prevents Phase 4 authorization.',
      'Nothing. Phase 4 is authorized.',
    ]) {
      assert.throws(
        () => serializePhase3Evidence({ ...EVIDENCE, authorizes }),
        /must explicitly authorize nothing/,
      );
    }
    assert.throws(
      () =>
        serializePhase3Evidence({
          ...EVIDENCE,
          toJSON: () => ({
            ...EVIDENCE,
            authorizes: 'Nothing. Phase 4 is authorized.',
          }),
        }),
      /must explicitly authorize nothing/,
    );
    assert.throws(
      () => serializePhase3Evidence({ ...EVIDENCE, authorizes: 'Phase 4' }),
      /must explicitly authorize nothing/,
    );
  });

  it('keeps the committed example synthetic, redacted, and non-authorizing', async () => {
    const example = JSON.parse(
      await readFile('test/fixtures/phase3-run-evidence.synthetic.json', 'utf8'),
    ) as Record<string, unknown>;
    assert.equal(example['synthetic'], undefined, 'the example retains the exact closed export schema');
    assert.equal((example['context'] as Record<string, unknown>)['environment'], 'synthetic-test');
    assert.doesNotThrow(() => serializePhase3Evidence(example));

    const reviewed = structuredClone(example);
    const reviewedEvents = reviewed['events'] as Record<string, unknown>[];
    const technicalCompletion = reviewedEvents.at(-1)!;
    const adjudication = {
      verdict: 'passed',
      tier2ReviewerId: 'Gemini 3.1 Pro (High)',
      tier2EvidenceSha256: '7'.repeat(64),
      founderAuthorizationId: 'founder:phase3:test',
    };
    const idempotencyKey = '20000000-0000-4000-8000-000000000010';
    const occurredAt = '2026-08-25T12:00:08.000Z';
    reviewedEvents.push({
      ...technicalCompletion,
      eventId: '10000000-0000-4000-8000-000000000010',
      eventIndex: 10,
      eventType: 'attempt_adjudicated',
      idempotencyKey,
      requestSha256: phase3RequestSha256({ idempotencyKey, ...adjudication }),
      reasonCode: null,
      result: 'passed',
      teardownResult: 'completed',
      teardownEvidenceSha256: technicalCompletion['teardownEvidenceSha256'],
      adjudication,
      occurredAt,
    });
    const reviewedAttempt = reviewed['attempt'] as Record<string, unknown>;
    reviewedAttempt['state'] = 'passed';
    reviewedAttempt['finishedAt'] = occurredAt;
    assert.doesNotThrow(() => serializePhase3Evidence(reviewed));

    const punctuationOnly = structuredClone(reviewed);
    (((punctuationOnly['events'] as Record<string, unknown>[]).at(-1)![
      'adjudication'
    ]) as Record<string, unknown>)['tier2ReviewerId'] = '---';
    assert.throws(() => serializePhase3Evidence(punctuationOnly), /closed schema/);

    const misplaced = structuredClone(reviewed);
    const misplacedEvent = (misplaced['events'] as Record<string, unknown>[])[0]!;
    misplacedEvent['adjudication'] = adjudication;
    assert.throws(() => serializePhase3Evidence(misplaced), /closed schema/);
  });

  it('refuses an evidence directory replaced by a symlink after validation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'phase3-evidence-swap-'));
    directories.push(root);
    const directory = join(root, 'evidence');
    const redirected = join(root, 'redirected');
    await mkdir(directory, { mode: 0o700 });
    await mkdir(redirected, { mode: 0o700 });
    const canonical = await realpath(directory);
    const identity = await securePhase3EvidenceDirectory(canonical);
    const reservation = await reservePhase3EvidenceFile(
      identity,
      'Phase3-CR1',
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    );
    await rename(directory, `${directory}-original`);
    await symlink(redirected, directory);

    await assert.rejects(
      writePhase3Evidence(reservation, EVIDENCE),
      /evidence directory identity changed/,
    );
    await disposePhase3EvidenceReservation(reservation);
    await assert.rejects(reservation.handle.stat(), /closed|EBADF/i);
  });

  it('refuses same-inode content added after reservation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'phase3-evidence-contamination-'));
    directories.push(directory);
    const identity = await securePhase3EvidenceDirectory(directory);
    const reservation = await reservePhase3EvidenceFile(
      identity,
      'Phase3-CR1',
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    );
    await reservation.handle.writeFile('unvalidated trailing content', { encoding: 'utf8' });
    await assert.rejects(
      writePhase3Evidence(reservation, EVIDENCE),
      /reserved evidence file is not empty/,
    );
    await disposePhase3EvidenceReservation(reservation);
  });
});

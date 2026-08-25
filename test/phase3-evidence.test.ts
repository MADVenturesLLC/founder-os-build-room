import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
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
  schema: 'build-room/phase3-run-evidence@1',
  attempt: { runAttemptId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
  authorizes: 'Nothing.',
};

describe('Phase 3 local evidence boundary', () => {
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

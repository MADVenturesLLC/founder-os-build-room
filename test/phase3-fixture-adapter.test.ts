import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, it } from 'node:test';
import {
  DeterministicFixtureAdapter,
  FixtureAdapterError,
  loadFixtureDefinition,
  validateFixtureDefinition,
  validateFixtureLifecycle,
  type FixtureDefinition,
} from '../packages/run-harness/src/phase3/fixture-adapter.js';
import {
  phase3RepositoryGitEnvironment,
  verifyFixtureRepository,
} from '../packages/run-harness/src/phase3/repository.js';
import { verifyPhase3EntryRepositories } from '../packages/run-harness/src/phase3/cli.js';
import type { Phase3AttemptPlan } from '../packages/run-harness/src/phase3/model.js';

const run = promisify(execFile);
const tempDirectories: string[] = [];

afterEach(async () => {
  for (const directory of tempDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

const FIXTURE: FixtureDefinition = {
  fixtureId: 'phase3-local-stub-v1',
  caseId: 'inspect-bound-sha',
  request: { operation: 'inspect_fixture', value: 'bound' },
  response: { status: 'ok', value: 'bound' },
};
const FIXTURE_REPOSITORY = 'MADVenturesLLC/phase3-fixture';

async function fixtureRepository(
  name = 'phase3-fixture-',
  repository = FIXTURE_REPOSITORY,
): Promise<{ path: string; sha: string }> {
  const path = await mkdtemp(join(tmpdir(), name));
  tempDirectories.push(path);
  await run('git', ['init', '-q', path]);
  await run('git', ['-C', path, 'config', 'user.email', 'fixture@example.invalid']);
  await run('git', ['-C', path, 'config', 'user.name', 'Fixture']);
  await run('git', [
    '-C',
    path,
    'remote',
    'add',
    'origin',
    `https://github.com/${repository}.git`,
  ]);
  await writeFile(join(path, 'fixture.txt'), 'governed fixture\n', 'utf8');
  await writeFile(join(path, 'phase3-stub.json'), `${JSON.stringify(FIXTURE, null, 2)}\n`, 'utf8');
  await run('git', ['-C', path, 'add', 'fixture.txt', 'phase3-stub.json']);
  await run('git', ['-C', path, 'commit', '-q', '-m', 'fixture']);
  const { stdout } = await run('git', ['-C', path, 'rev-parse', 'HEAD']);
  return { path, sha: stdout.trim() };
}

describe('Phase 3 fixture repository binding', () => {
  it('forwards no credential variables into Git subprocesses', () => {
    const environment = phase3RepositoryGitEnvironment({
      PATH: '/usr/bin',
      TMPDIR: '/tmp',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'C',
      CONTROL_PLANE_TOKEN: 'control-secret',
      PHASE3_ADJUDICATION_TOKEN: 'founder-secret',
      DATABASE_URL: 'postgresql://credential@example.invalid/db',
      GITHUB_TOKEN: 'github-secret',
      AWS_SECRET_ACCESS_KEY: 'cloud-secret',
    });
    assert.deepEqual(environment, {
      TMPDIR: '/tmp',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'C',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
    });
  });

  it('uses the trusted system Git even when PATH contains an impostor', async () => {
    const repository = await fixtureRepository();
    const fakeDirectory = await mkdtemp(join(tmpdir(), 'phase3-fake-git-'));
    tempDirectories.push(fakeDirectory);
    const marker = join(fakeDirectory, 'invoked');
    const fakeGit = join(fakeDirectory, 'git');
    await writeFile(fakeGit, `#!/bin/sh\nprintf hit > '${marker}'\nexit 1\n`, 'utf8');
    await chmod(fakeGit, 0o755);
    const originalPath = process.env['PATH'];
    process.env['PATH'] = `${fakeDirectory}:${originalPath ?? ''}`;
    try {
      const verified = await verifyFixtureRepository({
        path: repository.path,
        expectedSha: repository.sha,
        expectedRepository: FIXTURE_REPOSITORY,
      });
      assert.equal(verified.commitSha, repository.sha);
      await assert.rejects(
        realpath(marker),
        (error: unknown) =>
          typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT',
      );
    } finally {
      if (originalPath === undefined) delete process.env['PATH'];
      else process.env['PATH'] = originalPath;
    }
  });

  it('does not let Git exclude configuration hide an untracked file', async () => {
    const repository = await fixtureRepository();
    const excludeDirectory = await mkdtemp(join(tmpdir(), 'phase3-git-excludes-'));
    tempDirectories.push(excludeDirectory);
    const excludes = join(excludeDirectory, 'global-excludes');
    await writeFile(excludes, 'hidden-by-config.txt\n', 'utf8');
    await run('/usr/bin/git', [
      '-C',
      repository.path,
      'config',
      'core.excludesFile',
      excludes,
    ]);
    await writeFile(join(repository.path, 'hidden-by-config.txt'), 'must be detected\n', 'utf8');

    await assert.rejects(
      verifyFixtureRepository({
        path: repository.path,
        expectedSha: repository.sha,
        expectedRepository: FIXTURE_REPOSITORY,
      }),
      /fixture_dirty/,
    );
  });

  it('verifies FounderOS root, origin, cleanliness, presence, and authority SHA before entry', async () => {
    const founderOs = await fixtureRepository('phase3-founder-os-', 'MADVenturesLLC/FounderOS');
    const buildRoom = await fixtureRepository(
      'phase3-build-room-',
      'MADVenturesLLC/founder-os-build-room',
    );
    const fixture = await fixtureRepository();
    const plan = {
      founderOsSha: founderOs.sha,
      founderOs: { repository: 'MADVenturesLLC/FounderOS', path: founderOs.path },
      buildRoomSha: buildRoom.sha,
      fixture: {
        repository: FIXTURE_REPOSITORY,
        path: fixture.path,
        sha: fixture.sha,
      },
    } as Phase3AttemptPlan;

    assert.equal(
      (await verifyPhase3EntryRepositories(plan, buildRoom.path)).founderOs.commitSha,
      founderOs.sha,
    );
    await assert.rejects(
      verifyPhase3EntryRepositories({ ...plan, founderOsSha: 'f'.repeat(40) }, buildRoom.path),
      /founder_os_invalid/,
    );

    const subdirectory = join(founderOs.path, 'subdirectory');
    await mkdir(subdirectory);
    await assert.rejects(
      verifyPhase3EntryRepositories(
        { ...plan, founderOs: { ...plan.founderOs, path: subdirectory } },
        buildRoom.path,
      ),
      /founder_os_invalid/,
    );

    await run('git', [
      '-C',
      founderOs.path,
      'remote',
      'set-url',
      'origin',
      'https://github.com/MADVenturesLLC/WrongFounderOS.git',
    ]);
    await assert.rejects(verifyPhase3EntryRepositories(plan, buildRoom.path), /founder_os_invalid/);
    await run('git', [
      '-C',
      founderOs.path,
      'remote',
      'set-url',
      'origin',
      'https://github.com/MADVenturesLLC/FounderOS.git',
    ]);

    const dirty = join(founderOs.path, 'untracked.txt');
    await writeFile(dirty, 'dirty\n', 'utf8');
    await assert.rejects(verifyPhase3EntryRepositories(plan, buildRoom.path), /founder_os_invalid/);
    await unlink(dirty);
    await assert.rejects(
      verifyPhase3EntryRepositories(
        { ...plan, founderOs: { ...plan.founderOs, path: join(founderOs.path, 'missing') } },
        buildRoom.path,
      ),
      /founder_os_invalid/,
    );
  });

  it('accepts only the clean repository root at the exact commit', async () => {
    const fixture = await fixtureRepository();
    const verified = await verifyFixtureRepository({
      path: fixture.path,
      expectedSha: fixture.sha,
      expectedRepository: FIXTURE_REPOSITORY,
    });

    assert.equal(verified.realPath, await realpath(fixture.path));
    assert.equal(verified.commitSha, fixture.sha);
    assert.match(verified.treeSha, /^[0-9a-f]{40}$/);
    assert.equal(verified.clean, true);
  });

  it('refuses a wrong SHA and an untracked file', async () => {
    const fixture = await fixtureRepository();
    await assert.rejects(
      verifyFixtureRepository({
        path: fixture.path,
        expectedSha: '2'.repeat(40),
        expectedRepository: FIXTURE_REPOSITORY,
      }),
      /fixture_sha_mismatch/,
    );

    await writeFile(join(fixture.path, 'untracked.txt'), 'not governed\n', 'utf8');
    await assert.rejects(
      verifyFixtureRepository({
        path: fixture.path,
        expectedSha: fixture.sha,
        expectedRepository: FIXTURE_REPOSITORY,
      }),
      /fixture_dirty/,
    );
  });

  it('refuses a repository origin different from the authorized identity', async () => {
    const fixture = await fixtureRepository();
    await assert.rejects(
      verifyFixtureRepository({
        path: fixture.path,
        expectedSha: fixture.sha,
        expectedRepository: 'MADVenturesLLC/different-fixture',
      }),
      /fixture_repository_mismatch/,
    );
  });

  it('treats shell metacharacters as path characters', async () => {
    const fixture = await fixtureRepository('phase3-fixture-;touch-never-');
    const verified = await verifyFixtureRepository({
      path: fixture.path,
      expectedSha: fixture.sha,
      expectedRepository: FIXTURE_REPOSITORY,
    });
    assert.equal(verified.realPath, await realpath(fixture.path));
  });
});

describe('Phase 3 deterministic fixture adapter', () => {
  it('loads only the exact governed fixture schema', async () => {
    const fixture = await fixtureRepository();
    const repository = await verifyFixtureRepository({
      path: fixture.path,
      expectedSha: fixture.sha,
      expectedRepository: FIXTURE_REPOSITORY,
    });
    assert.deepEqual(await loadFixtureDefinition(repository), FIXTURE);
    assert.deepEqual(validateFixtureDefinition({ ...FIXTURE, command: 'echo unsafe' }), {
      ok: false,
      code: 'invalid_fixture_definition',
    });
  });

  it('loads the fixture blob from the verified commit, not the mutable worktree', async () => {
    const fixture = await fixtureRepository();
    const repository = await verifyFixtureRepository({
      path: fixture.path,
      expectedSha: fixture.sha,
      expectedRepository: FIXTURE_REPOSITORY,
    });
    await writeFile(
      join(fixture.path, 'phase3-stub.json'),
      `${JSON.stringify({
        ...FIXTURE,
        response: { status: 'ok', value: 'substituted' },
      })}\n`,
      'utf8',
    );

    assert.deepEqual(await loadFixtureDefinition(repository), FIXTURE);
  });

  it('produces the exact five-stage lifecycle with stable redacted digests', async () => {
    const fixture = await fixtureRepository();
    const repository = await verifyFixtureRepository({
      path: fixture.path,
      expectedSha: fixture.sha,
      expectedRepository: FIXTURE_REPOSITORY,
    });
    const adapter = new DeterministicFixtureAdapter(FIXTURE);

    const connection = await adapter.connect(repository, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    const registration = await adapter.register(connection);
    const exchange = await adapter.request(registration, 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff');
    await adapter.disconnect(connection);

    assert.equal(exchange.matched, true);
    assert.match(exchange.requestDigest, /^[0-9a-f]{64}$/);
    assert.match(exchange.responseDigest, /^[0-9a-f]{64}$/);
    assert.deepEqual(
      adapter.events.map((event) => event.stage),
      ['connect', 'adapter_registered', 'request', 'matched_response', 'disconnect'],
    );
    assert.deepEqual(validateFixtureLifecycle(adapter.events), { ok: true });

    const second = new DeterministicFixtureAdapter(FIXTURE);
    const secondConnection = await second.connect(repository, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    const secondRegistration = await second.register(secondConnection);
    const secondExchange = await second.request(
      secondRegistration,
      'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    );
    assert.equal(secondExchange.requestDigest, exchange.requestDigest);
    assert.equal(secondExchange.responseDigest, exchange.responseDigest);
  });

  it('refuses missing, duplicate, and out-of-order operations', async () => {
    const adapter = new DeterministicFixtureAdapter(FIXTURE);
    await assert.rejects(
      adapter.register({ sessionId: 'not-connected' }),
      (error: unknown) => error instanceof FixtureAdapterError && error.code === 'out_of_order_stage',
    );

    const fixture = await fixtureRepository();
    const repository = await verifyFixtureRepository({
      path: fixture.path,
      expectedSha: fixture.sha,
      expectedRepository: FIXTURE_REPOSITORY,
    });
    const connection = await adapter.connect(repository, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    await assert.rejects(
      adapter.connect(repository, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
      (error: unknown) => error instanceof FixtureAdapterError && error.code === 'duplicate_stage',
    );
    await adapter.disconnect(connection);
    assert.deepEqual(validateFixtureLifecycle(adapter.events), { ok: false, reason: 'missing_stage' });
  });

  it('rejects a mismatched response record', () => {
    const result = validateFixtureLifecycle([
      { stage: 'connect', artifactSha256: '1'.repeat(64) },
      { stage: 'adapter_registered', artifactSha256: '2'.repeat(64) },
      { stage: 'request', artifactSha256: '3'.repeat(64), exchangeId: 'exchange-a' },
      {
        stage: 'matched_response',
        artifactSha256: '4'.repeat(64),
        exchangeId: 'exchange-b',
        matched: true,
      },
      { stage: 'disconnect', artifactSha256: '5'.repeat(64) },
    ]);

    assert.deepEqual(result, { ok: false, reason: 'response_mismatch' });
  });
});

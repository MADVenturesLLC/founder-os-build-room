import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, open, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import {
  loadPhase3CliConfig,
  readPhase3PlanFile,
} from '../packages/run-harness/src/phase3/cli-config.js';

const directories: string[] = [];
const execute = promisify(execFile);

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function planFile(extra: Record<string, unknown> = {}): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'phase3-plan-'));
  directories.push(directory);
  const path = join(directory, 'plan.json');
  const founderOsPath = join(directory, 'founder-os');
  const fixturePath = join(directory, 'fixture');
  await initGit(founderOsPath);
  await initGit(fixturePath);
  await writeFile(
    path,
    `${JSON.stringify({
      runAttemptId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      label: 'Phase3-CR1',
      entryAuthorizationId: 'founder:phase3-cr1:test',
      founderOsSha: '1'.repeat(40),
      founderOs: { repository: 'MADVenturesLLC/FounderOS', path: founderOsPath },
      buildRoomSha: '2'.repeat(40),
      controlPlaneOrigin: 'http://127.0.0.1:8080',
      gatewayId: '11111111-2222-4333-8444-555555555555',
      expectedEnrollments: [
        { gatewayId: '11111111-2222-4333-8444-555555555555', state: 'enrolled' },
      ],
      fixture: {
        repository: 'MADVenturesLLC/phase3-fixture',
        path: fixturePath,
        sha: '3'.repeat(40),
      },
      environment: 'test',
      machine: 'test-mac',
      heartbeatFreshnessMs: 300_000,
      ...extra,
    })}\n`,
    'utf8',
  );
  return path;
}

describe('Phase 3 CLI configuration', () => {
  it('reads plan JSON through a bounded single-file handle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'phase3-plan-reader-'));
    directories.push(directory);
    const path = join(directory, 'plan.json');
    await writeFile(path, '{"plan":"bounded"}\n', 'utf8');
    assert.deepEqual(await readPhase3PlanFile(path), { plan: 'bounded' });

    await writeFile(path, 'x'.repeat(64 * 1024 + 1), 'utf8');
    await assert.rejects(readPhase3PlanFile(path), /PHASE3_PLAN_PATH is not a bounded file/);
    await writeFile(path, '{invalid', 'utf8');
    await assert.rejects(readPhase3PlanFile(path), /PHASE3_PLAN_PATH contains invalid JSON/);
  });

  it('rejects a FIFO without blocking before regular-file validation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'phase3-plan-fifo-'));
    directories.push(directory);
    const path = join(directory, 'plan.fifo');
    await execute('/usr/bin/mkfifo', [path]);
    let rescue: Awaited<ReturnType<typeof open>> | undefined;
    const timer = setTimeout(() => {
      void open(path, 'w').then((handle) => {
        rescue = handle;
        return handle.close();
      });
    }, 100);
    const started = Date.now();
    try {
      await assert.rejects(readPhase3PlanFile(path), /PHASE3_PLAN_PATH is not a bounded file/);
      assert.equal(Date.now() - started < 75, true, 'FIFO validation blocked in open');
    } finally {
      clearTimeout(timer);
      await rescue?.close().catch(() => undefined);
    }
  });

  it('loads a strict nonsecret plan and absolute private evidence destination', async () => {
    const planPath = await planFile();
    const evidencePath = join(dirname(planPath), 'evidence');
    const config = await loadPhase3CliConfig({
      CONTROL_PLANE_URL: 'http://127.0.0.1:8080',
      CONTROL_PLANE_TOKEN: 'test-token-not-exported',
      PHASE3_BUILD_VERIFIED_SHA: '2'.repeat(40),
      PHASE3_PLAN_PATH: planPath,
      PHASE3_EVIDENCE_PATH: evidencePath,
    });

    assert.equal(config.plan.runAttemptId, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    assert.equal(config.evidencePath, await realpath(evidencePath));
    await config.evidenceReservation.handle.close();
  });

  it('refuses to run while the Founder-only adjudication credential is present', async () => {
    const planPath = await planFile();
    await assert.rejects(
      loadPhase3CliConfig({
        CONTROL_PLANE_URL: 'http://127.0.0.1:8080',
        CONTROL_PLANE_TOKEN: 'test-token-not-exported',
        PHASE3_ADJUDICATION_TOKEN: 'must-not-enter-the-counted-run-harness',
        PHASE3_BUILD_VERIFIED_SHA: '2'.repeat(40),
        PHASE3_PLAN_PATH: planPath,
        PHASE3_EVIDENCE_PATH: join(dirname(planPath), 'evidence'),
      }),
      /PHASE3_ADJUDICATION_TOKEN must not be present in the counted-run harness environment/,
    );
  });

  it('fails before execution when a required secret is absent', async () => {
    const planPath = await planFile();
    await assert.rejects(
      loadPhase3CliConfig({
        CONTROL_PLANE_URL: 'http://127.0.0.1:8080',
        PHASE3_PLAN_PATH: planPath,
        PHASE3_EVIDENCE_PATH: '/tmp/phase3-evidence',
      }),
      /CONTROL_PLANE_TOKEN is required/,
    );
  });

  it('rejects a relative evidence path and a plan containing a token field', async () => {
    const planPath = await planFile({ controlPlaneToken: 'must-not-be-accepted' });
    const base = {
      CONTROL_PLANE_URL: 'http://127.0.0.1:8080',
      CONTROL_PLANE_TOKEN: 'sensitive-value',
      PHASE3_BUILD_VERIFIED_SHA: '2'.repeat(40),
      PHASE3_PLAN_PATH: planPath,
    };
    await assert.rejects(
      loadPhase3CliConfig({ ...base, PHASE3_EVIDENCE_PATH: 'relative' }),
      /PHASE3_EVIDENCE_PATH must be absolute/,
    );
    await assert.rejects(
      loadPhase3CliConfig({
        ...base,
        PHASE3_PLAN_PATH: await planFile(),
        PHASE3_EVIDENCE_PATH: '/tmp/..',
      }),
      /not a filesystem root/,
    );
    await assert.rejects(
      loadPhase3CliConfig({ ...base, PHASE3_EVIDENCE_PATH: '/tmp/phase3-evidence' }),
      (error: unknown) => error instanceof Error && !error.message.includes('sensitive-value'),
    );
  });

  it('refuses an environment URL on a different origin from the plan', async () => {
    const planPath = await planFile();
    await assert.rejects(
      loadPhase3CliConfig({
        CONTROL_PLANE_URL: 'https://different.example',
        CONTROL_PLANE_TOKEN: 'sensitive-value',
        PHASE3_BUILD_VERIFIED_SHA: '2'.repeat(40),
        PHASE3_PLAN_PATH: planPath,
        PHASE3_EVIDENCE_PATH: '/tmp/phase3-evidence',
      }),
      /CONTROL_PLANE_URL does not match the plan origin/,
    );
  });

  it('refuses a build marker different from the plan SHA', async () => {
    const planPath = await planFile();
    await assert.rejects(
      loadPhase3CliConfig({
        CONTROL_PLANE_URL: 'http://127.0.0.1:8080',
        CONTROL_PLANE_TOKEN: 'sensitive-value',
        PHASE3_BUILD_VERIFIED_SHA: '9'.repeat(40),
        PHASE3_PLAN_PATH: planPath,
        PHASE3_EVIDENCE_PATH: '/tmp/phase3-evidence',
      }),
      /PHASE3_BUILD_VERIFIED_SHA does not match the plan SHA/,
    );
  });

  it('refuses evidence inside the Build Room, fixture repository, or a symlink into either', async () => {
    const buildRoot = await mkdtemp(join(tmpdir(), 'phase3-build-root-'));
    const founderOsRoot = await mkdtemp(join(tmpdir(), 'phase3-founder-os-root-'));
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'phase3-fixture-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'phase3-evidence-link-'));
    directories.push(buildRoot, founderOsRoot, fixtureRoot, outside);
    await initGit(buildRoot);
    await initGit(founderOsRoot);
    await initGit(fixtureRoot);
    const planPath = await planFile({
      founderOs: { repository: 'MADVenturesLLC/FounderOS', path: founderOsRoot },
      fixture: {
        repository: 'MADVenturesLLC/phase3-fixture',
        path: fixtureRoot,
        sha: '3'.repeat(40),
      },
    });
    const base = {
      CONTROL_PLANE_URL: 'http://127.0.0.1:8080',
      CONTROL_PLANE_TOKEN: 'sensitive-value',
      PHASE3_BUILD_VERIFIED_SHA: '2'.repeat(40),
      PHASE3_PLAN_PATH: planPath,
    };

    for (const evidencePath of [
      join(founderOsRoot, 'evidence'),
      join(buildRoot, 'evidence'),
      join(fixtureRoot, 'evidence'),
    ]) {
      await assert.rejects(
        loadPhase3CliConfig({ ...base, PHASE3_EVIDENCE_PATH: evidencePath }, buildRoot),
        /outside FounderOS, Build Room, and fixture repositories/,
      );
    }

    const linked = join(outside, 'linked-build-room');
    await symlink(buildRoot, linked);
    await assert.rejects(
      loadPhase3CliConfig(
        { ...base, PHASE3_EVIDENCE_PATH: join(linked, 'evidence') },
        buildRoot,
      ),
      /outside FounderOS, Build Room, and fixture repositories/,
    );
  });

  it('uses the actual fixture Git root for evidence containment', async () => {
    const buildRoot = await mkdtemp(join(tmpdir(), 'phase3-build-git-root-'));
    const fixtureRoot = await mkdtemp(join(tmpdir(), 'phase3-fixture-git-root-'));
    directories.push(buildRoot, fixtureRoot);
    await initGit(buildRoot);
    await initGit(fixtureRoot);
    const subdirectory = join(fixtureRoot, 'subdirectory');
    await mkdir(subdirectory);
    const planPath = await planFile({
      fixture: {
        repository: 'MADVenturesLLC/phase3-fixture',
        path: subdirectory,
        sha: '3'.repeat(40),
      },
    });

    await assert.rejects(
      loadPhase3CliConfig(
        {
          CONTROL_PLANE_URL: 'http://127.0.0.1:8080',
          CONTROL_PLANE_TOKEN: 'sensitive-value',
          PHASE3_BUILD_VERIFIED_SHA: '2'.repeat(40),
          PHASE3_PLAN_PATH: planPath,
          PHASE3_EVIDENCE_PATH: join(fixtureRoot, 'evidence'),
        },
        buildRoot,
      ),
      /repository_not_root/,
    );
    await assert.rejects(realpath(join(fixtureRoot, 'evidence')), /ENOENT/);
  });

  it('reserves the exact output before execution and refuses unusable destinations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'phase3-evidence-readiness-'));
    directories.push(root);
    const planPath = await planFile();
    const base = {
      CONTROL_PLANE_URL: 'http://127.0.0.1:8080',
      CONTROL_PLANE_TOKEN: 'sensitive-value',
      PHASE3_BUILD_VERIFIED_SHA: '2'.repeat(40),
      PHASE3_PLAN_PATH: planPath,
    };

    const regularFile = join(root, 'regular-file');
    await writeFile(regularFile, 'not a directory\n', 'utf8');
    await assert.rejects(
      loadPhase3CliConfig({ ...base, PHASE3_EVIDENCE_PATH: regularFile }),
      /EEXIST|real directory/,
    );

    const unwritable = join(root, 'unwritable');
    await mkdir(unwritable, { mode: 0o500 });
    await chmod(unwritable, 0o500);
    await assert.rejects(
      loadPhase3CliConfig({ ...base, PHASE3_EVIDENCE_PATH: unwritable }),
      /mode 0700/,
    );

    const reserved = join(root, 'reserved');
    const first = await loadPhase3CliConfig({ ...base, PHASE3_EVIDENCE_PATH: reserved });
    await first.evidenceReservation.handle.close();
    await assert.rejects(
      loadPhase3CliConfig({ ...base, PHASE3_EVIDENCE_PATH: reserved }),
      /EEXIST/,
    );
  });
});

async function initGit(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
  await execute('git', ['init', '-q', path]);
}

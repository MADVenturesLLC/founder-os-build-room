import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const SHA_RE = /^[0-9a-f]{40}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface VerifiedFixtureRepository {
  readonly realPath: string;
  readonly repository: string;
  readonly commitSha: string;
  readonly treeSha: string;
  readonly clean: true;
}

export async function resolveRepositoryRoot(path: string): Promise<string> {
  const requestedPath = await realpath(path);
  let topLevel: string;
  try {
    topLevel = await git(requestedPath, ['rev-parse', '--show-toplevel']);
  } catch {
    throw new Error('repository_unavailable');
  }
  const repositoryPath = await realpath(topLevel);
  if (repositoryPath !== requestedPath) throw new Error('repository_not_root');
  return repositoryPath;
}

export async function verifyFixtureRepository(input: {
  readonly path: string;
  readonly expectedSha: string;
  readonly expectedRepository: string;
}): Promise<VerifiedFixtureRepository> {
  if (!SHA_RE.test(input.expectedSha) || !REPOSITORY_RE.test(input.expectedRepository)) {
    throw new Error('fixture_identity_invalid');
  }

  let repositoryPath: string;
  try {
    repositoryPath = await resolveRepositoryRoot(input.path);
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message === 'repository_not_root'
        ? 'fixture_not_repository_root'
        : 'fixture_repository_unavailable',
    );
  }

  let origin: string;
  try {
    origin = await git(repositoryPath, ['remote', 'get-url', 'origin']);
  } catch {
    throw new Error('fixture_repository_unavailable');
  }
  const repository = repositoryFromOrigin(origin);
  if (repository !== input.expectedRepository) throw new Error('fixture_repository_mismatch');

  const commitSha = await git(repositoryPath, ['rev-parse', '--verify', 'HEAD^{commit}']);
  if (commitSha !== input.expectedSha) throw new Error('fixture_sha_mismatch');

  const treeSha = await git(repositoryPath, ['rev-parse', '--verify', 'HEAD^{tree}']);
  const status = await git(repositoryPath, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--ignore-submodules=none',
  ]);
  if (status !== '') throw new Error('fixture_dirty');

  return {
    realPath: repositoryPath,
    repository,
    commitSha,
    treeSha,
    clean: true,
  };
}

export async function readVerifiedRepositoryFile(
  repository: VerifiedFixtureRepository,
  relativePath: string,
  maximumBytes: number,
): Promise<string> {
  if (
    !/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(relativePath) ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes <= 0
  ) {
    throw new Error('fixture_definition_invalid_path');
  }
  const object = `${repository.commitSha}:${relativePath}`;
  let size: number;
  try {
    size = Number(await git(repository.realPath, ['cat-file', '-s', object]));
  } catch {
    throw new Error('fixture_definition_unavailable');
  }
  if (!Number.isSafeInteger(size) || size < 0 || size > maximumBytes) {
    throw new Error('fixture_definition_too_large');
  }
  try {
    const contents = await gitRaw(repository.realPath, ['cat-file', 'blob', object], maximumBytes + 1);
    if (Buffer.byteLength(contents, 'utf8') !== size) throw new Error('size_mismatch');
    return contents;
  } catch {
    throw new Error('fixture_definition_unavailable');
  }
}

function repositoryFromOrigin(origin: string): string | null {
  const scp = /^git@github\.com:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(origin);
  if (scp?.[1] !== undefined) return scp[1];
  try {
    const url = new URL(origin);
    if (
      url.hostname !== 'github.com' ||
      (url.protocol !== 'https:' && url.protocol !== 'ssh:') ||
      (url.protocol === 'https:' && url.username !== '') ||
      (url.protocol === 'ssh:' && url.username !== 'git') ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return null;
    }
    const repository = url.pathname.replace(/^\//, '').replace(/\.git$/, '');
    return REPOSITORY_RE.test(repository) ? repository : null;
  } catch {
    return null;
  }
}

async function git(path: string, args: readonly string[]): Promise<string> {
  return (await gitRaw(path, args, 64 * 1024)).trim();
}

async function gitRaw(path: string, args: readonly string[], maxBuffer: number): Promise<string> {
  const environment = phase3RepositoryGitEnvironment(process.env);

  const { stdout } = await execute(
    '/usr/bin/git',
    [
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.excludesFile=/dev/null',
      '-C',
      path,
      ...args,
    ],
    { env: environment, maxBuffer },
  );
  return stdout;
}

export function phase3RepositoryGitEnvironment(
  source: Readonly<NodeJS.ProcessEnv>,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['TMPDIR', 'TMP', 'TEMP', 'LANG']) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('LC_') && value !== undefined) environment[key] = value;
  }
  environment['GIT_OPTIONAL_LOCKS'] = '0';
  environment['GIT_TERMINAL_PROMPT'] = '0';
  environment['GIT_CONFIG_NOSYSTEM'] = '1';
  environment['GIT_CONFIG_GLOBAL'] = '/dev/null';
  return environment;
}

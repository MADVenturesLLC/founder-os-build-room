import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';

describe('Phase 3 CLI entrypoint — fail before live collaborators', () => {
  it('exits nonzero on missing configuration without touching a live surface', async () => {
    const result = await run({});
    assert.equal(result.code, 1);
    assert.match(result.stderr, /CONTROL_PLANE_URL is required/);
    assert.equal(result.stdout, '');
  });

  it('converts SIGINT into an abort signal without killing bounded cleanup', async () => {
    const source = [
      "import { withPhase3TerminationSignals } from './dist/packages/run-harness/src/phase3/cli.js';",
      'await withPhase3TerminationSignals((signal) => new Promise((resolve) => {',
      '  const timer = setInterval(() => undefined, 1000);',
      "  signal.addEventListener('abort', () => { clearInterval(timer); process.stdout.write('operator_interrupted\\n'); resolve(); }, { once: true });",
      "  process.stdout.write('ready\\n');",
      '}));',
    ].join('\n');
    const result = await signalProbe(source);
    assert.equal(result.code, 0, JSON.stringify(result));
    assert.match(result.stdout, /operator_interrupted/);
    assert.equal(result.stderr, '');
  });
});

function run(environment: Record<string, string>): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/packages/run-harness/src/phase3/cli.js'], {
      cwd: process.cwd(),
      env: {
        PATH: process.env['PATH'],
        NODE_ENV: 'test',
        ...environment,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function signalProbe(source: string): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '--eval', source], {
      cwd: process.cwd(),
      env: { PATH: process.env['PATH'], NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let signaled = false;
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk;
      if (!signaled && stdout.includes('ready\n')) {
        signaled = true;
        child.kill('SIGINT');
      }
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

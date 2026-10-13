/**
 * The Linux redaction key source (`SystemdCredsHmacKeyCustody`): read-only,
 * by an argv that names only public things, with the key back on stdout only
 * (Linux Gateway design note §4.6; Founder act
 * FOUNDER-ACT-20261012-BR-LINUX-GATEWAY-IMPLEMENTATION B3.3).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CommandResult, CommandRunner } from '../packages/redaction/src/index.js';
import {
  REDACTION_CREDENTIAL_NAME,
  SystemdCredsHmacKeyCustody,
  defaultRedactionCredentialPath,
  SystemdCredsReadRunner,
  systemdCredsReadEnvironment,
} from '../packages/run-harness/src/redaction-key-linux.js';

const KEY_HEX = 'ab'.repeat(32);

class ScriptedRunner implements CommandRunner {
  readonly argvLog: string[][] = [];
  constructor(private readonly result: CommandResult | Error) {}
  async run(args: readonly string[]): Promise<CommandResult> {
    this.argvLog.push([...args]);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

function withCredentialFile<T>(body: (path: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), 'redaction-creds-'));
  const path = join(root, 'hmac-v1.cred');
  writeFileSync(path, 'c2VhbGVk\n', { mode: 0o600 });
  return body(path).finally(() => rmSync(root, { recursive: true, force: true }));
}

describe('redaction-key-systemd-creds', () => {
  it('reads a missing credential as absent, without running the tool', async () => {
    const runner = new ScriptedRunner({ code: 0, stdout: KEY_HEX, stderr: '' });
    const load = await new SystemdCredsHmacKeyCustody(runner, join(tmpdir(), 'no-such-dir', 'hmac-v1.cred')).load();
    assert.equal(load.kind, 'absent');
    assert.equal(runner.argvLog.length, 0);
  });

  it('loads the key, by an argv of public values only', async () => {
    await withCredentialFile(async (path) => {
      const runner = new ScriptedRunner({ code: 0, stdout: KEY_HEX, stderr: '' });
      const custody = new SystemdCredsHmacKeyCustody(runner, path);
      const load = await custody.load();
      assert.equal(load.kind, 'loaded');
      assert.equal(load.kind === 'loaded' && load.key.toString('hex'), KEY_HEX);
      assert.deepEqual(runner.argvLog, [['--user', `--name=${REDACTION_CREDENTIAL_NAME}`, '--newline=no', 'decrypt', path, '-']]);
      assert.ok(!JSON.stringify(runner.argvLog).includes(KEY_HEX), 'the key is never in argv');
    });
  });

  it('is unavailable when the tool refuses, and never carries its stdout', async () => {
    await withCredentialFile(async (path) => {
      const runner = new ScriptedRunner({ code: 1, stdout: KEY_HEX, stderr: 'Bad credential format.' });
      const load = await new SystemdCredsHmacKeyCustody(runner, path).load();
      assert.equal(load.kind, 'unavailable');
      assert.ok(load.kind === 'unavailable' && !load.detail.includes(KEY_HEX));
    });
  });

  it('is unavailable when the tool cannot run, or the key is malformed or short', async () => {
    await withCredentialFile(async (path) => {
      for (const result of [new Error('spawn ENOENT'), { code: 0, stdout: 'not-hex', stderr: '' }, { code: 0, stdout: 'ab'.repeat(8), stderr: '' }]) {
        const load = await new SystemdCredsHmacKeyCustody(new ScriptedRunner(result), path).load();
        assert.equal(load.kind, 'unavailable');
      }
    });
  });

  it('keeps the key under the macOS-style root the Founder kept on Linux (ruling R2)', () => {
    assert.equal(
      defaultRedactionCredentialPath(),
      join(homedir(), 'Library', 'Application Support', 'founder-os', 'redaction', 'hmac-v1.cred'),
    );
  });
});

describe('redaction-key-systemd-creds · the tool inherits no secret from the environment', () => {
  it('passes only the non-secret allowlist', () => {
    assert.deepEqual(
      systemdCredsReadEnvironment({ PATH: '/usr/bin', LANG: 'C.UTF-8', CONTROL_PLANE_TOKEN: 'not-a-real-token' }),
      { PATH: '/usr/bin', LANG: 'C.UTF-8' },
    );
  });

  it('spawns the tool without the caller\'s CONTROL_PLANE_TOKEN', async () => {
    const before = process.env['CONTROL_PLANE_TOKEN'];
    process.env['CONTROL_PLANE_TOKEN'] = 'not-a-real-token';
    try {
      const result = await new SystemdCredsReadRunner('/usr/bin/env').run([]);
      assert.equal(result.code, 0);
      assert.ok(!result.stdout.includes('CONTROL_PLANE_TOKEN'), 'the token is not inherited');
      assert.match(result.stdout, /^PATH=/m);
    } finally {
      if (before === undefined) delete process.env['CONTROL_PLANE_TOKEN'];
      else process.env['CONTROL_PLANE_TOKEN'] = before;
    }
  });
});

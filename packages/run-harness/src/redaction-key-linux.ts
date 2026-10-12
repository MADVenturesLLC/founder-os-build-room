/**
 * The redaction HMAC key on Linux: a read-only `systemd-creds` credential
 * (Linux Gateway design note §4.6; Founder act
 * FOUNDER-ACT-20261012-BR-LINUX-GATEWAY-IMPLEMENTATION B3.3).
 *
 * It lives in the run-harness, beside the one switch that chooses it
 * (`redaction-boundary.ts`), and implements the redaction package's
 * `HmacKeyCustody` interface. The redaction package itself is byte-pinned and
 * unchanged. Like the Keychain source, this module reads only: minting the
 * credential is a Founder custody act, e.g.
 *
 *   systemd-creds --user --with-key=host+tpm2 --name=hmac-v1 encrypt - <path>
 *
 * with the 64 hex characters typed or piped on standard input, never in argv.
 * The key mode is the one the PC's preflight fixed for the Gateway's key.
 *
 * Like `redaction-boundary.ts`, this module imports nothing from the daemon.
 */

import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  MIN_HMAC_KEY_BYTES,
  type CommandResult,
  type CommandRunner,
  type HmacKeyCustody,
  type HmacKeyLoad,
} from '../../redaction/src/index.js';

/** The credential name sealed into the key's ciphertext and checked on decryption. */
export const REDACTION_CREDENTIAL_NAME = 'hmac-v1';

/**
 * Where the key lives: beside the Gateway's directory, under the macOS-style
 * root the Founder's ruling R2 keeps on Linux.
 */
export function defaultRedactionCredentialPath(): string {
  return join(homedir(), 'Library', 'Application Support', 'founder-os', 'redaction', `${REDACTION_CREDENTIAL_NAME}.cred`);
}

/** The real runner: `/usr/bin/systemd-creds`, spawned with an argv array, no shell. */
export class SystemdCredsReadRunner implements CommandRunner {
  constructor(private readonly binary = '/usr/bin/systemd-creds') {}

  run(args: readonly string[]): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
    });
  }
}

/**
 * Read-only Linux custody. The argv it builds is exactly
 * `--user --name=hmac-v1 --newline=no decrypt <path> -`: the path is public,
 * and the key comes back only on standard output. A missing file is `absent`;
 * any other failure is `unavailable`. The value must be hex of even length
 * decoding to at least `MIN_HMAC_KEY_BYTES`, as the Keychain source requires.
 */
export class SystemdCredsHmacKeyCustody implements HmacKeyCustody {
  constructor(
    private readonly runner: CommandRunner,
    private readonly path: string = defaultRedactionCredentialPath(),
    private readonly name: string = REDACTION_CREDENTIAL_NAME,
  ) {}

  readArgs(): readonly string[] {
    return ['--user', `--name=${this.name}`, '--newline=no', 'decrypt', this.path, '-'];
  }

  async load(): Promise<HmacKeyLoad> {
    try {
      await stat(this.path);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (code === 'ENOENT') return { kind: 'absent', detail: `no ${this.name} credential` };
      return { kind: 'unavailable', detail: `the ${this.name} credential could not be checked: ${code || 'unknown error'}` };
    }
    let result: CommandResult;
    try {
      result = await this.runner.run(this.readArgs());
    } catch (error) {
      return { kind: 'unavailable', detail: `systemd-creds runner failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (result.code !== 0) {
      // stderr names the credential and the failure, never the key; stdout is not carried.
      return { kind: 'unavailable', detail: `systemd-creds exited ${result.code}: ${result.stderr.trim()}` };
    }
    const hex = result.stdout.trim();
    if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
      return { kind: 'unavailable', detail: 'custody item is not hex-encoded' };
    }
    const key = Buffer.from(hex, 'hex');
    if (key.byteLength < MIN_HMAC_KEY_BYTES) {
      return { kind: 'unavailable', detail: `custody item decodes to ${key.byteLength} bytes; ${MIN_HMAC_KEY_BYTES} required` };
    }
    return { kind: 'loaded', key };
  }
}

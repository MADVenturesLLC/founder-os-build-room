/**
 * An emulator of the `systemd-creds --user encrypt|decrypt` surface the
 * Linux custody backend uses, for suites that run where the real tool cannot:
 * every hosted CI runner (systemd older than 256, no TPM).
 *
 * It lives in the test tree, never in a package. Production constructs
 * `SystemdCredsCommandRunner` and nothing else, through the one factory.
 *
 * The emulated semantics are the ones the backend depends on:
 *   - `encrypt` seals the plaintext under the `--name=` given, and output is
 *     Base64 text that does not contain the plaintext;
 *   - `decrypt` refuses a credential whose embedded name is not the `--name=`
 *     given, as the real tool does;
 *   - `--user` is required, and `encrypt` accepts only `--with-key=host+tpm2`
 *     (the PC's preflight refused `tpm2` alone in `--user` scope);
 *   - with `--newline=no`, decrypt output is the plaintext exactly.
 */

import { createHash } from 'node:crypto';
import type { CommandResult, CredsRunner } from '../packages/gateway-daemon/src/index.js';

interface Sealed {
  readonly v: 1;
  readonly name: string;
  readonly key: string;
  /** XOR-masked, Base64: the plaintext never appears in the ciphertext. */
  readonly data: string;
}

const MASK = createHash('sha256').update('fake-systemd-creds-mask').digest();

function mask(bytes: Buffer): Buffer {
  return Buffer.from(bytes.map((byte, index) => byte ^ MASK[index % MASK.length]!));
}

function optionValue(args: readonly string[], option: string): string | null {
  const prefix = `--${option}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found === undefined ? null : found.slice(prefix.length);
}

export class FakeSystemdCredsRunner implements CredsRunner {
  /** Every argv this runner was handed, for assertions. Never the stdin. */
  readonly argvLog: string[][] = [];
  /** Every stdin this runner was handed, so suites can prove where secrets went. */
  readonly stdinLog: string[] = [];

  async run(args: readonly string[], stdin: string): Promise<CommandResult> {
    this.argvLog.push([...args]);
    this.stdinLog.push(stdin);
    if (!args.includes('--user')) return { code: 1, stdout: '', stderr: 'fake: --user required' };
    const name = optionValue(args, 'name');
    if (name === null || name === '') return { code: 1, stdout: '', stderr: 'fake: --name required' };

    if (args.includes('encrypt')) {
      const key = optionValue(args, 'with-key');
      if (key === 'tpm2') {
        return { code: 1, stdout: '', stderr: 'Selected key not available in --uid= scoped mode, refusing.' };
      }
      if (key !== 'host+tpm2') return { code: 1, stdout: '', stderr: `fake: key mode ${String(key)} refused` };
      const sealed: Sealed = { v: 1, name, key, data: mask(Buffer.from(stdin, 'utf8')).toString('base64') };
      return { code: 0, stdout: `${Buffer.from(JSON.stringify(sealed)).toString('base64')}\n`, stderr: '' };
    }

    if (args.includes('decrypt')) {
      let sealed: Sealed;
      try {
        sealed = JSON.parse(Buffer.from(stdin.trim(), 'base64').toString('utf8')) as Sealed;
      } catch {
        return { code: 1, stdout: '', stderr: 'Bad credential format.' };
      }
      if (sealed.name !== name) {
        return {
          code: 1,
          stdout: '',
          stderr: `Embedded credential name '${sealed.name}' does not match filename '${name}', refusing.`,
        };
      }
      const plaintext = mask(Buffer.from(sealed.data, 'base64')).toString('utf8');
      return { code: 0, stdout: args.includes('--newline=no') ? plaintext : `${plaintext}\n`, stderr: '' };
    }

    return { code: 1, stdout: '', stderr: `fake: unsupported verb in ${args.join(' ')}` };
  }
}

/** A runner that fails on demand, for fault injection. */
export class FaultySystemdCredsRunner implements CredsRunner {
  failOn: ((args: readonly string[]) => CommandResult | null) | null = null;

  constructor(private readonly inner: CredsRunner) {}

  async run(args: readonly string[], stdin: string): Promise<CommandResult> {
    const injected = this.failOn?.(args) ?? null;
    if (injected !== null) return injected;
    return this.inner.run(args, stdin);
  }
}

/** A runner for a machine where `systemd-creds --user` cannot work at all. */
export class UnavailableSystemdCredsRunner implements CredsRunner {
  async run(): Promise<CommandResult> {
    return { code: 1, stdout: '', stderr: 'Failed to connect to io.systemd.Credentials' };
  }
}

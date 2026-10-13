/**
 * Linux custody: `systemd-creds --user`, sealed with the host key and the TPM
 * (Linux Gateway design note §4; Founder act
 * FOUNDER-ACT-20261012-BR-LINUX-GATEWAY-IMPLEMENTATION B2, B3.1).
 *
 * Each item is one encrypted credential file in the custody directory, mode
 * 0700, each file mode 0600. Only ciphertext reaches the disk. The key mode is
 * `host+tpm2`: the PC's preflight of 2026-10-12 showed `--with-key=tpm2` alone
 * refused in `--user` scope ("Selected key not available in --uid= scoped
 * mode") and `host+tpm2` round-tripping. A credential so sealed decrypts only
 * on this machine, for this user, with both its TPM and its host key. The
 * mode is never `auto`, which can silently leave the TPM out, and never
 * `null`.
 *
 * Every credential carries its name inside the ciphertext (`--name=`), and
 * decryption checks it. So promotion never moves the staging file: it
 * decrypts staging and encrypts the secret afresh under the primary name.
 *
 * The guarantees are the Keychain backend's, each kept here by a file-system
 * operation that cannot be half-done:
 *
 *   - staging creation writes the ciphertext to a fresh temporary file and
 *     `link(2)`s it to the staging name, which fails with EEXIST when the
 *     name exists, atomically: no path can replace a staging item, and no
 *     partial staging file can exist;
 *   - promotion replaces `primary.cred` by `rename(2)`, the counterpart of
 *     `security -U` and its only use;
 *   - every write is verified by decrypting it back, and staging is deleted
 *     only after primary reads back;
 *   - a deletion is verified by the file being gone.
 *
 * The secret reaches `systemd-creds` only on standard input and comes back
 * only on standard output. The tool is spawned by absolute path with an argv
 * array and no shell. Error details keep the tool's standard error, never its
 * standard output.
 */

import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, link, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  CustodyError,
  PROBE_ACCOUNT,
  type CommandResult,
  type CustodyAccount,
  type CustodyInventory,
  type GatewayCustody,
} from './custody.js';
import { DIRECTORY_MODE, FILE_MODE } from './paths.js';

export const SYSTEMD_CREDS_BINARY = '/usr/bin/systemd-creds';

/** Fixed by the PC's preflight; see the header. */
export const SYSTEMD_CREDS_KEY_MODE = 'host+tpm2';

/** The file suffix of a credential in the custody directory. */
export const CREDENTIAL_SUFFIX = '.cred';

/**
 * The command runner. Injected so the suites can assert the argv built and
 * run the backend against a fake on machines without `systemd-creds --user`,
 * which includes every hosted CI runner.
 */
export interface CredsRunner {
  run(args: readonly string[], stdin: string): Promise<CommandResult>;
}

/** The real runner: `/usr/bin/systemd-creds`, spawned, with no shell anywhere. */
/**
 * The environment `systemd-creds` is given: an allowlist of non-secret
 * variables, nothing else. The tool needs no secret from its environment (the
 * secret travels on standard input), and inheriting the caller's whole
 * environment would hand it whatever the caller holds, such as the Phase 3
 * harness's CONTROL_PLANE_TOKEN (design note 4.3: no secret in an environment
 * variable).
 */
export const SYSTEMD_CREDS_ENV_ALLOWLIST = ['PATH', 'HOME', 'XDG_RUNTIME_DIR', 'LANG', 'LC_ALL', 'LC_CTYPE'] as const;

export function systemdCredsEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin' };
  for (const key of SYSTEMD_CREDS_ENV_ALLOWLIST) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

export class SystemdCredsCommandRunner implements CredsRunner {
  constructor(private readonly binary = SYSTEMD_CREDS_BINARY) {}

  run(args: readonly string[], stdin: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, [...args], { stdio: ['pipe', 'pipe', 'pipe'], env: systemdCredsEnvironment() });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        reject(new CustodyError('keychain_unavailable', 'the systemd-creds tool could not be run', String(error)));
      });
      child.on('close', (code) => {
        resolve({ code: code ?? -1, stdout, stderr });
      });
      // A tool that exits before draining stdin surfaces as EPIPE here; the
      // exit code and the read-back decide the outcome, as on macOS.
      child.stdin.on('error', () => undefined);
      child.stdin.end(stdin);
    });
  }
}

export class SystemdCredsCustody implements GatewayCustody {
  /**
   * @param directory  the custody directory; created mode 0700 on first write
   * @param namePrefix prefixed to every credential name and file name, so a
   *                   test suite's items can never be the Gateway's
   */
  constructor(
    private readonly runner: CredsRunner,
    private readonly directory: string,
    private readonly namePrefix: string = '',
  ) {}

  async createStaging(secret: string): Promise<void> {
    assertSingleLine(secret);
    await this.ensureDirectory();
    const sealed = await this.encrypt(this.nameOf('staging'), secret);
    const temporary = await this.writeTemporary(sealed);
    try {
      await link(temporary, this.pathOf('staging'));
    } catch (error) {
      if (errnoOf(error) === 'EEXIST') {
        throw new CustodyError('write_unverified', 'the staging item could not be created; one already exists');
      }
      throw new CustodyError('keychain_unavailable', 'the staging item could not be written', String(error));
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    await this.syncDirectory();

    if ((await this.read('staging')) !== secret) {
      throw new CustodyError('write_unverified', 'the staging item did not read back as written');
    }
  }

  /**
   * Promotion, in the Keychain backend's ruled order (correction C11): read
   * staging twice and compare; write primary, replacing any prior value; read
   * primary back; only then delete staging.
   */
  async promoteStagingToPrimary(): Promise<void> {
    const first = await this.read('staging');
    const second = await this.read('staging');
    if (first === null || first !== second) {
      throw new CustodyError('item_not_found', 'staging custody could not be read consistently');
    }

    assertSingleLine(first);
    await this.ensureDirectory();
    const sealed = await this.encrypt(this.nameOf('primary'), first);
    const temporary = await this.writeTemporary(sealed);
    try {
      await rename(temporary, this.pathOf('primary'));
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw new CustodyError('keychain_unavailable', 'the primary item could not be written', String(error));
    }
    await this.syncDirectory();

    if ((await this.read('primary')) !== first) {
      throw new CustodyError(
        'write_unverified',
        'primary did not read back as the staging value; staging is retained for retry',
      );
    }

    await this.delete('staging');
  }

  /** Read a secret, or null when the item does not exist. */
  async read(account: CustodyAccount): Promise<string | null> {
    let sealed: string;
    try {
      sealed = await readFile(this.pathOf(account), 'utf8');
    } catch (error) {
      if (errnoOf(error) === 'ENOENT') return null;
      throw new CustodyError('keychain_unavailable', `reading ${account} custody failed`, String(error));
    }
    return this.decrypt(this.nameOf(account), sealed);
  }

  async delete(account: CustodyAccount): Promise<void> {
    const path = this.pathOf(account);
    try {
      await unlink(path);
    } catch (error) {
      if (errnoOf(error) !== 'ENOENT') {
        throw new CustodyError('keychain_unavailable', `deleting ${account} custody failed`, String(error));
      }
    }
    await this.syncDirectory();

    // Verified, like every other custody mutation: the file must be gone.
    try {
      await stat(path);
    } catch (error) {
      if (errnoOf(error) === 'ENOENT') return;
      throw new CustodyError('keychain_unavailable', `checking ${account} custody failed`, String(error));
    }
    throw new CustodyError('write_unverified', `${account} custody still present after deletion`);
  }

  /**
   * Which items exist. The probe runs first, so a backend that cannot be used
   * throws `keychain_unavailable` even when no file exists yet, rather than
   * reading as "absent".
   */
  async inventory(): Promise<CustodyInventory> {
    await this.probe();
    return {
      primary: (await this.read('primary')) !== null,
      staging: (await this.read('staging')) !== null,
    };
  }

  /**
   * An encrypt and decrypt round trip of a random, non-secret value through
   * standard input and output. Nothing is written to disk.
   */
  async probe(): Promise<void> {
    const value = randomBytes(16).toString('hex');
    const name = `${this.namePrefix}${PROBE_ACCOUNT}`;
    const returned = await this.decrypt(name, await this.encrypt(name, value));
    if (returned !== value) {
      throw new CustodyError('keychain_unavailable', 'the systemd-creds round trip did not return its input');
    }
  }

  private nameOf(account: CustodyAccount): string {
    return `${this.namePrefix}${account}`;
  }

  private pathOf(account: CustodyAccount): string {
    return join(this.directory, `${this.nameOf(account)}${CREDENTIAL_SUFFIX}`);
  }

  private async encrypt(name: string, plaintext: string): Promise<string> {
    const result = await this.runner.run(
      ['--user', `--with-key=${SYSTEMD_CREDS_KEY_MODE}`, `--name=${name}`, 'encrypt', '-', '-'],
      plaintext,
    );
    if (result.code !== 0 || result.stdout.trim() === '') {
      throw new CustodyError('keychain_unavailable', 'systemd-creds could not encrypt', result.stderr);
    }
    return result.stdout;
  }

  private async decrypt(name: string, sealed: string): Promise<string> {
    const result = await this.runner.run(
      ['--user', `--name=${name}`, '--newline=no', 'decrypt', '-', '-'],
      sealed,
    );
    if (result.code !== 0) {
      // stdout is not carried: it may hold plaintext.
      throw new CustodyError('keychain_unavailable', 'systemd-creds could not decrypt', result.stderr);
    }
    return result.stdout;
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await mkdir(this.directory, { recursive: true, mode: DIRECTORY_MODE });
      await chmod(this.directory, DIRECTORY_MODE);
    } catch (error) {
      throw new CustodyError('keychain_unavailable', 'the custody directory could not be prepared', String(error));
    }
  }

  /** A fresh file in the custody directory, created exclusively, written and synced. */
  private async writeTemporary(content: string): Promise<string> {
    const path = join(this.directory, `.tmp-${randomUUID()}`);
    try {
      const handle = await open(path, 'wx', FILE_MODE);
      try {
        await handle.writeFile(content, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      await unlink(path).catch(() => undefined);
      throw new CustodyError('keychain_unavailable', 'a custody file could not be written', String(error));
    }
    return path;
  }

  /** Make a link, rename or unlink durable before it is reported done. */
  private async syncDirectory(): Promise<void> {
    try {
      const handle = await open(this.directory, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (errnoOf(error) === 'ENOENT') return;
      throw new CustodyError('keychain_unavailable', 'the custody directory could not be synced', String(error));
    }
  }
}

function errnoOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;
}

/**
 * Refuse a secret carrying a newline, as the Keychain backend does. That
 * backend must (the `security` prompt reads one line); this one could store
 * it, but the two backends keep one behaviour (design note 4.3), so a secret
 * one refuses is never held by the other.
 */
function assertSingleLine(secret: string): void {
  if (/[\r\n]/.test(secret)) {
    throw new CustodyError(
      'write_unverified',
      'a custody secret may not contain a newline: both custody backends hold one-line secrets',
    );
  }
}

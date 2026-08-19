/**
 * Keychain custody (contract §14).
 *
 * Verified live on the target machine on 2026-08-18, and one of those
 * observations shapes this whole module: **`security` can exit 0 on a failed
 * interactive write** (observed with a mismatched retype). So an exit code is
 * never trusted on its own. Every custody write is verified by reading the
 * value back and comparing it, and nothing is deleted until a read-back has
 * succeeded.
 *
 * Two write forms exist and they are not interchangeable:
 *
 *   - **staging creation** uses `add-generic-password` WITHOUT `-U`, so an
 *     existing staging item makes creation FAIL. No path may update an existing
 *     staging item — that was the defect behind correction B1, where two
 *     concurrent enrolments could each believe they were the first and the
 *     second silently replaced the first machine's only private key after its
 *     enrolment had already reached `awaiting_approval`.
 *   - **primary promotion** uses `-U`, where replacement is the intent. This is
 *     the sole permitted `-U` use in the contract.
 *
 * Fail-closed: if Keychain custody is unavailable at enrolment, `enroll`
 * refuses and `doctor` says why. There is no plaintext-file fallback.
 */

import { spawn } from 'node:child_process';

export const KEYCHAIN_SERVICE = 'com.madventures.buildroom.gateway';

export type CustodyAccount = 'primary' | 'staging';

/** `security` exits 44 when the item does not exist. */
export const ITEM_NOT_FOUND_EXIT = 44;

export type CustodyErrorCode = 'keychain_unavailable' | 'item_not_found' | 'write_unverified';

/**
 * A custody failure, classified.
 *
 * `detail` carries the raw tool output and is destined for a log line, never
 * for a display: `security` messages name accounts, services and sometimes
 * paths, and `doctor` is a thing people paste into messages.
 */
export class CustodyError extends Error {
  override readonly name = 'CustodyError';
  constructor(
    readonly code: CustodyErrorCode,
    message: string,
    readonly detail: string = '',
  ) {
    super(message);
  }
}

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * The command runner. Injected so the suites can assert what argv was built —
 * which is how `enroll-never-puts-code-in-argv` is checkable at all — and so
 * the cross-process lock suite can run on a machine without a Keychain.
 */
export interface KeychainRunner {
  run(args: readonly string[], stdin?: string): Promise<CommandResult>;
}

/** The real runner: `/usr/bin/security`, spawned, with no shell anywhere. */
export class SecurityCommandRunner implements KeychainRunner {
  constructor(private readonly binary = '/usr/bin/security') {}

  run(args: readonly string[], stdin?: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      /*
       * `spawn` with an argv array, never a shell string. A secret or a pairing
       * code interpolated into a shell command would be visible in the process
       * table and, worse, subject to shell quoting rules.
       */
      const child = spawn(this.binary, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (error) => {
        reject(new CustodyError('keychain_unavailable', 'the security tool could not be run', String(error)));
      });
      child.on('close', (code) => {
        resolve({ code: code ?? -1, stdout, stderr });
      });

      if (stdin !== undefined) child.stdin.write(stdin);
      child.stdin.end();
    });
  }
}

export interface CustodyInventory {
  readonly primary: boolean;
  readonly staging: boolean;
}

export class Custody {
  constructor(
    private readonly runner: KeychainRunner,
    private readonly service: string = KEYCHAIN_SERVICE,
  ) {}

  /**
   * Create the staging item. Fails if one already exists.
   *
   * No `-U`. The secret goes on stdin TWICE, because the interactive `-w` form
   * prompts for the password and then for a retype — and it never appears in
   * argv, where it would be readable from the process table.
   */
  async createStaging(secret: string): Promise<void> {
    assertSingleLine(secret);
    const result = await this.runner.run(
      ['add-generic-password', '-a', 'staging', '-s', this.service, '-w'],
      `${secret}\n${secret}\n`,
    );

    /*
     * The exit code is a hint, not a verdict. A non-zero exit here usually
     * means the item already exists — which is the fail-closed outcome this
     * form exists to produce — but a zero exit proves nothing, so the read-back
     * below is what decides.
     */
    const readBack = await this.read('staging');
    if (readBack !== secret) {
      throw new CustodyError(
        'write_unverified',
        result.code === 0
          ? 'the staging item did not read back as written'
          : 'the staging item could not be created; one may already exist',
        `${result.stderr}${result.stdout}`,
      );
    }
  }

  /**
   * Promotion, in the exact ruled order (correction C11).
   *
   *   1. read staging and verify the read (read twice, compare)
   *   2. write staging into primary — THIS REPLACES ANY PRIOR PRIMARY VALUE
   *   3. read primary back and verify equality
   *   4. delete staging, only after step 3 succeeds
   *
   * The guarantee is NOT that the old primary survives until the new one is
   * proven — the write in step 2 replaces it first, and saying otherwise was
   * the original defect. The guarantee is that **staging survives until primary
   * verification succeeds**, so an interruption anywhere between steps 2 and 4
   * can always be retried from staging. And the incumbent identity has already
   * been revoked by the Founder before a successor can be confirmed, so the key
   * being overwritten is no longer the authorised one.
   */
  async promoteStagingToPrimary(): Promise<void> {
    const first = await this.read('staging');
    const second = await this.read('staging');
    if (first === null || first !== second) {
      throw new CustodyError('item_not_found', 'staging custody could not be read consistently');
    }

    assertSingleLine(first);
    const written = await this.runner.run(
      ['add-generic-password', '-U', '-a', 'primary', '-s', this.service, '-w'],
      `${first}\n${first}\n`,
    );

    const readBack = await this.read('primary');
    if (readBack !== first) {
      throw new CustodyError(
        'write_unverified',
        'primary did not read back as the staging value; staging is retained for retry',
        `${written.stderr}${written.stdout}`,
      );
    }

    await this.delete('staging');
  }

  /** Read a secret, or null when the item does not exist. */
  async read(account: CustodyAccount): Promise<string | null> {
    const result = await this.runner.run([
      'find-generic-password',
      '-a',
      account,
      '-s',
      this.service,
      '-w',
    ]);
    if (result.code === ITEM_NOT_FOUND_EXIT) return null;
    if (result.code !== 0) {
      throw new CustodyError(
        'keychain_unavailable',
        `reading ${account} custody failed`,
        `${result.stderr}${result.stdout}`,
      );
    }
    // `-w` puts the secret on stdout and nothing else; the trailing newline is
    // the tool's, not the secret's.
    return result.stdout.replace(/\n$/, '');
  }

  async delete(account: CustodyAccount): Promise<void> {
    const result = await this.runner.run([
      'delete-generic-password',
      '-a',
      account,
      '-s',
      this.service,
    ]);
    if (result.code !== 0 && result.code !== ITEM_NOT_FOUND_EXIT) {
      throw new CustodyError(
        'keychain_unavailable',
        `deleting ${account} custody failed`,
        `${result.stderr}${result.stdout}`,
      );
    }
    // Verified by read-back, like every other custody mutation.
    if ((await this.read(account)) !== null) {
      throw new CustodyError('write_unverified', `${account} custody still readable after deletion`);
    }
  }

  async inventory(): Promise<CustodyInventory> {
    return {
      primary: (await this.readQuietly('primary')) !== null,
      staging: (await this.readQuietly('staging')) !== null,
    };
  }

  /** Inventory must not throw on an unavailable Keychain; `doctor` reports it. */
  private async readQuietly(account: CustodyAccount): Promise<string | null> {
    try {
      return await this.read(account);
    } catch {
      return null;
    }
  }
}

/**
 * Refuse a secret carrying a newline.
 *
 * The interactive `-w` prompt reads ONE line. A multi-line secret would be
 * silently truncated at its first newline and the item would hold a fragment of
 * a key that read back as something else — which the read-back verification
 * would catch, but as a confusing failure rather than as the plain statement it
 * is here.
 */
function assertSingleLine(secret: string): void {
  if (/[\r\n]/.test(secret)) {
    throw new CustodyError(
      'write_unverified',
      'a custody secret may not contain a newline: the security prompt reads one line',
    );
  }
}

/** The display form of a custody failure: classified, with the raw text dropped. */
export function sanitizeCustodyError(error: unknown): { code: CustodyErrorCode | 'unknown'; message: string } {
  if (error instanceof CustodyError) return { code: error.code, message: error.message };
  return { code: 'unknown', message: 'custody failed for an unclassified reason' };
}

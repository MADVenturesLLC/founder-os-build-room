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

const EXPECT_BINARY = '/usr/bin/expect';
const EXPECT_COMMAND_ENV = 'BUILDROOM_EXPECT_COMMAND';
const EXPECT_SEPARATOR = '\u001f';

/*
 * `security add-generic-password -w` requires a controlling terminal: a pipe
 * leaves it prompting forever, and `-w <password>` would expose the secret in
 * argv. `expect` is part of macOS and gives `security` a local PTY while this
 * driver reads the two password lines from its own stdin. The command vector
 * contains only executable and public Keychain metadata; the secret is never
 * placed in argv or the environment.
 */
const SECURITY_PROMPT_DRIVER = String.raw`
log_user 0
set timeout 10
set first [gets stdin]
set second [gets stdin]
set command [split $env(BUILDROOM_EXPECT_COMMAND) "\037"]
spawn -noecho {*}$command
expect {
  -re {password data for new item:} { send -- "$first\r"; exp_continue }
  -re {retype password for new item:} { send -- "$second\r"; exp_continue }
  timeout { puts stderr "security password prompt timed out"; exit 124 }
  eof { catch wait result; exit [lindex $result 3] }
}
`;

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
      const interactiveWrite = stdin !== undefined && this.binary === '/usr/bin/security' && process.platform === 'darwin';
      const command = interactiveWrite ? EXPECT_BINARY : this.binary;
      const commandArgs = interactiveWrite ? ['-c', SECURITY_PROMPT_DRIVER] : [...args];
      const env = interactiveWrite
        ? { ...process.env, [EXPECT_COMMAND_ENV]: [this.binary, ...args].join(EXPECT_SEPARATOR) }
        : process.env;
      const child = spawn(command, commandArgs, { env, stdio: ['pipe', 'pipe', 'pipe'] });

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

      /*
       * (correction 5, finding #8) The no-`-U` create is the live case: when
       * the item already exists the tool exits fast without draining stdin,
       * and the pending write surfaces as EPIPE. The exit code and the
       * read-back verification decide the outcome — the stream's own lifetime
       * never outranks that verdict.
       */
      child.stdin.on('error', () => undefined);
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
   * No `-U`. The secret goes on stdin TWICE. The real macOS runner gives
   * `security` a private PTY for its password-and-retype prompts, while the
   * secret itself never appears in argv or the environment.
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
 * The `security -w` prompt reads ONE line. A multi-line secret would be
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

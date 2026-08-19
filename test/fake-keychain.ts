/**
 * A file-backed emulator of the `security` generic-password surface.
 *
 * It exists so the custody and staging-lock suites can run anywhere, including
 * the credential-free Linux CI job, and — more importantly — so the
 * cross-process lock case can run TWO REAL PROCESSES against one shared store.
 * An in-memory double could not do that, and the property under test is
 * precisely what happens between two processes.
 *
 * It lives in the test tree, never in a package. Production constructs
 * `SecurityCommandRunner` and nothing else: there is no environment variable
 * that selects a different custody backend, which is what keeps "no
 * plaintext-file fallback" (ruling clause 2) true of the shipped code.
 *
 * The emulated semantics are the ones the contract depends on:
 *   - `add-generic-password` WITHOUT `-U` fails when the item exists
 *   - `add-generic-password` WITH `-U` replaces
 *   - `find-generic-password` exits 44 when the item is missing
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ITEM_NOT_FOUND_EXIT,
  type CommandResult,
  type KeychainRunner,
} from '../packages/gateway-daemon/src/index.js';

const ITEM_EXISTS_EXIT = 45;

export class FileKeychainRunner implements KeychainRunner {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  /** Every argv this runner has been handed, for assertions. */
  get argvLog(): readonly string[][] {
    const path = join(this.directory, 'argv.log');
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as string[]);
  }

  async run(args: readonly string[], stdin?: string): Promise<CommandResult> {
    appendFileSync(join(this.directory, 'argv.log'), `${JSON.stringify(args)}\n`);

    const command = args[0];
    const account = valueOf(args, '-a');
    const service = valueOf(args, '-s');
    if (account === null || service === null) {
      return { code: 2, stdout: '', stderr: 'missing -a or -s' };
    }
    const path = this.pathFor(service, account);

    if (command === 'add-generic-password') {
      const update = args.includes('-U');
      if (existsSync(path) && !update) {
        return { code: ITEM_EXISTS_EXIT, stdout: '', stderr: 'The specified item already exists' };
      }
      // The interactive `-w` form reads the password and a retype from stdin.
      const lines = (stdin ?? '').split('\n');
      const secret = lines[0] ?? '';
      const retype = lines[1] ?? '';
      if (secret !== retype) {
        /*
         * The observed real-world hazard: the tool can exit 0 on a failed
         * interactive write. Emulated faithfully, so the read-back verification
         * is what catches it here too.
         */
        return { code: 0, stdout: '', stderr: 'passwords do not match' };
      }
      writeFileSync(path, secret, { mode: 0o600 });
      return { code: 0, stdout: '', stderr: '' };
    }

    if (command === 'find-generic-password') {
      if (!existsSync(path)) {
        return { code: ITEM_NOT_FOUND_EXIT, stdout: '', stderr: 'could not be found' };
      }
      return { code: 0, stdout: `${readFileSync(path, 'utf8')}\n`, stderr: '' };
    }

    if (command === 'delete-generic-password') {
      if (!existsSync(path)) {
        return { code: ITEM_NOT_FOUND_EXIT, stdout: '', stderr: 'could not be found' };
      }
      rmSync(path);
      return { code: 0, stdout: '', stderr: '' };
    }

    return { code: 1, stdout: '', stderr: `unsupported command ${String(command)}` };
  }

  private pathFor(service: string, account: string): string {
    return join(this.directory, `${service}.${account}.secret`);
  }
}

function valueOf(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

/**
 * A runner that fails on demand, for the fault-injected recovery matrix.
 *
 * `failOn` is checked against the command name plus the account, so a test can
 * make exactly the primary write fail while the staging read still works —
 * which is how the promotion-order guarantee is checked at each step.
 */
export class FaultyKeychainRunner implements KeychainRunner {
  failOn: ((args: readonly string[]) => CommandResult | null) | null = null;

  constructor(private readonly inner: KeychainRunner) {}

  async run(args: readonly string[], stdin?: string): Promise<CommandResult> {
    const injected = this.failOn?.(args) ?? null;
    if (injected !== null) return injected;
    return this.inner.run(args, stdin);
  }
}

/**
 * HMAC key custody for the redaction boundary.
 *
 * The key lives in its OWN Keychain custody item — service
 * `mad.redaction.hmac`, account `hmac-v1` — separate from the gateway
 * daemon's `com.madventures.buildroom.gateway` items. This module reads only.
 * It never creates, updates, or deletes an item: minting the key is a
 * custody act (AGENTS.md: agents do not self-provision secrets), performed by
 * the Founder or under a Founder authorization, e.g.
 *
 *   security add-generic-password -a hmac-v1 -s mad.redaction.hmac -w <64 hex chars>
 *
 * and this package refuses to write until the item exists. That is the
 * fail-closed rule of the act: key unloadable → refuse write.
 *
 * `packages/gateway-daemon/**` is not imported and not modified. The runner
 * interface is shaped like the daemon's `KeychainRunner` so the same kind of
 * injected runner can drive both, but it is declared here so this package
 * carries no daemon dependency.
 */

import { spawn } from 'node:child_process';
import { MIN_HMAC_KEY_BYTES } from './redactor.js';

export const REDACTION_KEYCHAIN_SERVICE = 'mad.redaction.hmac';
export const REDACTION_KEYCHAIN_ACCOUNT = 'hmac-v1';

/** `security` exits 44 when the item does not exist (same fact the daemon's custody records). */
export const ITEM_NOT_FOUND_EXIT = 44;

export type HmacKeyLoad =
  | { readonly kind: 'loaded'; readonly key: Buffer }
  | { readonly kind: 'absent'; readonly detail: string }
  | { readonly kind: 'unavailable'; readonly detail: string };

export interface HmacKeyCustody {
  load(): Promise<HmacKeyLoad>;
}

export interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Injected so the suites can assert argv and never touch a real Keychain. */
export interface CommandRunner {
  run(args: readonly string[]): Promise<CommandResult>;
}

/** The real runner: `/usr/bin/security`, spawned with an argv array, no shell. */
export class SecurityCommandRunner implements CommandRunner {
  constructor(private readonly binary = '/usr/bin/security') {}

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
 * Read-only Keychain custody. The argv it builds is exactly
 * `find-generic-password -a hmac-v1 -s mad.redaction.hmac -w`; the value is
 * expected as hex and must decode to at least 32 bytes.
 */
export class KeychainHmacKeyCustody implements HmacKeyCustody {
  constructor(
    private readonly runner: CommandRunner,
    private readonly service: string = REDACTION_KEYCHAIN_SERVICE,
    private readonly account: string = REDACTION_KEYCHAIN_ACCOUNT,
  ) {}

  readArgs(): readonly string[] {
    return ['find-generic-password', '-a', this.account, '-s', this.service, '-w'];
  }

  async load(): Promise<HmacKeyLoad> {
    let result: CommandResult;
    try {
      result = await this.runner.run(this.readArgs());
    } catch (error) {
      return { kind: 'unavailable', detail: `keychain runner failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (result.code === ITEM_NOT_FOUND_EXIT) {
      return { kind: 'absent', detail: `no ${this.service}/${this.account} item` };
    }
    if (result.code !== 0) {
      // The tool's stderr names services and accounts, never the key; it is
      // safe to carry as detail. The stdout is not carried: on an unknown exit
      // code its content is unknown.
      return { kind: 'unavailable', detail: `security exited ${result.code}: ${result.stderr.trim()}` };
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

/** Fixture custody: a key held in memory. For tests and controlled fixtures only. */
export class InMemoryHmacKeyCustody implements HmacKeyCustody {
  constructor(private readonly key: Buffer | null) {}

  load(): Promise<HmacKeyLoad> {
    if (this.key === null) return Promise.resolve({ kind: 'absent', detail: 'fixture custody holds no key' });
    return Promise.resolve({ kind: 'loaded', key: Buffer.from(this.key) });
  }
}

/** Fixture custody that fails the way a broken Keychain does. */
export class UnavailableHmacKeyCustody implements HmacKeyCustody {
  constructor(private readonly detail = 'fixture custody is unavailable') {}

  load(): Promise<HmacKeyLoad> {
    return Promise.resolve({ kind: 'unavailable', detail: this.detail });
  }
}

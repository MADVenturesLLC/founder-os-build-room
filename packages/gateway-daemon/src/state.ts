/**
 * `state.json` — public metadata only (contract §15).
 *
 * What is NOT here is the point: no private key material, ever. Keys exist in
 * Keychain accounts and in process memory and nowhere else. This file holds
 * gateway ids, key ids, fingerprints, lane states, and the last states the
 * server reported — everything needed to resume after a restart, and nothing
 * that would matter if the file were read.
 *
 * Writes are atomic: a temporary file in the same directory, fsynced, then
 * renamed over the target. A partially written state file after a crash would
 * be worse than none, because a daemon would boot believing a half-truth about
 * which identity it holds.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { DIRECTORY_MODE, FILE_MODE, type GatewayPaths } from './paths.js';

export type PrimaryLaneState =
  | 'IDLE'
  | 'SESSION_STARTING'
  | 'HEARTBEATING'
  | 'TRANSPORT_RETRY'
  | 'REVOKED'
  | 'HALTED';

export type StagingLaneState =
  | 'INACTIVE'
  | 'PENDING_REDEEM'
  | 'AWAITING'
  | 'PROMOTED'
  | 'REFUSED'
  | 'TRANSPORT_RETRY'
  | 'HALTED';

export interface LaneIdentity {
  readonly gatewayId: string | null;
  readonly keyId: string | null;
  readonly fingerprint: string | null;
}

export interface GatewayState {
  readonly version: 1;
  readonly primary: {
    readonly lane: PrimaryLaneState;
    readonly identity: LaneIdentity;
    readonly lastServerState: string | null;
    readonly lastObservedAt: string | null;
  };
  readonly staging: {
    readonly lane: StagingLaneState;
    readonly identity: LaneIdentity;
    /** Stable across the whole 24 h retry horizon, so a retry stays a retry. */
    readonly idempotencyKey: string | null;
    readonly redeemStartedAt: string | null;
    readonly lastServerState: string | null;
    readonly lastObservedAt: string | null;
  };
  /** The most recent classified refusal, for `doctor`. Never raw tool output. */
  readonly lastRejection: { readonly code: string; readonly at: string } | null;
}

export function emptyState(): GatewayState {
  return {
    version: 1,
    primary: {
      lane: 'IDLE',
      identity: { gatewayId: null, keyId: null, fingerprint: null },
      lastServerState: null,
      lastObservedAt: null,
    },
    staging: {
      lane: 'INACTIVE',
      identity: { gatewayId: null, keyId: null, fingerprint: null },
      idempotencyKey: null,
      redeemStartedAt: null,
      lastServerState: null,
      lastObservedAt: null,
    },
    lastRejection: null,
  };
}

/**
 * Whether persisted state holds an unresolved staging enrolment.
 *
 * One of the three enrolment-guard conditions. "Unresolved" means anything
 * other than `INACTIVE`: pending, awaiting, retrying, promoted-but-incomplete,
 * or halted. A halted lane counts as unresolved deliberately — it is the state
 * that most needs a human, and letting a second `enroll` past it would destroy
 * the evidence.
 */
export function hasUnresolvedStaging(state: GatewayState): boolean {
  return state.staging.lane !== 'INACTIVE';
}

export class GatewayStateStore {
  constructor(private readonly paths: GatewayPaths) {}

  async read(): Promise<GatewayState> {
    try {
      const raw = await readFile(this.paths.statePath, 'utf8');
      const parsed = JSON.parse(raw) as GatewayState;
      if (parsed.version !== 1) return emptyState();
      return { ...emptyState(), ...parsed };
    } catch {
      // A missing or unreadable state file is an empty state, not a failure:
      // the first boot has no state, and a corrupt one must not wedge the
      // daemon into a shape only a file edit could fix.
      return emptyState();
    }
  }

  /** Atomic tmp+rename, fsynced, mode 0600. */
  async write(state: GatewayState): Promise<void> {
    await mkdir(this.paths.directory, { recursive: true, mode: DIRECTORY_MODE });
    const temporary = join(this.paths.directory, `.state.${randomUUID()}.tmp`);

    const handle = await open(temporary, 'wx', FILE_MODE);
    try {
      await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8' });
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await rename(temporary, this.paths.statePath);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async update(mutate: (state: GatewayState) => GatewayState): Promise<GatewayState> {
    const next = mutate(await this.read());
    await this.write(next);
    return next;
  }
}

/**
 * Fixed, documented filesystem locations for the gateway host (contract §14, §15).
 *
 * Every path is derived from one base directory, and the base directory is
 * injectable. That is what lets the cross-process lock suite run two real
 * processes against a temporary directory without any of this code carrying a
 * test mode: the production entrypoint passes the real base, a test passes a
 * temporary one, and the mechanism under test is identical either way.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

/** `~/Library/Application Support/founder-os/gateway/`. */
export function defaultGatewayDirectory(): string {
  return join(homedir(), 'Library', 'Application Support', 'founder-os', 'gateway');
}

export interface GatewayPaths {
  /** Mode 0700. Everything below it lives here and nowhere else. */
  readonly directory: string;
  /** Mode 0600. Public metadata only — never private key material. */
  readonly statePath: string;
  /** Mode 0600. The cross-process staging lock. */
  readonly stagingLockPath: string;
  /** The daemon's IPC socket. */
  readonly socketPath: string;
}

export function gatewayPaths(directory: string = defaultGatewayDirectory()): GatewayPaths {
  return {
    directory,
    statePath: join(directory, 'state.json'),
    stagingLockPath: join(directory, 'staging.lock'),
    socketPath: join(directory, 'ipc.sock'),
  };
}

/** Mode for the gateway state directory. */
export const DIRECTORY_MODE = 0o700;
/** Mode for every file the gateway writes. */
export const FILE_MODE = 0o600;

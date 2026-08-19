/**
 * `status`, `providers` and `tail` (contract §16).
 */

import {
  GatewayStateStore,
  ipcRequest,
  type GatewayPaths,
} from '../../gateway-daemon/src/index.js';

export interface StatusDeps {
  readonly paths: GatewayPaths;
  readonly state: GatewayStateStore;
}

export interface StatusReport {
  readonly fromDaemon: boolean;
  readonly primary: string;
  readonly staging: string;
  readonly rendered: string;
}

/**
 * Both lanes' states, from the daemon over IPC.
 *
 * Falls back to `state.json` when no daemon answers, MARKED as such. A status
 * that silently served a stale file would be worse than no status at all: the
 * whole question it answers is whether the machine is currently doing anything.
 */
export async function runStatus(deps: StatusDeps): Promise<StatusReport> {
  const response = await ipcRequest(deps.paths.socketPath, { op: 'status' });

  if (response.ok) {
    const primary = (response.body['primary'] as Record<string, unknown> | undefined) ?? {};
    const staging = (response.body['staging'] as Record<string, unknown> | undefined) ?? {};
    const primaryLane = String(primary['lane'] ?? 'unknown');
    const stagingLane = String(staging['lane'] ?? 'unknown');
    return {
      fromDaemon: true,
      primary: primaryLane,
      staging: stagingLane,
      rendered: `primary: ${primaryLane}\nstaging: ${stagingLane}`,
    };
  }

  const state = await deps.state.read();
  return {
    fromDaemon: false,
    primary: state.primary.lane,
    staging: state.staging.lane,
    rendered:
      `primary: ${state.primary.lane}\nstaging: ${state.staging.lane}\n` +
      `daemon not running — these are the last persisted lane states, not live ones`,
  };
}

/**
 * `providers` — a fail-closed stub, and deliberately not a placeholder that
 * looks like it might work later.
 *
 * No provider registry is authorized in Phase 3, and enrolment confers no
 * provider access (ruling §2). It exits 1 with the reason: a rejection posture,
 * per `DEC-20260815-12`.
 */
export function runProviders(): { readonly exitCode: number; readonly message: string } {
  return {
    exitCode: 1,
    message:
      'providers: refused. No provider registry is authorized in Phase 3, and enrolling a ' +
      'gateway confers no provider access. Provider credential custody is a Founder-reserved ' +
      'act outside this phase.',
  };
}

export interface TailDeps {
  readonly paths: GatewayPaths;
  readonly limit?: number;
}

export interface TailResult {
  readonly exitCode: number;
  readonly rendered: string;
  readonly entries: readonly Record<string, unknown>[];
}

/** Recent ring-buffer entries from the running daemon. Real, not a stub. */
export async function runTail(deps: TailDeps): Promise<TailResult> {
  const response = await ipcRequest(deps.paths.socketPath, { op: 'tail', limit: deps.limit ?? 50 });
  if (!response.ok) {
    return { exitCode: 1, rendered: `tail: ${response.reason}`, entries: [] };
  }

  const entries = (response.body['entries'] as Record<string, unknown>[] | undefined) ?? [];
  const rendered = entries
    .map((entry) => `${String(entry['at'])} ${String(entry['level'])} ${String(entry['at_'])} ${JSON.stringify(entry['fields'])}`)
    .join('\n');
  return { exitCode: 0, rendered: rendered === '' ? 'tail: no entries yet' : rendered, entries };
}

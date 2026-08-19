/**
 * `buildroom doctor` (contract §14, §16).
 *
 * A diagnosis, and only a diagnosis. `doctor` NEVER removes a staging lock —
 * not with a flag, not behind a confirmation, not on an age heuristic. An
 * earlier revision offered a confirmed recovery deletion and an independent
 * review reproduced the failure it enabled: a live holder's lock path removed,
 * a second `wx` acquire succeeding beside the still-open first handle, and two
 * processes mutating staging custody at once (correction, Appendix E B1).
 *
 * An orphaned lock is therefore a FAIL-CLOSED STOP CONDITION. It is reported,
 * with everything a person needs to resolve it out of band — after every
 * gateway process has been stopped, because removing a lock path while a live
 * process might hold its handle is the failure itself.
 *
 * Every custody error is sanitized before display: a classified code, with the
 * raw tool text redacted to a log line. `doctor` output is the kind of thing
 * people paste into messages.
 */

import {
  Custody,
  GatewayStateStore,
  isPidLive,
  readStagingLock,
  sanitizeCustodyError,
  stagingLockExists,
  ipcRequest,
  type ControlPlaneClient,
  type GatewayPaths,
} from '../../gateway-daemon/src/index.js';

export interface DoctorDeps {
  readonly paths: GatewayPaths;
  readonly custody: Custody;
  readonly client: ControlPlaneClient;
  readonly state: GatewayStateStore;
}

export interface StagingLockDiagnosis {
  readonly present: boolean;
  /** Sanitized metadata: pid, operation, acquisition time. Never the token. */
  readonly metadata: { pid: number; operation: string; acquiredAt: string } | null;
  readonly recordedPidLive: boolean | null;
  readonly stopCondition: boolean;
  readonly guidance: string | null;
}

export interface DoctorReport {
  readonly custody: { readonly primary: boolean; readonly staging: boolean; readonly error: string | null };
  readonly daemon: { readonly reachable: boolean; readonly reason: string | null };
  readonly socketPath: string;
  readonly controlPlane: { readonly reachable: boolean; readonly status: number | null };
  readonly lanes: { readonly primary: string; readonly staging: string };
  readonly lastRejection: { readonly code: string; readonly at: string } | null;
  readonly stagingLock: StagingLockDiagnosis;
  readonly stagingInventory: { readonly keychainItem: boolean; readonly persistedState: string };
}

export async function runDoctor(deps: DoctorDeps): Promise<DoctorReport> {
  let custodyState = { primary: false, staging: false };
  let custodyError: string | null = null;
  try {
    custodyState = await deps.custody.inventory();
  } catch (error) {
    custodyError = sanitizeCustodyError(error).code;
  }

  const daemon = await ipcRequest(deps.paths.socketPath, { op: 'status' });
  const state = await deps.state.read();

  let controlPlaneStatus: number | null = null;
  const challenge = await deps.client.challenge();
  if (!challenge.transport) controlPlaneStatus = challenge.status;

  return {
    custody: { ...custodyState, error: custodyError },
    daemon: { reachable: daemon.ok, reason: daemon.ok ? null : daemon.reason },
    socketPath: deps.paths.socketPath,
    controlPlane: { reachable: !challenge.transport, status: controlPlaneStatus },
    lanes: { primary: state.primary.lane, staging: state.staging.lane },
    lastRejection: state.lastRejection,
    stagingLock: await diagnoseStagingLock(deps.paths, state.staging.lane),
    stagingInventory: { keychainItem: custodyState.staging, persistedState: state.staging.lane },
  };
}

async function diagnoseStagingLock(
  paths: GatewayPaths,
  stagingLane: string,
): Promise<StagingLockDiagnosis> {
  if (!(await stagingLockExists(paths.stagingLockPath))) {
    return { present: false, metadata: null, recordedPidLive: null, stopCondition: false, guidance: null };
  }

  const metadata = await readStagingLock(paths.stagingLockPath);
  if (metadata === null) {
    return {
      present: true,
      metadata: null,
      recordedPidLive: null,
      stopCondition: true,
      guidance: STOP_CONDITION_GUIDANCE,
    };
  }

  const live = isPidLive(metadata.pid);
  return {
    present: true,
    // The ownerToken is deliberately absent: it is the credential that
    // authorises a release, and displaying it would hand it to anyone.
    metadata: { pid: metadata.pid, operation: metadata.operation, acquiredAt: metadata.acquiredAt },
    recordedPidLive: live,
    /*
     * A dead pid does NOT authorise deletion, and this field says so by being
     * a stop condition either way. Pids are reused; the guarantee is the
     * fail-closed acquire, not a liveness heuristic.
     */
    stopCondition: !live,
    guidance: live ? `a live process (pid ${metadata.pid}) holds the lock; wait for it` : STOP_CONDITION_GUIDANCE,
    ...(stagingLane === '' ? {} : {}),
  };
}

const STOP_CONDITION_GUIDANCE =
  'orphaned staging lock: this is a fail-closed stop condition. No tool removes it. ' +
  'Resolution is out-of-band Founder maintenance, performed only after every gateway ' +
  'process (CLI and daemon) has been stopped — removing the lock while a live process ' +
  'may still hold its handle would break mutual exclusion.';

export function renderDoctor(report: DoctorReport): string {
  const lines = [
    'custody',
    `  primary item: ${report.custody.primary ? 'present' : 'absent'}`,
    `  staging item: ${report.custody.staging ? 'present' : 'absent'}`,
    `  error:        ${report.custody.error ?? 'none'}`,
    'daemon',
    `  reachable:    ${report.daemon.reachable ? 'yes' : `no (${report.daemon.reason ?? 'unknown'})`}`,
    `  socket:       ${report.socketPath}`,
    'control plane',
    `  reachable:    ${report.controlPlane.reachable ? `yes (${String(report.controlPlane.status)})` : 'no'}`,
    'lanes',
    `  primary:      ${report.lanes.primary}`,
    `  staging:      ${report.lanes.staging}`,
    `  last refusal: ${report.lastRejection === null ? 'none' : `${report.lastRejection.code} at ${report.lastRejection.at}`}`,
    'staging lock',
    `  present:      ${report.stagingLock.present ? 'yes' : 'no'}`,
  ];

  if (report.stagingLock.metadata !== null) {
    lines.push(
      `  pid:          ${report.stagingLock.metadata.pid} (${report.stagingLock.recordedPidLive === true ? 'live' : 'not live'})`,
      `  operation:    ${report.stagingLock.metadata.operation}`,
      `  acquired:     ${report.stagingLock.metadata.acquiredAt}`,
    );
  }
  if (report.stagingLock.guidance !== null) lines.push(`  ${report.stagingLock.guidance}`);

  lines.push(
    'staging inventory',
    `  keychain:     ${report.stagingInventory.keychainItem ? 'present' : 'absent'}`,
    `  persisted:    ${report.stagingInventory.persistedState}`,
  );

  return lines.join('\n');
}

/**
 * `@build-room/gateway-daemon` — the macOS-local gateway host.
 *
 * Impure by design (contract §2): Keychain custody through `/usr/bin/security`,
 * two identity lanes, timers, an IPC socket and a ring buffer. It depends on
 * `@build-room/gateway-protocol` for the signed-message protocol and on nothing
 * else — the signing bytes come from the same pure module the control plane
 * verifies against.
 */

export {
  DIRECTORY_MODE,
  FILE_MODE,
  defaultGatewayDirectory,
  gatewayPaths,
  type GatewayPaths,
} from './paths.js';

export {
  Custody,
  CustodyError,
  ITEM_NOT_FOUND_EXIT,
  KEYCHAIN_SERVICE,
  SecurityCommandRunner,
  sanitizeCustodyError,
  type CommandResult,
  type CustodyAccount,
  type CustodyErrorCode,
  type CustodyInventory,
  type KeychainRunner,
} from './custody.js';

export {
  StagingLockBusy,
  acquireStagingLock,
  isPidLive,
  readStagingLock,
  stagingLockExists,
  type HeldStagingLock,
  type StagingLockMetadata,
  type StagingOperation,
} from './staging-lock.js';

export {
  GatewayStateStore,
  emptyState,
  hasUnresolvedStaging,
  type GatewayState,
  type LaneIdentity,
  type PrimaryLaneState,
  type StagingLaneState,
} from './state.js';

export {
  DISPOSITION_TABLES,
  PRIMARY_TABLE,
  PROTOCOL_INTEGRITY_CODES,
  SERVER_VOCABULARY,
  STAGING_PROBE_TABLE,
  STAGING_REDEEM_TABLE,
  disposition,
  vocabularyKey,
  type Disposition,
  type LaneTable,
} from './disposition.js';

export { ControlPlaneClient, type ControlPlaneResponse, type FetchLike } from './client.js';

export {
  buildHeartbeat,
  buildSessionStart,
  generateGatewayKeypair,
  privateKeyFromSecret,
  publicMembersOf,
  type GatewayIdentity,
  type GeneratedKeypair,
} from './signing.js';

export {
  BACKOFF_MAX_MS,
  BACKOFF_MIN_MS,
  PrimaryLane,
  REDEEM_RETRY_HORIZON_MS,
  StagingLane,
  type AcceptedRedemption,
  type LaneObservation,
  type StagingOutcome,
  type StagingRedeemRequest,
} from './lanes.js';

export { RING_CAPACITY, RingBuffer, type RingEntry } from './ring-buffer.js';
export { IpcServer, ipcRequest, type IpcHandlers, type IpcRequest, type IpcStatus } from './ipc.js';
export { createDaemonClock } from './clock.js';
export { GatewayDaemon, type GatewayDaemonDeps } from './daemon.js';

/**
 * `@build-room/gateway-daemon` — the local gateway host, on macOS and Linux.
 *
 * Impure by design (contract §2): key custody through the Keychain
 * (`/usr/bin/security`) on macOS or `systemd-creds` on Linux,
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
  PROBE_ACCOUNT,
  SecurityCommandRunner,
  UnavailableCustody,
  sanitizeCustodyError,
  type CommandResult,
  type CustodyAccount,
  type CustodyErrorCode,
  type CustodyInventory,
  type GatewayCustody,
  type KeychainRunner,
} from './custody.js';

export {
  CREDENTIAL_SUFFIX,
  SYSTEMD_CREDS_BINARY,
  SYSTEMD_CREDS_KEY_MODE,
  SystemdCredsCommandRunner,
  SystemdCredsCustody,
  systemdCredsEnvironment,
  type CredsRunner,
} from './systemd-creds-custody.js';

export { custodyDirectory, defaultGatewayCustody } from './custody-factory.js';

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

export {
  ControlPlaneClient,
  validateControlPlaneUrl,
  type ControlPlaneResponse,
  type FetchLike,
} from './client.js';

export {
  buildHeartbeat,
  buildPlannerPoll,
  buildPlannerReport,
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
  MAX_PLANNER_EXCHANGES_PER_TICK,
  PrimaryLane,
  REDEEM_RETRY_HORIZON_MS,
  StagingLane,
  type AcceptedRedemption,
  type LaneObservation,
  type PlannerRequestHandler,
  type StagingOutcome,
  type StagingRedeemRequest,
} from './lanes.js';

export { RING_CAPACITY, RingBuffer, type RingEntry } from './ring-buffer.js';

export {
  GatewayPlannerWorker,
  PlannerRecordStore,
  plannerRecordsDirectory,
  syncDirectory,
  syncMadeDirectories,
  type PlannerExecutor,
  type PlannerRecord,
  type PlannerStart,
  type PlannerWorkerDeps,
} from './planner-worker.js';
export {
  AGY_PLANNER_GATEWAY_ID,
  AGY_PLANNER_LANE,
  AGY_PLANNER_ROUTE,
  AGY_PRINT_TIMEOUT,
  AgyPlannerExecutor,
  BANNED_AGY_ARGUMENTS,
  CheckoutLeftBehindError,
  PINNED_AGY_ARGUMENTS,
  PKILL_PATH,
  PLANNER_STOP_BUDGET_MS,
  REAP_ANSWER_MS,
  REAP_RECHECK_MS,
  REAP_SETTLE_MS,
  STOP_GRACE_MS,
  agyInputLine,
  answerWithin,
  childEnvironment,
  gitCheckout,
  modelsNamed,
  isPlannerUserName,
  pgrepProbe,
  pkillReaper,
  reapCommandLine,
  remainsAfterReap,
  sha256OfFile,
  planDocumentFrom,
  plannerPrompt,
  readOnly,
  recordAbsence,
  removeCheckout,
  runChild,
  type AgyPlannerConfig,
  type AgyPlannerDeps,
  type CheckoutMaker,
  type FileHasher,
  type Launch,
  type PlannerReaper,
  type PlannerProcessProbe,
} from './agy-planner-executor.js';
export {
  boundGatewayReader,
  choosePlannerExecutor,
  plannerBootReap,
  type PlannerExecutorChoice,
  type PlannerExecutorContext,
} from './planner-executor-factory.js';
export { DaemonLockHeld, FLOCK_PATH, acquireDaemonLock, daemonLockPath, type HeldDaemonLock } from './daemon-lock.js';

/**
 * Room Runtime Phase 1 (fixture occupancy only) — the Gateway-side room
 * runtime and its stop-class errors.
 */
export {
  ExecutionCardinalityError,
  FIXTURE_RING_PATCHES,
  RoomRuntime,
  RoomRuntimeError,
  VIEWER_QUEUE_BYTES,
  VIEWER_QUEUE_FRAMES,
  type OutFrame,
  type RoomNack,
  type RoomOutcome,
  type RoomResult,
  type RoomRuntimeDeps,
} from './room-runtime.js';
export {
  IpcServer,
  SUN_PATH_MAX,
  assertSocketPathFits,
  ipcRequest,
  type IpcHandlers,
  type IpcRequest,
  type IpcStatus,
} from './ipc.js';
export { createDaemonClock } from './clock.js';
export { GatewayDaemon, type GatewayDaemonDeps } from './daemon.js';

/**
 * OMP→MAD Evolve Pack v0, Lane D — cancelable pre/post tool-call hooks,
 * policy bundles, the seat-policy hook, and the output-schema post-hook.
 * The minimal intercept surface; wired to nothing live.
 */
export * from './hooks/index.js';

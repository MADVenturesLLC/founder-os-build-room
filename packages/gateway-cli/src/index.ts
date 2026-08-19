/**
 * `@build-room/gateway-cli` — the `buildroom` five-verb surface.
 *
 * Exactly five verbs, which is the ruled commitment (`DEC-20260815-13`). The
 * binary name is implementation detail; the surface is not.
 */

export { USAGE, VERBS, isVerb, type Verb } from './verbs.js';
export { GUARD_REFUSAL, runEnroll, type EnrollDeps, type EnrollResult } from './enroll.js';
export {
  renderDoctor,
  runDoctor,
  type DoctorDeps,
  type DoctorReport,
  type StagingLockDiagnosis,
} from './doctor.js';
export {
  runProviders,
  runStatus,
  runTail,
  type StatusDeps,
  type StatusReport,
  type TailDeps,
  type TailResult,
} from './commands.js';
export {
  DAEMON_ENTRY,
  offerDaemonStart,
  spawnDaemonDetached,
  type OfferDeps,
} from './offer.js';
export { main } from './bin.js';

/**
 * Test-only pause and fault hooks.
 *
 * Contract §19 requires the concurrency cases to use deterministic coordination
 * — injected clocks, transaction pause hooks, database-enforced conflicts —
 * and forbids repeated timing races. That rules out the usual approach of
 * firing two requests and hoping the interleaving shows up: a test that passes
 * because a race happened to land is a test that will pass when the bug is back.
 *
 * So the pipelines name their boundaries, and a test can hold a pipeline at one
 * while it drives the other side. Production constructs the whole subsystem
 * with `NO_HOOKS`, every member undefined, and every call site degenerates to a
 * single `undefined` check.
 *
 * The hooks can pause and they can throw. They cannot change a verdict: nothing
 * in a pipeline reads a hook's return value, so no behaviour exists here that
 * does not exist in production.
 */

export type Hook = () => Promise<void> | void;

/**
 * The named boundaries of a fenced pipeline, in execution order.
 *
 * `commitFault` is the exception to "hooks only pause": when it throws, the
 * pipeline treats it exactly as a failed COMMIT — rollback, no durable write,
 * no staged effect applied. That is the only honest way to test the
 * commit-gated memory rule, because a commit failure cannot be provoked from
 * outside the transaction.
 */
export interface PipelineHooks {
  /** After L0 is held, before BEGIN. */
  readonly beforeTransaction?: Hook;
  /** After the L1 fence row is read and verified. */
  readonly afterFence?: Hook;
  /** Immediately before the pre-COMMIT demotion-version recheck. */
  readonly beforePreCommitRecheck?: Hook;
  /** After the pre-COMMIT recheck passed, immediately before COMMIT. */
  readonly beforeCommit?: Hook;
  /** Throwing here stands in for a failed COMMIT. */
  readonly commitFault?: Hook;
  /** After a successful COMMIT, before the post-COMMIT recheck. */
  readonly afterCommit?: Hook;
  /** After the post-COMMIT recheck passed, before staged effects are applied. */
  readonly beforePublish?: Hook;
}

/** Boundaries of the single-flight acquisition attempt (contract §7). */
export interface AcquisitionHooks {
  /** After the acquisition UPDATE returned, before the validity recheck. */
  readonly afterSql?: Hook;
  /** Before the conditional exact-generation release of an invalidated attempt. */
  readonly beforeRelease?: Hook;
  /** Throwing here stands in for a failed release; the attempt stays fail-closed. */
  readonly releaseFault?: Hook;
  /** After reconciliation, before `servingGeneration` is published. */
  readonly beforeServingPublication?: Hook;
}

/** Boundaries of demotion's phase-2 executor (contract §7). */
export interface Phase2Hooks {
  /** Before L0 is acquired. */
  readonly beforeL0?: Hook;
  /** After L0 is held, before the map clear. */
  readonly afterL0?: Hook;
  /**
   * After the map clear and L0 release, immediately before the indivisible
   * finalization block. Throwing here is the last point at which failure is
   * possible; the block itself awaits nothing and cannot fail.
   */
  readonly beforeFinalize?: Hook;
}

export interface GatewayHooks {
  readonly sessionStart?: PipelineHooks;
  readonly heartbeat?: PipelineHooks;
  readonly rotation?: PipelineHooks;
  readonly reconciliation?: PipelineHooks;
  readonly stalenessSweep?: PipelineHooks;
  readonly roomAppend?: PipelineHooks;
  readonly acquisition?: AcquisitionHooks;
  readonly phase2?: Phase2Hooks;
}

export const NO_HOOKS: GatewayHooks = {};

/** Await a hook if one is installed. One call site shape for every boundary. */
export async function runHook(hook: Hook | undefined): Promise<void> {
  if (hook === undefined) return;
  await hook();
}

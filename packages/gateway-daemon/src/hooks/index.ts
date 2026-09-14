/**
 * Gateway tool-call hooks — barrel (OMP→MAD Evolve Pack v0, Lane D).
 *
 * The minimal intercept surface: an interceptor, policy bundles, the
 * seat-policy hook, and the output-schema post-hook. Wired to nothing live;
 * no socket, no process, no environment read, no provider.
 */

export {
  DEFAULT_HOOK_TIMEOUT_MS,
  INTERCEPTOR_BLOCK_CODES,
  INTERCEPT_OUTCOMES,
  InterceptorConfigError,
  PRE_HOOK_DECISIONS,
  TOOL_CLASSES,
  ToolCallInterceptor,
  isCleanDispatch,
  isToolClass,
  malformedCallField,
  type Dispatcher,
  type InterceptOutcome,
  type InterceptorOptions,
  type InterceptorTimers,
  type NamedObservation,
  type PostHook,
  type PostObservation,
  type PreHook,
  type PreHookDecision,
  type Revision,
  type ToolCall,
  type ToolClass,
} from './tool-call-hooks.js';

export {
  APPROVAL_TIERS,
  PolicyBundleError,
  PolicyBundleSet,
  matchTool,
  policyBundleHook,
  validateBundles,
  type ApprovalTier,
  type BundleGrant,
  type PolicyBundle,
  type PolicyDenyCode,
  type PolicyEvaluation,
  type RuleMatch,
  type ToolRule,
} from './policy-bundles.js';

export { SEAT_HOOK_CODES, seatPolicyHook, type SeatDispatchGate } from './seat-policy-hook.js';

export { outputSchemaPostHook } from './output-schema-hook.js';

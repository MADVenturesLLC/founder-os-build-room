/**
 * Cancelable pre/post hooks on tool calls — the minimal intercept surface
 * (OMP→MAD Evolve Pack v0, Lane D, Founder act of 2026-09-13).
 *
 * The interceptor is the ONLY path by which a `ToolCall` reaches a
 * `Dispatcher`. Pre-hooks run in order and may `allow`, `block`, or `revise`
 * the call's arguments; the first `block` ends the pipeline and the
 * dispatcher is never invoked. Post-hooks observe the result and may flag
 * or reject it. Every hook failure is fail-closed:
 *
 *   - a pre-hook that throws, times out, or returns anything outside the
 *     closed decision set BLOCKS the call;
 *   - a `revise` may change `args` only — identity fields (`call_id`,
 *     `tool`, `tool_class`, `seat_id`, `scope`) are never taken from a hook;
 *   - a post-hook that throws or times out yields
 *     `dispatched_post_hook_failed`, which is never a clean dispatch;
 *   - an interceptor with no pre-hook cannot be built: a gate with nothing
 *     in it is not a gate.
 *
 * Hard locks (act): no second daemon, no broker.sock, no MADV_SOCKET_PATH,
 * no provider execution, no production occupancy claim, no Phase 2. This
 * module opens no socket, spawns nothing, and reads no environment; it is
 * exported from the daemon package and wired to nothing live.
 *
 * Evolved from the OMP mechanism named in the act (cancelable tool-call
 * hooks that can block or revise arguments); the closed decision and
 * outcome enums, the identity-immutability rule, timeouts as blocks, and
 * the no-empty-gate rule are this repository's own.
 */

export type ToolClass = 'read' | 'write' | 'exec';
export const TOOL_CLASSES: readonly ToolClass[] = ['read', 'write', 'exec'] as const;

export function isToolClass(value: unknown): value is ToolClass {
  return typeof value === 'string' && (TOOL_CLASSES as readonly string[]).includes(value);
}

export interface ToolCall {
  readonly call_id: string;
  /** Dotted tool name, e.g. `fs.read`, `git.commit`, `shell.exec`. */
  readonly tool: string;
  readonly tool_class: ToolClass;
  readonly args: Readonly<Record<string, unknown>>;
  /** The seat on whose behalf the call is made; `null` is unbound (and blocked by the seat hook). */
  readonly seat_id: string | null;
  /** Correlation label (room / run / execution); reference only. */
  readonly scope: string;
  /** Reference only — never adjudicated by this module (the handoff.ts rule). */
  readonly authorization_ref: string | null;
}

export type PreHookDecision =
  | { readonly decision: 'allow' }
  | { readonly decision: 'block'; readonly code: string; readonly reason: string }
  | { readonly decision: 'revise'; readonly args: Readonly<Record<string, unknown>>; readonly reason: string };

export const PRE_HOOK_DECISIONS = ['allow', 'block', 'revise'] as const;

export interface PreHook {
  readonly name: string;
  run(call: ToolCall): PreHookDecision | Promise<PreHookDecision>;
}

export interface PostObservation {
  /** Empty means clean. */
  readonly flags: readonly string[];
  /** True rejects the result outright (e.g. a strict output-schema failure). */
  readonly rejected: boolean;
}

export interface PostHook {
  readonly name: string;
  observe(call: ToolCall, result: unknown): PostObservation | Promise<PostObservation>;
}

export type Dispatcher = (call: ToolCall) => Promise<unknown>;

export interface Revision {
  readonly by: string;
  readonly reason: string;
  readonly before: Readonly<Record<string, unknown>>;
  readonly after: Readonly<Record<string, unknown>>;
}

export interface NamedObservation {
  readonly by: string;
  readonly observation: PostObservation;
}

export type InterceptOutcome =
  | {
      readonly kind: 'blocked';
      readonly call: ToolCall;
      readonly by: string;
      readonly code: string;
      readonly reason: string;
      readonly revisions: readonly Revision[];
    }
  | {
      readonly kind: 'dispatched';
      readonly call: ToolCall;
      readonly result: unknown;
      readonly revisions: readonly Revision[];
      readonly observations: readonly NamedObservation[];
    }
  | {
      readonly kind: 'dispatched_flagged';
      readonly call: ToolCall;
      readonly result: unknown;
      readonly revisions: readonly Revision[];
      readonly observations: readonly NamedObservation[];
      readonly flags: readonly string[];
    }
  | {
      readonly kind: 'dispatched_rejected';
      readonly call: ToolCall;
      readonly result: unknown;
      readonly revisions: readonly Revision[];
      readonly observations: readonly NamedObservation[];
      readonly flags: readonly string[];
      readonly rejected_by: readonly string[];
    }
  | {
      readonly kind: 'dispatched_post_hook_failed';
      readonly call: ToolCall;
      readonly result: unknown;
      readonly revisions: readonly Revision[];
      readonly observations: readonly NamedObservation[];
      readonly failed_hook: string;
      readonly error: string;
    }
  | {
      readonly kind: 'dispatch_failed';
      readonly call: ToolCall;
      readonly revisions: readonly Revision[];
      readonly error: string;
    };

export const INTERCEPT_OUTCOMES = [
  'blocked',
  'dispatched',
  'dispatched_flagged',
  'dispatched_rejected',
  'dispatched_post_hook_failed',
  'dispatch_failed',
] as const;

/** The only PASS-shaped outcome. */
export function isCleanDispatch(outcome: InterceptOutcome): boolean {
  return outcome.kind === 'dispatched';
}

/** Block codes the interceptor itself emits (hooks emit their own). */
export const INTERCEPTOR_BLOCK_CODES = {
  malformed_call: 'malformed_call',
  hook_error: 'hook_error',
  hook_timeout: 'hook_timeout',
  hook_result_invalid: 'hook_result_invalid',
} as const;

export const DEFAULT_HOOK_TIMEOUT_MS = 5_000;

export interface InterceptorTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface InterceptorOptions {
  readonly pre: readonly PreHook[];
  readonly post?: readonly PostHook[];
  readonly hookTimeoutMs?: number;
  /** Injectable for deterministic timeout tests. */
  readonly timers?: InterceptorTimers;
}

export class InterceptorConfigError extends Error {
  override readonly name = 'InterceptorConfigError';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural check of an untrusted call. Returns the offending field, or null. */
export function malformedCallField(call: unknown): string | null {
  if (!isPlainObject(call)) return 'call';
  if (typeof call.call_id !== 'string' || call.call_id === '') return 'call_id';
  if (typeof call.tool !== 'string' || !/^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/i.test(call.tool)) return 'tool';
  if (!isToolClass(call.tool_class)) return 'tool_class';
  if (!isPlainObject(call.args)) return 'args';
  if (call.seat_id !== null && typeof call.seat_id !== 'string') return 'seat_id';
  if (typeof call.scope !== 'string' || call.scope === '') return 'scope';
  if (call.authorization_ref !== null && typeof call.authorization_ref !== 'string') return 'authorization_ref';
  return null;
}

function decisionShapeError(decision: unknown): string | null {
  if (!isPlainObject(decision)) return 'decision is not an object';
  switch (decision.decision) {
    case 'allow':
      return null;
    case 'block':
      return typeof decision.code === 'string' && decision.code !== '' && typeof decision.reason === 'string'
        ? null
        : 'block requires a non-empty code and a reason';
    case 'revise':
      return isPlainObject(decision.args) && typeof decision.reason === 'string' ? null : 'revise requires plain-object args and a reason';
    default:
      return `decision ${JSON.stringify(decision.decision)} is not one of ${PRE_HOOK_DECISIONS.join(', ')}`;
  }
}

function observationShapeError(observation: unknown): string | null {
  if (!isPlainObject(observation)) return 'observation is not an object';
  if (!Array.isArray(observation.flags) || !observation.flags.every((f) => typeof f === 'string')) return 'flags must be a string array';
  if (typeof observation.rejected !== 'boolean') return 'rejected must be a boolean';
  return null;
}

export class ToolCallInterceptor {
  private readonly pre: readonly PreHook[];
  private readonly post: readonly PostHook[];
  private readonly hookTimeoutMs: number;
  private readonly timers: InterceptorTimers;

  constructor(options: InterceptorOptions) {
    if (!Array.isArray(options.pre) || options.pre.length === 0) {
      throw new InterceptorConfigError('an interceptor needs at least one pre-hook; an empty gate is not a gate');
    }
    const names = [...options.pre, ...(options.post ?? [])].map((h) => h.name);
    if (names.some((n) => typeof n !== 'string' || n === '') || new Set(names).size !== names.length) {
      throw new InterceptorConfigError('every hook needs a unique non-empty name');
    }
    if (options.hookTimeoutMs !== undefined && !(Number.isFinite(options.hookTimeoutMs) && options.hookTimeoutMs > 0)) {
      throw new InterceptorConfigError('hookTimeoutMs must be a positive number');
    }
    this.pre = [...options.pre];
    this.post = [...(options.post ?? [])];
    this.hookTimeoutMs = options.hookTimeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;
    this.timers = options.timers ?? { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout) };
  }

  hookNames(): { readonly pre: readonly string[]; readonly post: readonly string[] } {
    return { pre: this.pre.map((h) => h.name), post: this.post.map((h) => h.name) };
  }

  async intercept(candidate: ToolCall, dispatcher: Dispatcher): Promise<InterceptOutcome> {
    const revisions: Revision[] = [];
    const malformed = malformedCallField(candidate);
    if (malformed !== null) {
      return { kind: 'blocked', call: candidate, by: 'interceptor', code: INTERCEPTOR_BLOCK_CODES.malformed_call, reason: `malformed field ${malformed}`, revisions };
    }
    let call: ToolCall = { ...candidate, args: { ...candidate.args } };

    for (const hook of this.pre) {
      const ran = await this.withTimeout(() => hook.run(call), hook.name);
      if (ran.kind === 'threw') {
        return { kind: 'blocked', call, by: hook.name, code: INTERCEPTOR_BLOCK_CODES.hook_error, reason: ran.error, revisions };
      }
      if (ran.kind === 'timeout') {
        return { kind: 'blocked', call, by: hook.name, code: INTERCEPTOR_BLOCK_CODES.hook_timeout, reason: `hook exceeded ${this.hookTimeoutMs}ms`, revisions };
      }
      const decision = ran.value as PreHookDecision;
      const shape = decisionShapeError(decision);
      if (shape !== null) {
        return { kind: 'blocked', call, by: hook.name, code: INTERCEPTOR_BLOCK_CODES.hook_result_invalid, reason: shape, revisions };
      }
      if (decision.decision === 'block') {
        return { kind: 'blocked', call, by: hook.name, code: decision.code, reason: decision.reason, revisions };
      }
      if (decision.decision === 'revise') {
        // Only args are taken. Identity fields come from the call, never the hook.
        const after = { ...decision.args };
        revisions.push({ by: hook.name, reason: decision.reason, before: call.args, after });
        call = { ...call, args: after };
      }
    }

    let result: unknown;
    try {
      result = await dispatcher(call);
    } catch (error) {
      return { kind: 'dispatch_failed', call, revisions, error: describeError(error) };
    }

    const observations: NamedObservation[] = [];
    const flags: string[] = [];
    const rejectedBy: string[] = [];
    for (const hook of this.post) {
      const ran = await this.withTimeout(() => hook.observe(call, result), hook.name);
      if (ran.kind === 'threw') {
        return { kind: 'dispatched_post_hook_failed', call, result, revisions, observations, failed_hook: hook.name, error: ran.error };
      }
      if (ran.kind === 'timeout') {
        return { kind: 'dispatched_post_hook_failed', call, result, revisions, observations, failed_hook: hook.name, error: `hook exceeded ${this.hookTimeoutMs}ms` };
      }
      const observation = ran.value as PostObservation;
      const shape = observationShapeError(observation);
      if (shape !== null) {
        return { kind: 'dispatched_post_hook_failed', call, result, revisions, observations, failed_hook: hook.name, error: shape };
      }
      observations.push({ by: hook.name, observation });
      flags.push(...observation.flags.map((f) => `${hook.name}: ${f}`));
      if (observation.rejected) rejectedBy.push(hook.name);
    }
    if (rejectedBy.length > 0) {
      return { kind: 'dispatched_rejected', call, result, revisions, observations, flags, rejected_by: rejectedBy };
    }
    if (flags.length > 0) {
      return { kind: 'dispatched_flagged', call, result, revisions, observations, flags };
    }
    return { kind: 'dispatched', call, result, revisions, observations };
  }

  private withTimeout<T>(
    run: () => T | Promise<T>,
    name: string,
  ): Promise<{ kind: 'value'; value: T } | { kind: 'threw'; error: string } | { kind: 'timeout' }> {
    return new Promise((resolve) => {
      let settled = false;
      const handle = this.timers.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ kind: 'timeout' });
      }, this.hookTimeoutMs);
      const finish = (outcome: { kind: 'value'; value: T } | { kind: 'threw'; error: string }): void => {
        if (settled) return;
        settled = true;
        this.timers.clearTimeout(handle);
        resolve(outcome);
      };
      try {
        Promise.resolve(run()).then(
          (value) => finish({ kind: 'value', value }),
          (error: unknown) => finish({ kind: 'threw', error: `${name}: ${describeError(error)}` }),
        );
      } catch (error) {
        finish({ kind: 'threw', error: `${name}: ${describeError(error)}` });
      }
    });
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

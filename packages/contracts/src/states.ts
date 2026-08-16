/**
 * The Build Room lifecycle state set.
 *
 * Source of truth: `DEC-20260815-11` v0.10, `## Reproduced Lifecycle Artifacts`
 * → "The 17 states, in canonical (declaration) order".
 *
 * Declaration order is CANONICAL (Founder Ruling — Declaration Order Canonical,
 * 2026-08-15). Range expressions in the transition table resolve against the
 * index of a state in `STATES`, so the order of this array is load-bearing:
 * reordering it silently changes T18's blast radius.
 */

export const STATES = [
  'ROOM_CREATED',
  'SCOPED',
  'PLANNING',
  'PLAN_REVIEW',
  'BUILDING',
  'BLOCKED_ON_FOUNDER',
  'EVIDENCE_CAPTURE',
  'PUSHED',
  'IN_REVIEW',
  'REMEDIATION',
  'CHECKS_VERIFIED',
  'AWAITING_FOUNDER_AUTH',
  'AUTHORIZED',
  'MERGE_CONFIRMED',
  'RECONCILING',
  'CLOSED_DELIVERED',
  'CLOSED_ABANDONED',
] as const;

export type State = (typeof STATES)[number];

/**
 * Terminal set (Founder Ruling — Non-Plain Transition Semantics, ruling 1).
 * The terminal set is closed: no transition leaves either CLOSED_* state.
 */
export const TERMINAL_STATES = ['CLOSED_DELIVERED', 'CLOSED_ABANDONED'] as const;

export type TerminalState = (typeof TERMINAL_STATES)[number];

const TERMINAL_SET: ReadonlySet<State> = new Set<State>(TERMINAL_STATES);

export function isState(value: unknown): value is State {
  return typeof value === 'string' && (STATES as readonly string[]).includes(value);
}

export function isTerminal(state: State): boolean {
  return TERMINAL_SET.has(state);
}

/**
 * Canonical ordinal of a state — its index in declaration order.
 * Throws on an unknown state rather than returning -1, so a typo cannot
 * silently produce an empty or wrong range.
 */
export function ordinal(state: State): number {
  const index = (STATES as readonly string[]).indexOf(state);
  if (index === -1) {
    throw new RangeError(`not a lifecycle state: ${String(state)}`);
  }
  return index;
}

/**
 * Inclusive range over declaration order, as used by T18's `{PUSHED..AUTHORIZED}`.
 * Founder Ruling — Declaration Order Canonical, ruling 2 fixes that range to
 * exactly six states; `range()` is the mechanism that derives it rather than
 * hard-coding the list twice.
 *
 * The section matters: the other numbered section in the same decision,
 * `Non-Plain Transition Semantics`, has its OWN ruling 2 (the RECONCILING
 * self-loop bar), and it is the section named elsewhere in this file — so a
 * bare "ruling 2" here resolves to the wrong ruling.
 */
export function range(from: State, to: State): readonly State[] {
  const start = ordinal(from);
  const end = ordinal(to);
  if (start > end) {
    throw new RangeError(`inverted state range: ${from}..${to}`);
  }
  return STATES.slice(start, end + 1);
}

/** All non-terminal states, in canonical order. */
export const NON_TERMINAL_STATES: readonly State[] = STATES.filter((s) => !TERMINAL_SET.has(s));

/**
 * "Any non-terminal" as used by T19 and T22, with the current state excluded.
 *
 * Founder Ruling — Non-Plain Transition Semantics, ruling 2: "any non-terminal"
 * excludes the current state, which is what bars the RECONCILING -> RECONCILING
 * self-loop on T19. Applied uniformly to T19 and T22; for T22 the exclusion is
 * vacuous because its target (CLOSED_ABANDONED) is terminal and therefore never
 * a member of the non-terminal set to begin with.
 */
export function anyNonTerminalExcluding(excluded: State): readonly State[] {
  return NON_TERMINAL_STATES.filter((s) => s !== excluded);
}

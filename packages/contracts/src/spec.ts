/**
 * The spec's own declared shape, as stated in prose by `DEC-20260815-11` v0.10.
 *
 * These constants are transcribed from the DECISION TEXT, not derived from the
 * code in this package. That is the point: the conformance test asserts the
 * code's actual shape against these numbers, so a divergence between code and
 * spec fails a test instead of passing silently.
 *
 * Deriving them from the arrays would make the test tautological.
 */

export const SPEC = {
  decision: 'DEC-20260815-11',
  /** The version of the decision this package implements. */
  version: '0.10',
  /** "The 17 states, in canonical (declaration) order" */
  stateCount: 17,
  /** "**Total: 29 events.**" — supersedes the Fable package's "20-event" claim. */
  eventCount: 29,
  /**
   * "The complete set is four"
   * (Founder Ruling — Non-Plain Transition Semantics, ruling 4)
   */
  overlayFlagCount: 4,
  /** "T1–T22 transition table" */
  transitionCount: 22,
  /** "Guard identifiers G1–G22 correspond positionally to T1–T22" */
  guardCount: 22,
  /**
   * Founder Ruling — Non-Plain Transition Semantics, ruling 1:
   * CLOSED_DELIVERED + CLOSED_ABANDONED
   */
  terminalStateCount: 2,
  /**
   * Founder Ruling — Declaration Order Canonical, ruling 2:
   * "T18's range `{PUSHED..AUTHORIZED}` ... these six states"
   */
  t18RangeSize: 6,
  /** Ten rulings in total, nine of them numbered (decision Notes). */
  founderRulingCount: 10,
} as const;

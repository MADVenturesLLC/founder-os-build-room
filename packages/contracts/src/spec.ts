/**
 * The spec's own declared shape, as stated in prose by `DEC-20260815-11` v0.12
 * (FounderOS `5c5333d`; the version is the decision's frontmatter `version:`).
 *
 * These constants are transcribed from the DECISION TEXT, not derived from the
 * code in this package. That is the point: the conformance test asserts the
 * code's actual shape against these numbers, so a divergence between code and
 * spec fails a test instead of passing silently.
 *
 * Deriving them from the arrays would make the test tautological.
 *
 * v0.12 records `FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING`: row 30
 * (`runtime_room.bound`, which triggers no transition) and T17's amended
 * guard. The state, overlay, transition and guard counts are unchanged by it
 * ("The 17 states, the four overlay flags and the transitions T1 to T22 stay
 * as they are, except the T17 guard of Part C" — that ruling's B1).
 */

export const SPEC = {
  decision: 'DEC-20260815-11',
  /** The version of the decision this package implements. */
  version: '0.12',
  /** "The 17 states, in canonical (declaration) order" */
  stateCount: 17,
  /**
   * "**Total: 30 events** (29 until 2026-10-27, when
   * `FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING`, recorded below, added
   * row 30)." — supersedes the Fable package's "20-event" claim.
   */
  eventCount: 30,
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
  /**
   * "ten rulings in total, nine of them numbered" (decision `## Notes`). That
   * sentence counts the three 2026-08-15 Founder Ruling sections; the decision
   * restates no total after v0.12 added
   * `FOUNDER-RULING-20261027-LIFECYCLE-ROOM-BINDING`, so neither does this.
   */
  founderRulingCount: 10,
} as const;

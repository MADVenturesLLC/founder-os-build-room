#!/usr/bin/env bash
# tier2-shape-check.sh — Stage A ADVISORY shape-only Tier-2 review detection
# gate for the MAD Ventures OS (DEC-20260814-02, ratified 2026-08-14;
# Stage A build commissioned by the founder the same day).
#
# Pattern: "gate, never edit" (DEC-20260718-02 / path-audit.sh /
# attribution-shape-check.sh). This script reads git state and environment
# input and exits pass/fail. It never modifies anything, and it is
# SHAPE-ONLY (DEC-20260721-01 clause 5 lineage): it validates that the
# required Tier-2 marker EXISTS and is well-formed for a change whose shape
# demands one. It never judges code correctness, review quality, or whether
# the attested reviewer actually read the diff.
#
# It answers exactly one question: does the required Tier-2 marker exist
# for a change whose shape demands one? FAIL-CLOSED: if the answer cannot
# be determined, Tier-2 is flagged as required.
#
# STAGE A — ADVISORY: this check is deliberately NOT on the required-checks
# list. A failure is an alert, not a merge block. Stage B (blocking) is a
# separate, explicit founder direction per DEC-20260814-02 and does not
# ride in on any edit to this file.
#
# ---------------------------------------------------------------------------
# TIER-2 TRIGGER SURFACES (DEC-20260814-02, founder-editable; editing this
# list is itself a Tier-2 surface). Path-expressed surfaces in THIS
# repository:
#   01-constitution/      — doctrine edits are founder-authority
#   07-decisions/         — decision records
#   .github/workflows/    — CI definitions, including this gate's workflow
#   00-system/scripts/    — the check scripts themselves live here
#   13-skills/            — Phase A forbids bot self-edit of shelves
#   04-agents/            — role-boundary integrity (cross-role scope)
# The decision's remaining surfaces (kill switches, auth/permission logic,
# secret plumbing, data migrations) are code-repo surfaces; they bind when
# this gate is ported to founder-os-telegram / founder-os-console, where
# they will be expressed as that repo's paths.
TRIGGER_REGEX='^(01-constitution/|07-decisions/|\.github/workflows/|00-system/scripts/|13-skills/|04-agents/)'
#
# ---------------------------------------------------------------------------
# TIER-2 MARKER (DEC-20260814-02 ratification, 2026-08-14): a contiguous
# trailer block at column 0 in the PR body carrying BOTH lines:
#
#   Tier2-Reviewer-Id: <roster id>
#   Tier2-Head-Sha: <full 40-hex sha of the PR head this review covers>
#
# The marker uses its own Tier2- namespace and sits ABOVE the Attribution
# block — deliberately NOT inside it. The required attribution-shape-check
# prbody gate is end-anchored and admits only its four trailer names
# (Role-Id / Role-Id-Secondary / Actor-Id / Execution-Surface); a
# Reviewer-Id line inside that final block would fail a required gate.
# Extending that gate's allowlist was rejected: it would edit a ratified
# required check to accommodate an advisory one.
#
# Tier2-Head-Sha IS the head-change re-flag ruled in DEC-20260814-02: the
# marker is valid only for the exact head SHA it names. A push moves the
# head, the recorded SHA no longer matches, and the alert re-raises. No
# clock-based staleness window exists, mirroring the DEC-20260801-02 rule
# that a push voids a founder authorization.
#
# REVIEWER ROSTER (founder ratification, 2026-08-14): gemini-3.1-pro plus
# the Codex models chatgpt-5.6-sol / chatgpt-5.6-terra / chatgpt-5.6-luna
# and grok-4.5. Editing this roster requires founder direction; the
# ratification statement is recorded verbatim in DEC-20260814-02.
# Unavailability handling per DEC-20260801-02 clause 5: report the unmet
# bar with evidence — never silently waive.
REVIEWER_ROSTER_REGEX='^Tier2-Reviewer-Id:[[:space:]]*(gemini-3\.1-pro|chatgpt-5\.6-sol|chatgpt-5\.6-terra|chatgpt-5\.6-luna|grok-4\.5)[[:space:]]*$'
#
# The reviewer must be a DISTINCT identity from the change author: the
# attested Tier2-Reviewer-Id must not equal any Actor-Id value in the PR
# body. This is attestation, not verification (shared-account identity
# makes account-based distinctness unverifiable — DEC-20260814-02): the
# check validates form only, and a fabricated attestation is a governance
# violation under agent-rules §10, exactly as with the attribution gate.
#
# Usage:
#   tier2-shape-check.sh pr <base-sha> <head-sha>   (PR body via PR_BODY env)
#   tier2-shape-check.sh marker <head-sha>          (marker-only; PR_BODY env)
#   tier2-shape-check.sh classify                   (paths on stdin; prints hits)
#   tier2-shape-check.sh selftest
# Exit: 0 = pass; 1 = alert/violation (each printed); 2 = usage error.
# `classify` exits 0 with hits printed when triggered, 1 when not.
# No network, no LLM, no external dependencies: bash + git + grep only.

set -euo pipefail

MODE="${1:-}"
fail=0

# --- helpers ---------------------------------------------------------------

# classify_stdin — read newline-separated paths on stdin, print those
# matching the trigger list. Returns 0 if any matched, 1 if none.
classify_stdin() {
  local hits
  hits="$(grep -E "$TRIGGER_REGEX" || true)"
  if [[ -n "$hits" ]]; then
    printf '%s\n' "$hits"
    return 0
  fi
  return 1
}

# validate_marker <head-sha> — apply the marker shape rules against PR_BODY.
validate_marker() {
  local head="$1" body reviewer_lines sha_lines reviewer sha actor_values
  body="$(printf '%s' "${PR_BODY-}" | tr -d '\r')"

  reviewer_lines="$(printf '%s\n' "$body" | grep -E '^Tier2-Reviewer-Id:' || true)"
  sha_lines="$(printf '%s\n' "$body" | grep -E '^Tier2-Head-Sha:' || true)"

  if [[ -z "$reviewer_lines" ]]; then
    echo "ALERT (marker) Tier-2 required but no 'Tier2-Reviewer-Id:' trailer found in the PR body (advisory Stage A — DEC-20260814-02)"
    fail=1
  elif [[ "$(printf '%s\n' "$reviewer_lines" | wc -l)" -ne 1 ]]; then
    echo "ALERT (marker) multiple 'Tier2-Reviewer-Id:' lines — exactly one is required"
    fail=1
  elif ! printf '%s\n' "$reviewer_lines" | grep -Eq "$REVIEWER_ROSTER_REGEX"; then
    echo "ALERT (marker) Tier2-Reviewer-Id is not on the founder-ratified roster: '$reviewer_lines'"
    fail=1
  fi

  if [[ -z "$sha_lines" ]]; then
    echo "ALERT (marker) Tier-2 required but no 'Tier2-Head-Sha:' trailer found — the marker must name the exact head it covers"
    fail=1
  elif [[ "$(printf '%s\n' "$sha_lines" | wc -l)" -ne 1 ]]; then
    echo "ALERT (marker) multiple 'Tier2-Head-Sha:' lines — exactly one is required"
    fail=1
  else
    sha="$(printf '%s\n' "$sha_lines" | sed -E 's/^Tier2-Head-Sha:[[:space:]]*//; s/[[:space:]]*$//')"
    if ! printf '%s\n' "$sha" | grep -Eq '^[0-9a-f]{40}$'; then
      echo "ALERT (marker) Tier2-Head-Sha is not a full 40-hex commit sha: '$sha'"
      fail=1
    elif [[ "$sha" != "$head" ]]; then
      echo "ALERT (marker) Tier2-Head-Sha '$sha' does not match the current head '$head' — a push voids the marker; re-review and re-mark the new head (DEC-20260814-02 head-change rule)"
      fail=1
    fi
  fi

  # Contiguity + order (DEC-20260814-02: the marker is one contiguous
  # trailer block): Tier2-Reviewer-Id must be immediately followed by
  # Tier2-Head-Sha, with no intervening content. Enforced only once both
  # lines exist singly — the missing/duplicate alerts above already cover
  # the other shapes.
  if [[ -n "$reviewer_lines" && -n "$sha_lines" ]] \
     && [[ "$(printf '%s\n' "$reviewer_lines" | wc -l)" -eq 1 ]] \
     && [[ "$(printf '%s\n' "$sha_lines" | wc -l)" -eq 1 ]]; then
    local rev_ln sha_ln
    rev_ln="$(printf '%s\n' "$body" | grep -nE '^Tier2-Reviewer-Id:' | head -n1 | cut -d: -f1)"
    sha_ln="$(printf '%s\n' "$body" | grep -nE '^Tier2-Head-Sha:' | head -n1 | cut -d: -f1)"
    if [[ "$sha_ln" -ne $((rev_ln + 1)) ]]; then
      echo "ALERT (marker) Tier2 marker is not one ordered, contiguous block — 'Tier2-Reviewer-Id:' must be immediately followed by 'Tier2-Head-Sha:' (DEC-20260814-02)"
      fail=1
    fi
  fi

  # Distinct-identity rule (attested, form-only): the reviewer id must not
  # equal any Actor-Id value present in the body.
  if [[ -n "$reviewer_lines" ]]; then
    reviewer="$(printf '%s\n' "$reviewer_lines" | head -n1 | sed -E 's/^Tier2-Reviewer-Id:[[:space:]]*//; s/[[:space:]]*$//')"
    actor_values="$(printf '%s\n' "$body" | grep -E '^Actor-Id:' | sed -E 's/^Actor-Id:[[:space:]]*//; s/[[:space:]]*$//' || true)"
    if [[ -n "$reviewer" && -n "$actor_values" ]] && printf '%s\n' "$actor_values" | grep -Fxq "$reviewer"; then
      echo "ALERT (marker) Tier2-Reviewer-Id equals an Actor-Id value ('$reviewer') — author and reviewer must be distinct identities"
      fail=1
    fi
  fi
}

# --- modes -----------------------------------------------------------------

case "$MODE" in
  pr)
    BASE_SHA="${2:?usage: tier2-shape-check.sh pr <base-sha> <head-sha>}"
    HEAD_SHA="${3:?usage: tier2-shape-check.sh pr <base-sha> <head-sha>}"

    # Resolve the head argument to a full 40-hex sha so a symbolic ref
    # (HEAD, a branch name) cannot produce a spurious marker mismatch.
    # FAIL-CLOSED: an unresolvable head is a gate failure, never a skip.
    if resolved="$(git rev-parse --verify "${HEAD_SHA}^{commit}" 2>/dev/null)"; then
      HEAD_SHA="$resolved"
    else
      echo "ALERT (paths) unable to resolve head '$HEAD_SHA' to a commit — failing closed: Tier-2 flagged as required"
      fail=1
    fi

    # FAIL-CLOSED: if the changed-path set cannot be computed, Tier-2 is
    # flagged as required rather than skipped. Three-dot (merge-base) diff:
    # BASE_SHA is the base-branch tip, which may have advanced past the PR's
    # branch point — a two-dot diff would count target-only changes as PR
    # changes and raise false Tier-2 alerts (CodeRabbit finding, PR #239).
    if ! changed="$(git diff --name-only "$BASE_SHA"..."$HEAD_SHA" 2>/dev/null)"; then
      echo "ALERT (paths) unable to compute changed paths for $BASE_SHA..$HEAD_SHA — failing closed: Tier-2 flagged as required"
      fail=1
      validate_marker "$HEAD_SHA"
    else
      hits="$(printf '%s\n' "$changed" | classify_stdin)" || true
      if [[ -n "$hits" ]]; then
        echo "Tier-2 surfaces touched (DEC-20260814-02 trigger list):"
        printf '%s\n' "$hits" | sed 's/^/  - /'
        validate_marker "$HEAD_SHA"
      else
        echo "no Tier-2 trigger surface touched — marker not required"
      fi
    fi
    ;;

  marker)
    HEAD_SHA="${2:?usage: tier2-shape-check.sh marker <head-sha>}"
    validate_marker "$HEAD_SHA"
    ;;

  classify)
    # stdin → matched trigger paths on stdout; exit 0 when triggered, 1 not.
    if classify_stdin; then exit 0; else exit 1; fi
    ;;

  selftest)
    GOOD_SHA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    OTHER_SHA='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    stm() { # marker-mode case: name, expected exit, body
      local name="$1" expected="$2" body="$3" rc=0
      PR_BODY="$body" bash "$0" marker "$GOOD_SHA" >/dev/null 2>&1 || rc=$?
      if [[ "$rc" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $rc, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }
    stc() { # classify-mode case: name, expected exit, paths (newline-joined)
      local name="$1" expected="$2" paths="$3" rc=0
      printf '%s\n' "$paths" | bash "$0" classify >/dev/null 2>&1 || rc=$?
      if [[ "$rc" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $rc, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }

    # Marker validation — roster, sha binding, distinctness, malformations.
    stm "valid marker (gemini)"        0 $'Tier2-Reviewer-Id: gemini-3.1-pro\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "valid marker (codex sol)"     0 $'Tier2-Reviewer-Id: chatgpt-5.6-sol\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "valid marker (codex terra)"   0 $'Tier2-Reviewer-Id: chatgpt-5.6-terra\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "valid marker (codex luna)"    0 $'Tier2-Reviewer-Id: chatgpt-5.6-luna\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "valid marker (grok)"          0 $'Tier2-Reviewer-Id: grok-4.5\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "valid marker above attribution block" 0 $'Tier2-Reviewer-Id: gemini-3.1-pro\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    stm "marker with CRLF"             0 $'Tier2-Reviewer-Id: gemini-3.1-pro\r\nTier2-Head-Sha: '"$GOOD_SHA"$'\r'
    stm "empty body"                   1 ''
    stm "missing reviewer line"        1 $'Tier2-Head-Sha: '"$GOOD_SHA"
    stm "missing head-sha line"        1 $'Tier2-Reviewer-Id: gemini-3.1-pro'
    stm "off-roster reviewer"          1 $'Tier2-Reviewer-Id: chatgpt-4o\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "empty reviewer value"         1 $'Tier2-Reviewer-Id:\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "stale head sha (push voids)"  1 $'Tier2-Reviewer-Id: gemini-3.1-pro\nTier2-Head-Sha: '"$OTHER_SHA"
    stm "short head sha rejected"      1 $'Tier2-Reviewer-Id: gemini-3.1-pro\nTier2-Head-Sha: aaaaaaa'
    stm "duplicate reviewer lines"     1 $'Tier2-Reviewer-Id: gemini-3.1-pro\nTier2-Reviewer-Id: grok-4.5\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "duplicate head-sha lines"     1 $'Tier2-Reviewer-Id: gemini-3.1-pro\nTier2-Head-Sha: '"$GOOD_SHA"$'\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "reviewer equals actor-id"     1 $'Tier2-Reviewer-Id: gemini-3.1-pro\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: gemini-3.1-pro\nExecution-Surface: claude-code'
    # Contiguity/order regression cases (CodeRabbit finding, PR #239): the
    # marker is ONE ordered, contiguous block.
    stm "reversed marker order"        1 $'Tier2-Head-Sha: '"$GOOD_SHA"$'\nTier2-Reviewer-Id: gemini-3.1-pro'
    stm "separated marker lines"       1 $'Tier2-Reviewer-Id: gemini-3.1-pro\nsome prose between\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "blank line inside marker"     1 $'Tier2-Reviewer-Id: gemini-3.1-pro\n\nTier2-Head-Sha: '"$GOOD_SHA"
    # BY DESIGN: the marker is NOT end-anchored — the end-anchored block is
    # the Attribution block, which must be the body's FINAL content, so the
    # Tier-2 marker always has content after it (DEC-20260814-02 clause 3
    # as corrected 2026-08-14). Prose after a valid marker passes.
    stm "content after marker passes (by design)" 0 $'Tier2-Reviewer-Id: gemini-3.1-pro\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nOrdinary prose, then the Attribution block.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'

    # Column-0 requirement: an indented marker is not a trailer and must
    # be treated as missing (Tier-2 review finding 5, PR #239).
    stm "indented marker rejected"     1 $' Tier2-Reviewer-Id: gemini-3.1-pro\n Tier2-Head-Sha: '"$GOOD_SHA"

    # Fail-closed fixtures (Tier-2 review finding 5, PR #239): previously
    # verified only by live probes, now pinned. A valid marker must NOT
    # mask a fail-closed path alert.
    stpr() { # pr-mode case: name, expected exit, base, head, body
      local name="$1" expected="$2" base="$3" head="$4" body="$5" rc=0
      PR_BODY="$body" bash "$0" pr "$base" "$head" >/dev/null 2>&1 || rc=$?
      if [[ "$rc" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $rc, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }
    stpr "fail-closed unresolvable head" 1 HEAD not-a-real-ref-zzz ''
    HEAD_RESOLVED="$(git rev-parse HEAD 2>/dev/null || echo "$GOOD_SHA")"
    stpr "fail-closed uncomputable diff (valid marker does not mask it)" 1 \
      "$OTHER_SHA" HEAD $'Tier2-Reviewer-Id: gemini-3.1-pro\nTier2-Head-Sha: '"$HEAD_RESOLVED"

    # Divergent-history regression (Tier-2 review finding 5 / CodeRabbit,
    # PR #239): the base branch advances with a trigger-surface commit
    # AFTER the PR branches, while the PR touches no trigger surface. The
    # three-dot merge-base diff must NOT flag the base-only change; the
    # old two-dot form would have. Uses a throwaway local fixture repo —
    # still no network, no external dependencies.
    SELF_ABS="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
    FIXDIR="$(mktemp -d)"
    # EXIT trap so the fixture dir cannot leak if setup fails under
    # `set -euo pipefail` (Copilot review, PR #241); the explicit rm below
    # still runs on the happy path.
    trap 'rm -rf "$FIXDIR"' EXIT
    (
      cd "$FIXDIR" || exit 1
      git init -q -b main . \
        && git -c user.email=selftest@local -c user.name=selftest commit -q --allow-empty -m base \
        && git checkout -q -b feature \
        && mkdir -p docs && echo x > docs/note.md \
        && git add -A && git -c user.email=selftest@local -c user.name=selftest commit -qm non-trigger-change \
        && git checkout -q main \
        && mkdir -p 07-decisions && echo y > 07-decisions/dec.md \
        && git add -A && git -c user.email=selftest@local -c user.name=selftest commit -qm trigger-on-base-only
    )
    div_rc=0
    ( cd "$FIXDIR" && PR_BODY='' bash "$SELF_ABS" pr main feature >/dev/null 2>&1 ) || div_rc=$?
    if [[ "$div_rc" -ne 0 ]]; then
      echo "SELFTEST FAIL: divergent-history three-dot merge-base (exit $div_rc, expected 0)"
      fail=1
    else
      echo "selftest ok: divergent-history three-dot merge-base"
    fi
    rm -rf "$FIXDIR"

    # Trigger classification — one case per ratified path surface, plus
    # negatives proving the list matches surfaces, not substrings.
    stc "constitution triggers"        0 '01-constitution/agent-rules.md'
    stc "decisions trigger"            0 '07-decisions/DEC-20260814-02-tier2-shape-check-gate.md'
    stc "workflows trigger"            0 '.github/workflows/tier2-shape.yml'
    stc "scripts trigger"              0 '00-system/scripts/tier2-shape-check.sh'
    stc "skills shelf trigger"         0 '13-skills/builder/wf13-review-discipline.md'
    stc "agents trigger"               0 '04-agents/role-registry.md'
    stc "research path no trigger"     1 '08-research/summaries/RES-20260814-01-codeagentswarm-architecture-teardown.md'
    stc "plans path no trigger"        1 '10-plans/ship-through-the-os-90-day-plan.md'
    stc "nested lookalike no trigger"  1 'docs/01-constitution/notes.md'
    stc "mixed set triggers"           0 $'08-research/raw/x.md\n13-skills/shared/y.md'
    ;;

  *)
    echo "usage: tier2-shape-check.sh pr <base-sha> <head-sha> (PR_BODY env) | marker <head-sha> (PR_BODY env) | classify (paths on stdin) | selftest" >&2
    exit 2
    ;;
esac

if (( fail )); then
  echo "tier2-shape-check: ALERT — Tier-2 shape violations above (advisory Stage A; not a merge block)" >&2
  exit 1
fi
echo "tier2-shape-check: PASS — Tier-2 shape valid (shape-only; attested values are not verified)"

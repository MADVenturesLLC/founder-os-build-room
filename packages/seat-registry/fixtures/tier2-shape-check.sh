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
# GREEN LANE (DEC-20260822-01, ratified by the Founder 2026-08-22, Option A;
# this is the clause 10 implementation). A qualifying green-lane change may
# satisfy this gate with a LANE DECLARATION in place of a Tier-2 reviewer
# marker. The declaration replaces the pre-merge reviewer relay and nothing
# else: SHA-specific Founder merge authorization (DEC-20260718-04),
# attribution, path-audit, exact-head discipline and the correction duties
# are untouched (clause 8).
#
# The declaration is a contiguous, ordered, column-0 block that must be the
# FINAL trailer block in the body — nothing after it but blank lines and the
# end-anchored Attribution block:
#
#   Green-Lane-Id: GL-2, GL-3
#   Green-Lane-Head-Sha: <full 40-hex sha of the head this declaration covers>
#
# THE LANE IS STRICTER THAN THE TIER-2 MARKER, deliberately (Founder ruling
# 2026-09-16). The marker may have prose between it and the Attribution block
# — DEC-20260814-02 clause 3, unchanged, with a by-design case for it. The
# lane declaration may not. A declaration is self-attested with no reviewer
# behind it, so a quoted example has to be distinguishable from a real one
# without interpreting Markdown; a marker names a roster reviewer and carries
# a different risk. See lane_decl_lines.
#
# INTERPRETATION, FLAGGED RATHER THAN BURIED: clause 3 names only the
# `Green-Lane-Id:` trailer, yet requires the declaration to be head-SHA-scoped
# — "any push voids it and it must be restated for the new head". A lone
# `Green-Lane-Id:` line reads identically at every head, so nothing about it
# can void on a push and that requirement would be unmechanizable. The
# `Green-Lane-Head-Sha:` line is the minimal way to make the property clause 3
# states actually checkable, exactly parallel to Tier2-Head-Sha. It is this
# implementation's reading of clause 3, not text the Founder ratified.
LANE_ID_REGEX='^GL-[1-5]$'
#
# ELIGIBLE PATH (clause 2): `/07-decisions/` ONLY. `/01-constitution/` is
# excluded even though it shares the trigger-surface row — constitution edits
# are never lane work — and the other eight trigger surfaces are excluded
# categorically. Expressed as a POSITIVE match every changed path must
# satisfy, so a path this list has never heard of can never qualify.
LANE_ELIGIBLE_REGEX='^07-decisions/'
#
# SIZE BOUNDS (clause 1, at the values the Founder set at ratification): at or
# under 50 changed lines across at most 3 files. Founder-settable; changing
# them is itself a Tier-2 surface edit.
LANE_MAX_LINES=50
LANE_MAX_FILES=3
#
# WHAT THIS CANNOT CHECK, AND WHAT COVERS IT INSTEAD. The gate validates the
# declaration's FORM plus the two bounds it can measure — changed paths and
# diff size. It cannot judge whether the change truly falls inside GL-1..GL-5,
# whether it alters meaning, authority, policy or evidence status, or whether
# it touches an OPERATIVE CLAUSE of a decision file rather than that file's
# mechanics, which is clause 2's central exclusion. Those are ATTESTED by the
# author. A shape-valid but false declaration goes green here and is a
# governance violation in the honesty class of agent-rules §10 (clause 3),
# caught by the 100% post-hoc WF-10 audit (clause 6) and answered by the
# two-exceedance suspension trigger (clause 7b). This is the same posture the
# attribution gate has carried since DEC-20260721-01 clause 5, stated plainly
# so no later reader mistakes the green result for a proof of lane fit.
#
# The clause 7a cap — at most 10 lane-declared merges per week — is cross-PR
# state that a stateless per-PR gate cannot see. It remains a WF-10 audit item.
#
# ---------------------------------------------------------------------------
# TIER-2 MARKER (DEC-20260814-02 ratification, 2026-08-14; amended by
# FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION B2/B3): a contiguous
# trailer block at column 0 in the PR body carrying these lines, in order:
#
#   Tier2-Reviewer-Id: <surface id>
#   Tier2-Reviewer-Model: <model the reviewer reports, or
#                          unavailable-from-current-harness>
#   Tier2-Head-Sha: <full 40-hex sha of the PR head this review covers>
#
# DEC-20260826-01 makes a Tier2-Verdict: line (PASS, PASS-WITH-ADVISORIES
# or FAIL) a REQUIRED part of the marker, after Tier2-Head-Sha. That
# decision leaves its enforcement to a separate Layer 1 implementation and
# authorizes no change to this script's runtime behaviour for it, so this
# gate still does not validate the verdict line. Its absence passing here
# is that known, pre-existing gap — not a ruling that it is optional.
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
# REVIEWER SURFACES (FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION B2,
# recorded verbatim in DEC-20260719-02): a binding verdict names the
# execution surface the review ran on — exactly one of antigravity, codex,
# chatgpt or grok-build, each as registered in
# 04-agents/execution-surface-registry.md. Adding or removing a surface
# needs a Founder act. Unavailability handling per DEC-20260801-02 clause
# 5: report the unmet bar with evidence — never silently waive.
#
# Superseded, kept as dated history: from 2026-08-14 until that act's
# implementing pull request merged, this gate accepted the model roster
# gemini-3.1-pro, chatgpt-5.6-sol, chatgpt-5.6-terra, chatgpt-5.6-luna and
# grok-4.5. Markers already merged under that roster stay valid (act B5).
REVIEWER_SURFACE_REGEX='^Tier2-Reviewer-Id:[[:space:]]*(antigravity|codex|chatgpt|grok-build)[[:space:]]*$'
#
# THE MODEL IS RECORDED, NOT BOUND (act B3): Tier2-Reviewer-Model is
# required and must carry a non-empty value — the model the reviewer
# reports, or unavailable-from-current-harness. It is not verified and no
# value is refused here: the act keeps two model rules (the restricted
# roster never issues a binding verdict; a model's data-boundary condition
# binds its review), and both are attested, not machine-checked.
#
# INDEPENDENCE (act B4): the attested reviewer surface must differ from
# every Execution-Surface value in the PR body's attribution, and the
# attested Tier2-Reviewer-Id must not equal any Actor-Id value in the PR
# body. This is attestation, not verification (shared-account identity
# makes account-based distinctness unverifiable — DEC-20260814-02): the
# check validates form only, and a fabricated attestation is a governance
# violation under agent-rules §10, exactly as with the attribution gate.
#
# Usage:
#   tier2-shape-check.sh pr <base-sha> <head-sha>   (PR body via PR_BODY env)
#   tier2-shape-check.sh marker <head-sha>          (marker-only; PR_BODY env)
#   tier2-shape-check.sh lane <head-sha>            (lane-decl only; PR_BODY env)
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
# matching the trigger list. Returns 0 if any matched, 1 if none. Used by
# `classify` mode and its selftests, which exercise literal path strings
# that never contain embedded newlines; the real git-diff-driven path in
# `pr` mode uses classify_array instead (see below) precisely because real
# filenames are not guaranteed that.
classify_stdin() {
  local hits
  hits="$(grep -E "$TRIGGER_REGEX" || true)"
  if [[ -n "$hits" ]]; then
    printf '%s\n' "$hits"
    return 0
  fi
  return 1
}

# classify_array — check each provided path (one per argument) against the
# trigger list, printing those that match. Returns 0 if any matched, 1 if
# none. Paths arrive as separate arguments, never a newline-joined string:
# git permits literal newlines inside a filename, so a NUL-delimited path
# list flattened to newlines and handed to a line-oriented matcher could
# read one such path as two records — a fragment after the embedded
# newline spuriously matching TRIGGER_REGEX for a path that was never
# actually changed. MEASURED with a fixture commit: a single file whose
# real name is `<LF>07-decisions/fake.md` — one path component starting
# with a newline, immediately followed by the trigger prefix, no real
# `07-decisions/` directory involved — falsely triggered under
# `-z | tr '\0' '\n' | grep`, and does not under this (Copilot review, PR
# #347). Matching each argument as one whole string via bash's own `=~`
# never re-splits it. `"$@"` is always safe to iterate even with zero
# arguments, unlike a caller's own named array — see the `pr` mode guard
# on `changed_arr` below for why that distinction matters here.
classify_array() {
  local any=1 p
  for p in "$@"; do
    if [[ "$p" =~ $TRIGGER_REGEX ]]; then
      printf '%s\n' "$p"
      any=0
    fi
  done
  return "$any"
}

# value_in_lines <needle> <newline-separated values> — true when one line
# equals the needle exactly. A here-string, never a pipe: in
# `printf '%s\n' "$values" | grep -Fxq "$needle"`, grep exits on the first
# match, the writer can take SIGPIPE once the values outgrow the pipe buffer,
# and pipefail surfaces 141 — so a real match reads as no match and every
# positive refusal built on it fails OPEN. The Tier-2 review of PR #372 at
# be52b41 (codex) reproduced exactly that on the surface-independence check;
# lane_declared below already avoids a pipe for the same reason.
value_in_lines() {
  grep -Fxq -- "$1" <<<"$2"
}

# final_attribution_lines <body> — print the body's final Attribution block:
# walking up from the end, skip blank lines, then take the contiguous run of
# Role-Id / Role-Id-Secondary / Actor-Id / Execution-Surface trailers and
# stop at the first line that is neither. This is the end-anchored block the
# attribution gate validates. Act B4 compares the reviewer surface with the
# Execution-Surface values "in the pull request's attribution", so prose
# elsewhere in the body that happens to start with `Execution-Surface:` (a
# quoted review report, say) must not count (Copilot, PR #372 at 91dbe24).
#
# NOT `mapfile`: it is bash 4+, and macOS /bin/bash is 3.2. With it, the
# builtin is "not found" there, the array stays empty, nothing is printed,
# and the surface refusal compares against no surfaces at all: fail OPEN
# (Tier-2 review, codex, PR #372 at 2c12633). Same read loop as
# lane_decl_lines below; the caller also refuses when this prints nothing
# for a body that ends in a trailer line.
final_attribution_lines() {
  local -a lines
  local i ln
  lines=()
  while IFS= read -r ln; do
    lines+=( "$ln" )
  done <<<"$1"
  i=$(( ${#lines[@]} - 1 ))
  while (( i >= 0 )) && [[ -z "${lines[i]//[[:space:]]/}" ]]; do
    i=$(( i - 1 ))
  done
  local end=$i
  while (( i >= 0 )); do
    case "${lines[i]}" in
      'Role-Id:'*|'Role-Id-Secondary:'*|'Actor-Id:'*|'Execution-Surface:'*) i=$(( i - 1 )) ;;
      *) break ;;
    esac
  done
  local j
  for (( j = i + 1; j <= end; j++ )); do
    printf '%s\n' "${lines[j]}"
  done
  return 0
}

# validate_marker <head-sha> — apply the marker shape rules against PR_BODY.
validate_marker() {
  local head="$1" body reviewer_lines model_lines sha_lines reviewer model sha actor_values surface_values
  local attribution="" last_line
  body="$(printf '%s' "${PR_BODY-}" | tr -d '\r')"

  reviewer_lines="$(printf '%s\n' "$body" | grep -E '^Tier2-Reviewer-Id:' || true)"
  model_lines="$(printf '%s\n' "$body" | grep -E '^Tier2-Reviewer-Model:' || true)"
  sha_lines="$(printf '%s\n' "$body" | grep -E '^Tier2-Head-Sha:' || true)"

  if [[ -z "$reviewer_lines" ]]; then
    echo "ALERT (marker) Tier-2 required but no 'Tier2-Reviewer-Id:' trailer found in the PR body (advisory Stage A — DEC-20260814-02)"
    fail=1
  elif [[ "$(printf '%s\n' "$reviewer_lines" | wc -l)" -ne 1 ]]; then
    echo "ALERT (marker) multiple 'Tier2-Reviewer-Id:' lines — exactly one is required"
    fail=1
  elif ! grep -Eq "$REVIEWER_SURFACE_REGEX" <<<"$reviewer_lines"; then
    echo "ALERT (marker) Tier2-Reviewer-Id is not one of the four reviewer surfaces (antigravity, codex, chatgpt, grok-build): '$reviewer_lines' (FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION B2)"
    fail=1
  fi

  if [[ -z "$model_lines" ]]; then
    echo "ALERT (marker) no 'Tier2-Reviewer-Model:' line — the marker must record the model the reviewer reports, or 'unavailable-from-current-harness' (FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION B3)"
    fail=1
  elif [[ "$(printf '%s\n' "$model_lines" | wc -l)" -ne 1 ]]; then
    echo "ALERT (marker) multiple 'Tier2-Reviewer-Model:' lines — exactly one is required"
    fail=1
  else
    model="$(printf '%s\n' "$model_lines" | sed -E 's/^Tier2-Reviewer-Model:[[:space:]]*//; s/[[:space:]]*$//')"
    if [[ -z "$model" ]]; then
      echo "ALERT (marker) Tier2-Reviewer-Model is empty — record the model the reviewer reports, or 'unavailable-from-current-harness'"
      fail=1
    fi
  fi

  if [[ -z "$sha_lines" ]]; then
    echo "ALERT (marker) Tier-2 required but no 'Tier2-Head-Sha:' trailer found — the marker must name the exact head it covers"
    fail=1
  elif [[ "$(printf '%s\n' "$sha_lines" | wc -l)" -ne 1 ]]; then
    echo "ALERT (marker) multiple 'Tier2-Head-Sha:' lines — exactly one is required"
    fail=1
  else
    sha="$(printf '%s\n' "$sha_lines" | sed -E 's/^Tier2-Head-Sha:[[:space:]]*//; s/[[:space:]]*$//')"
    if ! grep -Eq '^[0-9a-f]{40}$' <<<"$sha"; then
      echo "ALERT (marker) Tier2-Head-Sha is not a full 40-hex commit sha: '$sha'"
      fail=1
    elif [[ "$sha" != "$head" ]]; then
      echo "ALERT (marker) Tier2-Head-Sha '$sha' does not match the current head '$head' — a push voids the marker; re-review and re-mark the new head (DEC-20260814-02 head-change rule)"
      fail=1
    fi
  fi

  # Contiguity + order (DEC-20260814-02: the marker is one contiguous
  # trailer block): Tier2-Reviewer-Id, then Tier2-Reviewer-Model, then
  # Tier2-Head-Sha, on consecutive lines with no intervening content.
  # Enforced only once all three lines exist singly — the missing/duplicate
  # alerts above already cover the other shapes.
  if [[ -n "$reviewer_lines" && -n "$model_lines" && -n "$sha_lines" ]] \
     && [[ "$(printf '%s\n' "$reviewer_lines" | wc -l)" -eq 1 ]] \
     && [[ "$(printf '%s\n' "$model_lines" | wc -l)" -eq 1 ]] \
     && [[ "$(printf '%s\n' "$sha_lines" | wc -l)" -eq 1 ]]; then
    local rev_ln model_ln sha_ln
    rev_ln="$(printf '%s\n' "$body" | grep -nE '^Tier2-Reviewer-Id:' | head -n1 | cut -d: -f1)"
    model_ln="$(printf '%s\n' "$body" | grep -nE '^Tier2-Reviewer-Model:' | head -n1 | cut -d: -f1)"
    sha_ln="$(printf '%s\n' "$body" | grep -nE '^Tier2-Head-Sha:' | head -n1 | cut -d: -f1)"
    if [[ "$model_ln" -ne $((rev_ln + 1)) || "$sha_ln" -ne $((rev_ln + 2)) ]]; then
      echo "ALERT (marker) Tier2 marker is not one ordered, contiguous block — 'Tier2-Reviewer-Id:', 'Tier2-Reviewer-Model:' and 'Tier2-Head-Sha:' must be consecutive lines, in that order (DEC-20260814-02)"
      fail=1
    fi
  fi

  # Distinct-identity rule (attested, form-only): the reviewer id must not
  # equal any Actor-Id value present in the body.
  if [[ -n "$reviewer_lines" ]]; then
    reviewer="$(printf '%s\n' "$reviewer_lines" | head -n1 | sed -E 's/^Tier2-Reviewer-Id:[[:space:]]*//; s/[[:space:]]*$//')"
    actor_values="$(printf '%s\n' "$body" | grep -E '^Actor-Id:' | sed -E 's/^Actor-Id:[[:space:]]*//; s/[[:space:]]*$//' || true)"
    if [[ -n "$reviewer" && -n "$actor_values" ]] && value_in_lines "$reviewer" "$actor_values"; then
      echo "ALERT (marker) Tier2-Reviewer-Id equals an Actor-Id value ('$reviewer') — author and reviewer must be distinct identities"
      fail=1
    fi
    # Independence of surfaces (act B4): the reviewer surface must differ
    # from every Execution-Surface in the PR body's final Attribution block.
    # A parser failure is a refusal, never "no surfaces": if the body's last
    # non-blank line is a trailer, the final block cannot be empty, so an
    # empty result there means the parser failed and the comparison would
    # otherwise pass by default.
    last_line="$(printf '%s\n' "$body" | grep -v '^[[:space:]]*$' | tail -n1 || true)"
    if ! attribution="$(final_attribution_lines "$body")"; then
      echo "ALERT (marker) could not read the final Attribution block — refusing rather than skipping the surface-independence check (FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION B4)"
      fail=1
    elif [[ -z "$attribution" ]] && grep -Eq '^(Role-Id|Role-Id-Secondary|Actor-Id|Execution-Surface):' <<<"$last_line"; then
      echo "ALERT (marker) the body ends in a trailer line but no final Attribution block was read — refusing rather than skipping the surface-independence check (FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION B4)"
      fail=1
    fi
    surface_values="$(printf '%s\n' "$attribution" | grep -E '^Execution-Surface:' | sed -E 's/^Execution-Surface:[[:space:]]*//; s/[[:space:]]*$//' || true)"
    if [[ -n "$reviewer" && -n "$surface_values" ]] && value_in_lines "$reviewer" "$surface_values"; then
      echo "ALERT (marker) Tier2-Reviewer-Id equals an Execution-Surface in the attribution ('$reviewer') — the review must run on a different surface from the work (FOUNDER-ACT-20261011-TIER2-SURFACE-ATTESTATION B4)"
      fail=1
    fi
  fi
}

# THE LANE DECLARATION IS POSITIONAL (Founder ruling 2026-09-16, ratifying the
# rule proposed in DEC-20260822-01 v0.8; see that decision's Implementation
# section for the ruling and its verbatim text):
#
#   A `Green-Lane-Id:` declaration is recognized only when its block is the
#   FINAL trailer block in the PR body — nothing follows it except blank lines
#   and the end-anchored Attribution block. A `Green-Lane-Id:` line anywhere
#   else in the body is prose and is ignored.
#
# WHY THIS REPLACED A PARSER. The previous implementation blanked Markdown code
# fences and then scanned for a declaration anywhere at column 0. Four review
# rounds found four defects in that fence handling and EVERY ONE WAS FAIL-OPEN:
# a quoted example read as a live declaration, granting the lane and skipping
# the Tier-2 marker. Tier-2 review (grok-4.5, PR #344 at 0187cfa) returned FAIL
# on the class and recorded that the path was unbounded. The positional rule
# deletes the parser outright: no Markdown is interpreted, only position.
#
# WHAT IT DOES NOT DO, stated plainly because an earlier claim in this file
# overstated a safety property and had to be retracted. This does NOT eliminate
# the accidental-declaration class. A documentation body whose example happens
# to sit LAST, immediately above the Attribution block, is still
# indistinguishable from a declaration and still grants the lane. What the rule
# removes is every quoted example that is not last — the ordinary shape of
# documentation, and the whole fenced-example class. The residue is narrower
# and rests where lane FIT always rested: clause 3's honesty class and clause
# 6's 100% post-hoc WF-10 audit.

# lane_decl_lines — locate the declaration POSITIONALLY and print its two
# lines, or return 1. Walks UP from the end of the body, skipping blank lines
# and Attribution-block trailers; the first line that is neither must be
# `Green-Lane-Head-Sha:`, and the line immediately above it must be
# `Green-Lane-Id:`. Anything else means there is no declaration in the marker
# position, whatever the body says elsewhere.
lane_decl_lines() {
  local body i line value ln sha_idx=-1
  local phase=tail attrib_seen=0 has_actor=0
  local -a lines
  body="${PR_BODY-}"
  body="${body//$'\r'/}"
  # NOT `mapfile`/`readarray`: those are bash 4+, and macOS ships /bin/bash
  # 3.2. This file's shebang is `#!/usr/bin/env bash`, so on a Mac without a
  # newer bash on PATH `mapfile` is simply not found — every lane detection
  # then fails, and the feature silently does nothing on the Founder's own
  # platform. path-audit.sh and attribution-shape-check.sh are both 3.2-clean;
  # a mapfile here was a regression against that house convention, introduced
  # by this PR and caught in Tier-2 review. The read loop below is equivalent:
  # a herestring always supplies a trailing newline, so it yields exactly the
  # element count `mapfile -t` does, including one empty element for an empty
  # body.
  lines=()
  while IFS= read -r ln; do
    lines+=( "$ln" )
  done <<< "$body"

  # Walk UP from the end through three regions, in this order:
  #   tail    — trailing blank lines
  #   attrib  — the Attribution block: a CONTIGUOUS run of trailer lines
  #   gap     — blank lines between that block and the declaration
  # then the declaration itself. Anything out of place ends the walk.
  #
  # WHY THE BLOCK IS CHECKED AT ALL, and why the check is shaped like this.
  # The ruling permits exactly two things after the declaration: blank lines
  # and THE Attribution block. Deciding whether the trailing lines ARE that
  # block needs a notion of what one looks like, so a structural test here is
  # unavoidable rather than duplication for its own sake. I argued the
  # opposite one revision ago and shipped a single-field heuristic instead;
  # review then found it accepted a run split by a blank line, and an
  # `Actor-Id:` with no value. Both measured. A half-check was the worst of
  # both options — it duplicated the contract AND got it wrong.
  #
  # This is a NECESSARY CONDITION, not a revalidation of attribution:
  # contiguous, every trailer carrying a non-empty value, and `Actor-Id:`
  # present (for direct-founder work `Role-Id:` is the line omitted, never
  # `Actor-Id:`). Whether those values are CORRECT is
  # attribution-shape-check.sh's job — required on main, where this gate is
  # advisory — and that division is deliberate.
  for (( i = ${#lines[@]} - 1; i >= 0; i-- )); do
    line="${lines[i]}"

    if [[ -z "${line//[[:space:]]/}" ]]; then
      if [[ "$phase" == attrib ]]; then
        # A blank ENDS the Attribution block; nothing may reopen it.
        phase=gap
      fi
      continue
    fi

    case "$line" in
      'Role-Id:'*|'Role-Id-Secondary:'*|'Actor-Id:'*|'Execution-Surface:'*)
        if [[ "$phase" == gap ]]; then
          # A trailer line after the run already closed: the trailing lines
          # are not ONE block, so they are not the Attribution block.
          return 1
        fi
        value="${line#*:}"
        if [[ -z "${value//[[:space:]]/}" ]]; then
          # An empty trailer value is not a trailer; attribution-shape
          # rejects the same body. Refuse rather than count it as a block.
          return 1
        fi
        phase=attrib
        attrib_seen=1
        if [[ "$line" == 'Actor-Id:'* ]]; then
          has_actor=1
        fi
        continue
        ;;
    esac

    if [[ "$line" == 'Green-Lane-Head-Sha:'* ]]; then
      sha_idx=$i
    fi
    break
  done

  (( sha_idx > 0 )) || return 1
  [[ "${lines[sha_idx - 1]}" == 'Green-Lane-Id:'* ]] || return 1
  if (( attrib_seen == 1 && has_actor == 0 )); then
    return 1
  fi

  printf '%s\n%s\n' "${lines[sha_idx - 1]}" "${lines[sha_idx]}"
}

# lane_declared — true when a declaration sits in the marker position.
# Command substitution, never a pipe: `... | grep -q` can report false on a
# real match when the writer takes SIGPIPE and pipefail surfaces 141.
lane_declared() {
  local out
  out="$(lane_decl_lines)" || return 1
  [[ -n "$out" ]]
}

# validate_lane_shape <head-sha> — validate the VALUES of the positionally
# located declaration. Order, contiguity and uniqueness are STRUCTURAL now:
# lane_decl_lines returns exactly two adjacent lines or nothing, so this only
# judges what they say. Prints each violation; returns 0 clean, 1 otherwise.
# Deliberately does NOT touch the global `fail`: a declaration that does not
# qualify falls through to the marker requirement, and a PR carrying a valid
# Tier-2 marker must still pass on that marker's strength.
validate_lane_shape() {
  local head="$1" decl id_line sha_line ids sha lane seen bad=0

  if ! decl="$(lane_decl_lines)"; then
    echo "ALERT (lane) no lane declaration in the marker position — the block must be the FINAL trailer block, with nothing after it but blank lines and the Attribution block (Founder ruling 2026-09-16; DEC-20260822-01)"
    echo "  NOTE: the block is two lines, 'Green-Lane-Id:' then 'Green-Lane-Head-Sha:'. The second is this gate's UNRATIFIED reading of clause 3's 'any push voids it' requirement, which one invariant line cannot carry; it remains pending Founder disposition. Stage A is advisory and blocks no merge either way."
    return 1
  fi
  id_line="$(printf '%s' "$decl" | sed -n '1p')"
  sha_line="$(printf '%s' "$decl" | sed -n '2p')"

  ids="$(printf '%s' "$id_line" | sed -E 's/^Green-Lane-Id:[[:space:]]*//; s/[[:space:]]*$//')"
  if [[ -z "$ids" ]]; then
    echo "ALERT (lane) 'Green-Lane-Id:' carries no value — name at least one of GL-1..GL-5"
    bad=1
  else
    seen=''
    while IFS= read -r lane; do
      lane="${lane#"${lane%%[![:space:]]*}"}"
      lane="${lane%"${lane##*[![:space:]]}"}"
      if [[ -z "$lane" ]]; then
        echo "ALERT (lane) empty lane id in 'Green-Lane-Id: $ids'"
        bad=1
      elif ! printf '%s\n' "$lane" | grep -Eq "$LANE_ID_REGEX"; then
        echo "ALERT (lane) '$lane' is not a Founder-approved lane — DEC-20260814-03 clause 6 defines GL-1 through GL-5"
        bad=1
      elif printf '%s\n' "$seen" | grep -Fxq "$lane"; then
        echo "ALERT (lane) lane id '$lane' is declared more than once"
        bad=1
      else
        seen="$seen$lane"$'\n'
      fi
    done < <(printf '%s\n' "$ids" | tr ',' '\n')
  fi

  # Head binding — clause 3's "any push voids it", mechanized. No clock-based
  # staleness window: the declaration is valid only for the exact head named.
  sha="$(printf '%s' "$sha_line" | sed -E 's/^Green-Lane-Head-Sha:[[:space:]]*//; s/[[:space:]]*$//')"
  if ! printf '%s\n' "$sha" | grep -Eq '^[0-9a-f]{40}$'; then
    echo "ALERT (lane) Green-Lane-Head-Sha is not a full 40-hex commit sha: '$sha'"
    bad=1
  elif [[ "$sha" != "$head" ]]; then
    echo "ALERT (lane) Green-Lane-Head-Sha '$sha' does not match the current head '$head' — a push voids the declaration; restate it for the new head (DEC-20260822-01 clause 3)"
    bad=1
  fi

  return "$bad"
}

# validate_lane <head-sha> <base-sha> [changed-path ...] — the full
# qualifying test: declaration form, eligible path (clause 2), size bounds
# (clause 1). Returns 0 only when the change qualifies. Like
# validate_lane_shape it leaves the global `fail` alone; the caller decides
# what a non-qualifying declaration costs (clause 4: it costs the lane,
# never the Tier-2 marker). Changed paths arrive as trailing positional
# arguments, not a joined string — see classify_array's comment for why:
# `"$@"` is always safe to iterate here even when the caller passed none.
validate_lane() {
  local head="$1" base="$2"
  shift 2
  local bad=0 ineligible='' numstat files total p

  validate_lane_shape "$head" || bad=1

  # Eligible path (clause 2) and mixed changes (clause 4): a lane-declared PR
  # touching ANY ineligible path is wholly non-qualifying. No partial
  # application — splitting is the author's job before review, never after.
  # Each path tested whole, one per loop iteration (classify_array's
  # newline-safety rationale applies identically here), rather than a
  # newline-joined string re-split by grep.
  for p in "$@"; do
    if [[ ! "$p" =~ $LANE_ELIGIBLE_REGEX ]]; then
      ineligible="$ineligible$p"$'\n'
    fi
  done
  if [[ -n "$ineligible" ]]; then
    echo "ALERT (lane) changed paths outside the eligible path — /07-decisions/ only (DEC-20260822-01 clause 2); a mixed change is wholly non-qualifying (clause 4):"
    printf '%s' "$ineligible" | sed 's/^/  - /'
    bad=1
  fi

  # Size bounds (clause 1). FAIL-CLOSED: a diff whose size cannot be measured
  # is not a diff that has been shown to be within bounds.
  if ! numstat="$(git diff --numstat "$base"..."$head" 2>/dev/null)"; then
    echo "ALERT (lane) unable to compute the diff size for $base...$head — failing closed: the lane does not apply"
    bad=1
  # `grep -E ... >/dev/null`, never `grep -qE`: -q exits on the first match, and
  # under pipefail a SIGPIPE'd writer surfaces 141, which this negated test
  # would read as "not binary" — a FAIL-OPEN. Reachability is the reviewer's
  # point and my earlier reasoning was too quick: the binary check runs BEFORE
  # the file-count bound, so numstat is not yet known to be small. It still
  # takes thousands of files to fill the pipe, and such a change fails the
  # 3-file bound moments later — but "another check happens to catch it" is not
  # a property worth depending on in a guardrail. (Copilot review, PR #344.)
  elif printf '%s\n' "$numstat" | grep -E '^-[[:space:]]' >/dev/null; then
    echo "ALERT (lane) the diff contains a binary file, whose changed-line count is unmeasurable — failing closed"
    bad=1
  else
    files="$(printf '%s\n' "$numstat" | grep -c '.' || true)"
    total="$(printf '%s\n' "$numstat" | awk 'NF{s+=$1+$2} END{print s+0}')"
    if [[ "$files" -gt "$LANE_MAX_FILES" ]]; then
      echo "ALERT (lane) $files changed files exceeds the ratified bound of $LANE_MAX_FILES (DEC-20260822-01 clause 1)"
      bad=1
    fi
    if [[ "$total" -gt "$LANE_MAX_LINES" ]]; then
      echo "ALERT (lane) $total changed lines exceeds the ratified bound of $LANE_MAX_LINES (DEC-20260822-01 clause 1)"
      bad=1
    fi
  fi

  return "$bad"
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
    #
    # `-z`, unquoted, read into an ARRAY — never newline-joined text. Without
    # `-z`, git's default core.quotePath double-quotes and octal-escapes any
    # path with a non-ASCII byte (or `"`, `\`, a control char), so e.g.
    # `07-decisions/DEC-café.md` comes back as
    # `"07-decisions/DEC-caf\303\251.md"` — a leading `"` that TRIGGER_REGEX's
    # `^07-decisions/` anchor does not match (MEASURED with a fixture commit;
    # PR #344 advisory, reported outside clause 10). But converting `-z`'s NUL
    # terminators to newlines and handing the result to a line-oriented
    # matcher — this fix's first revision — trades that hole for a narrower
    # one: git also permits LITERAL newlines inside a filename, so such a
    # path reads as two lines, and a fragment after the embedded newline can
    # spuriously match TRIGGER_REGEX for a path that was never actually
    # changed (Copilot review, PR #347; MEASURED with a fixture file named
    # `<LF>07-decisions/fake.md`). NUL is the only byte guaranteed absent
    # from any path, so paths are read NUL-delimited into an array here —
    # one element per path, whole, regardless of content — and every match
    # downstream (classify_array, validate_lane) tests one array element at
    # a time, never a newline-split fragment of one.
    #
    # The diff is written to a temp file rather than piped, so git's own
    # exit status is checked directly against a redirect, never through a
    # pipeline's pipefail-mediated status (as the `tr` in this fix's first
    # revision briefly was).
    GIT_DIFF_TMP="$(mktemp)"
    if ! git diff --name-only -z "$BASE_SHA"..."$HEAD_SHA" >"$GIT_DIFF_TMP" 2>/dev/null; then
      rm -f "$GIT_DIFF_TMP"
      echo "ALERT (paths) unable to compute changed paths for $BASE_SHA..$HEAD_SHA — failing closed: Tier-2 flagged as required"
      fail=1
      validate_marker "$HEAD_SHA"
    else
      changed_arr=()
      while IFS= read -r -d '' cpath; do
        changed_arr+=( "$cpath" )
      done <"$GIT_DIFF_TMP"
      rm -f "$GIT_DIFF_TMP"

      # `"${changed_arr[@]}"` errors under `set -u` on bash < 4.4 when the
      # array has zero elements (an empty diff is possible — e.g. an empty
      # commit) — unlike `"$@"`, a caller's own named array is not exempt.
      # Guarded explicitly, once, here, rather than reaching for the more
      # obscure `${arr[@]+"${arr[@]}"}` idiom; classify_array and
      # validate_lane iterate `"$@"` internally, which needs no such guard.
      if (( ${#changed_arr[@]} > 0 )); then
        hits="$(classify_array "${changed_arr[@]}")" || true
      else
        hits=""
      fi
      if [[ -n "$hits" ]]; then
        echo "Tier-2 surfaces touched (DEC-20260814-02 trigger list):"
        printf '%s\n' "$hits" | sed 's/^/  - /'
        # Green lane (DEC-20260822-01 clause 10). A lane declaration stands in
        # for the Tier-2 marker ONLY when its form and both measurable bounds
        # hold. Any failure falls through to the marker requirement — clause
        # 4's fail-closed posture — so a broken or over-reaching declaration
        # never buys a pass, and the PR is told what it actually needs. A PR
        # carrying BOTH a bad declaration and a valid marker still passes, on
        # the marker's strength: the normal governed path is always available.
        if lane_declared; then
          lane_ok=0
          if (( ${#changed_arr[@]} > 0 )); then
            validate_lane "$HEAD_SHA" "$BASE_SHA" "${changed_arr[@]}" || lane_ok=1
          else
            validate_lane "$HEAD_SHA" "$BASE_SHA" || lane_ok=1
          fi
          if (( lane_ok == 0 )); then
            echo "green lane declared and within the ratified bounds — Tier-2 marker not required (DEC-20260822-01 Option A)"
            echo "  NOTE: lane FIT is attested, not verified here; every lane merge is audited post-hoc at 100% coverage at the next WF-10 (clause 6)"
          else
            echo "green lane declared but NOT qualifying — falling through to the Tier-2 marker requirement (DEC-20260822-01 clause 4)"
            validate_marker "$HEAD_SHA"
          fi
        else
          validate_marker "$HEAD_SHA"
        fi
      else
        echo "no Tier-2 trigger surface touched — marker not required"
      fi
    fi
    ;;

  marker)
    HEAD_SHA="${2:?usage: tier2-shape-check.sh marker <head-sha>}"
    validate_marker "$HEAD_SHA"
    ;;

  lane)
    # Declaration shape only. The eligible-path and size bounds need the diff
    # and are exercised through `pr` mode; this mode exists so the form rules
    # are testable in isolation, exactly as `marker` is.
    HEAD_SHA="${2:?usage: tier2-shape-check.sh lane <head-sha>}"
    validate_lane_shape "$HEAD_SHA" || fail=1
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

    # Marker validation — reviewer surfaces, model line, sha binding,
    # distinctness, malformations (FOUNDER-ACT-20261011-TIER2-SURFACE-
    # ATTESTATION B2-B4 on top of DEC-20260814-02).
    stm "valid marker (antigravity)"   0 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "valid marker (codex)"         0 $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "valid marker (chatgpt)"       0 $'Tier2-Reviewer-Id: chatgpt\nTier2-Reviewer-Model: GPT-5.6 Terra\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "valid marker (grok-build)"    0 $'Tier2-Reviewer-Id: grok-build\nTier2-Reviewer-Model: Grok 4.5\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "valid marker, model unavailable from the harness" 0 $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: unavailable-from-current-harness\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "valid marker with a Tier2-Verdict line after it" 0 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$GOOD_SHA"$'\nTier2-Verdict: PASS'
    stm "valid marker above attribution block" 0 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    stm "marker with CRLF"             0 $'Tier2-Reviewer-Id: antigravity\r\nTier2-Reviewer-Model: Gemini 3.8 Flash\r\nTier2-Head-Sha: '"$GOOD_SHA"$'\r'
    stm "empty body"                   1 ''
    stm "missing reviewer line"        1 $'Tier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "missing head-sha line"        1 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash'
    # The surface list is exact (act B2): a former roster model id, a
    # registered surface that is not a reviewer surface, and an unknown
    # value are all refused.
    stm "former roster model id refused (gemini-3.1-pro)" 1 $'Tier2-Reviewer-Id: gemini-3.1-pro\nTier2-Reviewer-Model: Gemini 3.1 Pro\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "former roster model id refused (grok-4.5)" 1 $'Tier2-Reviewer-Id: grok-4.5\nTier2-Reviewer-Model: Grok 4.5\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "former roster model id refused (chatgpt-5.6-sol)" 1 $'Tier2-Reviewer-Id: chatgpt-5.6-sol\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "non-reviewer surface refused (claude-code)" 1 $'Tier2-Reviewer-Id: claude-code\nTier2-Reviewer-Model: Opus\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "non-reviewer surface refused (cursor)" 1 $'Tier2-Reviewer-Id: cursor\nTier2-Reviewer-Model: x\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "surface with a suffix refused" 1 $'Tier2-Reviewer-Id: codex-cli\nTier2-Reviewer-Model: x\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "empty reviewer value"         1 $'Tier2-Reviewer-Id:\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$GOOD_SHA"
    # The model line is required (act B3).
    stm "missing model line"           1 $'Tier2-Reviewer-Id: antigravity\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "empty model value"            1 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model:\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "whitespace-only model value"  1 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model:   \nTier2-Head-Sha: '"$GOOD_SHA"
    stm "duplicate model lines"        1 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Reviewer-Model: Gemini 3.1 Pro\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "stale head sha (push voids)"  1 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$OTHER_SHA"
    stm "short head sha rejected"      1 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: aaaaaaa'
    stm "duplicate reviewer lines"     1 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Id: codex\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "duplicate head-sha lines"     1 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$GOOD_SHA"$'\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "reviewer equals actor-id"     1 $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: codex\nExecution-Surface: claude-code'
    # Independence of surfaces (act B4): the reviewer surface must differ
    # from every Execution-Surface in the attribution.
    stm "reviewer surface equals the execution surface" 1 $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: session:codex/x\nExecution-Surface: codex'
    stm "reviewer surface equals one of several execution surfaces" 1 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code\nExecution-Surface: antigravity'
    # SIGPIPE regression (Tier-2 review, codex, PR #372 at be52b41). The old
    # `printf | grep -Fxq` form returned 141 — no match — on this list once
    # it outgrew the pipe buffer, so the refusal never fired. value_in_lines
    # is tested directly because a PR body cannot carry a value list this
    # large through the environment; the marker case after it pins the same
    # property end to end at the largest body the environment allows.
    BIG_LIST="codex"$'\n'"$(printf 'claude-code\n%.0s' $(seq 1 30000))"
    if value_in_lines codex "$BIG_LIST"; then
      echo "selftest ok: early match in a list larger than the pipe buffer is found"
    else
      echo "SELFTEST FAIL: early match in a list larger than the pipe buffer is found"
      fail=1
    fi
    if value_in_lines cursor "$BIG_LIST"; then
      echo "SELFTEST FAIL: absent value in a large list is not found"
      fail=1
    else
      echo "selftest ok: absent value in a large list is not found"
    fi
    BIG_SURFACES="$(printf 'Execution-Surface: claude-code\n%.0s' $(seq 1 3000))"
    stm "large body: reviewer surface equals an early execution surface" 1 $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: codex\n'"$BIG_SURFACES"
    BIG_ACTORS="$(printf 'Actor-Id: session:y\n%.0s' $(seq 1 3000))"
    stm "large body: reviewer equals an early actor-id" 1 $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: codex\n'"$BIG_ACTORS"$'\nExecution-Surface: claude-code'
    # B4 reads the ATTRIBUTION block, not the whole body (Copilot, PR #372
    # at 91dbe24): a column-0 `Execution-Surface:` line in prose above the
    # final block does not count, and one inside the block always does.
    stm "execution surface in prose above the attribution block does not count" 0 $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nA quoted report:\nExecution-Surface: codex\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    stm "execution surface in the attribution block counts after trailing blanks" 1 $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: codex\n\n\n'
    stm "reviewer surface differs from the execution surface" 0 $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    # Bash 3.2 regression (Tier-2 review, codex, PR #372 at 2c12633): with
    # `mapfile` the surface refusal read no block on macOS /bin/bash and
    # passed by default. 3.2 is not available here, so the cases run marker
    # mode with the bash 4+ line builtins disabled, which is the failure the
    # review reproduced; then with `read` disabled, which makes the parser
    # yield nothing and must be refused, not skipped.
    stm_without() { # marker mode with builtins disabled: name, expected, builtins, body
      local name="$1" expected="$2" builtins="$3" body="$4" rc=0
      PR_BODY="$body" bash -c 'enable -n '"$builtins"' 2>/dev/null; . "$0" marker "$1"' "$0" "$GOOD_SHA" >/dev/null 2>&1 || rc=$?
      if [[ "$rc" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $rc, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }
    stm_without "without mapfile: reviewer surface equal to the execution surface is refused" 1 'mapfile readarray' $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: session:codex/x\nExecution-Surface: codex'
    stm_without "without mapfile: a valid marker still passes" 0 'mapfile readarray' $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    stm_without "attribution parser that yields nothing is refused, not skipped" 1 'read' $'Tier2-Reviewer-Id: codex\nTier2-Reviewer-Model: GPT-5.6 Sol\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    # The house rule, pinned: no bash 4+ line builtin is invoked in command
    # position anywhere in this file (comments and test names may name them).
    if grep -nE '^[^#]*(^|[;&|(]|then|do|else)[[:space:]]*(mapfile|readarray)([[:space:]]|$)' "$0" | grep -v 'grep -nE' >/dev/null; then
      echo "SELFTEST FAIL: no mapfile or readarray outside comments"
      fail=1
    else
      echo "selftest ok: no mapfile or readarray outside comments"
    fi
    # Contiguity/order regression cases (CodeRabbit finding, PR #239): the
    # marker is ONE ordered, contiguous block.
    stm "reversed marker order"        1 $'Tier2-Head-Sha: '"$GOOD_SHA"$'\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Reviewer-Id: antigravity'
    stm "model line after head sha"    1 $'Tier2-Reviewer-Id: antigravity\nTier2-Head-Sha: '"$GOOD_SHA"$'\nTier2-Reviewer-Model: Gemini 3.8 Flash'
    stm "model line before reviewer"   1 $'Tier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Reviewer-Id: antigravity\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "separated marker lines"       1 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash\nsome prose between\nTier2-Head-Sha: '"$GOOD_SHA"
    stm "blank line inside marker"     1 $'Tier2-Reviewer-Id: antigravity\n\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$GOOD_SHA"
    # BY DESIGN: the marker is NOT end-anchored — the end-anchored block is
    # the Attribution block, which must be the body's FINAL content, so the
    # Tier-2 marker always has content after it (DEC-20260814-02 clause 3
    # as corrected 2026-08-14). Prose after a valid marker passes.
    stm "content after marker passes (by design)" 0 $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$GOOD_SHA"$'\n\nOrdinary prose, then the Attribution block.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'

    # Column-0 requirement: an indented marker is not a trailer and must
    # be treated as missing (Tier-2 review finding 5, PR #239).
    stm "indented marker rejected"     1 $' Tier2-Reviewer-Id: antigravity\n Tier2-Reviewer-Model: Gemini 3.8 Flash\n Tier2-Head-Sha: '"$GOOD_SHA"

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
      "$OTHER_SHA" HEAD $'Tier2-Reviewer-Id: antigravity\nTier2-Reviewer-Model: Gemini 3.8 Flash\nTier2-Head-Sha: '"$HEAD_RESOLVED"

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

    # Quoted-pathname regression (PR #344 advisory, reported outside clause
    # 10): a trigger-surface path that git's default core.quotePath renders
    # quoted (any non-ASCII byte, or `"`, `\`, a control char) must still be
    # classified as a hit — MEASURED: before the `-z` fix above, this fixture
    # silently returned "no Tier-2 trigger surface touched". Same
    # throwaway-fixture pattern as the divergent-history case above.
    FIXDIR="$(mktemp -d)"
    (
      cd "$FIXDIR" || exit 1
      git init -q -b main . \
        && git -c user.email=selftest@local -c user.name=selftest commit -q --allow-empty -m base \
        && git checkout -q -b feature \
        && mkdir -p 07-decisions \
        && printf 'x\n' > "07-decisions/DEC-café-test.md" \
        && git add -A && git -c user.email=selftest@local -c user.name=selftest commit -qm trigger-non-ascii-filename
    )
    quoted_head="$(git -C "$FIXDIR" rev-parse feature)"
    quoted_rc=0
    ( cd "$FIXDIR" && PR_BODY='' bash "$SELF_ABS" pr main feature >/dev/null 2>&1 ) || quoted_rc=$?
    if [[ "$quoted_rc" -ne 1 ]]; then
      echo "SELFTEST FAIL: quoted non-ASCII trigger path detected, no marker (exit $quoted_rc, expected 1)"
      fail=1
    else
      echo "selftest ok: quoted non-ASCII trigger path is still classified as a hit"
    fi
    quoted_rc=0
    ( cd "$FIXDIR" && PR_BODY=$'Tier2-Reviewer-Id: grok-build\nTier2-Reviewer-Model: Grok 4.5\nTier2-Head-Sha: '"$quoted_head" bash "$SELF_ABS" pr main feature >/dev/null 2>&1 ) || quoted_rc=$?
    if [[ "$quoted_rc" -ne 0 ]]; then
      echo "SELFTEST FAIL: quoted non-ASCII trigger path with a valid marker passes (exit $quoted_rc, expected 0)"
      fail=1
    else
      echo "selftest ok: quoted non-ASCII trigger path with a valid marker passes"
    fi
    rm -rf "$FIXDIR"

    # Embedded-newline regression (Copilot review, PR #347): a single real
    # file whose path is `<LF>07-decisions/fake.md` — one path component
    # starting with a newline, immediately followed by the trigger prefix,
    # no real 07-decisions/ directory anywhere in it — must NOT be
    # classified as a trigger-surface hit. MEASURED: this exact fixture
    # falsely triggered under `-z | tr '\0' '\n' | grep`, the fix's first
    # revision, and does not under the array-based rewrite.
    FIXDIR="$(mktemp -d)"
    (
      cd "$FIXDIR" || exit 1
      git init -q -b main . \
        && git -c user.email=selftest@local -c user.name=selftest commit -q --allow-empty -m base \
        && git checkout -q -b feature \
        && weirdname=$'\n07-decisions' \
        && mkdir -p "$weirdname" \
        && printf 'x\n' > "$weirdname/fake.md" \
        && git add -A && git -c user.email=selftest@local -c user.name=selftest commit -qm embedded-newline-lookalike
    )
    newline_rc=0
    ( cd "$FIXDIR" && PR_BODY='' bash "$SELF_ABS" pr main feature >/dev/null 2>&1 ) || newline_rc=$?
    if [[ "$newline_rc" -ne 0 ]]; then
      echo "SELFTEST FAIL: embedded-newline lookalike not classified as a hit (exit $newline_rc, expected 0 — no real trigger surface touched)"
      fail=1
    else
      echo "selftest ok: embedded-newline lookalike is not classified as a hit"
    fi
    rm -rf "$FIXDIR"

    # Empty-diff regression: `"${changed_arr[@]}"` on a zero-element array
    # errors under `set -u` on bash < 4.4 unless guarded. An empty commit
    # against its own parent has zero changed paths, so `pr` mode must still
    # complete cleanly rather than aborting on that expansion.
    FIXDIR="$(mktemp -d)"
    (
      cd "$FIXDIR" || exit 1
      git init -q -b main . \
        && git -c user.email=selftest@local -c user.name=selftest commit -q --allow-empty -m base \
        && git checkout -q -b feature \
        && git -c user.email=selftest@local -c user.name=selftest commit -q --allow-empty -m still-empty
    )
    empty_rc=0
    ( cd "$FIXDIR" && PR_BODY='' bash "$SELF_ABS" pr main feature >/dev/null 2>&1 ) || empty_rc=$?
    if [[ "$empty_rc" -ne 0 ]]; then
      echo "SELFTEST FAIL: empty diff did not complete cleanly (exit $empty_rc, expected 0)"
      fail=1
    else
      echo "selftest ok: empty diff completes cleanly (no unbound-array abort)"
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

    # ---------------------------------------------------------------------
    # GREEN LANE (DEC-20260822-01 clause 10 implementation).
    #
    # Part 1 — declaration FORM, in isolation, mirroring the marker cases.
    stl() { # lane-mode case: name, expected exit, body
      local name="$1" expected="$2" body="$3" rc=0
      PR_BODY="$body" bash "$0" lane "$GOOD_SHA" >/dev/null 2>&1 || rc=$?
      if [[ "$rc" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $rc, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }
    stl "lane decl single lane"        0 $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl multiple lanes"     0 $'Green-Lane-Id: GL-2, GL-3\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl all five lanes"     0 $'Green-Lane-Id: GL-1,GL-2,GL-3,GL-4,GL-5\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl above attribution"  0 $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: '"$GOOD_SHA"$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    stl "lane decl with CRLF"          0 $'Green-Lane-Id: GL-2\r\nGreen-Lane-Head-Sha: '"$GOOD_SHA"$'\r'
    # FLIPPED 0 -> 1 by the Founder's positional ruling of 2026-09-16. The
    # Tier-2 MARKER still admits prose after it (DEC-20260814-02 clause 3, and
    # the by-design case for it is unchanged above); the LANE DECLARATION does
    # not. That divergence is the ruling, and it is what makes a quoted example
    # distinguishable from a declaration without parsing Markdown.
    stl "lane decl with prose after it is refused" 1 $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: '"$GOOD_SHA"$'\n\nOrdinary prose, then the Attribution block.\n\nRole-Id: builder\nActor-Id: session:x'
    stl "lane decl empty body"         1 ''
    stl "lane decl missing head-sha"   1 $'Green-Lane-Id: GL-2'
    stl "lane decl missing lane id"    1 $'Green-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl empty lane value"   1 $'Green-Lane-Id:\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl unknown lane GL-6"  1 $'Green-Lane-Id: GL-6\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl unknown lane GL-0"  1 $'Green-Lane-Id: GL-0\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl non-GL token"       1 $'Green-Lane-Id: registry-mechanics\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl one good one bad"   1 $'Green-Lane-Id: GL-2, GL-9\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl duplicate lane id"  1 $'Green-Lane-Id: GL-2, GL-2\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl trailing comma"     1 $'Green-Lane-Id: GL-2,\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    # FLIPPED 1 -> 0 by the same ruling: "a Green-Lane-Id: line anywhere else
    # in the body is prose and is ignored", so an earlier line is not a
    # duplicate — it is prose, and the final block is the declaration. The
    # uniqueness check it used to need is now structural: lane_decl_lines
    # returns exactly two adjacent lines or nothing.
    stl "earlier Green-Lane-Id line is prose, not a duplicate" 0 $'Green-Lane-Id: GL-2\nGreen-Lane-Id: GL-3\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl duplicate sha lines" 1 $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: '"$GOOD_SHA"$'\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl stale head (push voids)" 1 $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: '"$OTHER_SHA"
    stl "lane decl short head sha"     1 $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: aaaaaaa'
    stl "lane decl reversed order"     1 $'Green-Lane-Head-Sha: '"$GOOD_SHA"$'\nGreen-Lane-Id: GL-2'
    stl "lane decl separated lines"    1 $'Green-Lane-Id: GL-2\nsome prose between\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl blank line inside"  1 $'Green-Lane-Id: GL-2\n\nGreen-Lane-Head-Sha: '"$GOOD_SHA"
    stl "lane decl indented rejected"  1 $' Green-Lane-Id: GL-2\n Green-Lane-Head-Sha: '"$GOOD_SHA"

    # Part 2 — the two bounds the gate can MEASURE: eligible path (clause 2 /
    # clause 4 mixed changes) and diff size (clause 1). Each case builds a
    # throwaway fixture repo whose feature branch changes a given set of paths
    # at given line counts, then runs `pr` mode against that fixture's real
    # head. No network, no external dependencies.
    stlane() { # name, expected, lane-ids ('' = none), extra-body, path:lines...
      local name="$1" expected="$2" ids="$3" extra="$4"; shift 4
      local dir rc=0 head body spec path lines i
      dir="$(mktemp -d)"
      (
        cd "$dir" || exit 1
        git init -q -b main . \
          && git -c user.email=selftest@local -c user.name=selftest commit -q --allow-empty -m base \
          && git checkout -q -b feature || exit 1
        for spec in "$@"; do
          path="${spec%%:*}"; lines="${spec##*:}"
          mkdir -p "$(dirname "$path")" || exit 1
          : > "$path"
          if [[ "$lines" == bin ]]; then
            printf '\x00\x01\x02binary\xff' > "$path"
          else
            i=0
            while (( i < lines )); do echo "line $i" >> "$path"; i=$((i+1)); done
          fi
        done
        git add -A && git -c user.email=selftest@local -c user.name=selftest commit -qm lane-change
      ) >/dev/null 2>&1 || { echo "SELFTEST FAIL: $name (fixture setup)"; fail=1; rm -rf "$dir"; return; }
      head="$(git -C "$dir" rev-parse feature)"
      body=''
      [[ -n "$ids" ]] && body=$'Green-Lane-Id: '"$ids"$'\nGreen-Lane-Head-Sha: '"$head"
      [[ -n "$extra" ]] && body="$body${extra//__HEAD__/$head}"
      ( cd "$dir" && PR_BODY="$body" bash "$SELF_ABS" pr main feature >/dev/null 2>&1 ) || rc=$?
      rm -rf "$dir"
      if [[ "$rc" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $rc, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }

    # Qualifying — the case the decision exists for: a small registry-mechanics
    # row in /07-decisions/ merges on the declaration, with no Tier-2 marker.
    stlane "lane qualifies: one small decisions file" 0 'GL-2' '' '07-decisions/decision-log.md:4'
    stlane "lane qualifies: three files at the bound" 0 'GL-2, GL-3' '' \
      '07-decisions/decision-log.md:5' '07-decisions/decision-id-reservations.md:5' '07-decisions/ops-actions-log.md:5'
    stlane "lane qualifies: exactly 50 changed lines" 0 'GL-3' '' '07-decisions/decision-log.md:50'

    # Size bounds (clause 1) — one over each ratified limit.
    stlane "lane fails: 4 files exceeds the 3-file bound" 1 'GL-2' '' \
      '07-decisions/a.md:2' '07-decisions/b.md:2' '07-decisions/c.md:2' '07-decisions/d.md:2'
    stlane "lane fails: 51 changed lines exceeds the 50-line bound" 1 'GL-3' '' '07-decisions/decision-log.md:51'

    # Eligible path (clause 2) and mixed changes (clause 4).
    stlane "lane fails: mixed decisions + scripts is wholly non-qualifying" 1 'GL-2' '' \
      '07-decisions/decision-log.md:3' '00-system/scripts/tier2-shape-check.sh:3'
    stlane "lane fails: constitution is never lane work" 1 'GL-1' '' '01-constitution/agent-rules.md:3'
    stlane "lane fails: workflows are categorically excluded" 1 'GL-5' '' '.github/workflows/tier2-shape.yml:3'
    stlane "lane fails: a non-trigger path still breaks eligibility" 1 'GL-2' '' \
      '07-decisions/decision-log.md:3' '08-research/note.md:3'

    # The normal governed path stays available. A non-qualifying declaration
    # costs the LANE, never the Tier-2 marker: with a valid marker the same
    # mixed change passes, and without one it fails.
    stlane "non-qualifying lane still passes on a valid Tier-2 marker" 0 'GL-2' \
      $'\nTier2-Reviewer-Id: grok-build\nTier2-Reviewer-Model: Grok 4.5\nTier2-Head-Sha: __HEAD__' \
      '07-decisions/decision-log.md:3' '00-system/scripts/tier2-shape-check.sh:3'

    # Regressions: lane logic must not alter behaviour where no lane is declared.
    stlane "no declaration, trigger touched, no marker still fails" 1 '' '' '07-decisions/decision-log.md:3'
    stlane "no declaration, trigger touched, valid marker still passes" 0 '' \
      $'Tier2-Reviewer-Id: grok-build\nTier2-Reviewer-Model: Grok 4.5\nTier2-Head-Sha: __HEAD__' '07-decisions/decision-log.md:3'
    stlane "no trigger surface touched — declaration is irrelevant" 0 'GL-5' '' 'docs/note.md:3'

    # An unmeasurable diff is not a diff shown to be within bounds: a binary
    # file under an eligible path fails the lane closed rather than passing on
    # a size that cannot be computed.
    stlane "lane fails closed on a binary file" 1 'GL-5' '' '07-decisions/blob.bin:bin'

    # This gate cannot tell a real declaration from one QUOTED in prose, so a
    # PR documenting the trailer format at column 0 is routed to the lane path.
    #
    # RETRACTED (Tier-2 review, grok-4.5, PR #344 @ 0187cfa): an earlier
    # version of this comment called that "harmless" on the reasoning that such
    # a PR is a docs/scripts change which fails clause 2 eligibility and falls
    # through to the marker. THAT REASONING IS FALSE, and false for precisely
    # the case that matters. It holds only when the PR also touches an
    # ineligible path — as this case below does. A documentation PR touching
    # ONLY /07-decisions/ is size-eligible AND quoting, so the quote grants the
    # lane and skips the marker. The reviewer measured exactly that and ruled
    # it BLOCKING.
    #
    # REMEDIATED since, by the Founder's positional ruling of 2026-09-16 (see
    # lane_decl_lines): a declaration counts only as the FINAL trailer block,
    # so every quoted example that is not last — fenced or not — is now prose.
    # NOT fully closed, and this is the honest bound: an example that happens
    # to sit last, immediately above the Attribution block, is still
    # indistinguishable from a declaration. That residue rests where lane FIT
    # always rested — clause 3's honesty class and clause 6's 100% post-hoc
    # WF-10 audit — and Stage A remains advisory and blocks no merge.
    stlane "quoted example falls through and passes on the marker" 0 '' \
      $'This PR documents the format:\n\nGreen-Lane-Id: GL-2\nGreen-Lane-Head-Sha: <sha>\n\nTier2-Reviewer-Id: grok-build\nTier2-Reviewer-Model: Grok 4.5\nTier2-Head-Sha: __HEAD__' \
      '00-system/scripts/foo.sh:3'
    stlane "quoted example without a marker still fails" 1 '' \
      $'This PR documents the format:\n\nGreen-Lane-Id: GL-2\nGreen-Lane-Head-Sha: <sha>' \
      '00-system/scripts/foo.sh:3'

    # Large-body detection (Copilot finding, PR #344). A PR body runs to
    # GitHub's 65536-character limit, and the old `printf | tr | grep -q`
    # form of lane_declared could return FALSE on a real match there: grep
    # exits on match, the writer takes SIGPIPE, pipefail surfaces 141. HONEST
    # LIMIT: that race is timing-dependent and this case does not reliably
    # reproduce it — it would likely have passed against the old code too.
    # What it pins is the PROPERTY, not the race: a declaration preceded by a
    # body at the platform limit is still seen. The race is removed by
    # construction instead, by having no pipe there at all.
    BIG_PAD="$(head -c 70000 /dev/zero | tr '\0' 'x')"
    stlane "large body still detects the lane declaration" 0 '' \
      "$BIG_PAD"$'\nGreen-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__' \
      '07-decisions/decision-log.md:4'

    # The accidental-declaration class, in the shapes that actually occur.
    # HONEST LABEL (Copilot finding, PR #344): these no longer exercise any
    # fence handling — that parser is deleted. They pass because a closing
    # fence line is non-Attribution content following the declaration, which
    # the positional rule rejects. They are kept because the SHAPES are the
    # real-world ones a documentation PR produces, not because the gate reads
    # Markdown; it does not.
    FENCE='```'
    stlane "example in a backtick block is refused" 1 '' \
      "Docs:"$'\n\n'"$FENCE"$'\nGreen-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\n'"$FENCE"$'\n\nRole-Id: builder' \
      '07-decisions/decision-log.md:3'
    stlane "example in a tilde block is refused" 1 '' \
      $'Docs:\n\n~~~\nGreen-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\n~~~\n\nRole-Id: builder' \
      '07-decisions/decision-log.md:3'
    # An earlier example is prose; the FINAL block is the declaration. This is
    # the ruling's "anywhere else in the body is prose and is ignored".
    stlane "earlier example is prose, final block is the declaration" 0 '' \
      "Docs:"$'\n\n'"$FENCE"$'\nGreen-Lane-Id: GL-9\nGreen-Lane-Head-Sha: deadbeef\n'"$FENCE"$'\n\nGreen-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__' \
      '07-decisions/decision-log.md:3'
    stlane "ordinary declaration qualifies" 0 'GL-2' '' \
      '07-decisions/decision-log.md:3'

    # KNOWN RESIDUAL, pinned deliberately rather than left undocumented, and
    # stated at its true width: a column-0 quote carrying the live head is
    # accepted ONLY when it is the FINAL trailer block. A mid-body quote is
    # prose and is refused, fenced or not. What remains is a documentation
    # example that happens to be last — textually identical to a declaration,
    # because at that point it is what a trailer IS. The ratified Tier-2
    # marker carries the same exposure (a body quoting Tier2-Reviewer-Id plus
    # the live head satisfies it), so closing this for the lane alone would
    # not close the class, and closing it for both means changing
    # DEC-20260814-02's marker contract, which is outside clause 10. Reported
    # for a separate governed PR. (An earlier version of this comment said
    # "UNFENCED column-0 quote … is accepted" without the final-block
    # qualifier, and credited fence handling with covering the ordinary
    # accident. Both were stale after the parser was deleted — the positional
    # rule is what covers it. Tier-2 review, PR #344.)
    # The positional ruling's core value: a documentation example with ANY
    # non-Attribution content after it is prose, whatever its indentation or
    # fencing. These were the accidental-grant class.
    stlane "docs example with prose after it is refused" 1 '' \
      $'Docs. Example:\n\nGreen-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\n\nThat is the format. See DEC-20260822-01.\n\nRole-Id: builder' \
      '07-decisions/decision-log.md:3'
    stlane "example followed by a heading is refused" 1 '' \
      $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\n\n## Notes\nRole-Id: builder' \
      '07-decisions/decision-log.md:3'
    # A real declaration with an Attribution block after it must still qualify.
    stlane "declaration above the Attribution block qualifies" 0 '' \
      $'Some summary prose about the change.\n\nGreen-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code' \
      '07-decisions/decision-log.md:3'

    # THE RESIDUE, pinned deliberately and named for what it is. The ruling
    # does NOT eliminate the accidental-declaration class; it removes every
    # quoted example that is not last. A documentation body whose example
    # happens to BE the final block is still indistinguishable from a
    # declaration — there is no textual difference between the two. Rests
    # where lane FIT always rested: clause 3's honesty class and clause 6's
    # 100% post-hoc WF-10 audit. Do not read this case as an oversight.
    # The construction here previously ended with a lone `Role-Id:` line and is
    # now REFUSED by the Actor-Id requirement above — the residue is narrower
    # than it was. It is not gone: a documentation body whose example is the
    # final block AND is followed by a real Attribution block is still
    # indistinguishable from a declaration, because at that point it is
    # textually identical to one. That is the honest residue and this is it.
    stlane "docs whose example IS the final block still qualifies (residue)" 0 '' \
      $'This PR documents the lane format. Example:\n\nGreen-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code' \
      '07-decisions/decision-log.md:3'
    # Trailing lines that merely LOOK like an Attribution block do not make
    # one. Measured accepted before the fix (Copilot finding, PR #344).
    stlane "declaration + attribution-shaped prose without Actor-Id is refused" 1 '' \
      $'This PR documents the trailer formats:\n\nGreen-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\nRole-Id: <one of the 17 role IDs>' \
      '07-decisions/decision-log.md:3'
    stlane "declaration + a real Attribution block qualifies" 0 '' \
      $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code' \
      '07-decisions/decision-log.md:3'
    stlane "declaration with nothing after it qualifies" 0 'GL-3' '' \
      '07-decisions/decision-log.md:3'
    # The trailing run must be ONE block of real trailers. All three of these
    # were MEASURED granting the lane against the single-field heuristic that
    # preceded this check (Copilot findings, PR #344).
    stlane "blank line splitting the attribution run is refused" 1 '' \
      $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\n\nRole-Id: builder\n\nActor-Id: session:x' \
      '07-decisions/decision-log.md:3'
    stlane "Actor-Id with an empty value is refused" 1 '' \
      $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\n\nRole-Id: <one of the 17 role IDs>\nActor-Id:' \
      '07-decisions/decision-log.md:3'
    stlane "Actor-Id with a whitespace-only value is refused" 1 '' \
      $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\n\nRole-Id: builder\nActor-Id:    ' \
      '07-decisions/decision-log.md:3'
    # ... without rejecting the legitimate shapes around them.
    stlane "attribution immediately after the declaration qualifies" 0 '' \
      $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\nRole-Id: builder\nActor-Id: session:x' \
      '07-decisions/decision-log.md:3'
    stlane "trailing blank lines after the attribution block are fine" 0 '' \
      $'Green-Lane-Id: GL-2\nGreen-Lane-Head-Sha: __HEAD__\n\nRole-Id: builder\nActor-Id: session:x\n\n' \
      '07-decisions/decision-log.md:3'

    # DELETED WITH THE PARSER (Copilot finding, PR #344, taken). This block
    # held nine cases asserting Markdown fence mechanics — mixed delimiters,
    # 0-3 space indentation, info strings, closing-run length, tab handling.
    # Four of them pinned real fail-opens at the time and were worth having.
    # `lane_body` no longer exists: the gate reads no Markdown at all, so
    # those cases passed for a reason unrelated to their names and asserted
    # coverage the implementation cannot provide. A mislabelled green test is
    # worse than no test, so they are removed rather than renamed. The two
    # properties among them that are still real are re-expressed positionally
    # below; the defect history stays in DEC-20260822-01.

    # Content BETWEEN the two trailer lines breaks the block — the line above
    # Green-Lane-Head-Sha must be Green-Lane-Id and nothing else.
    stlane "content between the trailers is refused" 1 '' \
      $'Green-Lane-Id: GL-2\n'"$FENCE"$'\nnoise\n'"$FENCE"$'\nGreen-Lane-Head-Sha: __HEAD__' \
      '07-decisions/decision-log.md:3'
    # Indentation of the declaration itself: a trailer is column-0 or it is
    # not a trailer, so an indented pair is not a declaration.
    stlane "indented declaration is not a declaration" 1 '' \
      $'  Green-Lane-Id: GL-2\n  Green-Lane-Head-Sha: __HEAD__' \
      '07-decisions/decision-log.md:3'
    ;;

  *)
    echo "usage: tier2-shape-check.sh pr <base-sha> <head-sha> (PR_BODY env) | marker <head-sha> (PR_BODY env) | lane <head-sha> (PR_BODY env) | classify (paths on stdin) | selftest" >&2
    exit 2
    ;;
esac

if (( fail )); then
  echo "tier2-shape-check: ALERT — Tier-2 shape violations above (advisory Stage A; not a merge block)" >&2
  exit 1
fi
echo "tier2-shape-check: PASS — Tier-2 shape valid (shape-only; attested values are not verified)"

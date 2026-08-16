#!/usr/bin/env bash
# attribution-shape-check.sh — Layer 2 shape-only attribution check.
#
# PORTED VERBATIM from FounderOS `00-system/scripts/attribution-shape-check.sh`
# under `DEC-20260815-18` clause 1, which adopts the FounderOS attribution
# conventions for this repository as a CONVENTION, not as a second governance
# authority (clause 2). FounderOS remains the system of record; this copy is
# kept byte-comparable so the two can be diffed, with exactly ONE intentional
# behavioural divergence, marked below at HISTORICAL_BRANCH_ALLOWLIST.
#
# Original header follows.
#
# Layer 2 shape-only attribution check for the MAD Ventures OS
# (DEC-20260718-05 clause 19, activated in the same sequence as Layer 1 per
# clause 21).
#
# Pattern: "gate, never edit" (DEC-20260718-02 / path-audit.sh). This script
# reads git state and exits pass/fail. It never modifies anything, and it is
# SHAPE-ONLY: it validates the form of the Attribution block, never whether an
# attested value is true (clause 20 — no truth oracle).
#
# Checks (exactly clause 19 a–c):
#   (a) Branch-prefix check — fail any NEW branch whose name (the path
#       segment after refs/heads/) matches ^(plato|copilot)/ ,
#       CASE-INSENSITIVE. Exempt ONLY if on the pinned historical
#       allowlist below — commit timestamps are contributor-controlled
#       (backdatable) and are never used as authorization
#       (DEC-20260721-01 hardening, 2026-07-21). No intent inference: the
#       prohibition is on the prefixes themselves (clause 5a).
#   (b) Attribution-value check — a Role-Id trailer value must match the
#       enumerated 17-role alternation below, not a permissive pattern.
#       Invented values (operator, boss, founder) are rejected. A commit
#       with no Role-Id but Actor-Id: founder is valid (direct-founder
#       work); Role-Id: founder is invalid.
#   (c) Missing-attribution check — fail when ANY applicable commit (a
#       commit landing role-accountable work under the path filter below)
#       — and the final merged commit on main — lacks a valid Attribution
#       block. Every applicable commit is evaluated independently; the
#       check never passes merely because some other commit carries a
#       block.
#
# PATH FILTER for clause 19(c): `**` — every tracked path in the repository.
# A commit is APPLICABLE if it changes at least one file (non-empty diff;
# for merge commits, the combined diff — a clean merge with no conflict
# resolutions changes no files and is therefore not applicable inside a PR
# range, but the final merged commit on main is always evaluated). In this
# product repository every file-changing commit lands role-accountable
# work unless it is direct-founder work, which the block still records via
# Actor-Id: founder.
#
# Clause 19(a) historical exemption — pinned allowlist (DEC-20260721-01).
#
# ===================== DELIBERATE DIVERGENCE FROM FounderOS ====================
# In FounderOS this allowlist pins exactly the two pre-activation branches that
# existed when the exemption was ruled. THIS REPOSITORY HAS NO SUCH BRANCHES:
# the gate is adopted at first commit (`DEC-20260815-18` clause 3 — "a
# convention adopted at first commit is expensive to retrofit"), so no branch
# predates it and nothing can qualify for a historical exemption.
#
# The allowlist is therefore deliberately EMPTY: `^$` never matches, because the
# branch name is a required non-empty argument. That makes this gate strictly
# STRONGER than the FounderOS one, never weaker — a `plato/` or `copilot/`
# branch is prohibited here with no exemption path at all.
#
# This is the ONE intentional behavioural difference from the ported script. The
# `selftest` case below asserts the rejection rather than the exemption, and the
# two must be changed together if a Founder ever grants an exemption here.
# =============================================================================
HISTORICAL_BRANCH_ALLOWLIST='^$'
#
# Usage:
#   attribution-shape-check.sh pr   <base-sha> <head-sha> <head-branch-name>
#   attribution-shape-check.sh main <head-sha>
# Exit: 0 = pass; 1 = one or more violations (each printed); 2 = usage error.
# No network, no LLM, no external dependencies: bash + git + grep only.

set -euo pipefail

# The seventeen roles ratified before 2026-08-12, plus twelve of the thirteen
# added by DEC-20260812-03 (OA-1 charter ratification, ratified 2026-08-12).
#
# ============================ DELIBERATE ASYMMETRY ============================
# The canonical registry in /04-agents/role-registry.md holds THIRTY roles.
# This list holds TWENTY-NINE. That is not an omission and must not be
# "corrected" by adding the missing role.
#
# `investment-acquisition-lead` is ratified as to its authority boundary but is
# `activation_status: deferred` — non-assignable, non-routable, and ineligible
# for attributed work until a separate explicit Founder activation ruling
# (DEC-20260812-03, Founder ruling 2026-08-12).
#
# Excluding it here is how that invariant is ENFORCED rather than merely
# documented: a commit attributing work to a deferred role fails this required
# check. Restoring it to this list would silently delete the control.
#
# Adding it requires a Founder activation ruling flipping activation_status to
# `active` in the registry. The `selftest` mode carries a negative assertion
# proving the rejection holds; that assertion must be updated in the same
# change, never removed.
# =============================================================================
#
# Otherwise this list MUST stay in sync with the roster summary in
# /04-agents/role-registry.md: a role absent here cannot be used for attributed
# work, because its commits fail this required check.
ROLE_ID_REGEX='^Role-Id:[[:space:]]*(strategist|architect|builder|researcher|experience-architect|independent-reviewer|product-lead|brand-lead|marketing-lead|operations-lead|finance-lead|legal-risk|qa-lead|pre-mortem-reviewer|chief-of-staff|deputy-chief-of-staff|founder-mirror|chief-strategy-officer|chief-operating-officer|chief-financial-officer|chief-marketing-creative-officer|chief-compliance-officer|security-lead|data-intelligence-lead|reliability-lead|portfolio-venture-lead|growth-commercial-lead|innovation-futures-lead|program-execution-lead)[[:space:]]*$'

MODE="${1:-}"
fail=0

# --- helpers ---------------------------------------------------------------

# validate_block <sha> <label>
# Applies (b) and the block-validity rules of (c) to one commit.
validate_block() {
  local sha="$1" label="$2" body role_lines actor_founder actor_present
  body="$(git log -1 --format=%B "$sha")"

  role_lines="$(printf '%s\n' "$body" | grep -E '^Role-Id:' || true)"
  actor_present="$(printf '%s\n' "$body" | grep -E '^Actor-Id:[[:space:]]*[^[:space:]]' || true)"
  actor_founder="$(printf '%s\n' "$body" | grep -E '^Actor-Id:[[:space:]]*founder[[:space:]]*$' || true)"

  if [[ -n "$role_lines" ]]; then
    # (b) every Role-Id line must match the enumerated 17-role alternation.
    while IFS= read -r line; do
      if ! printf '%s\n' "$line" | grep -Eq "$ROLE_ID_REGEX"; then
        echo "FAIL (b) $label $sha: invalid Role-Id value: '$line'"
        fail=1
      fi
    done <<< "$role_lines"
    # A block also requires Actor-Id (Appendix A canonical form).
    if [[ -z "$actor_present" ]]; then
      echo "FAIL (c) $label $sha: Role-Id present but Actor-Id missing"
      fail=1
    fi
  else
    # No Role-Id: valid only as direct-founder work (Actor-Id: founder).
    if [[ -z "$actor_founder" ]]; then
      echo "FAIL (c) $label $sha: no valid Attribution block (no Role-Id trailer and no 'Actor-Id: founder')"
      fail=1
    fi
  fi
}

# applicable <sha> — exit 0 if the commit changes at least one file under
# the path filter (`**`): non-empty (combined, for merges) diff. Exit 1 if
# the diff is genuinely empty. Exit 2 if the commit cannot be read — the
# caller must FAIL CLOSED on that: a read error is never treated as
# "not applicable" (independent review, 2026-07-21).
applicable() {
  local sha="$1" files
  if ! files="$(git show --pretty=format: --name-only "$sha" 2>/dev/null)"; then
    return 2
  fi
  [[ -n "$(printf '%s\n' "$files" | grep -v '^$' || true)" ]]
}

# --- modes -----------------------------------------------------------------

case "$MODE" in
  pr)
    BASE_SHA="${2:?usage: attribution-shape-check.sh pr <base-sha> <head-sha> <head-branch-name>}"
    HEAD_SHA="${3:?usage: attribution-shape-check.sh pr <base-sha> <head-sha> <head-branch-name>}"
    BRANCH="${4:?usage: attribution-shape-check.sh pr <base-sha> <head-sha> <head-branch-name>}"

    # (a) branch-prefix check — case-insensitive, on the segment after
    # refs/heads/; exempt only via the pinned historical allowlist, never
    # via contributor-controlled timestamps.
    if printf '%s\n' "$BRANCH" | grep -Eiq '^(plato|copilot)/'; then
      if printf '%s\n' "$BRANCH" | grep -Eq "$HISTORICAL_BRANCH_ALLOWLIST"; then
        echo "note (a): branch '$BRANCH' is on the pinned historical allowlist (pre-activation) — exempt"
      else
        echo "FAIL (a) branch '$BRANCH': prohibited branch prefix (^(plato|copilot)/, case-insensitive; DEC-20260718-05 clause 5a; timestamps are never authorization)"
        fail=1
      fi
    fi

    # (b)+(c) every commit in the PR range, evaluated independently.
    while IFS= read -r sha; do
      [[ -z "$sha" ]] && continue
      app_rc=0; applicable "$sha" || app_rc=$?
      if [[ "$app_rc" -eq 0 ]]; then
        validate_block "$sha" "commit"
      elif [[ "$app_rc" -eq 2 ]]; then
        # Fail closed: a commit we cannot read is a gate failure, never a
        # skipped check.
        echo "FAIL (c) commit $sha: unable to read commit for applicability check (failing closed)"
        fail=1
      else
        # Not applicable under the path filter; still apply (b) to any
        # Role-Id trailer it carries.
        if git log -1 --format=%B "$sha" | grep -Eq '^Role-Id:'; then
          validate_block "$sha" "commit(non-applicable)"
        fi
      fi
    done < <(git rev-list --reverse "$BASE_SHA..$HEAD_SHA")
    ;;

  main)
    HEAD_SHA="${2:?usage: attribution-shape-check.sh main <head-sha>}"
    # (c) the final merged commit on main is always evaluated — it is the
    # authoritative attribution record (clause 7), regardless of merge
    # strategy.
    validate_block "$HEAD_SHA" "final-merged-commit"
    ;;

  prbody)
    # DEC-20260721-01 item 1: the PR body must carry a shape-valid
    # Attribution block (DEC-20260718-05: "every PR body carries the same
    # three fields") — this is what flows into the final merged commit
    # under the ruled merge-message default, so it is gated with the same
    # shape-only rules as a commit block, plus Execution-Surface when a
    # role is attested. The body arrives via the PR_BODY environment
    # variable ONLY: it is untrusted multiline input and must never be
    # shell-interpolated into a command. CRs from web-authored bodies are
    # stripped before matching.
    #
    # END-ANCHORED (DEC-20260721-01 follow-up, 2026-07-21): only the LAST
    # contiguous run of non-blank lines is treated as the block, and every
    # line in it must be a trailer field (Role-Id / Role-Id-Secondary /
    # Actor-Id / Execution-Surface). Trailers followed by prose fail —
    # because only the final paragraph becomes the merged commit's git
    # trailers, the body must actually END with the block, not merely
    # contain trailer-shaped lines somewhere above other content.
    body="$(printf '%s' "${PR_BODY-}" | tr -d '\r')"
    tail_block="$(printf '%s\n' "$body" | awk '
      /^[[:space:]]*$/ { inblock = 0; next }
      { if (!inblock) block = ""; inblock = 1; block = block $0 "\n" }
      END { printf "%s", block }')"
    if [[ -z "$tail_block" ]]; then
      echo "FAIL (prbody) PR body: empty — must end with a raw Attribution trailer block"
      fail=1
    elif printf '%s' "$tail_block" | grep -qEv '^(Role-Id|Role-Id-Secondary|Actor-Id|Execution-Surface):'; then
      offending="$(printf '%s' "$tail_block" | grep -Ev '^(Role-Id|Role-Id-Secondary|Actor-Id|Execution-Surface):' | head -n 1)"
      echo "FAIL (prbody) PR body: final block is not a pure trailer block — content follows the trailers (first offending line: '$offending')"
      fail=1
    else
      role_lines="$(printf '%s\n' "$tail_block" | grep -E '^Role-Id:' || true)"
      role_secondary_lines="$(printf '%s\n' "$tail_block" | grep -E '^Role-Id-Secondary:' || true)"
      actor_present="$(printf '%s\n' "$tail_block" | grep -E '^Actor-Id:[[:space:]]*[^[:space:]]' || true)"
      actor_founder="$(printf '%s\n' "$tail_block" | grep -E '^Actor-Id:[[:space:]]*founder[[:space:]]*$' || true)"
      surface_present="$(printf '%s\n' "$tail_block" | grep -E '^Execution-Surface:[[:space:]]*[^[:space:]]' || true)"
      # Optional secondary roles (DEC-20260718-05 clause 10): each must be a
      # valid role, and they require a primary Role-Id — a secondary trailer
      # alone is never a valid attribution.
      if [[ -n "$role_secondary_lines" ]]; then
        while IFS= read -r line; do
          [[ -z "$line" ]] && continue
          if ! printf '%s\n' "$line" | sed 's/^Role-Id-Secondary:/Role-Id:/' | grep -Eq "$ROLE_ID_REGEX"; then
            echo "FAIL (prbody) PR body: invalid Role-Id-Secondary value: '$line'"
            fail=1
          fi
        done <<< "$role_secondary_lines"
        if [[ -z "$role_lines" ]]; then
          echo "FAIL (prbody) PR body: Role-Id-Secondary present without a primary Role-Id"
          fail=1
        fi
      fi
      if [[ -n "$role_lines" ]]; then
        while IFS= read -r line; do
          if ! printf '%s\n' "$line" | grep -Eq "$ROLE_ID_REGEX"; then
            echo "FAIL (prbody) PR body: invalid Role-Id value: '$line'"
            fail=1
          fi
        done <<< "$role_lines"
        if [[ -z "$actor_present" ]]; then
          echo "FAIL (prbody) PR body: Role-Id present but Actor-Id missing"
          fail=1
        fi
        if [[ -z "$surface_present" ]]; then
          echo "FAIL (prbody) PR body: Role-Id present but Execution-Surface missing"
          fail=1
        fi
      else
        if [[ -z "$actor_founder" ]]; then
          echo "FAIL (prbody) PR body: no Attribution block (no Role-Id trailer and no 'Actor-Id: founder')"
          fail=1
        fi
      fi
    fi
    ;;

  selftest)
    # DEC-20260721-01 regression cases for the prbody parser (independent
    # review, 2026-07-21: the gate is security-sensitive; every branch of
    # the PR-body validation is exercised here). Re-invokes this script in
    # prbody mode per case and compares exit codes.
    st() {
      local name="$1" expected="$2" body="$3" rc=0
      PR_BODY="$body" bash "$0" prbody >/dev/null 2>&1 || rc=$?
      if [[ "$rc" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $rc, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }
    st "valid 17-role block"        0 $'Role-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "valid block with CRLF"      0 $'Role-Id: builder\r\nActor-Id: session:x\r\nExecution-Surface: claude-code\r'
    st "direct-founder work"        0 $'Actor-Id: founder'
    st "non-founder without Role-Id" 1 $'Actor-Id: session:x'
    st "missing Actor-Id"           1 $'Role-Id: builder\nExecution-Surface: claude-code'
    st "missing Execution-Surface"  1 $'Role-Id: builder\nActor-Id: session:x'
    st "invalid Role-Id value"      1 $'Role-Id: boss\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "empty body"                 1 ''
    st "empty Role-Id value"        1 $'Role-Id:\nActor-Id: founder'
    st "empty Actor-Id value"       1 $'Role-Id: builder\nActor-Id:\nExecution-Surface: claude-code'
    st "empty Execution-Surface"    1 $'Role-Id: builder\nActor-Id: session:x\nExecution-Surface:'
    # End-anchoring regression cases (DEC-20260721-01 follow-up): the block
    # must be the body's FINAL paragraph, not merely present somewhere.
    st "trailers then trailing prose" 1 $'Role-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code\n\nSee discussion above.'
    st "prose inside the final block" 1 $'Role-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code\nthanks!'
    st "prose before block is fine"   0 $'## Summary\n\nDid the thing.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "trailing blank line is fine"  0 $'Role-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code\n'
    # Secondary-role cases (DEC-20260718-05 clause 10): validated, and a
    # primary Role-Id is required whenever a secondary is present.
    st "valid primary + secondary"    0 $'Role-Id: builder\nRole-Id-Secondary: architect\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "invalid secondary value"      1 $'Role-Id: builder\nRole-Id-Secondary: boss\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "secondary without primary"    1 $'Role-Id-Secondary: architect\nActor-Id: founder'
    # Activation-deferral invariant (DEC-20260812-03, Founder ruling
    # 2026-08-12): an activation-deferred role is ratified as to its authority
    # boundary but MUST NOT be assignable, routable, or attributable.
    # `investment-acquisition-lead` is the sole deferred role, and these
    # NEGATIVE assertions prove this gate rejects it as an attributed Role-Id.
    # They are the enforcement of that invariant. If a Founder activation
    # ruling later flips it to `activation_status: active`, these expectations
    # change from 1 to 0 in the SAME change that adds it to ROLE_ID_REGEX —
    # they are never simply deleted.
    st "deferred role rejected as Role-Id" \
                                      1 $'Role-Id: investment-acquisition-lead\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "deferred role rejected as secondary" \
                                      1 $'Role-Id: builder\nRole-Id-Secondary: investment-acquisition-lead\nActor-Id: session:x\nExecution-Surface: claude-code'
    # Control: a non-deferred role added by the same decision IS accepted, so
    # the two assertions above prove deferral specifically, not a broken regex.
    st "activated OA-1 role accepted"  0 $'Role-Id: chief-strategy-officer\nActor-Id: session:x\nExecution-Surface: claude-code'
    # Branch-prefix gate regression cases (pr mode with an empty commit
    # range — HEAD..HEAD — so only check (a) runs; the prefix check itself
    # needs no git state).
    stb() {
      local name="$1" expected="$2" branch="$3" rc=0
      bash "$0" pr HEAD HEAD "$branch" >/dev/null 2>&1 || rc=$?
      if [[ "$rc" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $rc, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }
    stb "prohibited plato/ prefix"       1 'plato/anything'
    stb "prohibited mixed-case Plato/"   1 'Plato/anything'
    stb "prohibited COPILOT/ prefix"     1 'COPILOT/feature'
    # DIVERGENCE FROM FounderOS (see HISTORICAL_BRANCH_ALLOWLIST above): this
    # repository grants NO historical exemption, so the branch FounderOS exempts
    # is rejected here. Expectation is 1, not 0, deliberately.
    stb "no historical exemption here"   1 'plato/architecture-governance-reconciliation'
    stb "normal branch accepted"         0 'claude/feature-x'
    stb "builder branch accepted"        0 'builder/wf04-step3-slice1-contracts-ledger'
    ;;

  *)
    echo "usage: attribution-shape-check.sh pr <base-sha> <head-sha> <head-branch-name> | main <head-sha> | prbody (body via PR_BODY env) | selftest" >&2
    exit 2
    ;;
esac

if (( fail )); then
  echo "attribution-shape-check: FAILED (violations above)" >&2
  exit 1
fi
echo "attribution-shape-check: PASS — attribution shape valid (shape-only; attested values are not verified)"

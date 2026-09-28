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
# LAG, NOT DIVERGENCE (2026-09-28): FounderOS has changed its copy since the
# port, and those changes are not all carried here, so a diff today shows
# more than the one divergence above. Carried so far: the `prbody` PR-title,
# git-divider and git-readability rules and their selftest cases, from
# FounderOS blob bd71d9c0ca2f4d954f7a28b3a525c2cbc2b9f502 (FounderOS main
# 6d2eb3fe24bc14c2834be000c63efb65614e83ad), under the Founder's PR #83
# merge disposition, REMEDIATION 5. NOT carried: the same rules for commit
# messages in `validate_block` (so `pr` and `main` mode still accept a commit
# whose trailers git cannot read), and FounderOS's other later changes.
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
    # PR TITLE (2026-09-21, Copilot on FounderOS PR #356): the merge commit
    # is "<PR title> (#N)\n\n<body>", so the title is the first line git
    # reads, and a title beginning with `---` followed by whitespace or
    # end-of-line is a divider ABOVE everything — the merge commit parses
    # to zero trailers while the body alone looks fine. The workflow passes
    # the title through PR_TITLE (env mapping only, never interpolated).
    # Unset — an older workflow, or the selftest — falls back to a
    # synthetic one-word subject, which is never a divider. GitHub's
    # " (#N)" suffix cannot turn a non-divider title into one or vice
    # versa: `---` + suffix is `--- (`, still a divider; `---x` + suffix is
    # still not. Every line of the title is checked, so a title that
    # somehow carried a newline could not smuggle a divider past this.
    title="$(printf '%s' "${PR_TITLE-}" | tr -d '\r')"
    [[ -n "$title" ]] || title="subject"
    tdivider="$(printf '%s\n' "$title" | grep -nE '^---([[:space:]]|$)' | head -n 1 || true)"
    if [[ -n "$tdivider" ]]; then
      echo "FAIL (prbody) PR title: '${tdivider#*:}' is a git message divider — as the merge commit's first line it strips every trailer below it"
      fail=1
    fi
    # GIT MESSAGE DIVIDER (2026-09-21): `git interpret-trailers` treats any
    # line that begins with `---` followed by whitespace or end-of-line as
    # the end of the message and reads trailers only from what precedes it.
    # The end-anchor below cannot see this: a divider ABOVE the final block
    # leaves the block intact as text while git ignores it entirely.
    # Measured on FounderOS PR #355: Cursor Bugbot's summary block, moved
    # above the trailers per the then-current CLAUDE.md remedy, carried a
    # bare `---`; this gate returned PASS and `git interpret-trailers
    # --parse` returned zero trailers. That is the madventures-tui
    # c3c7d9fe21036b8d90c9d2bf0feabf5e7d9df624 outcome, reached with a
    # green check. The rule below is git's documented divider exactly,
    # verified against git 2.43.0: `---`, `--- `, `--- x` are dividers;
    # `----`, `---x`, `***`, and an indented ` ---` are not. Markdown fences
    # do not protect a divider; git does not know about them.
    #
    # Measured in THIS repository too (2026-09-28): the merge commits of
    # PR #83 (69ca61bb0fa516a0e3a4920294bf28fccf35d783, line 55) and PR #82
    # (0629c73f111a44436955a1ad6b491a8312ce21e1, line 258) each carry a bare
    # `---` opening Cursor Bugbot's summary block above the attribution
    # lines, and each parses to zero trailers; this gate, before this rule
    # was ported, passed both PR bodies. Ported under the Founder's PR #83
    # merge disposition, REMEDIATION 5.
    divider="$(printf '%s\n' "$body" | grep -nE '^---([[:space:]]|$)' | head -n 1 || true)"
    if [[ -n "$divider" ]]; then
      echo "FAIL (prbody) PR body: line ${divider%%:*} is a git message divider ('${divider#*:}') — git interpret-trailers stops reading there, so the merge commit would carry NO trailers regardless of the block below it"
      fail=1
    fi
    # GIT-READABILITY (2026-09-21): the hand rules above and below
    # (divider, end-anchor, key restriction) each encode one of git's
    # conditions for reading a trailer block. This asks git directly, so a
    # future divergence between the hand rules and git fails here instead
    # of on `main`. The merge commit is "<PR title>\n\n<body>", so the
    # title (or the synthetic fallback above) is prepended: parsed alone, a
    # body that IS only the block would be read as the subject and yield
    # nothing. No known body passes the hand rules and fails this; it is
    # the brace to their belt — and with the real title in front, it is
    # also what catches a divider-shaped title.
    parsed="$(printf '%s\n\n%s\n' "$title" "$body" | git interpret-trailers --parse)"
    # Line-level, value included (Copilot on FounderOS PR #356, round 4):
    # every raw line shaped like an attribution trailer must be one git
    # reads from the merge commit. The values validated further down
    # already come from the final block; this rejects an attribution-shaped
    # line anywhere else in the body, which git would not read and a reader
    # might.
    raw_attr="$(printf '%s\n' "$body" | grep -E '^(Role-Id|Role-Id-Secondary|Actor-Id|Execution-Surface):' || true)"
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      norm="$(printf '%s' "$line" | sed -E 's/^([A-Za-z-]+):[[:space:]]*/\1: /; s/[[:space:]]+$//')"
      if ! printf '%s\n' "$parsed" | grep -qxF -- "$norm"; then
        echo "FAIL (prbody) PR body: attribution line '$line' is present but git interpret-trailers does not read it as a trailer of the merge commit"
        fail=1
      fi
    done <<< "$raw_attr"
    # One for one, not merely membership (Copilot on FounderOS PR #356,
    # round 6): a stray line that DUPLICATES a real trailer ("Actor-Id:
    # founder" in prose above a block that also says it) passes the
    # per-line check above, because the parsed set contains that line once.
    # The normalised raw attribution lines and the attribution lines git
    # parsed must be the same multiset.
    raw_norm="$(printf '%s\n' "$raw_attr" | sed -E 's/^([A-Za-z-]+):[[:space:]]*/\1: /; s/[[:space:]]+$//' | sort)"
    parsed_attr="$(printf '%s\n' "$parsed" | grep -E '^(Role-Id|Role-Id-Secondary|Actor-Id|Execution-Surface):' | sort || true)"
    if [[ "$raw_norm" != "$parsed_attr" ]]; then
      echo "FAIL (prbody) PR body: attribution-shaped lines do not match, one for one, the trailers git would read from the merge commit — an attribution-shaped line sits outside the final block, or duplicates one inside it"
      fail=1
    fi
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
    # Git-divider cases (2026-09-21): a line git reads as end-of-message
    # anywhere above the block strips every trailer from the merge commit
    # while leaving the block intact as text. The end-anchor cannot see it.
    # Positive and negative cases mirror git's documented rule, measured.
    st "divider --- above block"       1 $'Summary.\n\n---\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "divider --- with trailing sp"  1 $'Summary.\n\n--- \n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "divider --- with text"         1 $'Summary.\n\n--- notes\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "divider inside a code fence"   1 $'Summary.\n\n```\n---\n```\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "---- is not a divider"         0 $'Summary.\n\n----\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "---x is not a divider"         0 $'Summary.\n\n---x\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "*** rule is not a divider"     0 $'Summary.\n\n***\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "indented --- is not a divider" 0 $'Summary.\n\n ---\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    # The shape that reached `main` in this repository (PR #83 at 69ca61b,
    # PR #82 at 0629c73): Cursor Bugbot's summary block, opening with a bare
    # `---`, above the trailers. The same block with `***` in place of the
    # `---` is the documented remedy and must pass.
    st "Bugbot summary with --- above block" 1 $'## Summary\n\nDid the thing.\n\n<!-- CURSOR_SUMMARY -->\n---\n\n> [!NOTE]\n> **Low Risk**\n> Tests only.\n\n<!-- /CURSOR_SUMMARY -->\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "Bugbot summary with *** accepted"    0 $'## Summary\n\nDid the thing.\n\n<!-- CURSOR_SUMMARY -->\n***\n\n> [!NOTE]\n> **Low Risk**\n> Tests only.\n\n<!-- /CURSOR_SUMMARY -->\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    # Stray attribution-shaped lines outside the block (Copilot on
    # FounderOS PR #356, rounds 4 and 6).
    st "stray Actor-Id line above the block rejected" 1 $'Actor-Id: founder\nquoted in prose.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "padded trailer values accepted"    0 $'Role-Id:   builder  \nActor-Id: session:x\nExecution-Surface: claude-code'
    st "duplicated attribution line above the block rejected" 1 $'Role-Id: builder\nquoted in prose.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    # PR-title cases (Copilot on FounderOS PR #356): the title is the merge
    # commit's first line. st_titled <name> <expected-exit> <title> <body>.
    st_titled() {
      local name="$1" expected="$2" title="$3" body="$4" rc=0
      PR_TITLE="$title" PR_BODY="$body" bash "$0" prbody >/dev/null 2>&1 || rc=$?
      if [[ "$rc" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $rc, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }
    st_titled "title: ordinary title accepted"      0 'fix(x): do the thing' $'Summary.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st_titled "title: bare --- rejected"            1 '---'                  $'Summary.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st_titled "title: --- with text rejected"       1 '--- release notes'    $'Summary.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st_titled "title: ---x is not a divider"        0 '---x'                 $'Summary.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st_titled "title: divider on a second line rejected" 1 $'ok\n---'        $'Summary.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st_titled "title: CR stripped, still a divider" 1 $'---\r'               $'Summary.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
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

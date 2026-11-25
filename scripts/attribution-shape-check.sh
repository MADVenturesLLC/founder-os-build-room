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
# CORRECTED HERE, NOT YET IN FounderOS: the divider character set (see
# DIVIDER CHARACTER SET in `prbody`); FounderOS's `[[:space:]]` class is
# broader than git's. ADDED HERE, NOT YET IN FounderOS: the MERGE WRAP and
# TRAILER LINE LENGTH rules in `prbody`, for lines GitHub re-wraps at merge.
# CARRIED (2026-11-25): FounderOS's fail-closed reading of the checker's
# input, from FounderOS merge a83750926d942d74b71f84cee61856c60e40ce28
# (pull request 439, decision-log v5.46, Tier-2 PASS-WITH-ADVISORIES at
# 58c924c9e9d785083623a22e61541c2f40eddd12): text is matched in memory, a
# failing command is never read as PASS, text the regex cannot read is
# refused, and the commit-range listing is checked (IN MEMORY and
# UNREADABLE TEXT, under helpers), with the construct guards, fault cases
# and unreadable-text cases in `selftest`. It replaces this copy's first
# attempt of 2026-11-24 (process substitution and an `unread` handler),
# which FounderOS's Tier-2 review at 8b544c0 showed could still end in PASS
# (measured here too: a failed `git log` in the commit loop passed at
# a14fcc9). The checks themselves are this copy's own and are unchanged:
# validate_block still does not read Role-Id-Secondary, and the
# non-applicable path still looks only for `Role-Id:`, as before. CARRIED
# (2026-11-24): FounderOS's fail-closed handling of a commit range git
# cannot list, with its selftest cases (st_range).
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
# Clause 5a's prohibited prefixes, in either case. Written out letter by
# letter because the test is bash's own (IN MEMORY, under helpers) and bash
# 3.2 has no case-insensitive match that is safe to switch on for one test.
# It was `grep -Ei '^(plato|copilot)/'`; GNU grep -i in a UTF-8 locale also
# folds the dotless i (U+0131) onto `i`, and nothing else onto any of these
# letters (measured over U+0020 to U+2FFFF, GNU grep 3.11, C.UTF-8), so the
# dotless i is written in and no branch that was refused is now let through.
PROHIBITED_BRANCH_ERE='^([Pp][Ll][Aa][Tt][Oo]|[Cc][Oo][Pp]([Ii]|ı)[Ll][Oo][Tt])/'
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
# A line shaped like an attribution trailer.
ATTR_LINE_ERE='^(Role-Id|Role-Id-Secondary|Actor-Id|Execution-Surface):'

MODE="${1:-}"
fail=0

# A newline and a carriage return, for splitting and cleaning text in memory
# (IN MEMORY, under helpers).
NL=$'\n'
CR=$'\r'

# --- helpers ---------------------------------------------------------------

# IN MEMORY (2026-11-25). Text the checker already holds (a commit message,
# git's parsed trailers, the PR body, a branch name, a list of commits) is
# split into lines and matched by bash itself: parameter expansion and
# `[[ =~ ]]`. No check reads it back through a here-string, a pipe, a process
# substitution or grep. Each of those is a channel that can fail without the
# check noticing:
#   - a here-string is a temporary file in bash 3.2 (the macOS /bin/bash);
#     where writes are denied the redirection fails and the check is skipped
#     (measured 2026-11-24 on this copy at main 7ceadd2: PASS, exit 0, on an
#     invalid Role-Id);
#   - a pipe into an early-exit grep is the SIGPIPE race FounderOS closed in
#     its decision-log v4.76; eleven checks here still ran on a pipe that
#     can end early, into `grep -q` or `head -n 1`;
#   - a process substitution hides its writer's exit status, so a writer that
#     dies leaves an empty input, which reads as "nothing to check";
#   - grep exits 2 on an error, which `if grep` and `grep || true` both read
#     as "no match".
# What is left to external commands (git, sed, sort, tr, awk) is never read
# as PASS when it fails. Most run with no `|| true` and outside any `if`,
# `&&` or `||`, so under `set -euo pipefail` a failure stops the checker
# with that command's exit status. Four are tested where they run, and a
# failure prints a FAIL line and ends in exit 1: `git rev-list`, `git show`,
# `git merge-base`, and `git log` for a commit that changes no file.
# A loop over lines is a plain `for` over an array (split_lines), with
# nothing after `done`: an `|| handler` there switches errexit off for the
# whole loop body.
# Both points were findings of the Tier-2 review of FounderOS pull request
# 439 at 8b544c0, against the same design this copy carried at a14fcc9 (a
# loop whose writer wrote nothing passed; `|| unread` after the commit loop
# switched errexit off inside it, so here a failed `git log` in the loop
# ended in PASS). The selftest's construct guards keep the four constructs
# out, and its fault cases break a command on purpose.

# UNREADABLE TEXT (2026-11-25). bash's regex reads text in the locale's
# encoding. Where a string holds bytes that are not valid in it (a stray
# 0xFF in a UTF-8 locale), the macOS regex library matches nothing in that
# string at all, so a test that should have fired stayed silent: the Tier-2
# confirmation run of FounderOS pull request 439 at 143b075 passed a
# `plato/` branch that way under en_US.UTF-8, before this test was added
# there. So text that bash's regex cannot read from end to end is
# refused: FAIL, whatever else the checks then say. The test is the regex
# library's own (`.` or a newline, to the end), so it holds wherever a regex
# here would have gone blind, and in a byte locale (LC_ALL=C) every string
# passes it. split_lines makes the test, because every line a regex is put
# to comes from split_lines.
WHOLE_TEXT_ERE=$'^(.|\n)*$'
UNREADABLE_SEEN=""

# unreadable_text
# Names each line of SPLIT that bash's regex cannot read, once, and fails
# the gate.
unreadable_text() {
  local line named=0
  for line in "${SPLIT[@]}"; do
    if ! [[ "$line" =~ $WHOLE_TEXT_ERE ]]; then
      named=1
      if ! has_line "$UNREADABLE_SEEN" "$line"; then
        echo "FAIL (text) a line holds bytes that are not valid text in this locale, so no pattern can be matched against it (failing closed): '$line'"
        UNREADABLE_SEEN="$UNREADABLE_SEEN$NL$line"
      fi
    fi
  done
  if [[ "$named" -eq 0 ]]; then
    echo "FAIL (text) this shell's pattern matching could not read the text under check from end to end (failing closed)"
  fi
  fail=1
}

# split_lines <text>
# Sets SPLIT to the lines of <text> that are not empty, in order, in one
# pass: word splitting on newlines, with globbing off, and nothing else. The
# text is never evaluated. Empty lines are dropped, as word splitting drops
# empty fields; no pattern here matches an empty line, and first_match
# numbers its hit against the text itself. SPLIT always holds at least one
# element. A caller that splits again before it is done copies SPLIT first.
# The noglob setting and IFS are put back as they were.
split_lines() {
  local saved_ifs="$IFS" had_noglob=0
  case "$-" in *f*) had_noglob=1 ;; esac
  IFS="$NL"
  set -f
  SPLIT=($1)
  if [[ "$had_noglob" -eq 0 ]]; then set +f; fi
  IFS="$saved_ifs"
  if [[ "${#SPLIT[@]}" -eq 0 ]]; then SPLIT=(""); fi
  if ! [[ "$1" =~ $WHOLE_TEXT_ERE ]]; then unreadable_text; fi
}

# any_line_matches <text> <ere>
# 0 when some line of <text> matches <ere>, else 1: `grep -Eq`, with no
# third outcome.
any_line_matches() {
  local re="$2" line
  split_lines "$1"
  for line in "${SPLIT[@]}"; do
    if [[ "$line" =~ $re ]]; then return 0; fi
  done
  return 1
}

# lines_matching <text> <ere>
# Sets MATCHED to the lines of <text> that match <ere>, in order, joined by
# newlines: what `grep -E` printed. Empty when none does.
lines_matching() {
  local re="$2" line out="" sep=""
  split_lines "$1"
  for line in "${SPLIT[@]}"; do
    if [[ "$line" =~ $re ]]; then out="$out$sep$line"; sep="$NL"; fi
  done
  MATCHED="$out"
}

# first_match <text> <ere>
# 0 when some line of <text> matches <ere>, with its number in HIT_NO and its
# text in HIT_LINE (what `grep -nE ... | head -n 1` printed); else 1. The
# number counts every line, empty ones too: once there is a hit, the text is
# walked line by line to the first line equal to it, which is the hit, since
# an earlier equal line would have matched first.
first_match() {
  local re="$2" line rest n=0
  split_lines "$1"
  for line in "${SPLIT[@]}"; do
    if [[ "$line" =~ $re ]]; then
      rest="$1"
      while :; do
        n=$((n + 1))
        if [[ "${rest%%$NL*}" == "$line" ]]; then break; fi
        if [[ "$rest" != *"$NL"* ]]; then break; fi
        rest=${rest#*$NL}
      done
      HIT_NO="$n"; HIT_LINE="$line"; return 0
    fi
  done
  return 1
}

# first_other_line <text> <ere>
# 0 when some line of <text> that is not empty does NOT match <ere>, with the
# first such line in OTHER_LINE (what `grep -Ev ... | head -n 1` printed);
# else 1. Its one caller passes a block with no empty line.
first_other_line() {
  local re="$2" line
  split_lines "$1"
  for line in "${SPLIT[@]}"; do
    if ! [[ "$line" =~ $re ]]; then OTHER_LINE="$line"; return 0; fi
  done
  return 1
}

# has_line <text> <line>
# 0 when <line> is, exactly, one whole line of <text>: `grep -qxF`.
has_line() {
  [[ "$NL$1$NL" == *"$NL$2$NL"* ]]
}

# validate_block <sha> <label>
# Applies (b) and the block-validity rules of (c) to one commit.
validate_block() {
  local sha="$1" label="$2" body role_lines actor_founder actor_present line
  local -a lines
  body="$(git log -1 --format=%B "$sha")"

  lines_matching "$body" '^Role-Id:'; role_lines="$MATCHED"
  lines_matching "$body" '^Actor-Id:[[:space:]]*[^[:space:]]'; actor_present="$MATCHED"
  lines_matching "$body" '^Actor-Id:[[:space:]]*founder[[:space:]]*$'; actor_founder="$MATCHED"

  if [[ -n "$role_lines" ]]; then
    # (b) every Role-Id line must match the enumerated 17-role alternation.
    split_lines "$role_lines"; lines=("${SPLIT[@]}")
    for line in "${lines[@]}"; do
      if ! [[ "$line" =~ $ROLE_ID_REGEX ]]; then
        echo "FAIL (b) $label $sha: invalid Role-Id value: '$line'"
        fail=1
      fi
    done
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
  # Command substitution drops trailing newlines, so a listing of blank
  # lines alone is already empty here: not empty means a file is named.
  [[ -n "$files" ]]
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
    if any_line_matches "$BRANCH" "$PROHIBITED_BRANCH_ERE"; then
      if any_line_matches "$BRANCH" "$HISTORICAL_BRANCH_ALLOWLIST"; then
        echo "note (a): branch '$BRANCH' is on the pinned historical allowlist (pre-activation) — exempt"
      else
        echo "FAIL (a) branch '$BRANCH': prohibited branch prefix (^(plato|copilot)/, case-insensitive; DEC-20260718-05 clause 5a; timestamps are never authorization)"
        fail=1
      fi
    fi

    # (b)+(c) every commit in the PR range, evaluated independently.
    #
    # The range is materialized and its exit status checked BEFORE the loop.
    # Reading it through process substitution — `done < <(git rev-list …)` —
    # discards rev-list's exit status entirely: an unresolvable range (an
    # absent base or head object) produced an empty loop, `fail` was never
    # set, and the gate reported PASS with exit 0. The fail-closed handling
    # below covers a commit that cannot be READ; it did not cover a range
    # that cannot be ENUMERATED, which is strictly worse because nothing is
    # examined at all. Reproduced before this change:
    #
    #   $ attribution-shape-check.sh pr <absent-sha> <head> some/branch
    #   fatal: Invalid revision range <absent-sha>..<head>
    #   attribution-shape-check: PASS — attribution shape valid
    #   exit 0
    #
    # Regression cases live in `selftest` (st_range). Carried from FounderOS's
    # copy, where this guard and its cases already stand.
    #
    # git's stderr is NOT captured into the range (2026-11-25). With `2>&1`
    # here, whatever git wrote to stderr on a SUCCESSFUL listing (a warning,
    # or trace lines under GIT_TRACE) was read as commit ids, and the loop
    # below then failed on "unable to read commit" for a line that was never
    # a commit: a false failure. Found by the Tier-2 confirmation run of this
    # change at a14fcc9, after the guard was carried here from FounderOS,
    # whose copy had the same fault and was fixed in its pull request 439.
    # git's own error still reaches this script's stderr, beside the FAIL
    # line.
    #
    # The listing is taken with a dot printed after it (2026-11-25), because
    # command substitution drops every trailing newline and a blank line at
    # the end of the listing would go with them. The dot is printed only
    # when git succeeds, so the status tested is still git's.
    range_listed=1
    if ! range="$(git rev-list --reverse "$BASE_SHA..$HEAD_SHA" && printf '.')"; then
      echo "FAIL (c) unable to enumerate the commit range $BASE_SHA..$HEAD_SHA (failing closed; git's error is on stderr)"
      fail=1
      range=""
      range_listed=0
    fi
    range=${range%.}
    # git lists one id to a line, each line ended by a newline, and no blank
    # line. A blank record is not a commit either, and is not passed over in
    # silence, wherever it sits: first, between two ids, or last.
    if [[ "$range" == "$NL"* || "$range" == *"$NL$NL"* ]]; then
      echo "FAIL (c) commit range $BASE_SHA..$HEAD_SHA: git listed a blank line, which is not a commit id (failing closed)"
      fail=1
    fi
    range=${range%$NL}
    # A listing with nothing in it is only right when the head adds nothing
    # to the base. git answers that separately, so a listing that came back
    # empty by mistake does not pass as "nothing to check".
    if [[ "$range_listed" -eq 1 && -z "$range" ]]; then
      empty_rc=0
      git merge-base --is-ancestor "$HEAD_SHA" "$BASE_SHA" || empty_rc=$?
      if [[ "$empty_rc" -eq 1 ]]; then
        echo "FAIL (c) commit range $BASE_SHA..$HEAD_SHA: git listed no commit, but the head holds commits the base does not (failing closed)"
        fail=1
      elif [[ "$empty_rc" -ne 0 ]]; then
        echo "FAIL (c) commit range $BASE_SHA..$HEAD_SHA: unable to confirm that it holds no commit (failing closed; git's error is on stderr)"
        fail=1
      fi
    fi

    split_lines "$range"; range_lines=("${SPLIT[@]}")
    for sha in "${range_lines[@]}"; do
      [[ -z "$sha" ]] && continue
      # git lists full object ids, one to a line, and nothing else. A line
      # that is anything else is not a commit and is never handed on as one.
      if [[ ( "${#sha}" -ne 40 && "${#sha}" -ne 64 ) || "$sha" == *[!0123456789abcdef]* ]]; then
        echo "FAIL (c) commit range $BASE_SHA..$HEAD_SHA: git listed '$sha', which is not a commit id (failing closed)"
        fail=1
        continue
      fi
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
        # Role-Id trailer it carries. The message is read with its exit
        # status checked: it was piped into an early-exit `grep -q`, where a
        # failed read, or the SIGPIPE race, skipped the check.
        if ! msg="$(git log -1 --format=%B "$sha")"; then
          echo "FAIL (c) commit $sha: unable to read the commit message (failing closed)"
          fail=1
        elif any_line_matches "$msg" '^Role-Id:'; then
          validate_block "$sha" "commit(non-applicable)"
        fi
      fi
    done
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
    #
    # DIVIDER CHARACTER SET (Copilot on PR #86, 2026-09-28; measured on git
    # 2.43.0 here and reported for the runner's git): git's divider is `---`
    # followed by a space, a tab, a carriage return, or end-of-line, and
    # nothing else. `[[:space:]]`, which FounderOS still uses, also matches a
    # vertical tab or form feed, and under a UTF-8 locale U+3000; git reads
    # the trailers past all three, so that class rejected readable messages.
    # The class is written out, a space and a tab, so it means the same in
    # every locale (it was `[[:blank:]]`, matched under LC_ALL=C), and the
    # match is made in memory (IN MEMORY, under helpers). The CR is
    # matched on the text BEFORE CRs are stripped: stripping first turned
    # `---` + CR + `x` into `---x`, which passed here while git stopped
    # reading at it.
    divider_ere=$'^---([ \t]|\r|$)'
    title="$(printf '%s' "${PR_TITLE-}" | tr -d '\r')"
    [[ -n "$title" ]] || title="subject"
    if first_match "${PR_TITLE-}" "$divider_ere"; then
      echo "FAIL (prbody) PR title: '${HIT_LINE//$CR/}' is a git message divider — as the merge commit's first line it strips every trailer below it"
      fail=1
    fi
    # GIT MESSAGE DIVIDER (2026-09-21): `git interpret-trailers` treats any
    # line that begins with `---` followed by whitespace or end-of-line as
    # the end of the message and reads trailers only from what precedes it
    # ("whitespace" as git defines it: see DIVIDER CHARACTER SET above).
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
    if first_match "${PR_BODY-}" "$divider_ere"; then
      echo "FAIL (prbody) PR body: line $HIT_NO is a git message divider ('${HIT_LINE//$CR/}') — git interpret-trailers stops reading there, so the merge commit would carry NO trailers regardless of the block below it"
      fail=1
    fi
    # MERGE WRAP (2026-09-28, measured on this repository): the merge commit
    # does not always carry the body as written. On the three merges made
    # through the REST API (PR #84 at cf24db6, PR #85 at cba62c5, PR #87 at
    # 9f088f0), GitHub re-wrapped every body line longer than 72 characters:
    # it stripped the line's indent and broke it greedily at whitespace,
    # never inside a word, and left shorter lines and the title alone. That
    # model reproduces all three merge messages exactly. Merges made in the
    # web UI kept the body as written (PR #78 at c8558e9 has six long lines
    # intact). Either path can merge a PR, so this rule assumes the wrap.
    # Under it, a standalone `---` inside a long line can START a line of the
    # merge commit, as can an indented ` ---` line: both pass the divider
    # check above, and the merge commit then carries no trailers. This rule
    # does not predict where the wrap will break the line; it rejects, in a
    # long line, a `---` bounded on each side by the line's edge or by any
    # byte that is not a visible ASCII character, because the wrap may break
    # at any such byte.
    #
    # WIDTH, NOT BYTES, AND EVERY KIND OF SPACE (Tier-2 review of 813a190,
    # gemini-3.1-pro, FAIL): the model is Python's textwrap, which expands a
    # tab to the next multiple of 8 columns before measuring. A 69-byte line
    # of 65 letters, a tab and `---` is 75 columns wide, so it wraps and the
    # `---` starts the next line; the previous byte count passed it. The same
    # model breaks at a vertical tab, form feed or CR as well as a space or
    # tab, and turns each into a space, and its indent strip also removes
    # Unicode spaces such as U+3000. GitHub's own handling of tabs and of
    # those characters is unmeasured, so this takes the wider reading of
    # each: width with tabs expanded, and any non-visible byte as a possible
    # break. Other bytes still count one column each (LC_ALL=C), which is
    # stricter than a character count for non-ASCII text.
    # The line-length rule for the trailers themselves is TRAILER LINE
    # LENGTH, below; it measures width the same way.
    wdivider="$(printf '%s\n' "${PR_BODY-}" | LC_ALL=C awk '
      function cols(s,   i, n) {
        n = 0
        for (i = 1; i <= length(s); i++) {
          if (substr(s, i, 1) == "\t") n = n - n % 8 + 8; else n++
        }
        return n
      }
      { line = $0; gsub(/\r/, "", line) }
      hit == "" && cols(line) > 72 && $0 ~ /(^|[^!-~])---([^!-~]|$)/ { hit = NR ":" line }
      END { if (hit != "") print hit }')"
    if [[ -n "$wdivider" ]]; then
      echo "FAIL (prbody) PR body: line ${wdivider%%:*} is wider than 72 columns and holds a standalone '---'; GitHub re-wraps such lines when it writes the merge commit, which can start a line with that '---' and strip every trailer (write it as an em dash, or shorten the line)"
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
    lines_matching "$body" '^(Role-Id|Role-Id-Secondary|Actor-Id|Execution-Surface):'; raw_attr="$MATCHED"
    split_lines "$raw_attr"; lines=("${SPLIT[@]}")
    for line in "${lines[@]}"; do
      [[ -z "$line" ]] && continue
      norm="$(printf '%s' "$line" | sed -E 's/^([A-Za-z-]+):[[:space:]]*/\1: /; s/[[:space:]]+$//')"
      if ! has_line "$parsed" "$norm"; then
        echo "FAIL (prbody) PR body: attribution line '$line' is present but git interpret-trailers does not read it as a trailer of the merge commit"
        fail=1
      fi
    done
    # One for one, not merely membership (Copilot on FounderOS PR #356,
    # round 6): a stray line that DUPLICATES a real trailer ("Actor-Id:
    # founder" in prose above a block that also says it) passes the
    # per-line check above, because the parsed set contains that line once.
    # The normalised raw attribution lines and the attribution lines git
    # parsed must be the same multiset.
    raw_norm="$(printf '%s\n' "$raw_attr" | sed -E 's/^([A-Za-z-]+):[[:space:]]*/\1: /; s/[[:space:]]+$//' | sort)"
    lines_matching "$parsed" "$ATTR_LINE_ERE"; parsed_attr="$(printf '%s\n' "$MATCHED" | sort)"
    if [[ "$raw_norm" != "$parsed_attr" ]]; then
      echo "FAIL (prbody) PR body: attribution-shaped lines do not match, one for one, the trailers git would read from the merge commit — an attribution-shaped line sits outside the final block, or duplicates one inside it"
      fail=1
    fi
    # TRAILER LINE LENGTH (see MERGE WRAP above): on a merge that re-wraps,
    # an attribution line longer than 72 characters is split from its value.
    # The FounderOS CLAUDE.md records the measured case, merge commit 24cd66a
    # on 2026-08-30: a 74-character Actor-Id line landed as "Actor-Id:" with
    # its value on the next line. It sets 72 as the bound; this enforces that
    # bound before merge instead of after. (This repository's PR #24 merge,
    # 2d40a95, carries a 74-character Actor-Id intact because it was not
    # re-wrapped; its body fails this rule, as the bound says it should.)
    long_attr="$(printf '%s\n' "$raw_attr" | LC_ALL=C awk '
      function cols(s,   i, n) {
        n = 0
        for (i = 1; i <= length(s); i++) {
          if (substr(s, i, 1) == "\t") n = n - n % 8 + 8; else n++
        }
        return n
      }
      hit == "" && cols($0) > 72 { hit = cols($0) ":" $0 }
      END { if (hit != "") print hit }')"
    if [[ -n "$long_attr" ]]; then
      echo "FAIL (prbody) PR body: attribution line '${long_attr#*:}' is ${long_attr%%:*} columns wide; GitHub re-wraps lines over 72 when it writes the merge commit, which splits the trailer from its value"
      fail=1
    fi
    tail_block="$(printf '%s\n' "$body" | awk '
      /^[[:space:]]*$/ { inblock = 0; next }
      { if (!inblock) block = ""; inblock = 1; block = block $0 "\n" }
      END { printf "%s", block }')"
    if [[ -z "$tail_block" ]]; then
      echo "FAIL (prbody) PR body: empty — must end with a raw Attribution trailer block"
      fail=1
    elif first_other_line "$tail_block" "$ATTR_LINE_ERE"; then
      offending="$OTHER_LINE"
      echo "FAIL (prbody) PR body: final block is not a pure trailer block — content follows the trailers (first offending line: '$offending')"
      fail=1
    else
      lines_matching "$tail_block" '^Role-Id:'; role_lines="$MATCHED"
      lines_matching "$tail_block" '^Role-Id-Secondary:'; role_secondary_lines="$MATCHED"
      lines_matching "$tail_block" '^Actor-Id:[[:space:]]*[^[:space:]]'; actor_present="$MATCHED"
      lines_matching "$tail_block" '^Actor-Id:[[:space:]]*founder[[:space:]]*$'; actor_founder="$MATCHED"
      lines_matching "$tail_block" '^Execution-Surface:[[:space:]]*[^[:space:]]'; surface_present="$MATCHED"
      # Optional secondary roles (DEC-20260718-05 clause 10): each must be a
      # valid role, and they require a primary Role-Id — a secondary trailer
      # alone is never a valid attribution.
      if [[ -n "$role_secondary_lines" ]]; then
        split_lines "$role_secondary_lines"; lines=("${SPLIT[@]}")
        for line in "${lines[@]}"; do
          [[ -z "$line" ]] && continue
          # The value is tested as a primary role would be (it was `sed` into grep).
          cand="$line"
          if [[ "$line" == Role-Id-Secondary:* ]]; then cand="Role-Id:${line#Role-Id-Secondary:}"; fi
          if ! [[ "$cand" =~ $ROLE_ID_REGEX ]]; then
            echo "FAIL (prbody) PR body: invalid Role-Id-Secondary value: '$line'"
            fail=1
          fi
        done
        if [[ -z "$role_lines" ]]; then
          echo "FAIL (prbody) PR body: Role-Id-Secondary present without a primary Role-Id"
          fail=1
        fi
      fi
      if [[ -n "$role_lines" ]]; then
        split_lines "$role_lines"; lines=("${SPLIT[@]}")
        for line in "${lines[@]}"; do
          if ! [[ "$line" =~ $ROLE_ID_REGEX ]]; then
            echo "FAIL (prbody) PR body: invalid Role-Id value: '$line'"
            fail=1
          fi
        done
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
    # Git's divider character set exactly (Copilot on PR #86): git reads the
    # trailers past `---` + vertical tab, form feed, or U+3000, so those
    # pass; `---` + CR stops git even mid-line, so it fails, and so does a
    # CRLF body's bare `---`. The U+3000 case runs under C.UTF-8, where an
    # unpinned `[[:blank:]]` or `[[:space:]]` would match it.
    st "--- then vertical tab is not a divider" 0 $'Summary.\n\n---\v\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "--- then form feed is not a divider"   0 $'Summary.\n\n---\f\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    LC_ALL=C.UTF-8 st "--- then U+3000 is not a divider (C.UTF-8)" \
                                               0 $'Summary.\n\n---\xe3\x80\x80\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "--- then CR mid-line is a divider"     1 $'Summary.\n\n---\rx\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "CRLF body with bare --- is a divider"  1 $'Summary.\r\n\r\n---\r\n\r\nRole-Id: builder\r\nActor-Id: session:x\r\nExecution-Surface: claude-code\r'
    # The shape that reached `main` in this repository (PR #83 at 69ca61b,
    # PR #82 at 0629c73): Cursor Bugbot's summary block, opening with a bare
    # `---`, above the trailers. The same block with `***` in place of the
    # `---` is the documented remedy and must pass.
    st "Bugbot summary with --- above block" 1 $'## Summary\n\nDid the thing.\n\n<!-- CURSOR_SUMMARY -->\n---\n\n> [!NOTE]\n> **Low Risk**\n> Tests only.\n\n<!-- /CURSOR_SUMMARY -->\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "Bugbot summary with *** accepted"    0 $'## Summary\n\nDid the thing.\n\n<!-- CURSOR_SUMMARY -->\n***\n\n> [!NOTE]\n> **Low Risk**\n> Tests only.\n\n<!-- /CURSOR_SUMMARY -->\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    # Merge-wrap cases (MERGE WRAP and TRAILER LINE LENGTH). Measured by
    # re-wrapping each body the way GitHub does: "at the wrap point" and
    # "long indented" then parse to zero trailers, and the 74-character
    # trailer to an empty Actor-Id. "early in it", "ending in ---" and the
    # table row keep their trailers under that wrap; they are rejected on
    # purpose, because the rule does not predict where the wrap falls and
    # a different title or line would move it. The accepted cases pin what
    # the rule leaves alone: short lines, `---` inside a word, em dashes, and
    # a trailer of exactly 72 characters.
    st "wrap: long line, --- at the wrap point"  1 $'This sentence is long enough that the wrap lands right on the dashes xx --- and the rest of it continues past the column limit.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "wrap: long line, --- early in it"        1 $'Intro --- then a sentence that keeps going well past the seventy-two character limit.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "wrap: long line ending in ---"           1 $'A line that keeps going well past the seventy-two character limit and ends ---\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "wrap: long indented --- line"            1 $'Summary.\n\n   --- an indented line that is long enough to be wrapped by GitHub at merge time\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "wrap: long table row with | --- |"       1 $'| a very long cell that pushes the row well past the limit | --- | another cell |\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "wrap: short line with --- accepted"      0 $'A short line --- fine.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "wrap: long line, ---x and a---b accepted" 0 $'A long line that mentions ---x and a---b and keeps going past seventy-two characters.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "wrap: long line, em dashes accepted"     0 $'A long line that uses an em dash \xe2\x80\x94 like this \xe2\x80\x94 and keeps going past the limit.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "trailer of 72 characters accepted"       0 $'Summary.\n\nRole-Id: builder\nActor-Id: session:claude-code/an-identifier-long-enough-to-pass-72-chars\nExecution-Surface: claude-code'
    st "trailer of 74 characters rejected"       1 $'Summary.\n\nRole-Id: builder\nActor-Id: session:claude-code/an-identifier-long-enough-to-pass-72-chars-x\nExecution-Surface: claude-code'
    # Width and break characters (Tier-2 review of 813a190, FAIL). Each
    # rejected body passes the 72-byte count but loses every trailer, or its
    # Actor-Id value, under the textwrap model once tabs are expanded and a
    # vertical tab or Unicode indent is treated as the model treats it. The
    # first case is the reviewer's own.
    st "width: 65 letters, tab, --- (69 bytes, 75 columns)" \
                                                1 $'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\t---\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "width: long line, vertical tab then ---"  1 $'A line that keeps going well past the seventy-two character limit here\v--- and on.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "width: long line, --- then vertical tab"  1 $'---\vthen a line that keeps going well past the seventy-two character limit, on.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "width: long line indented by U+3000, ---" 1 $'\xe3\x80\x80--- then a line that keeps going well past the seventy-two character limit.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st "width: trailer widened past 72 by a tab" 1 $'Summary.\n\nRole-Id: builder\nActor-Id:\tsession:claude-code/an-identifier-that-is-sixty-bytes-long-xyz\nExecution-Surface: claude-code'
    st "width: short line with a tab and --- accepted" \
                                                0 $'A\t--- x\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
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
    st_titled "title: --- then CR is a divider"     1 $'---\r'               $'Summary.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st_titled "title: --- then CR mid-line is a divider" 1 $'---\rx'         $'Summary.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
    st_titled "title: --- then vertical tab is not a divider" 0 $'---\v'     $'Summary.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
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
    # st_range <name> <expected-exit> <base> <head>
    # A range that cannot be ENUMERATED must fail closed. Before the fix,
    # rev-list's exit status was discarded by process substitution and an
    # unresolvable range reached PASS having examined nothing. Carried, with
    # its cases, from FounderOS's copy.
    absent_sha='0000000000000000000000000000000000000000'
    st_range() {
      local name="$1" expected="$2" base="$3" head="$4" rc=0
      bash "$0" pr "$base" "$head" claude/selftest >/dev/null 2>&1 || rc=$?
      if [[ "$rc" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $rc, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }
    st_range "range: absent base fails closed"    1 "$absent_sha" HEAD
    st_range "range: absent head fails closed"    1 HEAD "$absent_sha"
    st_range "range: empty but valid range passes" 0 HEAD HEAD
    # CONSTRUCT GUARDS (2026-11-25; carried from FounderOS pull request 439).
    # They replace this copy's here-string guard of 2026-11-24, whose
    # comment filter was a grep read through a process substitution, so a
    # grep error there read as a pass (Tier-2 confirmation run at a14fcc9).
    # IN MEMORY, under helpers, says why no check may read text back through
    # a here-string, a process substitution or grep, nor wrap a command in
    # `|| true`. FounderOS measured the race a piped `grep -q` brings: under
    # `set -o pipefail`, 40 of 24,000 runs flipped on a loaded host. With no
    # grep in any check, that pipe cannot come back in any spelling.
    #
    # The scan reads this script once, in memory, and fails closed: the read
    # is a plain assignment, so an unreadable script stops the selftest, and
    # a scan that did not reach the `selftest)` label fails every guard. Each
    # marker is assembled so that this block does not match itself. Only a
    # whole-line comment is skipped: a marker in a quoted string or after
    # code fails its guard, which errs toward a look. The here-string guard
    # covers the whole script; the other three cover the checks, which end
    # at the `selftest)` label. Process substitution is caught in both
    # directions, and the no-op handler as `true` or `:` with any spacing
    # after `||`. They are tripwires for the usual spellings, not a proof:
    # a handler by another name is for review to catch.
    lt='<'
    here_string="$lt$lt$lt"
    proc_subst_in="$lt("
    proc_subst_out='>''('
    grep_word='(^|[^A-Za-z0-9_-])gr''ep([^A-Za-z0-9_-]|$)'
    or_true='[|][|][[:space:]]*(tr''ue|:)([^A-Za-z0-9_-]|$)'
    comment_line='^[[:space:]]*#'
    self_src="$(<"$0")"
    scan_lines=0
    scan_in_checks=1
    found_here_string=0
    found_grep=0
    found_proc_subst=0
    found_or_true=0
    split_lines "$self_src"; lines=("${SPLIT[@]}")
    for line in "${lines[@]}"; do
      scan_lines=$((scan_lines + 1))
      if [[ "$line" == "  selftest)" ]]; then scan_in_checks=0; fi
      if [[ "$line" =~ $comment_line ]]; then continue; fi
      if [[ "$line" == *"$here_string"* ]]; then found_here_string=1; fi
      if [[ "$scan_in_checks" -eq 1 ]]; then
        if [[ "$line" =~ $grep_word ]]; then found_grep=1; fi
        if [[ "$line" == *"$proc_subst_in"* || "$line" == *"$proc_subst_out"* ]]; then found_proc_subst=1; fi
        if [[ "$line" =~ $or_true ]]; then found_or_true=1; fi
      fi
    done
    scan_ok=1
    if [[ "$scan_in_checks" -ne 0 || "$scan_lines" -lt 500 ]]; then scan_ok=0; fi
    guard() {
      local name="$1" found="$2"
      if [[ "$scan_ok" -ne 1 ]]; then
        echo "SELFTEST FAIL: $name (this script could not be scanned)"
        fail=1
      elif [[ "$found" -ne 0 ]]; then
        echo "SELFTEST FAIL: $name"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }
    guard "no check reads a here-string" "$found_here_string"
    guard "no check runs grep" "$found_grep"
    guard "no check reads through a process substitution" "$found_proc_subst"
    guard "no check wraps a command in '|| true'" "$found_or_true"
    # Absolute path to this script: the fault and unreadable-text cases run
    # it with the working directory inside a throwaway repository, where a
    # relative $0 would not resolve.
    self_abs="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

    # FAULT CASES (2026-11-25). A command that fails must stop the checker; it
    # is never read as "nothing to flag" (IN MEMORY, under helpers). Each case
    # puts a shim first on PATH for one command, runs the checker on input
    # that is otherwise valid, and expects the stated exit status:
    #   breaks  the shim runs the real command, passes on all it printed, and
    #           then exits 23: the worst case, output that looks whole from a
    #           command that failed. Under errexit the checker stops with 23.
    #   noise   the shim prints a line that is not a commit id, then runs the
    #           real command (for `git rev-list`).
    #   blank   the shim prints an empty line, then runs the real command.
    #   blank-after  the shim runs the real command, then prints an empty line.
    #   blank-only   the shim prints an empty line and nothing else, exit 0.
    #   silent  the shim prints nothing and exits 0.
    # The pr-mode `git log` case pins, for this copy, the second finding of
    # FounderOS's Tier-2 review at 8b544c0: with `|| unread` after the commit
    # loop, as at a14fcc9, errexit was off inside it, and a failed `git log`
    # in validate_block ended in PASS, exit 0. This copy runs `git
    # interpret-trailers`, `sed` and `sort` only in prbody mode, so their
    # cases are there.
    #
    # Mode `pr-empty` runs `pr` over a range that holds no commit (the head
    # against itself): an empty listing is right there, and passes only when
    # git confirms it.
    #
    # st_fault <name> <expected-exit> <mode> <how> <command> [<git-subcommand>]
    st_fault() {
      local name="$1" expected="$2" mode="$3" how="$4" cmd="$5" sub="${6:-}" rc=0 tmp real base head
      real="$(command -v "$cmd")"
      tmp="$(mktemp -d)"
      mkdir "$tmp/bin" "$tmp/repo"
      {
        printf '#!/bin/sh\n'
        if [[ -n "$sub" ]]; then
          printf 'if [ "$1" != "%s" ]; then exec "%s" "$@"; fi\n' "$sub" "$real"
        fi
        if [[ "$how" == noise ]]; then
          printf 'echo "warning: not a commit id"\nexec "%s" "$@"\n' "$real"
        elif [[ "$how" == blank ]]; then
          printf 'echo ""\nexec "%s" "$@"\n' "$real"
        elif [[ "$how" == blank-after ]]; then
          printf '"%s" "$@" || exit $?\necho ""\n' "$real"
        elif [[ "$how" == blank-only ]]; then
          printf 'echo ""\n'
        elif [[ "$how" == silent ]]; then
          printf 'exit 0\n'
        else
          printf '"%s" "$@"\nexit 23\n' "$real"
        fi
      } > "$tmp/bin/$cmd"
      chmod +x "$tmp/bin/$cmd"
      git init -q "$tmp/repo" >/dev/null 2>&1
      git -C "$tmp/repo" config user.email 'selftest@example.invalid'
      git -C "$tmp/repo" config user.name 'attribution selftest'
      : > "$tmp/repo/f"
      git -C "$tmp/repo" add f
      git -C "$tmp/repo" commit -q -m $'base\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
      base="$(git -C "$tmp/repo" rev-parse HEAD)"
      printf 'change\n' > "$tmp/repo/f"
      git -C "$tmp/repo" add f
      git -C "$tmp/repo" commit -q -m $'work\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
      head="$(git -C "$tmp/repo" rev-parse HEAD)"
      case "$mode" in
        prbody)
          ( cd "$tmp/repo" && PATH="$tmp/bin:$PATH" PR_BODY=$'Summary.\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code' bash "$self_abs" prbody ) >/dev/null 2>&1 || rc=$?
          ;;
        main)
          ( cd "$tmp/repo" && PATH="$tmp/bin:$PATH" bash "$self_abs" main "$head" ) >/dev/null 2>&1 || rc=$?
          ;;
        pr)
          ( cd "$tmp/repo" && PATH="$tmp/bin:$PATH" bash "$self_abs" pr "$base" "$head" claude/selftest ) >/dev/null 2>&1 || rc=$?
          ;;
        pr-empty)
          ( cd "$tmp/repo" && PATH="$tmp/bin:$PATH" bash "$self_abs" pr "$head" "$head" claude/selftest ) >/dev/null 2>&1 || rc=$?
          ;;
      esac
      rm -rf "$tmp"
      if [[ "$rc" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $rc, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }
    st_fault "fault: prbody stops when git interpret-trailers fails" 23 prbody breaks git interpret-trailers
    st_fault "fault: main stops when git log fails"                  23 main   breaks git log
    st_fault "fault: pr stops when git log fails"                    23 pr     breaks git log
    st_fault "fault: prbody stops when sed fails"                    23 prbody breaks sed
    st_fault "fault: prbody stops when sort fails"                   23 prbody breaks sort
    st_fault "fault: prbody stops when awk fails"                    23 prbody breaks awk
    st_fault "fault: prbody stops when tr fails"                     23 prbody breaks tr
    st_fault "fault: pr fails when git rev-list fails"               1  pr     breaks git rev-list
    st_fault "fault: pr fails when git show fails"                   1  pr     breaks git show
    st_fault "fault: pr fails on a listed line that is no commit id" 1  pr     noise  git rev-list
    st_fault "fault: pr fails on a blank line in the listing"        1  pr     blank  git rev-list
    st_fault "fault: pr fails on a blank line after the listing"     1  pr     blank-after git rev-list
    st_fault "fault: pr fails on a listing that is one blank line"   1  pr     blank-only git rev-list
    st_fault "fault: an empty range listed as a blank line fails"    1  pr-empty blank-only git rev-list
    st_fault "fault: pr fails on a listing emptied by mistake"       1  pr     silent git rev-list
    st_fault "fault: pr passes an empty listing for an empty range"  0  pr-empty silent git rev-list
    st_fault "fault: pr fails when an empty range cannot be confirmed" 1 pr-empty breaks git merge-base

    # UNREADABLE TEXT cases (2026-11-25; UNREADABLE TEXT, under helpers). They
    # need a locale in whose encoding some bytes are invalid. The first of
    # these names that this system honours is used; where none is, the cases
    # are skipped in the open. 0xFF is valid in no UTF-8 sequence. The first
    # case is the confirmation run's own: at 143b075, on macOS, it passed.
    st_expect() {
      local name="$1" expected="$2" actual="$3"
      if [[ "$actual" -ne "$expected" ]]; then
        echo "SELFTEST FAIL: $name (exit $actual, expected $expected)"
        fail=1
      else
        echo "selftest ok: $name"
      fi
    }
    utf8_locale=""
    for candidate in C.UTF-8 en_US.UTF-8 en_US.utf8; do
      if LC_ALL="$candidate" bash -c 'x=$(printf "\303\251"); [[ "${#x}" -eq 1 ]]' >/dev/null 2>&1; then
        utf8_locale="$candidate"
        break
      fi
    done
    if [[ -z "$utf8_locale" ]]; then
      echo "selftest note: no UTF-8 locale on this system, so the unreadable-text cases were not run"
    else
      bad="$(printf 'x\377')"
      bad_body="Summary $bad."$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
      rc=0; LC_ALL="$utf8_locale" bash "$self_abs" pr HEAD HEAD "plato/$bad" >/dev/null 2>&1 || rc=$?
      st_expect "unreadable: a plato/ branch holding an invalid byte is refused" 1 "$rc"
      rc=0; LC_ALL="$utf8_locale" bash "$self_abs" pr HEAD HEAD "copilot/$bad" >/dev/null 2>&1 || rc=$?
      st_expect "unreadable: a copilot/ branch holding an invalid byte is refused" 1 "$rc"
      rc=0; LC_ALL="$utf8_locale" bash "$self_abs" pr HEAD HEAD "claude/$bad" >/dev/null 2>&1 || rc=$?
      st_expect "unreadable: any branch holding an invalid byte is refused" 1 "$rc"
      rc=0; LC_ALL="$utf8_locale" PR_BODY="$bad_body" bash "$self_abs" prbody >/dev/null 2>&1 || rc=$?
      st_expect "unreadable: a PR body holding an invalid byte is refused" 1 "$rc"
      rc=0; LC_ALL=C PR_BODY="$bad_body" bash "$self_abs" prbody >/dev/null 2>&1 || rc=$?
      st_expect "unreadable: the same PR body is read as bytes under LC_ALL=C" 0 "$rc"
      # `git commit` rewrites an invalid byte as Latin-1 before it stores the
      # message (measured, git 2.43.0: 0xFF is stored as 0xC3 0xBF), so these
      # commits are written as objects, the way another tool could write one.
      # FounderOS's copy, which validates a secondary role in a commit,
      # passed the second message under C.UTF-8 before this change: grep
      # printed "binary file matches" in place of the line and the role was
      # never seen. This copy reads no secondary role in a commit; the case
      # pins that the line is refused rather than skipped.
      st_raw_commit() {
        local name="$1" expected="$2" locale="$3" msg="$4" rc=0 tmp tree sha
        tmp="$(mktemp -d)"
        git init -q "$tmp" >/dev/null 2>&1
        : > "$tmp/f"
        git -C "$tmp" add f
        tree="$(git -C "$tmp" write-tree)"
        sha="$(printf 'tree %s\nauthor a <a@example.invalid> 0 +0000\ncommitter a <a@example.invalid> 0 +0000\n\n%s\n' "$tree" "$msg" | git -C "$tmp" hash-object -t commit -w --stdin)"
        ( cd "$tmp" && LC_ALL="$locale" bash "$self_abs" main "$sha" ) >/dev/null 2>&1 || rc=$?
        rm -rf "$tmp"
        st_expect "$name" "$expected" "$rc"
      }
      st_raw_commit "unreadable: a commit message holding an invalid byte is refused" 1 "$utf8_locale" \
        "work $bad"$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
      st_raw_commit "unreadable: the same commit message is read as bytes under LC_ALL=C" 0 C \
        "work $bad"$'\n\nRole-Id: builder\nActor-Id: session:x\nExecution-Surface: claude-code'
      st_raw_commit "unreadable: a secondary role on a line with an invalid byte is not hidden" 1 "$utf8_locale" \
        $'work\n\nRole-Id-Secondary: '"$bad"$'architect\nActor-Id: founder'
    fi
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

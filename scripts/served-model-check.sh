#!/usr/bin/env bash
# SERVED-MODEL CHECK — the decision behind the `served-model` check
# (.github/workflows/served-model.yml).
#
# WHAT IT DECIDES. Whether every commit a pull request adds records the model
# that served it, as FounderOS DEC-20261020-01 clauses 3, 4 and 5 require for
# pull requests to this repository (Amendment 2, ratified by the Founder
# 2026-10-22, comment 6331659745 on FounderOS pull request 395):
#
#   - The check covers every commit the pull request adds that changes a
#     file (the commits attribution-shape-check.sh also covers), except
#     direct-founder work: `Actor-Id: founder` with no `Role-Id`.
#   - A commit whose `Execution-Surface:` is `claude-code` is recorded by its
#     own `Co-Authored-By:` trailer, which the claude-code harness adds. The
#     trailer's name is mapped to a model id by the registry's display_name.
#     The builder never writes a line for it.
#   - A commit on any other builder surface (today `codex`) is recorded by a
#     `Served-Model: <model id> (<evidence source>)` line in the pull request
#     body, one line per model, above the Attribution block.
#   - It fails closed. A covered commit with no `Execution-Surface:`, one
#     naming a surface with no builder lane, a `claude-code` commit with no
#     trailer that maps, and a commit on another builder surface when the
#     body has no well-formed line, each count as a MISSING record. So does a
#     body whose `Served-Model:` line git reads as part of the trailer block,
#     or that sits below the end of the message git reads (a `---` divider
#     line, or trailing comment lines) (clause 3: above the Attribution
#     block, not a trailer). Both boundaries are git's own. Such a line is
#     never judged as a record, and the body's other records are judged all
#     the same, so an off-list one still fails at once. A body line inside an
#     HTML comment never counts, even one left unclosed. A commit range git
#     cannot list fails, as an unreadable commit does.
#   - A recorded model that is not on its lane's allowlist is OFF-LIST.
#
# PHASE-IN (clause 4). OFF-LIST fails at once. MISSING is an advisory alert
# before `blocking_from` (2026-11-15) and a failure from that date on. A
# `Served-Model:` line reading `unavailable-from-current-harness` records no
# model (clause 5: the work is unverified, not on-list) and is treated as
# MISSING, so it blocks from the same date.
#
# DATA. Lanes, allowlists and display names come from served-model-lanes.json
# beside this script: a copy of FounderOS 04-agents/model-registry.md at the
# commit the file names. When FounderOS changes a lane or an allowlist, that
# file is updated in a reviewed pull request; this script is not.
#
# WHAT IT DOES NOT PROVE. Shape only, like attribution-shape-check.sh. The
# surface a commit names, its Co-Authored-By trailer and a body line are all
# self-attested; the check validates their form, never their truth. A false
# one is false attribution under DEC-20260718-05.
#
# INTERFACE.
#   served-model-check.sh <base-sha> <head-sha>
#   env:  PR_BODY     the pull request body (required; may be empty)
#         CHECK_DATE  YYYY-MM-DD to judge as of (optional; default today, UTC)
#         LANES_FILE  data file (optional; default served-model-lanes.json
#                     beside this script)
#   exit: 0 pass, or MISSING before blocking_from (advisory)
#         1 fail: OFF-LIST, an unreadable commit or range, or MISSING from
#           blocking_from
#         2 input refused (fail closed): bad arguments, an unset PR_BODY, a
#           date that is not a real calendar date, or a lanes file that is
#           not exactly one JSON document or is malformed anywhere in it,
#           down to each allowlist entry, or a PR body whose end of message
#           git cannot be made to mark
#
# The PR body and commit messages are untrusted input. They are read by git
# and jq only, never evaluated by the shell.

set -euo pipefail

refuse() {
  echo "served-model-check: REFUSED — $1"
  exit 2
}

[[ $# -eq 2 ]] || refuse "usage: served-model-check.sh <base-sha> <head-sha>"
base="$1"
head="$2"
[[ "$base" =~ ^[0-9a-f]{40}$ ]] || refuse "base SHA is not 40 lowercase hex"
[[ "$head" =~ ^[0-9a-f]{40}$ ]] || refuse "head SHA is not 40 lowercase hex"
# `${PR_BODY+set}`, not `-v`: macOS runners ship bash 3.2, which lacks `-v`.
[[ -n "${PR_BODY+set}" ]] || refuse "PR_BODY is unset"

lanes_file="${LANES_FILE:-$(dirname "$0")/served-model-lanes.json}"
[[ -r "$lanes_file" ]] || refuse "lanes file $lanes_file is not readable"
# Exactly one JSON document: a file holding two would make every lookup below
# return two values joined by a newline, which no branch recognises.
lanes="$(jq -cs 'if length == 1 then .[0] else error("not exactly one JSON document") end' "$lanes_file" 2>/dev/null)" \
  || refuse "lanes file $lanes_file is not exactly one JSON document"
# A real calendar date in YYYY-MM-DD form: the round trip through strptime
# and mktime rejects 2026-00-00 and 2026-02-30 as well as malformed text.
JQ_ISDATE='def isdate: type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
  and (try ((strptime("%Y-%m-%d") | mktime | strftime("%Y-%m-%d")) == .) catch false);'

# Validated to the leaf: a malformed lane must refuse, never judge. An
# allowlist that is a string, not an array, would otherwise let a substring
# match pass an off-list model.
jq -e "$JQ_ISDATE"'
  (.blocking_from | isdate)
  and (.builder_lanes | type == "object" and length > 0
       and all(.[]; type == "object"
               and (.lane | type == "string" and length > 0)
               and (.record == "co-authored-by" or .record == "served-model-line")
               and (.allowlist | type == "array" and length > 0
                    and all(.[]; type == "string" and length > 0))))
  and (.display_names | type == "object" and all(.[]; type == "string" and length > 0))' \
  >/dev/null 2>&1 <<<"$lanes" || refuse "lanes file $lanes_file is malformed"
blocking_from="$(jq -r '.blocking_from' <<<"$lanes")"

today="${CHECK_DATE:-$(date -u +%F)}"
jq -en --arg d "$today" "$JQ_ISDATE"' $d | isdate' >/dev/null 2>&1 \
  || refuse "CHECK_DATE is not a real YYYY-MM-DD date"

# on_allowlist <surface> <model id>: exact membership, never a substring test.
on_allowlist() {
  jq -e --arg s "$1" --arg m "$2" 'any(.builder_lanes[$s].allowlist[]; . == $m)' >/dev/null <<<"$lanes"
}

git cat-file -e "$base^{commit}" 2>/dev/null || refuse "base $base is not a commit here"
git cat-file -e "$head^{commit}" 2>/dev/null || refuse "head $head is not a commit here"

trailer() {
  # $1 commit, $2 key — every value git itself reads as that trailer.
  git log -1 --format="%(trailers:key=$2,valueonly,separator=%x0A)" "$1"
}

# applicable <sha>: 0 if the commit changes a file, 1 if not, 2 if unreadable
# (the caller fails closed). Same rule as attribution-shape-check.sh.
applicable() {
  local files
  files="$(git show --pretty=format: --name-only "$1" 2>/dev/null)" || return 2
  [[ -n "$(printf '%s\n' "$files" | grep -v '^$' || true)" ]]
}

missing=0
offlist=0
unreadable=0
body_surfaces=""

# Clause 3: the line sits above the Attribution block and is not a trailer.
# The merge commit's message is "<title>\n\n<body>", so the body is read the
# way git will read it there, under a stand-in title line. Every boundary is
# git's own, never a guess at it:
#   - The end of the message. git stops reading at a `---` divider line, and
#     sets aside trailing comment and blank lines; nothing there is in the
#     message. To find that end, git appends one trailer under a key no body
#     can predict: it writes it at the end of the message's trailer block (or
#     as a new one), and copies the part it did not read, byte for byte,
#     after it. Whatever follows the marker is that part.
#   - The trailer block. git starts it after the last blank line above that
#     end, so it is the last paragraph of what remains, when git finds any
#     trailers.
# A Served-Model line in the trailer block, or below the end of the message,
# is out of place: it counts as a missing record and is never judged as one.
message="$(printf 'title\n\n%s\n' "$PR_BODY" | tr -d '\r'; printf x)"
message="${message%x}"
body_trailers="$(printf '%s' "$message" | git interpret-trailers --parse)"
served_in_trailers="$(grep -i '^Served-Model:' <<<"$body_trailers" || true)"
has_trailers=false
[[ -n "$body_trailers" ]] && has_trailers=true

marker="Served-Model-Boundary-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n'): x"
marked="$(printf '%s' "$message" \
  | git interpret-trailers --where end --if-exists add --if-missing add --trailer "$marker"; printf x)"
marked="${marked%x}"
[[ "$(grep -cxF -- "$marker" <<<"$marked" || true)" -eq 1 ]] \
  || refuse "git did not mark the end of the PR body's message exactly once"
# A newline held in a variable, not $'\n' inside the expansion, which bash
# 3.2 reads differently when extquote is off.
nl=$'\n'
unread="${marked#*"$marker$nl"}"
[[ "$message" == *"$unread" ]] \
  || refuse "the part of the PR body git does not read could not be located"
read_part="${message%"$unread"}"
served_unread="$(grep -i '^Served-Model:' <<<"$unread" || true)"

# The body's Served-Model records: every line of the message above the trailer
# block that starts at column 0. The stand-in title and the blank lines after
# it are set aside, never a line's own indentation, so an indented line stays
# off column 0. HTML comments do not count, so a template's example never
# does; a comment left open runs to the end, as a renderer reads it. A record
# is one physical line with no comment in it: each line of a comment becomes
# a U+0001 mark and its line breaks stay, so a line that began with a comment
# is off column 0, a comment cannot join two lines, and a Served-Model line
# holding any part of a comment is malformed, never read around it. Each line
# is {id, evidence} or {malformed}. Records are judged whether or not a
# misplaced line was also found, so an off-list model always fails at once.
body_records="$(jq -Rsc --argjson trailers "$has_trailers" '
  sub("\\Atitle\n"; "")
  | sub("\\A([ \t\f\u000b]*\n)+"; "")
  | sub("\\s+\\z"; "")
  | [splits("\n[ \t\f\u000b]*\n")] as $paras
  | (if $trailers then $paras[:-1] else $paras end)
  | join("\n\n")
  | gsub("(?<c><!--[\\s\\S]*?(?:-->|\\z))"; .c | [splits("\n")] | map("\u0001") | join("\n"))
  | split("\n")
  | map(select(test("^Served-Model:")))
  | map(capture("^Served-Model:[ \t]*(?<id>[A-Za-z0-9._-]+)[ \t]+\\((?<evidence>[^)\u0001]*[^)\u0001 \t][^)\u0001]*)\\)[ \t]*$")
        // {malformed: gsub("\u0001"; "<!--...-->")})
' <<<"$read_part")"

# Listed before the loop, so a failed listing fails closed instead of reading
# as a range with no commits in it.
if ! commits="$(git rev-list --reverse "$base..$head")"; then
  echo "FAIL: the commit range $base..$head cannot be listed (failing closed)"
  unreadable=1
  commits=""
fi

while IFS= read -r sha; do
  [[ -n "$sha" ]] || continue
  short="${sha:0:7}"
  rc=0; applicable "$sha" || rc=$?
  if [[ "$rc" -eq 2 ]]; then
    echo "FAIL $short: commit cannot be read (failing closed)"
    unreadable=1
    continue
  fi
  [[ "$rc" -eq 0 ]] || continue

  role="$(trailer "$sha" Role-Id)"
  actor="$(trailer "$sha" Actor-Id)"
  if [[ -z "$role" && "$actor" == "founder" ]]; then
    echo "note $short: direct-founder work, not covered"
    continue
  fi

  surface="$(trailer "$sha" Execution-Surface | sort -u)"
  if [[ -z "$surface" ]]; then
    echo "MISSING $short: no Execution-Surface trailer"
    missing=1
    continue
  fi
  if [[ "$(wc -l <<<"$surface")" -ne 1 ]]; then
    echo "MISSING $short: more than one Execution-Surface ($(tr '\n' ' ' <<<"$surface"))"
    missing=1
    continue
  fi

  record="$(jq -r --arg s "$surface" '.builder_lanes[$s].record // empty' <<<"$lanes")"
  case "$record" in
    co-authored-by)
      mapped=""
      while IFS= read -r coauthor; do
        [[ -n "$coauthor" ]] || continue
        name="$(sed -E 's/[[:space:]]*<[^>]*>[[:space:]]*$//; s/^[[:space:]]+//; s/[[:space:]]+$//' <<<"$coauthor")"
        id="$(jq -r --arg n "$name" '.display_names[$n] // empty' <<<"$lanes")"
        [[ -n "$id" ]] && mapped+="$id"$'\n'
      done < <(trailer "$sha" Co-Authored-By)
      if [[ -z "$mapped" ]]; then
        echo "MISSING $short: $surface commit has no Co-Authored-By trailer that maps to a registry model"
        missing=1
        continue
      fi
      while IFS= read -r id; do
        [[ -n "$id" ]] || continue
        if on_allowlist "$surface" "$id"; then
          echo "ok $short: $surface, served by $id (Co-Authored-By)"
        else
          echo "OFF-LIST $short: $surface commit served by $id, not on the $(jq -r --arg s "$surface" '.builder_lanes[$s].lane' <<<"$lanes") allowlist"
          offlist=1
        fi
      done < <(sort -u <<<"$mapped")
      ;;
    served-model-line)
      echo "note $short: $surface, recorded by the body's Served-Model line"
      body_surfaces+="$surface"$'\n'
      ;;
    *)
      echo "MISSING $short: Execution-Surface '$surface' has no builder lane"
      missing=1
      ;;
  esac
done <<<"$commits"

while IFS= read -r surface; do
  [[ -n "$surface" ]] || continue
  lane="$(jq -r --arg s "$surface" '.builder_lanes[$s].lane' <<<"$lanes")"
  if [[ -n "$served_in_trailers" ]]; then
    echo "MISSING body: a Served-Model line is in the trailer block, where it does not count; put it above the Attribution block, separated by a blank line"
    missing=1
  fi
  if [[ -n "$served_unread" ]]; then
    echo "MISSING body: a Served-Model line is below the end of the message git reads (a --- line, or trailing comment lines), where it does not count; put it above the Attribution block"
    missing=1
  fi
  while IFS= read -r bad; do
    [[ -n "$bad" ]] || continue
    echo "MISSING body: malformed line '$bad' (expected 'Served-Model: <model id> (<evidence source>)')"
    missing=1
  done < <(jq -r '.[] | .malformed // empty' <<<"$body_records")
  ids="$(jq -r '.[] | .id // empty' <<<"$body_records" | sort -u)"
  if [[ -z "$ids" ]]; then
    echo "MISSING body: $surface commits need a Served-Model line, and the body has none"
    missing=1
    continue
  fi
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    if [[ "$id" == "unavailable-from-current-harness" ]]; then
      echo "MISSING body: Served-Model is unavailable-from-current-harness (unverified, not on-list)"
      missing=1
    elif on_allowlist "$surface" "$id"; then
      echo "ok body: $surface, served by $id"
    else
      echo "OFF-LIST body: $id is not on the $lane allowlist"
      offlist=1
    fi
  done <<<"$ids"
done < <(sort -u <<<"$body_surfaces")

if [[ "$offlist" -eq 1 || "$unreadable" -eq 1 ]]; then
  echo "served-model-check: FAIL"
  exit 1
fi
if [[ "$missing" -eq 1 ]]; then
  if [[ ! "$today" < "$blocking_from" ]]; then
    echo "served-model-check: FAIL — a served-model record is missing (blocking from $blocking_from)"
    exit 1
  fi
  echo "served-model-check: ALERT — a served-model record is missing (advisory before $blocking_from, blocking from that date)"
  exit 0
fi
echo "served-model-check: PASS"

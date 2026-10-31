#!/usr/bin/env bash
# FOUNDER AUTHORIZATION CHECK — the one decision behind the
# `founder-authorization` status (.github/workflows/founder-authorization.yml).
#
# WHAT IT DECIDES. Whether a pull request's CURRENT head carries a Founder
# merge authorization in the SHA-named form DEC-20260718-04 requires:
#
#   Authorized: merge <owner>/<repo>#<number> at head <40-hex head SHA>
#
# as the opening words of a PR comment written by an allowed login. The SHA
# must equal the head being judged, so any push after an authorization leaves
# the new head unauthorized until a fresh comment names it. Markdown link
# syntax is reduced to its text and whitespace is normalized first, so a
# reference GitHub's editor turned into a link (as on PR #77) and a block
# whose SHA wraps onto the next line both still count; the SHA may sit in
# backticks.
#
# SECOND ROUTE: A MILESTONE ENVELOPE (FOUNDER-ACT-20261031-BR-MILESTONE-AUTH-
# GUARD, under DEC-20261027-01 clause 7). Only when the route above finds
# nothing and the caller supplies ENVELOPE_INPUT, the head also counts as
# authorized when ALL of these hold; any failure, or any input that cannot
# be judged, leaves it unauthorized:
#   1. the PR description has exactly one line
#      "Milestone-Auth: <MILESTONE-ID> https://github.com/<this repo>/issues/<n>";
#   2. issue <n> is an issue (not a PR), open, labelled milestone-carrier;
#   3. a comment on it by an allowed login is, after normalization (CR
#      removed, one surrounding fence pair dropped, Markdown links reduced to
#      text, whitespace collapsed), the whole DEC-20261027-01 Appendix B text
#      with every field filled, fields read in order, and no field value
#      holding a later field's label;
#   4. its milestone and carrier fields match the description's line;
#   5. exactly one member entry names this PR, at the head being judged;
#   6. the comment was never edited (updated_at equals created_at);
#   7. it holds none of Appendix B's seven placeholders;
#   8. the PR's complete file list touches no excluded path (.github/,
#      AGENTS.md or CLAUDE.md at any depth, scripts/, railway.toml,
#      package.json, package-lock.json, packages/control-plane/src/
#      migrations.ts or migrate-cli.ts, *.sql), by filename or a rename's
#      previous_filename.
#
# WHAT THE ENVELOPE ROUTE DOES NOT DECIDE (Part B6 of that act). It does not
# decide the rest of DEC-20261027-01 clause 4, whether the Founder reviewed
# each member's diff, or the clause 3 void when a later review finds an
# unresolved merge-blocking issue; those stay the Founder's. The Founder's
# revocation levers are deleting or editing the envelope comment, removing
# the milestone-carrier label, closing, deleting or transferring the carrier
# issue, and editing the member's description; the workflow re-judges the
# members each one affects. Like the route above, it cannot tell the
# Founder's comments from an agent's, because both post through the same
# GitHub account.
#
# WHY IT EXISTS. On 2026-09-27 three PRs (#76, #80, #81) were merged with no
# authorization comment on the PR; twice the comment meant as the
# authorization was a builder prompt pasted by mistake. An agreement did not
# stop that; a required check does.
#
# WHAT IT DOES NOT PROVE. Founder and agent sessions post through the same
# GitHub account, so an allowed login proves only which account wrote the
# comment, never which person or session did. The check stops accidental
# merges (a wrong paste, a merge clicked before the block was posted); the
# rule that only the Founder posts authorizations still carries the rest.
#
# INTERFACE.
#   founder-authorization-check.sh <owner/repo> <pr-number> <head-sha>
#   stdin:  the PR's issue comments, a JSON array as the REST API returns it
#   env:    FOUNDER_LOGINS — space-separated logins whose comments count
#           (required; an empty or unset value fails closed)
#           ENVELOPE_INPUT — optional path to a JSON file
#           {pull, files, issue, comments}: the PR object, its file list, the
#           carrier issue and the carrier's comments, as the REST API returns
#           them. Unset or empty: the script behaves exactly as it did before
#           the envelope route existed.
#   stdout: one JSON object {authorized, description, comment_id, html_url}
#   exit:   0 authorized, 1 not authorized, 2 input refused (fail closed)
#
# Comment bodies are untrusted input. They are read only by jq, never by the
# shell, and nothing here evaluates them.

set -euo pipefail

emit() {
  # $1 authorized (true|false), $2 description, $3 comment id, $4 url
  jq -nc --argjson a "$1" --arg d "$2" --arg id "${3:-}" --arg u "${4:-}" \
    '{authorized: $a, description: $d, comment_id: (if $id == "" then null else ($id | tonumber) end), html_url: (if $u == "" then null else $u end)}'
}

refuse() {
  emit false "refused: $1"
  exit 2
}

[[ $# -eq 3 ]] || refuse "usage: <owner/repo> <pr-number> <head-sha>"
repo="$1"
pr="$2"
head="$3"

[[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || refuse "repository name is malformed"
[[ "$pr" =~ ^[1-9][0-9]*$ ]] || refuse "PR number is malformed"
[[ "$head" =~ ^[0-9a-f]{40}$ ]] || refuse "head SHA is not 40 lowercase hex"

logins="${FOUNDER_LOGINS:-}"
[[ -n "${logins// /}" ]] || refuse "FOUNDER_LOGINS is empty"

comments="$(cat)"
jq -e 'type == "array"' >/dev/null 2>&1 <<<"$comments" || refuse "comments are not a JSON array"

match="$(jq -c \
  --arg repo "$repo" --arg pr "$pr" --arg head "$head" --arg logins "$logins" '
  ($logins | split(" ") | map(select(length > 0))) as $allowed
  | [ .[]
      | select((.user.login // "") as $l | $allowed | index($l))
      | . as $c
      | (($c.body // "")
          | gsub("\\[(?<t>[^\\]]*)\\]\\([^)]*\\)"; "\(.t)")
          | gsub("\\s+"; " ")
          | ltrimstr(" ")) as $text
      | ($text | capture("^Authorized: merge (?<repo>[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)#(?<pr>[0-9]+) at head `?(?<sha>[0-9A-Fa-f]{40})(?![0-9A-Za-z_])")?) as $m
      | select($m != null)
      | select(($m.repo | ascii_downcase) == ($repo | ascii_downcase))
      | select($m.pr == $pr)
      | select(($m.sha | ascii_downcase) == $head)
      | {id: $c.id, url: ($c.html_url // "")}
    ]
  | first // empty
' <<<"$comments")" || refuse "comments could not be evaluated"

if [[ -n "$match" ]]; then
  id="$(jq -r '.id' <<<"$match")"
  url="$(jq -r '.url' <<<"$match")"
  emit true "Authorized at head ${head:0:7} by comment $id" "$id" "$url"
  exit 0
fi

# ---------------------------------------------------------------------------
# ENVELOPE ROUTE (FOUNDER-ACT-20261031-BR-MILESTONE-AUTH-GUARD, Part B).
# Reached only when the single-PR route above found nothing AND the caller set
# ENVELOPE_INPUT. With ENVELOPE_INPUT unset or empty, the script ends exactly
# as it did before the envelope route existed.
# ---------------------------------------------------------------------------
envelope_input="${ENVELOPE_INPUT:-}"
if [[ -z "$envelope_input" ]]; then
  emit false "No Founder authorization names head ${head:0:7} on #$pr"
  exit 1
fi

[[ -f "$envelope_input" ]] || refuse "envelope input is not a readable file"
jq -e 'type == "object"' "$envelope_input" >/dev/null 2>&1 || refuse "envelope input is not a JSON object"

envelope="$(jq -c \
  --arg repo "$repo" --arg pr "$pr" --arg head "$head" --arg logins "$logins" '
  # One failing condition, the first in Part B order, names the reason. A
  # condition that errors (missing field, wrong type) counts as failing.
  def chk(c; m): if .reason != null then . elif ((try c catch false) == true) then . else .reason = m end;

  # B2: CR removed; one opening and one closing fence line around the whole
  # envelope ignored; Markdown links reduced to their text; whitespace runs
  # reduced to one space.
  def normalize:
    gsub("\r"; "")
    | split("\n")
    | until((length == 0) or (.[0] | test("\\S")); .[1:])
    | until((length == 0) or (.[-1] | test("\\S")); .[:-1])
    | if length >= 2
         and (.[0] | test("^ {0,3}(```+|~~~+)[^`]*$"))
         and (.[-1] | test("^ {0,3}(```+|~~~+)\\s*$"))
      then .[1:-1] else . end
    | join("\n")
    | gsub("\\[(?<t>[^\\]]*)\\]\\([^)]*\\)"; "\(.t)")
    | gsub("\\s+"; " ")
    | ltrimstr(" ") | rtrimstr(" ");

  # B1.3: DEC-20261027-01 Appendix B, normalized; only the fields vary.
  def template:
    "^FOUNDER MILESTONE AUTHORIZATION I, Michael Daley, Founder \\(MAD Ventures\\), authorize merge of each pull request listed below at the full 40-character head named on its line\\. Merge each only if its live head still matches the head named for it\\. milestone: (?<m>.+?) bounded by: (?<b>.+?) scope: (?<s>.+?) carrier: (?<c>\\S+) (?<members>MADVenturesLLC/[A-Za-z0-9_.-]+#[1-9][0-9]* head [0-9A-Fa-f]{40}(?: MADVenturesLLC/[A-Za-z0-9_.-]+#[1-9][0-9]* head [0-9A-Fa-f]{40})*) I have reviewed each member\u0027s diff at the head named for it\\. Each line is a separate authorization\\. A line is void the moment that pull request\u0027s head moves, or when a later review finds an unresolved merge-blocking issue on it; the other lines stay in force\\. A void line is re-authorized only by a new comment, never by editing this one\\. This authorization does not cover any pull request that DEC-20261027-01 clause 4 excludes, and does not extend to any pull request not listed above\\. — Michael Daley$";

  # B1.7: Appendix B placeholders.
  def placeholders:
    ["<MILESTONE-ID>", "<governing plan / task list / ruling>", "<one line>",
     "<full URL of this milestone issue>", "<repo>", "<n>", "<40-character SHA>"];

  # B1.8: paths an envelope entry may never cover.
  def excluded:
    startswith(".github/")
    or ((split("/") | last) as $b | $b == "AGENTS.md" or $b == "CLAUDE.md")
    or startswith("scripts/")
    or . == "railway.toml" or . == "package.json" or . == "package-lock.json"
    or . == "packages/control-plane/src/migrations.ts"
    or . == "packages/control-plane/src/migrate-cli.ts"
    or endswith(".sql");

  def carrier_url($n): "https://github.com/" + $repo + "/issues/" + $n;

  # Judges one carrier comment; returns it with .reason null when it counts.
  def envelope($ma; $allowed):
    . as $c
    | {reason: null, id: $c.id, url: ($c.html_url // "")}
    | chk($c.user.login as $l | $allowed | index($l) != null;
          "comment \($c.id) is not from an allowed login")
    | chk($c.updated_at == $c.created_at and ($c.created_at | type) == "string";
          "comment \($c.id) has been edited")
    | ($c.body // "") as $raw
    | ($raw | normalize) as $t
    | chk([placeholders[] as $p | ($raw | contains($p)) or ($t | contains($p))] | any | not;
          "comment \($c.id) still holds an Appendix B placeholder")
    | (($t | capture(template)?) // null) as $f
    | chk($f != null; "comment \($c.id) is not the Appendix B text")
    | chk([$f.m, $f.b, $f.s] | map(gsub("^ +| +$"; "") | length > 0) | all;
          "comment \($c.id) has an empty field")
    # B2: a field value holding the label of a later field is refused. Read
    # lazily, "bounded by: X scope: Y scope: Z" would hand "Y scope: Z" to
    # scope and hide the label inside bounded by; so each of the four labels
    # must occur exactly once, which no value holding a label can satisfy.
    | chk(["milestone:", "bounded by:", "scope:", "carrier:"]
          | map(. as $l | $t | ascii_downcase | [match($l; "g")] | length == 1) | all;
          "comment \($c.id) has a field value holding a field label")
    | chk($f.m == $ma.id; "comment \($c.id) names milestone \($f.m), not \($ma.id)")
    | chk(($f.c | ascii_downcase) == ($ma.url | ascii_downcase);
          "comment \($c.id) names another carrier")
    | ([($f.members // "") | scan("MADVenturesLLC/([A-Za-z0-9_.-]+)#([1-9][0-9]*) head ([0-9A-Fa-f]{40})")
        | select((("MADVenturesLLC/" + .[0]) | ascii_downcase) == ($repo | ascii_downcase) and .[1] == $pr)]) as $mine
    | chk(($mine | length) == 1;
          "comment \($c.id) has \($mine | length) entries for #\($pr); exactly one required")
    | chk(($mine[0][2] | ascii_downcase) == $head;
          "comment \($c.id) names another head for #\($pr)");

  ($logins | split(" ") | map(select(length > 0))) as $allowed
  | . as $in
  | {reason: null}

  # B1.1: exactly one Milestone-Auth line, naming this repository'"'"'s issue.
  | ([($in.pull.body // "") | split("\n")[] | sub("\r$"; "")
       | select(test("^\\s*Milestone-Auth:"; "i"))]) as $lines
  | chk(($lines | length) == 1;
        "description has \($lines | length) Milestone-Auth lines; exactly one required")
  | (($lines[0] // "") | gsub("^\\s+|\\s+$"; "")
     | capture("^Milestone-Auth: (?<id>\\S+) (?<url>https://github\\.com/(?<r>[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)/issues/(?<n>[1-9][0-9]*))$")? // null) as $ma
  | chk($ma != null and ($ma.r | ascii_downcase) == ($repo | ascii_downcase);
        "Milestone-Auth line does not name an issue in \($repo)")

  # The inputs describe this pull request at this head.
  | chk(($in.pull.number | tostring) == $pr and $in.pull.head.sha == $head;
        "envelope input describes another pull request or head")

  # B1.8: the file list is complete and touches no excluded path.
  | chk(($in.files | type) == "array" and ([$in.files[] | (.filename | type) == "string"] | all);
        "file list is malformed")
  | chk(($in.pull.changed_files | type) == "number"
        and ($in.files | length) < 3000 and ($in.files | length) >= $in.pull.changed_files;
        "file list may be incomplete (\($in.files | length) of \($in.pull.changed_files // "?"))")
  | ([$in.files[]? | (.filename?, .previous_filename?) | strings | select(excluded)]) as $hit
  | chk(($hit | length) == 0; "changes \($hit[0]), which an envelope cannot cover")

  # B1.2: the carrier is this repository'"'"'s open issue, labelled.
  | chk(($in.issue.number | tostring) == $ma.n; "carrier issue #\($ma.n) could not be read")
  | chk($in.issue.pull_request == null; "carrier #\($ma.n) is a pull request, not an issue")
  | chk($in.issue.state == "open"; "carrier #\($ma.n) is not open")
  | chk([$in.issue.labels[]?.name] | index("milestone-carrier") != null;
        "carrier #\($ma.n) does not carry the milestone-carrier label")

  # B1.3 to B1.7: one comment on the carrier is a valid envelope for this head.
  | chk(($in.comments | type) == "array"; "carrier comments are malformed")
  | if .reason != null then .
    else
      ([$in.comments[] | select((.user.login // "") as $l | $allowed | index($l))
        | envelope($ma; $allowed)]) as $judged
      | ([$judged[] | select(.reason == null)] | first) as $ok
      | if $ok != null then {reason: null, id: $ok.id, url: $ok.url, carrier: $ma.n}
        elif ($judged | length) == 0 then .reason = "carrier #\($ma.n) has no comment from an allowed login"
        else .reason = $judged[-1].reason end
    end
' "$envelope_input")" || refuse "envelope input could not be evaluated"
[[ -n "$envelope" ]] || refuse "envelope input could not be evaluated"

if [[ "$(jq -r '.reason == null' <<<"$envelope")" == true ]]; then
  id="$(jq -r '.id' <<<"$envelope")"
  url="$(jq -r '.url' <<<"$envelope")"
  carrier="$(jq -r '.carrier' <<<"$envelope")"
  emit true "Authorized at head ${head:0:7} by envelope comment $id on carrier #$carrier" "$id" "$url"
  exit 0
fi

emit false "No authorization for head ${head:0:7} on #$pr; envelope: $(jq -r '.reason' <<<"$envelope")"
exit 1

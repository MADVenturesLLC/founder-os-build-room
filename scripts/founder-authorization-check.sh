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
      | ($text | capture("^Authorized: merge (?<repo>[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)#(?<pr>[0-9]+) at head `?(?<sha>[0-9A-Fa-f]{40})`?(?![0-9A-Fa-f])")?) as $m
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

emit false "No Founder authorization names head ${head:0:7} on #$pr"
exit 1

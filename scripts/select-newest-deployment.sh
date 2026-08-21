#!/usr/bin/env bash
#
# Pick the newest deployment from a Railway `deployments` GraphQL response.
#
# Reads the response JSON on stdin, takes the page size the query asked for as
# `$1`, and writes the newest node as JSON on stdout. Exits non-zero, with the
# reason on stderr, when the newest cannot be established.
#
# Split out of `railway-restart.sh` so this decision can be TESTED. It is the
# step where the script either establishes which deployment is current or fails
# to, and it was previously inline in a script nothing exercised — see
# `test/railway-deployment-selection.test.ts`, which drives it with 49- and
# 50-edge responses because the boundary is the whole point.
#
# WHY A FULL PAGE IS REFUSED
#
# Railway documents no ordering guarantee for `deployments`. Sorting the page
# by `createdAt` here is exact only if the page CONTAINS the newest deployment,
# and the thing that would have to promise that is the same guarantee the sort
# was introduced to stop relying on. A full page may be truncated, so on a full
# page the newest is not established and this refuses rather than restarting a
# deployment it cannot identify.
#
# Fewer than `page_size` edges means the page is the complete set, and the sort
# is then exact regardless of what order the server returned them in.
#
# RAISING `PAGE_SIZE` IS NOT A FIX. It moves the failure point without removing
# it — at no value can the script prove it holds the newest deployment (Founder
# ruling, 2026-08-21). The fixes are verified cursor pagination to exhaustion or
# a confirmed server-side ordering contract; both need Railway's connection
# schema established against the live API. See `docs/phase-2-known-limits.md` §3.

set -euo pipefail

page_size="${1:?page size is required}"

response=$(cat)

edge_count=$(printf '%s' "$response" | jq '[.data.deployments.edges[]?] | length')

if [[ "$edge_count" -ge "$page_size" ]]; then
  echo "Railway returned a full page of $edge_count deployments, so this page may be" >&2
  echo "truncated. Railway guarantees no ordering for \`deployments\`, so a truncated" >&2
  echo "page need not contain the newest one — refusing to restart a deployment this" >&2
  echo "script cannot prove is the current one. Raise PAGE_SIZE in railway-restart.sh," >&2
  echo "or implement cursor pagination once the connection contract is confirmed." >&2
  exit 2
fi

# jq sorts a null or absent key first, so one malformed `createdAt` silently
# changes which node is "newest". Refuse instead of sorting around it. Anchored
# at both ends and type-checked: a prefix match accepts "2026-08-21T00:00:00
# whatever", and a non-string id or status is truthy but unusable.
#
# Every field is range-checked, and the pattern is built from pieces shared with
# the sort below so the two cannot drift. Bare `[0-9]{2}` was loose in two ways:
# it accepted an offset of `+24:00` or `+00:60`, which passes a shape check and
# then converts into a real instant up to a day away; and it let an out-of-range
# date or time reach jq, which died with its own exit 5 rather than this
# script's documented exit 3. Seconds allow 60 on purpose — RFC 3339 permits a
# leap second and `fromdateiso8601` parses one. A well-formed but nonexistent
# date (2026-02-30) is still accepted and normalised by strptime; catching that
# needs a calendar, not a pattern. All raised by CodeRabbit on PR #6.
DATE='[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])'
TIME='([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)'
FRAC='([.][0-9]+)?'
OFFSET='(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])'
RFC3339="^${DATE}T${TIME}${FRAC}${OFFSET}\$"
CAPTURE="^(?<base>${DATE}T${TIME})(?<frac>${FRAC})(?<off>${OFFSET})\$"
invalid=$(printf '%s' "$response" | jq -r --arg re "$RFC3339" '
  .data.deployments.edges[]?.node
  | select(
      (.id     | type != "string" or . == "")
      or (.status | type != "string" or . == "")
      or (.createdAt | type != "string" or (test($re) | not))
    )
  | tojson')

if [[ -n "$invalid" ]]; then
  echo "deployment nodes with a missing or malformed id/status/createdAt:" >&2
  printf '  %s\n' "$invalid" >&2
  echo "cannot establish the newest deployment from these — refusing" >&2
  exit 3
fi

# Sort by the INSTANT, not the string. The pattern above accepts numeric
# offsets, and `sort_by(.createdAt)` compares those lexicographically: with
# "2026-08-21T00:00:00-01:00" (which is 01:00Z) and "2026-08-21T00:30:00Z",
# a string sort puts the Z form last and picks the OLDER deployment. jq's
# `fromdateiso8601` will not parse either an offset or fractional seconds, so
# the offset is applied by hand. Fractional seconds are the tiebreak within a
# second rather than being discarded. Raised by CodeRabbit on PR #6.
newest=$(printf '%s' "$response" | jq -c --arg cap "$CAPTURE" '
  def rfc3339_epoch:
    capture($cap)
    | [ (.base + "Z" | fromdateiso8601)
        - (if .off == "Z" then 0
           else (if .off[0:1] == "-" then -1 else 1 end)
                * ((.off[1:3] | tonumber) * 3600 + (.off[4:6] | tonumber) * 60)
           end),
        # An absent fraction captures as "", not null, because FRAC is wrapped
        # in a named group — and "" is truthy in jq, so `// ".0"` never fires.
        (if .frac == "" then 0 else (.frac | tonumber) end) ];
  [.data.deployments.edges[]?.node]
  | sort_by(.createdAt | rfc3339_epoch)
  | last // empty')

if [[ -z "$newest" || "$newest" == "null" ]]; then
  echo "no deployment found for the service; response: $response" >&2
  exit 1
fi

printf '%s' "$newest"

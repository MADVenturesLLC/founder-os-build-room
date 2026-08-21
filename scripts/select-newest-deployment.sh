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
# THIS IS A BOUND, NOT THE FIX. Raising `PAGE_SIZE` moves the failure point; it
# does not remove it (Founder ruling, 2026-08-21). The fix is cursor pagination
# to exhaustion, or a server-side sort, and both need Railway's connection
# contract confirmed against the live API first — whether `pageInfo`/`after`
# exist on this connection and what an ordering argument would be. That needs a
# Founder-issued project token, so it is not something a session can settle on
# its own. See `docs/phase-2-known-limits.md` §3.

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

newest=$(printf '%s' "$response" \
  | jq -c '[.data.deployments.edges[]?.node] | sort_by(.createdAt) | last // empty')

if [[ -z "$newest" || "$newest" == "null" ]]; then
  echo "no deployment found for the service; response: $response" >&2
  exit 1
fi

printf '%s' "$newest"

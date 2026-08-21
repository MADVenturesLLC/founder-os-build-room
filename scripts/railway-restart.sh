#!/usr/bin/env bash
#
# Restart the Railway service through Railway's API.
#
# This exists to close `docs/phase-2-known-limits.md` §3 and §5, which are the
# two largest weaknesses in the run evidence and are really the same weakness:
# with `ExternalPlatform` a human performs each restart, so the harness can
# observe that a restart happened but never that its own request caused one,
# and the human is timing their click against a clock they cannot see.
#
# Pointing `PHASE2_RESTART_COMMAND` at this script removes both. The harness
# calls it at exactly the moment it wants a restart, the call itself performs
# the restart, and the process identity that follows is caused by the request
# that preceded it rather than merely later than it.
#
# What it does NOT close: Railway's API returns `true`, not a restart id, so
# the causal link is "this call performed a restart" rather than "the process
# now serving is the one this call produced". A concurrent restart from another
# source could still interleave. That is a smaller gap than a human with a
# stopwatch, and it is stated rather than glossed — see §3.
#
# CREDENTIALS ARE READ FROM THE ENVIRONMENT AND NEVER STORED HERE.
# `RAILWAY_API_TOKEN` is a Railway **project** token, scoped to one project and
# environment. It belongs in the shell that runs the gate and nowhere else —
# not in this file, not in `railway.toml`, not in any committed artifact
# (`DEC-20260815-07`; `DEC-20260815-17` Phase 2 exit criterion 1). Revoke it
# once the gate is done; nothing here needs it to persist.

set -euo pipefail

API="${RAILWAY_API_URL:-https://backboard.railway.com/graphql/v2}"

need() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required and was not set" >&2
    exit 1
  fi
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required and is not on PATH" >&2
    exit 1
  fi
}

need RAILWAY_API_TOKEN
need RAILWAY_PROJECT_ID
need RAILWAY_SERVICE_ID
need RAILWAY_ENVIRONMENT_ID

# `need jq` would check an ENVIRONMENT VARIABLE named jq — `need` indirects
# through `${!name}`. The command check is a different check and needs its own
# helper; conflating them made this script exit "jq is required and was not set"
# on a machine where jq was installed and working.
need_command jq
need_command curl

# `--fail-with-body` so an HTTP error is an error here rather than a success
# carrying an error document. A restart that did not happen must not look like
# one that did — the whole condition depends on this call being honest.
#
# It is NOT sufficient alone: GraphQL reports errors with HTTP 200, so a failed
# query arrives as a success carrying an `errors` array. `graphql()` checks for
# that explicitly rather than trusting the status code. Raised by CodeRabbit on
# PR #2.
call() {
  curl -sS --fail-with-body -m 30 "$API" \
    -H "Project-Access-Token: $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$1"
}

graphql() {
  local response
  response=$(call "$1")
  if printf '%s' "$response" | jq -e 'has("errors")' >/dev/null 2>&1; then
    echo "GraphQL error from Railway: $response" >&2
    exit 1
  fi
  printf '%s' "$response"
}

# The ACTIVE deployment is looked up rather than remembered. A push redeploys
# the service and mints a new deployment id, so a hardcoded one would restart
# something that is no longer serving — or nothing at all.
#
# `first:1` is not "the newest". Railway documents no ordering guarantee for
# `deployments`, and its own CLI sorts client-side — so this pulls a page and
# picks the newest by `createdAt` here rather than trusting the server to have
# meant what we assumed. Raised by CodeRabbit on PR #2.
#
# That sort is only sound if the page CONTAINS the newest deployment, and the
# same missing ordering guarantee is what would have to promise it does. With
# no documented order, an arbitrary page of fifty out of eighty deployments
# need not include the most recent one — so the client-side sort did not remove
# the assumption, it moved it one level down where it stopped being visible.
#
# The page size is therefore load-bearing, and the script proves rather than
# hopes: if exactly PAGE_SIZE edges come back, the set may be truncated and the
# newest cannot be established, so this refuses instead of restarting something
# it cannot identify. Fewer than PAGE_SIZE means the page is the complete set
# and the sort is exact.
#
# Refusing is the right failure for this harness — its whole purpose is to
# refuse a restart that only looks like one. The proper fix is to page to
# exhaustion (or to sort server-side), and both need Railway's connection
# schema confirmed against the live API first; PAGE_SIZE is the interim bound.
PAGE_SIZE=50

read -r -d '' QUERY <<GQL || true
query(\$p:String!,\$s:String!,\$e:String!){
  deployments(first:${PAGE_SIZE}, input:{projectId:\$p, serviceId:\$s, environmentId:\$e}){
    edges { node { id status createdAt } }
  }
}
GQL

# The request body is built by `jq`, never by interpolating into a JSON string.
# The ids are UUIDs today, so hand-built JSON happened to be valid — but a value
# carrying a quote or backslash would produce a malformed or altered request,
# and "happens to be safe" is a poor property for the one call that performs the
# restart. Raised by CodeRabbit on PR #2.
deployments=$(graphql "$(jq -nc \
  --arg q "$QUERY" \
  --arg p "$RAILWAY_PROJECT_ID" \
  --arg s "$RAILWAY_SERVICE_ID" \
  --arg e "$RAILWAY_ENVIRONMENT_ID" \
  '{query:$q, variables:{p:$p, s:$s, e:$e}}')")

# Responses are parsed by `jq` too. The previous
# `sed -n 's/.*"id":"\([^"]*\)".*/\1/p'` was greedy: the leading `.*` runs as far
# as it can, so it captured the LAST id on the line rather than the first, and
# `head -1` only deduplicated lines. One id in the response made that harmless;
# any added id-bearing field would have restarted something else.
edge_count=$(printf '%s' "$deployments" | jq '[.data.deployments.edges[]?] | length')

if [[ "$edge_count" -ge "$PAGE_SIZE" ]]; then
  echo "Railway returned a full page of $edge_count deployments, so this page may be" >&2
  echo "truncated. Railway guarantees no ordering for \`deployments\`, so a truncated" >&2
  echo "page need not contain the newest one — refusing to restart a deployment this" >&2
  echo "script cannot prove is the current one. Raise PAGE_SIZE in this script, or" >&2
  echo "implement cursor pagination once the connection schema is confirmed." >&2
  exit 1
fi

newest=$(printf '%s' "$deployments" \
  | jq -c '[.data.deployments.edges[]?.node] | sort_by(.createdAt) | last // empty')

if [[ -z "$newest" || "$newest" == "null" ]]; then
  echo "no deployment found for the service; response: $deployments" >&2
  exit 1
fi

deployment_id=$(printf '%s' "$newest" | jq -r '.id // empty')
status=$(printf '%s' "$newest" | jq -r '.status // empty')

if [[ -z "$deployment_id" ]]; then
  echo "newest deployment carries no id; node: $newest" >&2
  exit 1
fi

# Restarting a deployment that is not serving would report success and change
# nothing, which is precisely the kind of hollow pass this harness exists to
# refuse.
if [[ "$status" != "SUCCESS" ]]; then
  echo "newest deployment $deployment_id is $status, not SUCCESS — refusing to restart it" >&2
  exit 1
fi

result=$(graphql "$(jq -nc \
  --arg q 'mutation($id:String!){ deploymentRestart(id:$id) }' \
  --arg id "$deployment_id" \
  '{query:$q, variables:{id:$id}}')")

# Checked as a parsed value, not a substring. `*'"deploymentRestart":true'*`
# would also match that text appearing anywhere else in the document.
if [[ "$(printf '%s' "$result" | jq -r '.data.deploymentRestart // empty')" != "true" ]]; then
  echo "restart was not accepted; response: $result" >&2
  exit 1
fi

echo "restart requested for deployment $deployment_id"

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

need RAILWAY_API_TOKEN
need RAILWAY_PROJECT_ID
need RAILWAY_SERVICE_ID
need RAILWAY_ENVIRONMENT_ID

# `--fail-with-body` so an HTTP error is an error here rather than a success
# carrying an error document. A restart that did not happen must not look like
# one that did — the whole condition depends on this call being honest.
call() {
  curl -sS --fail-with-body -m 30 "$API" \
    -H "Project-Access-Token: $RAILWAY_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$1"
}

# The ACTIVE deployment is looked up rather than remembered. A push redeploys
# the service and mints a new deployment id, so a hardcoded one would restart
# something that is no longer serving — or nothing at all.
deployments=$(call "$(cat <<JSON
{"query":"query(\$p:String!,\$s:String!,\$e:String!){ deployments(first:1, input:{projectId:\$p, serviceId:\$s, environmentId:\$e}){ edges { node { id status } } } }",
 "variables":{"p":"$RAILWAY_PROJECT_ID","s":"$RAILWAY_SERVICE_ID","e":"$RAILWAY_ENVIRONMENT_ID"}}
JSON
)")

deployment_id=$(printf '%s' "$deployments" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
status=$(printf '%s' "$deployments" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p' | head -1)

if [[ -z "$deployment_id" ]]; then
  echo "no deployment found for the service; response: $deployments" >&2
  exit 1
fi

# Restarting a deployment that is not serving would report success and change
# nothing, which is precisely the kind of hollow pass this harness exists to
# refuse.
if [[ "$status" != "SUCCESS" ]]; then
  echo "latest deployment $deployment_id is $status, not SUCCESS — refusing to restart it" >&2
  exit 1
fi

result=$(call "$(cat <<JSON
{"query":"mutation(\$id:String!){ deploymentRestart(id:\$id) }","variables":{"id":"$deployment_id"}}
JSON
)")

if [[ "$result" != *'"deploymentRestart":true'* ]]; then
  echo "restart was not accepted; response: $result" >&2
  exit 1
fi

echo "restart requested for deployment $deployment_id"

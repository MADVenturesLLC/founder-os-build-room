#!/usr/bin/env bash
# gateway-smoke.sh — local CLI smoke for the gateway surface (contract §20).
#
# Exercises the five verbs against a THROWAWAY HOME, so it cannot read, write or
# delete anything in the developer's real gateway state directory. It contacts
# no control plane and performs no Founder act: minting, confirming and revoking
# are Founder-reserved and are deliberately absent from this script.
#
# What it proves: the binary runs, the verb surface is exactly five, `providers`
# refuses with a reason, and `status`, `tail` and `doctor` behave correctly with
# no daemon listening — which is the state a machine is in before it has ever
# been enrolled.
#
# Usage:  scripts/gateway-smoke.sh
# Exit:   0 = every check behaved as specified

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLI="$ROOT/dist/packages/gateway-cli/src/bin.js"

if [[ ! -f "$CLI" ]]; then
  echo "gateway-smoke: $CLI is absent — run 'npm run build' first" >&2
  exit 2
fi

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

# A throwaway HOME. `gatewayPaths()` derives everything from it, so nothing this
# script does can touch a real gateway's state.
run_cli() {
  HOME="$SANDBOX" BUILDROOM_CONTROL_PLANE_URL="http://127.0.0.1:1" \
    node "$CLI" "$@" 2>&1 || true
}

status_of() {
  HOME="$SANDBOX" BUILDROOM_CONTROL_PLANE_URL="http://127.0.0.1:1" \
    node "$CLI" "$@" >/dev/null 2>&1
  echo $?
}

failures=0
check() {
  local what="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ok    $what"
  else
    echo "  FAIL  $what (expected $expected, got $actual)" >&2
    failures=1
  fi
}

echo "gateway-smoke: sandbox HOME=$SANDBOX"

echo "no verb -> usage, exit 2"
check "exit code" 2 "$(status_of)"
check "lists five verbs" 5 "$(run_cli | grep -cE '^  (enroll|status|doctor|providers|tail) ')"

echo "unknown verb -> usage, exit 2"
check "exit code" 2 "$(status_of definitely-not-a-verb)"

echo "providers -> fail-closed refusal"
check "exit code" 1 "$(status_of providers)"
check "states the reason" 1 "$(run_cli providers | grep -ci 'no provider registry is authorized in Phase 3')"
check "denies provider access" 1 "$(run_cli providers | grep -c 'confers no provider access')"

echo "status -> falls back to state.json, marked as not live"
check "exit code" 0 "$(status_of status)"
check "reports both lanes" 2 "$(run_cli status | grep -cE '^(primary|staging): ')"
check "marks the fallback" 1 "$(run_cli status | grep -c 'daemon not running')"

echo "tail -> reports plainly that no daemon is listening"
check "exit code" 1 "$(status_of tail)"
check "says why" 1 "$(run_cli tail | grep -c 'daemon not running')"

echo "doctor -> renders a full diagnosis without a daemon or a control plane"
check "exit code" 0 "$(status_of doctor)"
for section in custody daemon 'control plane' lanes 'staging lock' 'staging inventory'; do
  check "reports '$section'" 1 "$(run_cli doctor | grep -c "^$section$")"
done
check "no staging lock present" 1 "$(run_cli doctor | grep -c 'present:      no')"
# Two 'reachable: no' lines are expected with nothing running: the daemon and
# the control plane. Counting one would pass only if a section were missing.
check "daemon and control plane both unreachable" 2 "$(run_cli doctor | grep -c 'reachable:    no')"

echo "the sandbox HOME was used, not the real one"
check "state directory under the sandbox" 1 \
  "$(run_cli doctor | grep -c "socket:       $SANDBOX")"

if [[ "$failures" -ne 0 ]]; then
  echo "gateway-smoke: FAILED" >&2
  exit 1
fi
echo "gateway-smoke: PASS — the five-verb surface behaves as specified with no daemon"

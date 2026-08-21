#!/usr/bin/env bash
# verify-check-self-test.sh — explicit-case harness for verify-check.sh.
#
# Each case is an explicit allowlist with an asserted exit code and an
# asserted output marker. No inference, no skipIf. A case that fails to
# match its expectation fails the harness.
#
# Cases:
#   PASS       — all checks pass                            → exit 0, "PASS — every check ran"
#   FAIL       — one check exits 1                          → exit 1, "FAILED — gate exit 1"
#   UNVERIFIED — a check's tool is missing from PATH        → exit 2, "UNVERIFIED — a check could not run"
#   UNVERIFIED_PATH — a check's tool path does not exist    → exit 2
#   EMPTY      — no checks declared                         → exit 2, "no checks were declared"
#
# Usage: bash scripts/verify-check-self-test.sh   (from repo root)

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
V="$ROOT/scripts/verify-check.sh"

assert() {
  local desc="$1" expected_rc="$2" expected_text="$3"
  shift 3
  local out rc
  out="$("$@" 2>&1)"
  rc=$?
  if [[ $rc -ne "$expected_rc" ]]; then
    echo "FAIL: $desc — expected rc=$expected_rc got rc=$rc" >&2
    echo "$out" | tail -n 3 >&2
    return 1
  fi
  if ! grep -qF "$expected_text" <<<"$out"; then
    echo "FAIL: $desc — expected output containing '$expected_text'" >&2
    echo "$out" | tail -n 3 >&2
    return 1
  fi
  echo "PASS: $desc"
}

fails=0

# Case PASS — two trivial checks that both pass.
VERIFY_CHECKS='a:true|b:true' \
  bash "$V" >/tmp/vcs-pass.out 2>&1
if [[ $? -eq 0 ]] && grep -qF 'PASS — every check ran and passed' /tmp/vcs-pass.out; then
  echo "PASS: all-pass -> exit 0"
else
  echo "FAIL: all-pass -> expected exit 0 + PASS line" >&2; cat /tmp/vcs-pass.out >&2; fails=$((fails+1))
fi

# Case 2 — one check fails (exit 1).
VERIFY_CHECKS='a:true|b:false' \
  bash "$V" "" >/tmp/vcs-fail.out 2>&1
if [[ $? -eq 1 ]] && grep -qF 'FAILED — gate exit 1' /tmp/vcs-fail.out; then
  echo "PASS: failing check -> exit 1"
else
  echo "FAIL: failing check -> expected exit 1" >&2; cat /tmp/vcs-fail.out >&2; fails=$((fails+1))
fi

# Case 3 — tool missing from PATH (exit 2).
VERIFY_CHECKS='a:definitely-no-such-tool-xyz --flag' \
  bash "$V" "" >/tmp/vcs-unv.out 2>&1
if [[ $? -eq 2 ]] && grep -qF 'UNVERIFIED — a check could not run' /tmp/vcs-unv.out; then
  echo "PASS: missing tool -> exit 2"
else
  echo "FAIL: missing tool -> expected exit 2" >&2; cat /tmp/vcs-unv.out >&2; fails=$((fails+1))
fi

# Case 4: tool path that does not exist (exit 2).
VERIFY_CHECKS='a:/no/such/script.sh' \
  bash "$V" "" >/tmp/vcs-unv2.out 2>&1
if [[ $? -eq 2 ]] && grep -qF '/no/such/script.sh' /tmp/vcs-unv2.out; then
  echo "PASS: missing path tool -> exit 2"
else
  echo "FAIL: missing path tool -> expected exit 2" >&2; cat /tmp/vcs-unv2.out >&2; fails=$((fails+1))
fi

# Case 5: no checks declared (exit 2).
VERIFY_CHECKS='' bash "$V" >/tmp/vcs-empty.out 2>&1
if [[ $? -eq 2 ]] && grep -qF 'no checks were declared' /tmp/vcs-empty.out; then
  echo "PASS: empty checks -> exit 2"
else
  echo "FAIL: empty checks -> expected exit 2" >&2; cat /tmp/vcs-empty.out >&2; fails=$((fails+1))
fi

rm -f /tmp/vcs-pass.out /tmp/vcs-fail.out /tmp/vcs-unv.out /tmp/vcs-unv2.out /tmp/vcs-empty.out

echo
echo "verify-check-self-test: $((5 - fails))/5 cases passed"
[[ $fails -eq 0 ]]

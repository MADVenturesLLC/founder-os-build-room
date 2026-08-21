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
# Usage: bash harness/verify-check-self-test.sh   (from repo root)

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
V="$ROOT/scripts/verify-check.sh"

# Per-run unique temp directory — never a predictable /tmp path. EXIT trap
# guarantees cleanup on any return path (success, failure, or interrupt),
# so a local attacker cannot pre-create the directory or hijack the
# diagnostic files inside it (CWE-377 insecure temporary file).
TMPDIR_HARNESS="$(mktemp -d -t vcs-XXXXXX)"
trap 'rm -rf "$TMPDIR_HARNESS"' EXIT

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
  bash "$V" >"$TMPDIR_HARNESS/pass.out" 2>&1
if [[ $? -eq 0 ]] && grep -qF 'PASS — every check ran and passed' "$TMPDIR_HARNESS/pass.out"; then
  echo "PASS: all-pass -> exit 0"
else
  echo "FAIL: all-pass -> expected exit 0 + PASS line" >&2; cat "$TMPDIR_HARNESS/pass.out" >&2; fails=$((fails+1))
fi

# Case 2 — one check fails (exit 1).
VERIFY_CHECKS='a:true|b:false' \
  bash "$V" "" >"$TMPDIR_HARNESS/fail.out" 2>&1
if [[ $? -eq 1 ]] && grep -qF 'FAILED — gate exit 1' "$TMPDIR_HARNESS/fail.out"; then
  echo "PASS: failing check -> exit 1"
else
  echo "FAIL: failing check -> expected exit 1" >&2; cat "$TMPDIR_HARNESS/fail.out" >&2; fails=$((fails+1))
fi

# Case 3 — tool missing from PATH (exit 2).
VERIFY_CHECKS='a:definitely-no-such-tool-xyz --flag' \
  bash "$V" "" >"$TMPDIR_HARNESS/unv.out" 2>&1
if [[ $? -eq 2 ]] && grep -qF 'UNVERIFIED — a check could not run' "$TMPDIR_HARNESS/unv.out"; then
  echo "PASS: missing tool -> exit 2"
else
  echo "FAIL: missing tool -> expected exit 2" >&2; cat "$TMPDIR_HARNESS/unv.out" >&2; fails=$((fails+1))
fi

# Case 4: tool path that does not exist (exit 2).
VERIFY_CHECKS='a:/no/such/script.sh' \
  bash "$V" "" >"$TMPDIR_HARNESS/unv2.out" 2>&1
if [[ $? -eq 2 ]] && grep -qF '/no/such/script.sh' "$TMPDIR_HARNESS/unv2.out"; then
  echo "PASS: missing path tool -> exit 2"
else
  echo "FAIL: missing path tool -> expected exit 2" >&2; cat "$TMPDIR_HARNESS/unv2.out" >&2; fails=$((fails+1))
fi

# Case 5: no checks declared (exit 2).
VERIFY_CHECKS='' bash "$V" >"$TMPDIR_HARNESS/empty.out" 2>&1
if [[ $? -eq 2 ]] && grep -qF 'no checks were declared' "$TMPDIR_HARNESS/empty.out"; then
  echo "PASS: empty checks -> exit 2"
else
  echo "FAIL: empty checks -> expected exit 2" >&2; cat "$TMPDIR_HARNESS/empty.out" >&2; fails=$((fails+1))
fi

# Case 6: check script behind an interpreter is missing (exit 2, not 1).
VERIFY_CHECKS='a:bash scripts/does-not-exist-for-tester.sh' bash "$V" >"$TMPDIR_HARNESS/missingscript.out" 2>&1
if [[ $? -eq 2 ]] && grep -qF 'check script' "$TMPDIR_HARNESS/missingscript.out"; then
  echo "PASS: missing check script -> exit 2"
else
  echo "FAIL: missing check script -> expected exit 2" >&2; cat "$TMPDIR_HARNESS/missingscript.out" >&2; fails=$((fails+1))
fi

echo
echo "verify-check-self-test: $((6 - fails))/6 cases passed"
[[ $fails -eq 0 ]]

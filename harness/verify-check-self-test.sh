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

# Case 7: tool path is a directory, not a regular file (exit 2).
# /tmp is a directory that is readable — `-e` and `-r` would pass; only
# `-f` rejects it. The fix in scripts/verify-check.sh adds an explicit
# -f check so directories are classified as UNVERIFIED, not silently run.
VERIFY_CHECKS='a:/tmp' \
  bash "$V" "" >"$TMPDIR_HARNESS/dirtool.out" 2>&1
if [[ $? -eq 2 ]] && grep -qF 'is not a regular file' "$TMPDIR_HARNESS/dirtool.out"; then
  echo "PASS: directory as tool path -> exit 2"
else
  echo "FAIL: directory as tool path -> expected exit 2" >&2; cat "$TMPDIR_HARNESS/dirtool.out" >&2; fails=$((fails+1))
fi

# Case 8: tool path exists but is not executable (exit 2).
# Create a temp file, leave it non-executable, point at it.
NOTEXEC="$(mktemp -p "$TMPDIR_HARNESS" notexec-XXXXXX.sh)"
VERIFY_CHECKS="a:${NOTEXEC}" \
  bash "$V" "" >"$TMPDIR_HARNESS/notexec.out" 2>&1
if [[ $? -eq 2 ]] && grep -qF 'is not executable' "$TMPDIR_HARNESS/notexec.out"; then
  echo "PASS: non-executable tool path -> exit 2"
else
  echo "FAIL: non-executable tool path -> expected exit 2" >&2; cat "$TMPDIR_HARNESS/notexec.out" >&2; fails=$((fails+1))
fi

# Case 9: mixed — one check fails, one check has missing tool.
# UNVERIFIED must take precedence over FAILED: exit 2, not 1.
# Stricter assertion: verify the aggregate summary line reports the
# correct counts ("1 failed, 1 unverified") — not merely that exit was
# 2 and "UNVERIFIED" appeared somewhere in the output.
VERIFY_CHECKS='a:false|b:definitely-no-such-tool-mixed-xyz' \
  bash "$V" "" >"$TMPDIR_HARNESS/mixed.out" 2>&1
if [[ $? -eq 2 ]] \
   && grep -qF 'UNVERIFIED' "$TMPDIR_HARNESS/mixed.out" \
   && grep -qF '1 failed, 1 unverified' "$TMPDIR_HARNESS/mixed.out"; then
  echo "PASS: mixed false|missing-tool -> exit 2 (UNVERIFIED precedence)"
else
  echo "FAIL: mixed false|missing-tool -> expected exit 2" >&2; cat "$TMPDIR_HARNESS/mixed.out" >&2; fails=$((fails+1))
fi

echo
echo "verify-check-self-test: $((9 - fails))/9 cases passed"
[[ $fails -eq 0 ]]

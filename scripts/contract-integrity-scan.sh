#!/usr/bin/env bash
# contract-integrity-scan.sh — the pre-PR integrity gate (correction C12).
#
# The source artifact this contract descends from carried model-internal
# corruption: a thinking-marker line, stray ellipses, and a spliced schema
# fragment. A document that carries any of those has not been reviewed, it has
# been skimmed — so the build fails on a hit rather than leaving it to a reader
# to notice.
#
# THE NEEDLE LIST SHIPS HERE, NOT IN THE DOCUMENT. That is deliberate and it is
# the only way the scheme works: a contract that enumerated its own forbidden
# tokens would fail its own gate on the enumeration.
#
# Usage:   scripts/contract-integrity-scan.sh [contract-path]
#          (or set GATEWAY_CONTRACT_PATH)
# Exit:    0 = clean; the SHA-256 is printed for the PR body
#          1 = one or more corruption tokens found (each printed with its line)
#          2 = the contract file was not supplied or does not exist
#
# No network, no LLM, no external dependencies: bash + grep + shasum only.

set -euo pipefail

CONTRACT="${1:-${GATEWAY_CONTRACT_PATH:-}}"

if [[ -z "$CONTRACT" ]]; then
  cat >&2 <<'USAGE'
contract-integrity-scan: no contract path supplied.

The contract document lives outside this repository — it is the authorizing
artifact, not a tracked file — so its location must be given explicitly:

  scripts/contract-integrity-scan.sh ~/gateway-enrollment-build-contract-rev-4-7.md
  GATEWAY_CONTRACT_PATH=... npm run gate:integrity
USAGE
  exit 2
fi

if [[ ! -f "$CONTRACT" ]]; then
  echo "contract-integrity-scan: no such file: $CONTRACT" >&2
  exit 2
fi

# Fixed-string needles, in two lists.
#
# CASE-SENSITIVE markers, because these are conventionally uppercase and a
# case-insensitive match would hit ordinary words. `XXX` matched lowercase would
# hit hex examples; a bare `PLACEHOLDER` matched case-insensitively hits the
# English word "placeholders" — which this contract uses, in the very sentence
# describing this gate. That is the self-reference hazard C12 named, and the fix
# is to scan for literal marker FORMS rather than for the words that describe
# them.
CASE_SENSITIVE_NEEDLES=(
  # 1. Thinking markers — the model-internal leak that started this correction.
  '<thinking>'
  '</thinking>'
  'antThinking'
  'antml:thinking'
  'begin_of_thought'
  'end_of_thought'

  # 2. Work-item markers: an unfinished document presented as a finished one.
  'TODO:'
  'TODO('
  'FIXME'
  'XXX:'
  'HACK:'
  '[WIP]'
  '<work_item'
  'TBD'

  # 3. Placeholder FORMS, never the English word.
  '<placeholder'
  '[PLACEHOLDER]'
  '{{placeholder}}'
  '__PLACEHOLDER__'
  'INSERT_HERE'
  'FILL_IN'
  'TKTK'
  '???'
)

# Case-insensitive, where the token is a phrase rather than a marker.
CASE_INSENSITIVE_NEEDLES=(
  'lorem ipsum'
)

found=0

for needle in "${CASE_SENSITIVE_NEEDLES[@]}"; do
  if hits="$(grep -n -F -- "$needle" "$CONTRACT")"; then
    echo "CORRUPTION TOKEN: $needle" >&2
    echo "$hits" | sed 's/^/  /' >&2
    found=1
  fi
done

for needle in "${CASE_INSENSITIVE_NEEDLES[@]}"; do
  if hits="$(grep -n -F -i -- "$needle" "$CONTRACT")"; then
    echo "CORRUPTION TOKEN: $needle" >&2
    echo "$hits" | sed 's/^/  /' >&2
    found=1
  fi
done

# 4. Stray ellipses. A Unicode ellipsis anywhere, or a line that is nothing but
# dots, is the shape an elided fragment leaves behind. Ordinary prose in this
# document uses neither.
if hits="$(grep -n -- '…' "$CONTRACT")"; then
  echo "CORRUPTION TOKEN: unicode ellipsis" >&2
  echo "$hits" | sed 's/^/  /' >&2
  found=1
fi

if hits="$(grep -n -E '^[[:space:]]*\.{3,}[[:space:]]*$' "$CONTRACT")"; then
  echo "CORRUPTION TOKEN: elided line (dots only)" >&2
  echo "$hits" | sed 's/^/  /' >&2
  found=1
fi

if [[ "$found" -eq 1 ]]; then
  echo "contract-integrity-scan: FAILED (corruption tokens above)" >&2
  exit 1
fi

digest="$(shasum -a 256 "$CONTRACT" | awk '{print $1}')"
lines="$(wc -l < "$CONTRACT" | tr -d ' ')"
bytes="$(wc -c < "$CONTRACT" | tr -d ' ')"

echo "contract-integrity-scan: PASS — no corruption tokens found"
echo "  contract: $CONTRACT"
echo "  sha256:   $digest"
echo "  lines:    $lines"
echo "  bytes:    $bytes"

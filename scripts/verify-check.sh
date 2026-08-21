#!/usr/bin/env bash
# verify-check.sh — integrity gate: an unverified check is a failing check.
#
# Adopted for this repository by DEC-20260815-18's convention and hardened by
# the "unchecked counts as failing" rule taken from the procoder audit
# (build-room/source/procoder-audit/README.md, verified in source 2026-08-20).
#
# The Build Room's gates (attribution-shape, path-audit) validate PRESENCE:
# they exit 0 when the attributed block is well-formed, or when every
# referenced path resolves. They never refuse when a check could not actually
# verify — a missing tool, a missing script, an unreadable file — so a check
# that silently did nothing is reported as clean. This script closes that gap.
#
# It runs one command per declared check, and:
#   - exit 0 → every check ran and PASSED
#   - exit 1 → at least one check ran and FAILED
#   - exit 2 → a check could not run (tool or script missing/unreadable),
#              or no checks were declared. NEVER reported as clean.
#
# It never modifies anything. A check that could not be verified is treated
# exactly like a failure.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# name:command — the command is run through the shell. The first token is the
# tool; if that token is a path (contains '/') it must exist and be readable.
# VERIFY_CHECKS overrides the default set (used by the self-test harness;
# production runs use the defaults below).
declare -a CHECKS=(
  "path-audit:bash scripts/path-audit.sh"
  "attribution-selftest:bash scripts/attribution-shape-check.sh selftest"
  "typecheck:npm run typecheck"
)

if [[ "${VERIFY_CHECKS+x}" = "x" ]]; then
  # Set-but-empty means "no checks declared" — a valid, distinct state.
  if [[ -z "$VERIFY_CHECKS" ]]; then
    CHECKS=()
  else
    IFS='|' read -r -a CHECKS <<< "$VERIFY_CHECKS"
  fi
fi

if [[ ${#CHECKS[@]} -eq 0 ]]; then
  echo "verify-check: UNVERIFIED — no checks were declared; refusing to report clean" >&2
  exit 2
fi

pass=0
unverified=0
declare -a FAILED=()
declare -a UNVERIFIED=()

for entry in "${CHECKS[@]}"; do
  name="${entry%%:*}"
  cmd="${entry#*:}"
  tool="${cmd%% *}"

  # Tool existence. For a bare command name, PATH lookup; for a path, the
  # file itself must exist and be readable.
  if [[ "$tool" == */* ]]; then
    if [[ ! -e "$tool" ]]; then
      echo "UNVERIFIED: ${name} — '${tool}' does not exist"
      UNVERIFIED+=("$name")
      continue
    fi
    if [[ ! -r "$tool" ]]; then
      echo "UNVERIFIED: ${name} — '${tool}' is not readable"
      UNVERIFIED+=("$name")
      continue
    fi
  else
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "UNVERIFIED: ${name} — '${tool}' not on PATH"
      UNVERIFIED+=("$name")
      continue
    fi
  fi

  out="$(mktemp)"
  if ! bash -c "$cmd" >"$out" 2>&1; then
    echo "FAILED: ${name} — ${cmd}"
    tail -n 6 "$out" | sed 's/^/    /'
    FAILED+=("$name")
  else
    echo "PASS: ${name}"
    pass=$((pass+1))
  fi
  rm -f "$out"
done

echo
echo "verify-check: ${pass} passed, ${#FAILED[@]} failed, ${#UNVERIFIED[@]} unverified"

if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "verify-check: FAILED — gate exit 1" >&2
  exit 1
fi
if [[ ${#UNVERIFIED[@]} -gt 0 ]]; then
  echo "verify-check: UNVERIFIED — a check could not run; refusing to report clean" >&2
  exit 2
fi

echo "verify-check: PASS — every check ran and passed"

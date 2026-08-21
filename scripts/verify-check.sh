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
cd "$ROOT" || exit 2

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
declare -a FAILED=()
declare -a UNVERIFIED=()

for entry in "${CHECKS[@]}"; do
  name="${entry%%:*}"
  cmd="${entry#*:}"
  # Split $cmd into tokens WITHOUT re-parsing via the shell (avoids CWE-78
  # command injection — $cmd is from the hardcoded default array or the
  # VERIFY_CHECKS env var, but the pattern still applies for defense in depth
  # and to fix SC2206 word-splitting on quoted paths). We deliberately do NOT
  # honour shell quoting, because $cmd is a plain command string, not shell
  # syntax — tokens are separated by IFS whitespace only.
  declare -a cmd_tokens=()
  # shellcheck disable=SC2206  # intentional split on IFS whitespace, not quote-aware
  IFS=$' \t\n' read -r -d '' -a cmd_tokens < <(printf '%s\0' "$cmd") || true
  # If read returned 0 tokens (empty cmd), leave the array empty so the
  # downstream "no tool" path triggers correctly.
  if [[ ${#cmd_tokens[@]} -eq 0 ]]; then
    echo "UNVERIFIED: ${name} — empty command"
    UNVERIFIED+=("$name")
    continue
  fi
  tool="${cmd_tokens[0]}"

  # Tool existence. For a bare command name, PATH lookup; for a path, the
  # file itself must exist, be a regular file (not a directory), be readable,
  # and be executable. Directories that happen to be readable (e.g. /tmp)
  # would otherwise pass `-r` — that is wrong; we want a real executable
  # tool.
  if [[ "$tool" == */* ]]; then
    if [[ ! -e "$tool" ]]; then
      echo "UNVERIFIED: ${name} — '${tool}' does not exist"
      UNVERIFIED+=("$name")
      continue
    fi
    if [[ ! -f "$tool" ]]; then
      echo "UNVERIFIED: ${name} — '${tool}' is not a regular file (directory or special)"
      UNVERIFIED+=("$name")
      continue
    fi
    if [[ ! -r "$tool" ]]; then
      echo "UNVERIFIED: ${name} — '${tool}' is not readable"
      UNVERIFIED+=("$name")
      continue
    fi
    if [[ ! -x "$tool" ]]; then
      echo "UNVERIFIED: ${name} — '${tool}' is not executable"
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

  # Script behind an interpreter: `bash scripts/foo.sh ...`. The first token
  # is the interpreter (always present); the SECOND token, when it is a path,
  # is the check script itself. A missing script, a directory, or a
  # non-readable script is an unverified check, not a failed one — exit 2,
  # never "clean".
  if [[ ${#cmd_tokens[@]} -ge 2 && "${cmd_tokens[1]}" == */* && "${cmd_tokens[1]}" != -* ]]; then
    script="${cmd_tokens[1]}"
    if [[ ! -e "$script" ]]; then
      echo "UNVERIFIED: ${name} — check script '${script}' does not exist"
      UNVERIFIED+=("$name")
      continue
    fi
    if [[ ! -f "$script" ]]; then
      echo "UNVERIFIED: ${name} — check script '${script}' is not a regular file (directory or special)"
      UNVERIFIED+=("$name")
      continue
    fi
    if [[ ! -r "$script" ]]; then
      echo "UNVERIFIED: ${name} — check script '${script}' is not readable"
      UNVERIFIED+=("$name")
      continue
    fi
  fi

  out="$(mktemp)" || {
    echo "UNVERIFIED: ${name} — could not allocate temp file (mktemp failed)"
    UNVERIFIED+=("$name")
    continue
  }
  # Run the command via direct exec on the token array — never re-parse via
  # the shell (avoids CWE-78 command injection; cf. ast-grep
  # bash-c-variable-injection-bash). Each token is passed as a separate argv
  # entry, preserving internal whitespace as a literal boundary.
  if ! "${cmd_tokens[@]}" >"$out" 2>&1; then
    echo "FAILED: ${name} — ${cmd}"
    tail -n 6 "$out" | sed 's/^/    /'
    FAILED+=("$name")
  else
    echo "PASS: ${name}"
    pass=$((pass+1))
  fi
  rm -f "$out" || true
done

echo
echo "verify-check: ${pass} passed, ${#FAILED[@]} failed, ${#UNVERIFIED[@]} unverified"

# UNVERIFIED takes precedence over FAILED: an unverified check means we
# genuinely don't know whether the failed check would have passed if it
# could run, so we cannot honestly report "clean". Exit 2 wins.
if [[ ${#UNVERIFIED[@]} -gt 0 ]]; then
  echo "verify-check: UNVERIFIED — a check could not run; refusing to report clean" >&2
  exit 2
fi
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "verify-check: FAILED — gate exit 1" >&2
  exit 1
fi

echo "verify-check: PASS — every check ran and passed"

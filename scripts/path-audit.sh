#!/usr/bin/env bash
# path-audit.sh — deterministic path audit for the MAD Ventures OS Build Room.
#
# Adopted under `DEC-20260815-18` clause 1, which makes path-audit a required
# check for this repository alongside attribution-shape. Same "gate, never edit"
# pattern as the FounderOS original (`DEC-20260718-02`): this script reads the
# working tree and exits pass/fail. It never modifies anything.
#
# ADAPTED, not ported verbatim. The FounderOS audit resolves repo-ABSOLUTE
# references against that repository's `/NN-folder/` doctrine scheme, which does
# not exist here. This repository is a product monorepo, so the audit resolves
# repo-RELATIVE references against its own top-level entries instead. The rule
# it enforces is the same one: every path a governed document points at must
# exist.
#
# Usage:   scripts/path-audit.sh [repo-root]
#          (repo-root defaults to the repository containing this script)
# Exit:    0 = every referenced path resolves
#          1 = one or more referenced paths are missing (each is printed
#              as "<source-file>: <missing-path>")
#          2 = an audit-surface file itself is missing
#
# SCOPE — deliberately narrow, so the audit is deterministic and has no false
# positives on prose. Only backtick-quoted references are audited, and only
# those beginning with one of this repository's top-level entries or naming a
# tracked root file. OUT OF SCOPE, by design: URLs, cross-repository references
# (`MADVenturesLLC/...`, `../FounderOS/...`), npm package specifiers
# (`@build-room/...`), decision IDs, and bare filenames.
#
# Also out of scope: every file under `docs/planning/`, excluded from the audit
# surface by Founder ruling of 2026-09-01
# (https://github.com/MADVenturesLLC/founder-os-build-room/pull/15#issuecomment-5503812585),
# given under `DEC-20260718-02` clause 4 as adopted by `DEC-20260815-18`
# clause 1. Plans filed there name paths that do not yet exist by design, so
# auditing them as governed references produces false failures. In exchange, a
# plan filed under `docs/planning/` must state which of the paths it names do
# not exist at the base. The audit's rule, its semantics, and its enforcement
# on every other document are unchanged.
#
# No network, no LLM, no external dependencies: bash + grep + sed only.

set -euo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT"

# The audit surface: the documents that describe this repository to a reader.
SURFACE=("README.md" "AGENTS.md")
while IFS= read -r f; do
  SURFACE+=("${f#./}")
done < <(find ./docs -path ./docs/planning -prune -o -name '*.md' -print 2>/dev/null | sort)

# Top-level entries a repo-relative reference may start with. A reference that
# does not start with one of these is out of scope (see SCOPE above).
ROOTS='packages|apps|scripts|docs|test|source|\.github'

missing=0
surface_missing=0

for src in "${SURFACE[@]}"; do
  if [[ ! -f "$src" ]]; then
    echo "AUDIT-SURFACE MISSING: $src" >&2
    surface_missing=1
    continue
  fi

  # Pull backtick-quoted spans, then keep only those shaped like a repo-relative
  # path under a known top-level entry, or a tracked root file.
  while IFS= read -r ref; do
    # strip trailing punctuation that regularly follows a path in prose
    while [[ "$ref" =~ [.,:\;\)]$ ]]; do ref="${ref%?}"; done
    # a trailing slash denotes a directory; test the directory itself
    ref="${ref%/}"
    [[ -z "$ref" ]] && continue
    if [[ ! -e "$ref" ]]; then
      echo "$src: $ref"
      missing=1
    fi
  done < <(
    grep -oE '`[^`]+`' "$src" \
      | sed 's/^`//; s/`$//' \
      | grep -E "^((${ROOTS})/[A-Za-z0-9._/-]*|README\.md|AGENTS\.md|package\.json|tsconfig\.json|tsconfig\.base\.json|\.gitignore|\.env\.example)$" \
      | sort -u
  )
done

if [[ "$surface_missing" -eq 1 ]]; then
  echo "path-audit: FAILED (audit-surface file missing)" >&2
  exit 2
fi
if [[ "$missing" -eq 1 ]]; then
  echo "path-audit: FAILED (unresolved path references above)" >&2
  exit 1
fi
echo "path-audit: PASS — every audited path reference resolves"

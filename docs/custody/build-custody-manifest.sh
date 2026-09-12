#!/usr/bin/env bash
# Build Room Custody Manifest Generator
#
# Produces a governed, PR-landable manifest of every custody artifact's
# SHA-256, so the record is verifiable even though the artifacts themselves
# are never committed.
#
# Founder ruling 2026-09-12 (Cicero custody model):
#   "Keep disk as working custody, and periodically land a manifest of hashes
#    via PR — a single governed file listing what custody exists and its
#    hashes."
#
# Usage:
#   build-custody-manifest.sh              # write to stdout
#   build-custody-manifest.sh -o FILE      # write to FILE
#
# Deterministic: same tree in, same bytes out. No timestamps in the body
# (the header records the generation instant only).

set -euo pipefail

BUILD_ROOM="${BUILD_ROOM:-$HOME/MADVenturesOPs/build-room}"

# Custody surface: governance artifacts only.
# EXCLUDED deliberately and named so the exclusion is auditable:
#   source/            third-party audit clones (not our custody)
#   enforcement-core/  code tree incl. node_modules (not governance record)
#   session/           empty at time of writing; add if it holds artifacts
CUSTODY_DIRS=(verification planning templates wf04-step1)
# source/ is MIXED: it holds both third-party audit clones (not our custody)
# and Build Room source documents (custody). Scope by FILE, not directory.
CUSTODY_FILES_GLOB="source/*.md source/*.txt"
EXCLUDED_DIRS=(enforcement-core session)
EXCLUDED_IN_SOURCE=(source/*audit-repo source/procoder-audit source/row-bot-site source/row-bot-subreports source/_inventory)

cd "$BUILD_ROOM"

OUT=""
if [[ "${1:-}" == "-o" && -n "${2:-}" ]]; then
  OUT="$2"
fi

emit() {
  local generated
  generated="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  echo "# Build Room — Custody Manifest"
  echo
  echo "Governed inventory of working-folder custody artifacts and their SHA-256"
  echo "identities. The artifacts themselves live in \`~/MADVenturesOPs/build-room/\`"
  echo "and are **not** committed; this file is what makes them verifiable from a"
  echo "governed repository."
  echo
  echo "**This manifest is not authority.** Authority lives in"
  echo "\`~/MADVenturesOPs/FounderOS/07-decisions/\`. This file records what custody"
  echo "exists, so a reader can check a hash against an artifact without trusting"
  echo "the working folder."
  echo
  echo "- Generated (UTC): \`$generated\`"
  echo "- Build Room root: \`$BUILD_ROOM\`"
  echo "- Custody files: \`$({ find "${CUSTODY_DIRS[@]}" -type f 2>/dev/null; ls -1 $CUSTODY_FILES_GLOB 2>/dev/null; } | grep -v -e "templates/build-custody-manifest.sh" -e "verification/CUSTODY-MANIFEST.md" -e "\\.DS_Store" | wc -l | tr -d ' ')\`"
  echo "- Excluded from custody (named, so the exclusion is auditable):"
  for d in "${EXCLUDED_DIRS[@]}"; do
    [[ -d "$d" ]] || continue
    local what
    case "$d" in
      enforcement-core) what="code tree incl. node_modules" ;;
      session)          what="no custody artifacts at time of writing" ;;
      *)                what="excluded" ;;
    esac
    echo "  - \`$d/\` — $what"
  done
  echo "  - \`source/*-audit-repo/\`, \`source/procoder-audit/\`, \`source/row-bot-site/\`, \`source/row-bot-subreports/\`, \`source/_inventory/\` — third-party clones (NOT custody)"
  echo "  - NOTE: \`source/\` is mixed. Its top-level \`.md\`/\`.txt\` documents ARE custody and ARE inventoried above."
  echo
  echo "## Custody artifacts"
  echo
  echo "| Path (relative to Build Room root) | SHA-256 | Bytes |"
  echo "|---|---|---|"

  { find "${CUSTODY_DIRS[@]}" -type f 2>/dev/null; ls -1 $CUSTODY_FILES_GLOB 2>/dev/null; } \
    | grep -v -e "templates/build-custody-manifest.sh" -e "verification/CUSTODY-MANIFEST.md" -e "\.DS_Store" \
    | LC_ALL=C sort | while IFS= read -r f; do
    local hash bytes
    hash="$(shasum -a 256 "$f" | awk '{print $1}')"
    bytes="$(wc -c < "$f" | tr -d ' ')"
    printf '| `%s` | `%s` | %s |\n' "$f" "$hash" "$bytes"
  done

  echo
  echo "## Verification"
  echo
  echo "To check one artifact against this manifest:"
  echo
  echo '```bash'
  echo "cd ~/MADVenturesOPs/build-room"
  echo "shasum -a 256 <path>   # compare against the row above"
  echo '```'
  echo
  echo "A mismatch means the artifact changed since this manifest was landed, or"
  echo "the artifact is not the one this manifest describes. Either way it is a"
  echo "finding, not a formatting problem."
}

if [[ -n "$OUT" ]]; then
  emit > "$OUT"
  echo "wrote: $OUT" >&2
  echo "bytes: $(wc -c < "$OUT" | tr -d ' ')" >&2
  echo "sha256: $(shasum -a 256 "$OUT" | awk '{print $1}')" >&2
else
  emit
fi

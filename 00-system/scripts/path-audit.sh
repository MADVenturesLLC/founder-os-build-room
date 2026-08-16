#!/usr/bin/env bash
# Path audit for founder-os-build-room
# Checks that every path referenced in the repository's index files exists.
# Adopted from FounderOS per DEC-20260815-01 clause 4.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

FAILURES=0

audit_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "SKIP: $file (does not exist yet)"
    return
  fi
  echo "=== $file ==="
  # Extract markdown links and bare paths
  grep -oP '(?<=\]\(|^\[)\K[^)]+(?=\))' "$file" 2>/dev/null | \
  while read -r path; do
    # Skip URLs and external references
    [[ "$path" =~ ^https?:// ]] && continue
    [[ "$path" =~ ^MADVenturesLLC/ ]] && continue
    # Strip fragments
    path="${path%%#*}"
    [[ -z "$path" ]] && continue
    if [[ ! -e "$path" ]]; then
      echo "  MISSING: $path (from $file)"
      FAILURES=$((FAILURES + 1))
    fi
  done
}

# Index files to audit
for f in README.md AGENTS.md; do
  audit_file "$f"
done

# Also audit the source/ directory if it exists
if [[ -d source ]]; then
  echo "=== source/ ==="
  for f in source/*.md; do
    [[ -f "$f" ]] && audit_file "$f"
  done
fi

if [[ $FAILURES -gt 0 ]]; then
  echo "FAIL: $FAILURES broken path(s)"
  exit 1
fi

echo "PASS: all referenced paths resolve"
exit 0
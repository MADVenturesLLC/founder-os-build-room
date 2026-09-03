#!/usr/bin/env bash
# secret-scan.sh — deterministic repository secret scan (WF-17: AUTHORIZED).
#
# Runs the open-source gitleaks CLI directly (not gitleaks-action), because
# gitleaks-action requires a paid GITLEAKS_LICENSE for organization-owned
# repositories (MADVenturesLLC is one) — provisioning that license would be
# adding new provider access, a Founder act this session does not have.
# The CLI itself is free and requires no license or network access to run
# once downloaded.
#
# Pinned gitleaks version, verified against the published release checksum
# before use — no floating "latest".
#
# Scans this repository's git history (default gitleaks behavior: git log
# + working tree), not any unrelated user or system location. A finding
# prints only file/line/rule metadata — gitleaks does not print the
# secret value itself in its default report; --redact removes it from the
# report even more thoroughly on the offhand chance a rule's `secret`
# field would otherwise appear in the summary output. A genuine finding
# is a HARD FAILURE (nonzero exit) — this script never suppresses one.
#
# Usage: scripts/secret-scan.sh
# Exit:  0 = clean; 1 = leak(s) found; 2 = setup/tool failure (unverified,
#        never reported as clean)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || { echo "secret-scan: failed to enter repository root" >&2; exit 2; }

GITLEAKS_VERSION="8.30.1"

if command -v gitleaks >/dev/null 2>&1; then
  BIN="gitleaks"
else
  OS="$(uname -s)"
  ARCH="$(uname -m)"
  case "$OS-$ARCH" in
    Linux-x86_64) ASSET="gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" ;;
    Darwin-arm64) ASSET="gitleaks_${GITLEAKS_VERSION}_darwin_arm64.tar.gz" ;;
    Darwin-x86_64) ASSET="gitleaks_${GITLEAKS_VERSION}_darwin_x64.tar.gz" ;;
    *)
      echo "secret-scan: no pinned gitleaks asset for $OS-$ARCH; install gitleaks and re-run" >&2
      exit 2
      ;;
  esac

  TMP="$(mktemp -d)" || { echo "secret-scan: mktemp failed" >&2; exit 2; }
  trap 'rm -rf "$TMP"' EXIT

  URL="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${ASSET}"
  CHECKSUMS_URL="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_checksums.txt"

  curl -sSLf -o "$TMP/gitleaks.tar.gz" "$URL" || {
    echo "secret-scan: failed to download gitleaks release asset from $URL" >&2
    exit 2
  }
  curl -sSLf -o "$TMP/checksums.txt" "$CHECKSUMS_URL" || {
    echo "secret-scan: failed to download gitleaks checksums from $CHECKSUMS_URL" >&2
    exit 2
  }

  expected="$(grep " ${ASSET}\$" "$TMP/checksums.txt" | awk '{print $1}')"
  if [[ -z "$expected" ]]; then
    echo "secret-scan: no checksum entry for $ASSET; refusing to trust an unverified download" >&2
    exit 2
  fi
  actual="$(shasum -a 256 "$TMP/gitleaks.tar.gz" | awk '{print $1}')"
  if [[ "$expected" != "$actual" ]]; then
    echo "secret-scan: checksum mismatch for $ASSET (expected $expected, got $actual)" >&2
    exit 2
  fi

  tar -xzf "$TMP/gitleaks.tar.gz" -C "$TMP" gitleaks || {
    echo "secret-scan: failed to extract gitleaks from $TMP/gitleaks.tar.gz" >&2
    exit 2
  }
  chmod +x "$TMP/gitleaks" || {
    echo "secret-scan: failed to mark $TMP/gitleaks as executable" >&2
    exit 2
  }
  BIN="$TMP/gitleaks"
fi

echo "secret-scan: running $("$BIN" version 2>&1 | head -1)"

# --redact: never print the matched secret value itself in the report.
# Default gitleaks source is the full git history plus working tree.
if "$BIN" detect --source "$ROOT" --redact --no-banner; then
  echo "secret-scan: PASS — no leaks found"
  exit 0
else
  rc=$?
  echo "secret-scan: FAILED — gitleaks reported findings (exit $rc); investigate before proceeding" >&2
  exit 1
fi

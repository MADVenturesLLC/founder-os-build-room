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
cd "$ROOT"

# die2 <message> — exit 2 (setup/tool failure), per the contract in the
# header. Every setup failure below is classified through this helper:
# no curl/grep/shasum/tar/chmod/gitleaks invocation failure may exit
# with the failing command's own code, which would blur the contract
# (several of those tools exit 1, the findings class, on failure).
die2() {
  echo "secret-scan: $*" >&2
  exit 2
}

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

  # --fail: an HTTP error (404 on a retracted release, a 5xx, a captive
  # portal writing an HTML error page into the file) must fail curl itself
  # rather than delivering a bogus artifact as a "successful" download.
  # Any failure exits 2 (setup), never 0 and never the findings class.
  curl --fail -sSL -o "$TMP/gitleaks.tar.gz" "$URL" \
    || die2 "download failed for $URL (curl exit $?)"
  curl --fail -sSL -o "$TMP/checksums.txt" "$CHECKSUMS_URL" \
    || die2 "download failed for $CHECKSUMS_URL (curl exit $?)"

  # `|| true` INSIDE the substitution: under pipefail a no-match grep
  # must reach the [[ -z ]] guard below, not terminate the script through
  # set -e (the RF-1 finding — the guard was unreachable on no-match).
  expected="$(grep " ${ASSET}$" "$TMP/checksums.txt" | awk '{print $1}' || true)"
  if [[ -z "$expected" ]]; then
    die2 "no checksum entry for $ASSET; refusing to trust an unverified download"
  fi
  actual="$(shasum -a 256 "$TMP/gitleaks.tar.gz" | awk '{print $1}')" \
    || die2 "checksum computation failed for $ASSET (shasum exit $?)"
  if [[ "$expected" != "$actual" ]]; then
    die2 "checksum mismatch for $ASSET (expected $expected, got $actual)"
  fi

  tar -xzf "$TMP/gitleaks.tar.gz" -C "$TMP" gitleaks \
    || die2 "extraction failed for $ASSET (tar exit $?)"
  chmod +x "$TMP/gitleaks" || die2 "chmod +x failed for the extracted gitleaks binary"
  BIN="$TMP/gitleaks"
fi

bin_version="$("$BIN" version 2>&1 | head -1)" \
  || die2 "gitleaks version probe failed (exit $?); tool unusable, scan unverified"
echo "secret-scan: running $bin_version"

# --redact: never print the matched secret value itself in the report.
# Default gitleaks source is the full git history plus working tree.
scan_rc=0
"$BIN" detect --source "$ROOT" --redact --no-banner || scan_rc=$?
case "$scan_rc" in
  0)
    echo "secret-scan: PASS — no leaks found"
    exit 0
    ;;
  1)
    # gitleaks exit 1 = findings, the only path that reports findings.
    echo "secret-scan: FAILED — gitleaks reported findings (exit 1); investigate before proceeding" >&2
    exit 1
    ;;
  *)
    # Any other nonzero gitleaks exit (126 invalid invocation, etc.) is a
    # tool failure, NOT findings: the scan did not run to completion, so
    # it is unverified and must never masquerade as findings (exit 1) or
    # clean (exit 0).
    die2 "gitleaks tool failure (exit $scan_rc); scan unverified, never reported as clean"
    ;;
esac

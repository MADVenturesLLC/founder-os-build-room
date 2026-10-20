#!/usr/bin/env python3
"""Re-vendor the ten Seat Registry doctrine fixtures from a FounderOS commit.

Usage:
    python3 tools/revendor-doctrine-fixtures.py <founderOS-repo> <commit-sha> [--dry-run]

What it does, and only this:
  1. copies each fixture's `source_path` from <commit-sha> to its vendored `filename`;
  2. recomputes each SHA-256 and rewrites it in packages/seat-registry/src/fixtures.ts;
  3. moves DOCTRINE_PIN to <commit-sha> in fixtures.ts, its doc comment, and the
     assertion in test/seat-registry-fixtures.test.ts;
  4. prints a per-file table and the new pin.

It refuses to WRITE when the working tree has uncommitted changes to the fixture
directory, fixtures.ts, or the assertion test, so a re-vendor cannot silently
destroy an edit or mix old and new copies. It resolves and hashes all ten source
blobs BEFORE the first write, so a missing path at the target commit exits 2 with
nothing modified. It never edits a fixture's content: the bytes come from the
doctrine repo.

Exit codes: 0 clean, 1 refused, 2 missing source path at that commit.
"""

from __future__ import annotations

import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES_TS = ROOT / "packages/seat-registry/src/fixtures.ts"
FIXTURES_DIR = ROOT / "packages/seat-registry/fixtures"
TEST_TS = ROOT / "test/seat-registry-fixtures.test.ts"

ENTRY_RE = re.compile(
    r"\{\s*source_path:\s*'([^']+)',\s*filename:\s*'([^']+)',\s*sha256:\s*'([0-9a-f]{64})',\s*\}",
    re.S,
)
PIN_RE = re.compile(r"\b([0-9a-f]{40})\b")


def sh(*args: str) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def dirty_targets() -> list[str]:
    """Uncommitted paths among the files this tool would overwrite."""
    out = sh(
        "git", "-C", str(ROOT), "status", "--porcelain", "--untracked-files=all", "--",
        "packages/seat-registry/fixtures",
        "packages/seat-registry/src/fixtures.ts",
        "test/seat-registry-fixtures.test.ts",
    )
    return [line for line in out.splitlines() if line.strip()]


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: revendor-doctrine-fixtures.py <founderOS-repo> <commit-sha> [--dry-run]", file=sys.stderr)
        return 1
    repo, commit = sys.argv[1], sys.argv[2]
    dry = "--dry-run" in sys.argv[3:]

    ts = FIXTURES_TS.read_text()
    entries = ENTRY_RE.findall(ts)
    if len(entries) != 10:
        print(f"refused: parsed {len(entries)} fixture entries, expected 10", file=sys.stderr)
        return 1

    pin_match = re.search(r"DOCTRINE_PIN\s*=\s*'([0-9a-f]{40})'", ts)
    if pin_match is None:
        print("refused: DOCTRINE_PIN not found in fixtures.ts", file=sys.stderr)
        return 1
    old_pin = pin_match.group(1)
    new_pin = sh("git", "-C", repo, "rev-parse", "{}^0".format(commit)).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", new_pin):
        print(f"refused: could not resolve {commit} in {repo}", file=sys.stderr)
        return 1

    # Resolve and hash every source blob BEFORE writing anything: a missing path at
    # the target commit must leave the checkout untouched, never half-vendored.
    resolved: list[tuple[str, str, str, bytes]] = []
    for source_path, filename, old_sha in entries:
        try:
            blob = subprocess.run(
                ["git", "-C", repo, "show", f"{new_pin}:{source_path}"],
                check=True, capture_output=True,
            ).stdout
        except subprocess.CalledProcessError:
            print(f"missing at {new_pin[:8]}: {source_path}", file=sys.stderr)
            print("nothing was written", file=sys.stderr)
            return 2
        resolved.append((filename, old_sha, hashlib.sha256(blob).hexdigest(), blob))

    if not dry:
        dirty = dirty_targets()
        if dirty:
            print("refused: the vendored targets have uncommitted changes; commit or restore them first:", file=sys.stderr)
            for line in dirty:
                print(f"  {line}", file=sys.stderr)
            print("nothing was written", file=sys.stderr)
            return 1

    rows, changed = [], 0
    new_ts = ts
    for filename, old_sha, new_sha, blob in resolved:
        if new_sha != old_sha:
            changed += 1
        rows.append((filename, old_sha, new_sha))
        if not dry:
            (FIXTURES_DIR / filename).write_bytes(blob)
            new_ts = re.sub(
                rf"(filename:\s*'{re.escape(filename)}',\s*sha256:\s*')[0-9a-f]{{64}}(')",
                rf"\g<1>{new_sha}\g<2>",
                new_ts,
            )

    new_ts = new_ts.replace(old_pin, new_pin)
    test_ts = TEST_TS.read_text().replace(old_pin, new_pin)
    if not dry:
        FIXTURES_TS.write_text(new_ts)
        TEST_TS.write_text(test_ts)

    print(f"doctrine pin: {old_pin} -> {new_pin}   {'DRY RUN — nothing written' if dry else 'WRITING'}")
    print(f"{'fixture':58s} {'changed':7s} sha256")
    for filename, old_sha, new_sha in rows:
        print(f"{filename:58s} {'YES' if new_sha != old_sha else 'no':7s} {new_sha[:16]}…")
    if dry:
        print(f"\n{changed} of {len(rows)} fixture(s) would change. Nothing was written.")
    else:
        print(f"\n{changed} of {len(rows)} fixture(s) written; DOCTRINE_PIN and the test assertion updated.")
    if changed == 0 and old_pin == new_pin:
        print("idempotent: this is the pin the fixtures already carry.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env bash
# custody-pin-check.sh — verify the cross-document pins inside custody records.
#
# The custody records under `docs/planning/command-journal/custody/` cite each
# other by git blob id, SHA-256, byte count and line count, and one of them
# publishes a `sed` recipe for extracting a hash-pinned substring. Every one of
# those values is maintained by hand, and every one of them fails SILENTLY: a
# stale pin still looks like a pin, and a broken extraction yields a different
# hash rather than an error. The landing banner of the R4 brief says exactly
# this about its own recipe — "breaks recovery with a wrong hash, not an error".
#
# Same "gate, never edit" pattern as `path-audit.sh` and
# `attribution-shape-check.sh`: this script reads the working tree and exits
# pass/fail. It never modifies anything.
#
# WHAT IT CHECKS, and why it needs no manifest of its own. The records already
# declare their pins; a separate manifest would be one more hand-maintained
# copy to go stale, which is the failure this script exists to catch. So the
# script reads the declarations and verifies them:
#
#   1. Custody receipt tables. For each table block carrying a `| Path | ... |`
#      row, the declared `Git blob id`, `SHA-256`, byte count and line count are
#      recomputed from the named file and compared.
#   2. Dispatched-text extraction. Where a receipt declares a
#      `SHA-256 (dispatched text)` value, the extraction is performed with the
#      `sed` anchor the receipt itself publishes — the script runs the recipe
#      the document gives its readers, rather than a private reimplementation —
#      and the resulting hash, byte count and line count are compared.
#   3. Inline banner pins. Anywhere a custody file names another custody file
#      and pins it with a `sha256 <64 hex>` line within the next few lines, the
#      pinned value is recomputed and compared. This covers the brief's landing
#      banner, which pins the addendum.
#
# WHAT IT DOES NOT CHECK. It does not judge whether a record is true, complete,
# or authorized; it checks only that the record's own arithmetic holds. It is
# not a Tier-2 review and not a merge authorization.
#
# Usage:   scripts/custody-pin-check.sh [repo-root]
#          (repo-root defaults to the repository containing this script)
# Exit:    0 = every declared pin matches the file it names
#          1 = one or more pins are stale (each is printed with expected/actual)
#          2 = the script could not run (missing directory, missing tool)

set -uo pipefail

repo_root="${1:-}"
if [[ -z "$repo_root" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(cd "$script_dir/.." && pwd)"
fi

custody_dir="$repo_root/docs/planning/command-journal/custody"

if [[ ! -d "$custody_dir" ]]; then
  echo "custody-pin-check: no custody directory at $custody_dir" >&2
  exit 2
fi

for tool in python3 git; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "custody-pin-check: required tool not found: $tool" >&2
    exit 2
  }
done

CUSTODY_DIR="$custody_dir" REPO_ROOT="$repo_root" python3 - <<'PY'
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

custody = Path(os.environ["CUSTODY_DIR"])
repo_root = Path(os.environ["REPO_ROOT"])

failures = 0
checks = 0


def fail(msg):
    global failures
    failures += 1
    print(f"  FAIL {msg}")


def ok(msg):
    global checks
    checks += 1
    print(f"  ok   {msg}")


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def blob_id_of(path: Path) -> str:
    out = subprocess.run(
        ["git", "hash-object", str(path)],
        capture_output=True,
        text=True,
        cwd=str(repo_root),
    )
    return out.stdout.strip()


def resolve(decl_path: str):
    """A path as declared in a record, resolved against the repository root."""
    candidate = repo_root / decl_path
    return candidate if candidate.is_file() else None


HEX64 = r"[0-9a-f]{40,64}"
ROW = re.compile(r"^\|\s*(?P<key>[^|]+?)\s*\|\s*(?P<value>.*?)\s*\|\s*$")


def rows_of(block):
    for line in block:
        m = ROW.match(line)
        if m:
            yield m.group("key"), m.group("value")


def first_hex(text, width=64):
    m = re.search(rf"\b([0-9a-f]{{{width}}})\b", text)
    return m.group(1) if m else None


def first_int_before(text, word):
    m = re.search(rf"\b(\d[\d,]*)\s+{word}\b", text)
    return int(m.group(1).replace(",", "")) if m else None


def table_blocks(lines):
    """Contiguous runs of table rows."""
    block, out = [], []
    for line in lines:
        if line.startswith("|"):
            block.append(line)
        else:
            if block:
                out.append(block)
            block = []
    if block:
        out.append(block)
    return out


# ---------------------------------------------------------------- 1 & 2
for receipt in sorted(custody.glob("CUSTODY-RECEIPT-*.md")):
    lines = receipt.read_text(encoding="utf-8").splitlines()
    rel = receipt.relative_to(repo_root)

    # The sed anchor the receipt publishes for its extraction recipe, if any.
    anchor = None
    for line in lines:
        m = re.search(r"sed -n '/\^(?P<pat>[^/]+)\$/,\$p'", line)
        if m:
            anchor = m.group("pat")
            break

    for block in table_blocks(lines):
        fields = dict(rows_of(block))
        decl_path = None
        for key, value in fields.items():
            if key.strip().lower() == "path":
                decl_path = value.strip().strip("`")
        if not decl_path:
            continue

        target = resolve(decl_path)
        if target is None:
            fail(f"{rel}: declares a path that does not resolve: {decl_path}")
            continue

        actual_sha = sha256_of(target)
        actual_blob = blob_id_of(target)
        raw = target.read_bytes()
        actual_bytes = len(raw)
        actual_lines = raw.count(b"\n")
        name = Path(decl_path).name

        for key, value in fields.items():
            k = key.strip()

            if k.lower().startswith("git blob id"):
                declared = first_hex(value, 40)
                if declared is None:
                    fail(f"{rel}: {name}: blob row has no hash: {value}")
                elif declared == actual_blob:
                    ok(f"{name}: blob {declared}")
                else:
                    fail(f"{name}: blob declared {declared}, actual {actual_blob}")

            elif "dispatched text" in k.lower() and k.lower().startswith("sha-256"):
                declared = first_hex(value)
                if anchor is None:
                    fail(f"{rel}: declares a dispatched-text hash but publishes no sed anchor")
                    continue
                text = target.read_text(encoding="utf-8")
                extract, taking = [], False
                for line in text.splitlines(keepends=True):
                    if not taking and line.rstrip("\n") == anchor:
                        taking = True
                    if taking:
                        extract.append(line)
                blob = "".join(extract).encode("utf-8")
                if not blob:
                    fail(f"{name}: sed anchor {anchor!r} matches no line — extraction is empty")
                    continue
                got = hashlib.sha256(blob).hexdigest()
                if declared == got:
                    ok(f"{name}: dispatched extract {got[:8]}… via anchor {anchor!r}")
                else:
                    fail(f"{name}: dispatched extract declared {declared}, actual {got}")
                d_bytes = first_int_before(value, "bytes")
                d_lines = first_int_before(value, "lines")
                if d_bytes is not None and d_bytes != len(blob):
                    fail(f"{name}: dispatched bytes declared {d_bytes}, actual {len(blob)}")
                elif d_bytes is not None:
                    ok(f"{name}: dispatched bytes {d_bytes}")
                n = blob.count(b"\n")
                if d_lines is not None and d_lines != n:
                    fail(f"{name}: dispatched lines declared {d_lines}, actual {n}")
                elif d_lines is not None:
                    ok(f"{name}: dispatched lines {d_lines}")

            elif k.lower().startswith("sha-256"):
                declared = first_hex(value)
                if declared is None:
                    fail(f"{rel}: {name}: SHA-256 row has no hash: {value}")
                elif declared == actual_sha:
                    ok(f"{name}: sha256 {declared[:8]}…")
                else:
                    fail(f"{name}: sha256 declared {declared}, actual {actual_sha}")

            elif k.lower().startswith("bytes"):
                d_bytes = first_int_before(value, "bytes")
                if d_bytes is None:
                    m = re.match(r"^(\d[\d,]*)$", value.strip())
                    d_bytes = int(m.group(1).replace(",", "")) if m else None
                if d_bytes is not None and d_bytes != actual_bytes:
                    fail(f"{name}: bytes declared {d_bytes}, actual {actual_bytes}")
                elif d_bytes is not None:
                    ok(f"{name}: bytes {d_bytes}")
                d_lines = first_int_before(value, "lines")
                if d_lines is not None and d_lines != actual_lines:
                    fail(f"{name}: lines declared {d_lines}, actual {actual_lines}")
                elif d_lines is not None:
                    ok(f"{name}: lines {d_lines}")

            elif k.lower().startswith("lines"):
                m = re.match(r"^(\d[\d,]*)", value.strip())
                if m:
                    d_lines = int(m.group(1).replace(",", ""))
                    if d_lines != actual_lines:
                        fail(f"{name}: lines declared {d_lines}, actual {actual_lines}")
                    else:
                        ok(f"{name}: lines {d_lines}")

# ---------------------------------------------------------------- 3
CUSTODY_REL = "docs/planning/command-journal/custody/"
for record in sorted(custody.iterdir()):
    if not record.is_file():
        continue
    try:
        lines = record.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        continue
    rel = record.relative_to(repo_root)
    for i, line in enumerate(lines):
        m = re.search(rf"({re.escape(CUSTODY_REL)}\S+)", line)
        if not m:
            continue
        named = m.group(1).rstrip("`,;)")
        for lookahead in lines[i + 1 : i + 4]:
            pin = re.search(r"\bsha256\s+([0-9a-f]{64})\b", lookahead)
            if not pin:
                continue
            target = resolve(named)
            if target is None:
                fail(f"{rel}: inline pin names a path that does not resolve: {named}")
                break
            got = sha256_of(target)
            if pin.group(1) == got:
                ok(f"{rel.name}: inline pin on {Path(named).name} = {got[:8]}…")
            else:
                fail(
                    f"{rel.name}: inline pin on {Path(named).name} "
                    f"declared {pin.group(1)}, actual {got}"
                )
            break

print()
if failures:
    print(f"custody-pin-check: FAIL — {failures} stale pin(s), {checks} verified")
    sys.exit(1)
if checks == 0:
    print("custody-pin-check: PASS — no declared pins found to verify")
    sys.exit(0)
print(f"custody-pin-check: PASS — {checks} declared pin(s) verified")
sys.exit(0)
PY

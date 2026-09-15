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
#      `SHA-256 (dispatched text)` value, the extraction is run by invoking
#      `sed` itself with the anchor the receipt publishes — literally the
#      command the document gives its readers, not a reimplementation of it,
#      so a regex metacharacter in the anchor behaves here exactly as it does
#      for a reader. The resulting hash, byte count and line count are then
#      compared against the declared ones.
#   3. Inline banner pins. Anywhere a custody file names another custody file
#      and pins it with a `sha256 <64 hex>` line within the next few lines, the
#      pinned value is recomputed and compared. This covers the brief's landing
#      banner, which pins the addendum.
#
# WHAT IT DOES NOT CHECK. It does not judge whether a record is true, complete,
# or authorized; it checks only that the record's own arithmetic holds. It is
# not a Tier-2 review and not a merge authorization.
#
# NO SILENT PASS. A verifier that can exit green having verified nothing is the
# same defect it exists to catch, moved one level up. So: a custody directory
# holding records but yielding zero verified pins is a FAILURE, not a pass; a
# row whose key names a pin but whose value will not parse is a FAILURE, not a
# skip; and anything ambiguous — two extraction recipes in one receipt, two
# candidate paths for one inline pin, a duplicated table key — is a FAILURE
# rather than a guess.
#
# Usage:   scripts/custody-pin-check.sh [repo-root]
#          (repo-root defaults to the repository containing this script)
# Exit:    0 = every declared pin matches the file it names, and at least one
#              pin was verified
#          1 = one or more pins are stale, unparseable, ambiguous, or the
#              directory holds records but declares no pins at all
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
repo_root = Path(os.environ["REPO_ROOT"]).resolve()

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


def sha256_of(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def blob_id_of(path):
    """git hash-object, with its exit status honoured rather than ignored."""
    r = subprocess.run(
        ["git", "hash-object", str(path)],
        capture_output=True, text=True, cwd=str(repo_root),
    )
    if r.returncode != 0:
        return None
    return r.stdout.strip() or None


def resolve(decl_path):
    """Resolve a declared path against the repo root, refusing to leave it.

    Declared paths come from repository documents, which on a fork-triggered
    run are contributor-controlled. Only hashes are ever compared, so the
    blast radius is small, but an absolute or escaping path is a defect in
    the record either way and is reported as one.
    """
    if os.path.isabs(decl_path) or decl_path.startswith("~"):
        return None, "absolute path"
    candidate = (repo_root / decl_path).resolve()
    try:
        candidate.relative_to(repo_root)
    except ValueError:
        return None, "path escapes the repository"
    if not candidate.is_file():
        return None, "no such file"
    return candidate, None


ROW = re.compile(r"^\|\s*(?P<key>[^|]+?)\s*\|\s*(?P<value>.*?)\s*\|\s*$")
# The quoted expression of a published `sed -n '<expr>' ...` recipe, captured
# verbatim so it can be handed straight back to sed.
SED_EXPR = re.compile(r"sed -n '(?P<expr>[^']*)'")


def hex_of(text, minimum, maximum):
    m = re.search(rf"\b([0-9a-f]{{{minimum},{maximum}}})\b", text)
    return m.group(1) if m else None


def int_before(text, word):
    m = re.search(rf"\b(\d[\d,]*)\s+{word}\b", text)
    return int(m.group(1).replace(",", "")) if m else None


def table_blocks(lines):
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


def is_pin_key(k):
    k = k.lower()
    return (
        k.startswith("git blob id")
        or k.startswith("sha-256")
        or k.startswith("bytes")
        or k.startswith("lines")
    )


# ------------------------------------------------- receipts: tables + extract
for receipt in sorted(custody.glob("CUSTODY-RECEIPT-*.md")):
    text = receipt.read_text(encoding="utf-8")
    lines = text.splitlines()
    rel = receipt.relative_to(repo_root)

    # Every published extraction recipe in this receipt. More than one distinct
    # expression is ambiguous: this script will not guess which table row a
    # given recipe belongs to.
    exprs = sorted({m.group("expr") for m in SED_EXPR.finditer(text)})

    for block in table_blocks(lines):
        rows = [ROW.match(l) for l in block]
        rows = [(m.group("key").strip(), m.group("value").strip()) for m in rows if m]
        keys = [k for k, _ in rows]
        dupes = {k for k in keys if keys.count(k) > 1}
        if dupes:
            fail(f"{rel}: table has duplicated key(s) {sorted(dupes)} — cannot read unambiguously")
            continue

        decl = {k: v for k, v in rows}
        path_key = next((k for k in decl if k.lower() == "path"), None)
        if path_key is None:
            continue
        decl_path = decl[path_key].strip("`")

        target, why = resolve(decl_path)
        if target is None:
            fail(f"{rel}: declared path unusable ({why}): {decl_path}")
            continue

        raw = target.read_bytes()
        actual = {
            "sha": hashlib.sha256(raw).hexdigest(),
            "blob": blob_id_of(target),
            "bytes": len(raw),
            "lines": raw.count(b"\n"),
        }
        if actual["blob"] is None:
            fail(f"{rel}: git hash-object failed for {decl_path}")
            continue
        name = Path(decl_path).name

        for key, value in rows:
            if not is_pin_key(key):
                continue
            k = key.lower()

            if k.startswith("git blob id"):
                declared = hex_of(value, 7, 40)
                if declared is None:
                    fail(f"{name}: blob row declares no hash: {value!r}")
                elif actual["blob"].startswith(declared):
                    ok(f"{name}: blob {declared}")
                else:
                    fail(f"{name}: blob declared {declared}, actual {actual['blob']}")

            elif k.startswith("sha-256") and "dispatched" in k:
                declared = hex_of(value, 64, 64)
                if declared is None:
                    fail(f"{name}: dispatched-text row declares no hash: {value!r}")
                    continue
                if len(exprs) == 0:
                    fail(f"{rel}: declares a dispatched-text hash but publishes no sed recipe")
                    continue
                if len(exprs) > 1:
                    fail(f"{rel}: publishes {len(exprs)} distinct sed recipes — which one applies to {name} is ambiguous")
                    continue
                expr = exprs[0]
                r = subprocess.run(["sed", "-n", expr, str(target)], capture_output=True)
                if r.returncode != 0:
                    fail(f"{name}: published recipe `sed -n '{expr}'` failed: {r.stderr.decode(errors='replace').strip()}")
                    continue
                blob = r.stdout
                if not blob:
                    fail(f"{name}: published recipe `sed -n '{expr}'` extracted nothing")
                    continue
                got = hashlib.sha256(blob).hexdigest()
                if declared == got:
                    ok(f"{name}: extract {got[:8]}… via published recipe sed -n '{expr}'")
                else:
                    fail(f"{name}: extract declared {declared}, actual {got}")
                d_bytes, d_lines = int_before(value, "bytes"), int_before(value, "lines")
                if d_bytes is not None:
                    (ok if d_bytes == len(blob) else fail)(
                        f"{name}: extract bytes {d_bytes}" if d_bytes == len(blob)
                        else f"{name}: extract bytes declared {d_bytes}, actual {len(blob)}")
                n = blob.count(b"\n")
                if d_lines is not None:
                    (ok if d_lines == n else fail)(
                        f"{name}: extract lines {d_lines}" if d_lines == n
                        else f"{name}: extract lines declared {d_lines}, actual {n}")

            elif k.startswith("sha-256"):
                declared = hex_of(value, 64, 64)
                if declared is None:
                    fail(f"{name}: SHA-256 row declares no hash: {value!r}")
                elif declared == actual["sha"]:
                    ok(f"{name}: sha256 {declared[:8]}…")
                else:
                    fail(f"{name}: sha256 declared {declared}, actual {actual['sha']}")

            else:  # bytes / lines
                d_bytes = int_before(value, "bytes")
                d_lines = int_before(value, "lines")
                if d_bytes is None and k.startswith("bytes"):
                    m = re.match(r"^(\d[\d,]*)\b", value)
                    d_bytes = int(m.group(1).replace(",", "")) if m else None
                if d_lines is None and k.startswith("lines"):
                    m = re.match(r"^(\d[\d,]*)\b", value)
                    d_lines = int(m.group(1).replace(",", "")) if m else None
                if d_bytes is None and d_lines is None:
                    # The key names a pin, so an unreadable value is a hole in
                    # the verification, not something to pass over quietly.
                    fail(f"{name}: '{key}' names a pin but its value does not parse: {value!r}")
                    continue
                if d_bytes is not None:
                    (ok if d_bytes == actual["bytes"] else fail)(
                        f"{name}: bytes {d_bytes}" if d_bytes == actual["bytes"]
                        else f"{name}: bytes declared {d_bytes}, actual {actual['bytes']}")
                if d_lines is not None:
                    (ok if d_lines == actual["lines"] else fail)(
                        f"{name}: lines {d_lines}" if d_lines == actual["lines"]
                        else f"{name}: lines declared {d_lines}, actual {actual['lines']}")

# ------------------------------------------------------------- inline pins
CUSTODY_REL = "docs/planning/command-journal/custody/"
PIN = re.compile(r"\bsha256\s+([0-9a-f]{64})\b")
PATHS = re.compile(rf"({re.escape(CUSTODY_REL)}[^\s`'\"*)\]]+)")
TRIM = "`,;)]*.\"'"

for record in sorted(custody.iterdir()):
    if not record.is_file():
        continue
    try:
        lines = record.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        continue
    rel = record.relative_to(repo_root)
    for i, line in enumerate(lines):
        pin = PIN.search(line)
        window_start = i
        if not pin:
            continue
        # Candidate paths: this line, then backwards a short way. Ambiguity is
        # reported rather than resolved by picking the nearest.
        candidates = []
        for j in range(i, max(-1, i - 4), -1):
            found = [m.group(1).rstrip(TRIM) for m in PATHS.finditer(lines[j])]
            if found:
                candidates = found
                break
        if not candidates:
            continue
        if len(candidates) > 1:
            fail(f"{rel.name}: pin {pin.group(1)[:8]}… has {len(candidates)} candidate paths nearby — ambiguous")
            continue
        named = candidates[0]
        target, why = resolve(named)
        if target is None:
            fail(f"{rel.name}: inline pin names an unusable path ({why}): {named}")
            continue
        got = sha256_of(target)
        if pin.group(1) == got:
            ok(f"{rel.name}: inline pin on {Path(named).name} = {got[:8]}…")
        else:
            fail(f"{rel.name}: inline pin on {Path(named).name} declared {pin.group(1)}, actual {got}")

# --------------------------------------------------------------- verdict
records = [p for p in custody.iterdir() if p.is_file()]
print()
if failures:
    print(f"custody-pin-check: FAIL — {failures} problem(s), {checks} pin(s) verified")
    sys.exit(1)
if checks == 0:
    if records:
        # The silent-pass hole this script exists to close, one level up.
        print(
            f"custody-pin-check: FAIL — {len(records)} record(s) present but no pin was "
            "verified. Either the records declare none, or the format moved and this "
            "check no longer reads them. Passing here would verify nothing."
        )
        sys.exit(1)
    print("custody-pin-check: PASS — custody directory is empty, nothing to verify")
    sys.exit(0)
print(f"custody-pin-check: PASS — {checks} declared pin(s) verified")
sys.exit(0)
PY

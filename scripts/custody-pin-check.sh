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
#      `sed` itself with the expression the receipt publishes, not a
#      reimplementation of it, so a regex metacharacter in the anchor behaves
#      here exactly as it does for a reader. The one addition is `--sandbox`,
#      which disables sed's `e`, `r` and `w` commands. Those execute shell
#      commands and read/write arbitrary files; the expression is scraped out
#      of a repository document, so without the flag anyone able to open a
#      pull request could run commands on the CI runner. No extraction recipe
#      uses `e`/`r`/`w`, and `--sandbox` changes nothing about how an address
#      range or a `p` behaves, so the published recipe is still what runs.
#      The resulting hash, byte count and line count are then compared against
#      the declared ones. Those counts are taken over sed's stdout exactly as
#      emitted, trailing newline included — the same bytes a reader piping the
#      published recipe into `shasum` would hash.
#   3. Inline banner pins. Anywhere a custody file names a file under
#      `docs/planning/command-journal/` and pins it with a `sha256 <64 hex>`
#      line at or just below it, the pinned value is recomputed and compared.
#      This covers the brief's landing banner, which pins the addendum, and
#      the plan revisions the brief and addendum pin a directory up. Paths
#      these records wrap across two lines are rejoined before matching.
#      A pin with no path near it is PRINTED AND NOT COUNTED rather than
#      failed: the records deliberately pin superseded revisions ("R1 frozen",
#      "R2 reviewed") that name no file in the tree, so failing there would be
#      permanently red on a correct record. Printing it keeps the output from
#      implying coverage it does not have.
#
# WHAT IT DOES NOT CHECK. It does not judge whether a record is true, complete,
# or authorized; it checks only that the record's own arithmetic holds. It is
# not a Tier-2 review and not a merge authorization.
#
# WHAT THE NUMBERS MEAN, stated because the declarations being checked are
# hand-produced and the two identity columns do not share a basis:
#   - "Lines" is `wc -l` semantics — newline characters counted. A file with no
#     trailing newline therefore reports one fewer than a reader counting
#     visible lines. Every custody record checked here ends with a newline.
#   - "SHA-256" is over the file's bytes on disk. "Git blob id" is
#     `git hash-object`, which applies any `.gitattributes` or `core.autocrlf`
#     filter, so it matches the blob git actually stores — which is what a
#     receipt's blob column means. Under a clean/CRLF filter the two columns
#     would be computed over different bytes and could disagree without either
#     being wrong. This repository defines no `.gitattributes` today, and all
#     three forms (filtered, `--no-filters`, and the blob stored on `main`)
#     were confirmed identical when this check was written.
#   - A file under the custody directory that is not UTF-8 text carries no
#     readable inline pins. It is reported by name rather than passed over in
#     silence, but it is not counted as a failure: a binary attachment is a
#     legitimate record, it just cannot declare a pin in text.
#
# NO SILENT PASS. A verifier that can exit green having verified nothing is the
# same defect it exists to catch, moved one level up. So: a custody directory
# holding records but yielding zero verified pins is a FAILURE, not a pass; a
# row whose key names a pin but whose value will not parse is a FAILURE, not a
# skip; and anything ambiguous — two extraction recipes in one receipt, two
# candidate paths for one inline pin, a duplicated table key — is a FAILURE
# rather than a guess.
#
# WHAT COVERAGE THIS CLAIMS, because a green run must not imply more.
#
#   Covered: every pin declared in a `CUSTODY-RECEIPT-*.md` table, and inline
#   pins written with a LOWERCASE `sha256` keyword — `sha256 <hex>`,
#   `sha256: <hex>` or `sha256=<hex>` — near a path under
#   `docs/planning/command-journal/`. The hex may be either case; the keyword
#   may not. No uppercase-keyword pin exists in the records today (measured),
#   but this says so rather than letting the reader assume otherwise.
#
#   NOT covered: hashes written `SHA-256: <hex>` in running prose. The records
#   use that form too, and this check does not read it — they are not verified
#   and, unlike the notes below, not even reported. Measured on 2026-09-15:
#   27 such hashes across the custody tree, of which 6 resolve to a file
#   present in this repository:
#
#     AMENDMENT-pr2b-test-role-fixture-r2-20260910.md  lines 15, 16, 17, 19
#       -> pr2b-storage-architecture-r6.md, pr2b-implementation-plan-r1.md,
#          pr2b-implementation-plan-r1-addendum-01.md,
#          FOUNDER-AUTHORIZATION-pr2b-gate1-ISSUANCE-RECEIPT-20260910.md
#     FOUNDER-AUTHORIZATION-pr2b-gate3-PROPOSED-ISSUANCE-RECEIPT-20260913.md
#       lines 29, 41
#       -> DRAFT-founder-authorization-...-r3-20260913.md,
#          FOUNDER-RULING-...-complete-replacement-source-20260913.txt
#
#   This is a scope decision, not an oversight. Prose can spell a hash any
#   number of ways, and each widening of the inline matcher has revealed
#   another spelling; widening it again would pull ~21 further hashes out of
#   2600-line prose documents into a channel whose path-attribution window is
#   four lines, which produces false failures on correct records. The
#   receipt-table channel is complete and tested; the inline channel is a
#   bounded bonus and says so rather than implying it is exhaustive.
#
# A second stated exemption: the published recipes read committed truth
# (`git show "$REF:$P"`), and this check reads the WORKING TREE instead. `P=` is
# compared against the Path row so the recipe cannot name a different file, but
# `REF=` is deliberately NOT resolved: on a pull request that legitimately edits
# a custody record, the working tree and `origin/main` differ by design, and
# resolving REF would fail every such PR. The consequence is real and worth
# naming — a stale or wrong REF in a record reproduces different bytes for a
# reader while this check stays green. Verifying REF belongs to a check that
# runs against the merged result, not against a PR head.
#
# One stated exemption: an EMPTY custody directory passes. Nothing is declared,
# so nothing is unverified, and this gate does not assert that records must
# exist — no other gate does either, so deleting the directory is not caught
# here. Said out loud because an unstated exemption to a "no silent pass" rule
# is itself a silent pass.
#
# Usage:   scripts/custody-pin-check.sh [repo-root]
#          (repo-root defaults to the repository containing this script)
#          scripts/custody-pin-check.sh selftest
#          (runs this checker against synthetic records in a temporary
#          repository, asserting that each documented failure mode fails)
# Exit:    0 = every declared pin matches the file it names, and at least one
#              pin was verified
#          1 = one or more pins are stale, unparseable, ambiguous, or the
#              directory holds records but declares no pins at all
#          2 = the script could not run (missing directory, missing tool,
#              a `sed` without `--sandbox`, or not a git repository)

set -uo pipefail

# ---------------------------------------------------------------- selftest
# `custody-pin-check.sh selftest` builds synthetic custody records in a
# throwaway repository and asserts what this checker does with each one. It
# exists because this script is a parser over hand-written markdown, and every
# claim in the header above — that a moved format fails rather than passes,
# that an ambiguous record fails rather than guesses, that a hostile recipe
# cannot execute — is otherwise asserted rather than tested. Same role as
# `gate:attribution-selftest` plays for the attribution parser.
#
# It touches nothing outside its temporary directory and reads no real record.

selftest_fixture() {
  # $1 = directory to build in. Leaves a valid, self-consistent record set.
  local t="$1" c
  c="$t/docs/planning/command-journal/custody"
  mkdir -p "$c"
  git -C "$t" init -q 2>/dev/null
  printf 'PREAMBLE\nANCHOR\nbody line\n' > "$c/sample.txt"

  local rel="docs/planning/command-journal/custody/sample.txt"
  local blob sha bytes lines esha ebytes elines
  blob="$(git -C "$t" hash-object "$c/sample.txt")"
  sha="$(sha256sum "$c/sample.txt" | cut -d' ' -f1)"
  bytes="$(wc -c < "$c/sample.txt" | tr -d ' ')"
  lines="$(wc -l < "$c/sample.txt" | tr -d ' ')"
  esha="$(sed -n '/^ANCHOR$/,$p' "$c/sample.txt" | sha256sum | cut -d' ' -f1)"
  ebytes="$(sed -n '/^ANCHOR$/,$p' "$c/sample.txt" | wc -c | tr -d ' ')"
  elines="$(sed -n '/^ANCHOR$/,$p' "$c/sample.txt" | wc -l | tr -d ' ')"

  {
    printf '# Custody receipt (synthetic)\n\n'
    printf '| Field | Value |\n|---|---|\n'
    printf '| Path | `%s` |\n' "$rel"
    printf '| Git blob id | `%s` |\n' "$blob"
    printf '| SHA-256 | `%s` |\n' "$sha"
    printf '| Bytes | %s bytes |\n' "$bytes"
    printf '| Lines | %s lines |\n' "$lines"
    printf '| SHA-256 (dispatched text) | `%s` — %s bytes, %s lines |\n' "$esha" "$ebytes" "$elines"
    printf '\nRecover the dispatched text with:\n\n'
    printf '    P=%s\n' "$rel"
    printf "    sed -n '/^ANCHOR\$/,\$p' | sha256sum\n"
  } > "$c/CUSTODY-RECEIPT-sample.md"
}

selftest_case() {
  # $1 = name, $2 = expected exit, $3 = substring expected in output,
  # $4 = shell to mutate the fixture (runs with $c and $t set)
  local name="$1" want="$2" needle="$3" mutate="$4"
  local t out rc c
  t="$(mktemp -d)" || { echo "  FAIL $name — mktemp -d failed" >&2; return 1; }
  selftest_fixture "$t"
  c="$t/docs/planning/command-journal/custody"
  # A mutation that silently fails to apply leaves a pristine fixture, and any
  # case expecting exit 0 then goes green having tested nothing. So its exit
  # status is checked AND the fixture is required to have actually changed.
  local before after mrc
  before="$(find "$t/docs" -type f -exec sha256sum {} + | sort | sha256sum)"
  ( cd "$t" && eval "$mutate" ) >/dev/null 2>&1; mrc=$?
  after="$(find "$t/docs" -type f -exec sha256sum {} + | sort | sha256sum)"
  if [[ "$mutate" != ":" ]] && { [[ "$mrc" != 0 ]] || [[ "$before" == "$after" ]]; }; then
    printf '  FAIL %s — the mutation did not apply (exit %s), so this case tested nothing\n' \
      "$name" "$mrc"
    selftest_failures=$((selftest_failures + 1))
    selftest_ran=$((selftest_ran + 1))
    rm -rf "$t"
    return
  fi
  out="$(bash "$SELFTEST_SELF" "$t" 2>&1)"; rc=$?
  if [[ "$rc" == "$want" ]] && printf '%s' "$out" | grep -qF -- "$needle"; then
    printf '  ok   %s\n' "$name"
  else
    printf '  FAIL %s — exit %s (want %s), looking for %s\n' "$name" "$rc" "$want" "$needle"
    printf '%s\n' "$out" | sed 's/^/         /'
    selftest_failures=$((selftest_failures + 1))
  fi
  selftest_ran=$((selftest_ran + 1))
  rm -rf "$t"
}

run_selftest() {
  selftest_failures=0
  selftest_ran=0
  echo "custody-pin-check selftest"

  selftest_case "a self-consistent record set passes" 0 \
    "PASS —" ":"

  selftest_case "a stale SHA-256 fails and names it" 1 \
    "sha256 declared" \
    "sed -i 's/| SHA-256 | \`[0-9a-f]*\`/| SHA-256 | \`$(printf '0%.0s' {1..64})\`/' \"\$PWD/docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md\""

  selftest_case "an unparseable pin value fails rather than being skipped" 1 \
    "does not parse" \
    "sed -i 's/^| Bytes | .*/| Bytes | thirteen thousand |/' docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "renaming the Path key trips the floor" 1 \
    "not one table declared a Path row" \
    "sed -i 's/^| Path |/| Filepath |/' docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "renaming receipts out of the scanned pattern trips the floor" 1 \
    "not one table declared a Path row" \
    "mv docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md docs/planning/command-journal/custody/RECEIPT-CUSTODY-sample.md"

  # The needle is sed's own parse error, not just a non-zero exit: if sed had
  # accepted `-i` it would have rewritten the file, and the run would then fail
  # anyway on the now-stale hash. Only "unknown command" proves it was refused.
  selftest_case "a recipe beginning with - is not handed to sed as an option" 1 \
    "unknown command" \
    "sed -i \"s|sed -n '/\\^ANCHOR\\\$/,\\\$p'|sed -n '-i s/PREAMBLE/OWNED/'|\" docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "a recipe using sed's e command is refused by the sandbox" 1 \
    "sandbox mode" \
    "sed -i \"s|sed -n '/\\^ANCHOR\\\$/,\\\$p'|sed -n '1e echo hi'|\" docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "two distinct recipes are ambiguous, not resolved by guessing" 1 \
    "distinct sed recipes" \
    "printf \"\\nAlternative: \\\`sed -n '5,20p' f\\\`\\n\" >> docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "a column-heading row is reported as a table-shape problem" 1 \
    "table shape not understood" \
    "printf '\\n| Path | Git blob id |\\n|---|---|\\n' >> docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "an empty custody directory passes with nothing to verify" 0 \
    "nothing to verify" \
    "rm -f docs/planning/command-journal/custody/*"

  selftest_case "an inline pin whose path is wrapped across two lines is read" 0 \
    "inline pin on sample.txt" \
    "printf '\\nPinned:\\n  path docs/planning/command-journal/\\n       custody/sample.txt\\n  sha256 %s\\n' \"\$(sha256sum docs/planning/command-journal/custody/sample.txt | cut -d\" \" -f1)\" >> docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "an unrecognized SHA-256 qualifier is refused, not guessed at" 1 \
    "qualifier this check does not recognize" \
    "sed -i 's/^| SHA-256 |/| SHA-256 (as sent) |/' docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "an uppercase digest is accepted, not reported as absent" 0 \
    "PASS" \
    "sed -i '/^| SHA-256 |/s/[0-9a-f]\\{64\\}/\\U&/' docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "the same path named twice on one line is not ambiguous" 0 \
    "inline pin on sample.txt" \
    "printf '\\nSee docs/planning/command-journal/custody/sample.txt and again docs/planning/command-journal/custody/sample.txt\\n  sha256 %s\\n' \"\$(sha256sum docs/planning/command-journal/custody/sample.txt | cut -d\" \" -f1)\" >> docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "receipts renamed to a non-markdown extension trip the floor" 1 \
    "not one table declared a Path row" \
    "mv docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.txt"

  selftest_case "an uppercase INLINE digest is verified, not passed over invisibly" 0 \
    "inline pin on sample.txt" \
    "printf '\\nPinned: docs/planning/command-journal/custody/sample.txt\\n  sha256 %s\\n' \"\$(sha256sum docs/planning/command-journal/custody/sample.txt | cut -d\" \" -f1 | tr a-f A-F)\" >> docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "a recipe reading a different file than the Path row is refused" 1 \
    "would verify a hash no reader reproduces" \
    "sed -i 's|^    P=.*|    P=docs/planning/command-journal/custody/other.txt|' docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "a recipe with no readable P= is reported, not silently unchecked" 1 \
    "no readable \`P=\` assignment" \
    "sed -i '/^    P=/d' docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  selftest_case "an inline pin written with a colon is read, not passed over" 0 \
    "inline pin on sample.txt" \
    "printf '\\nPinned: docs/planning/command-journal/custody/sample.txt\\n  sha256: %s\\n' \"\$(sha256sum docs/planning/command-journal/custody/sample.txt | cut -d\" \" -f1)\" >> docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  # The blank lines are load-bearing: they put the pin outside the four-line
  # lookback by construction rather than by however long the fixture happens to
  # be, so adding a line to selftest_fixture cannot silently invert this case.
  selftest_case "an inline pin with no path nearby is noted, not counted, not failed" 0 \
    "not verified, not counted" \
    "printf '\\nSuperseded revision:\\n  sha256 %s\\n' \"\$(printf '1%.0s' {1..64})\" >> docs/planning/command-journal/custody/CUSTODY-RECEIPT-sample.md"

  echo
  if (( selftest_failures )); then
    echo "custody-pin-check selftest: FAIL — $selftest_failures of $selftest_ran case(s) failed"
    return 1
  fi
  echo "custody-pin-check selftest: PASS — $selftest_ran case(s)"
  return 0
}

# Preflight runs BEFORE the selftest branch below, so an unsupported platform
# gets one clear message instead of a wall of per-case mismatches. sha256sum is
# here because the selftest fixtures use it; on macOS it is `shasum -a 256`, and
# GNU sed is absent too, so this check is a Linux/coreutils gate either way.
required_tools=(python3 git sed)
# sha256sum is used only by the selftest fixtures; the real path hashes through
# python's hashlib. Demanding it on every run would blame a tool the check being
# run does not need.
[[ "${1:-}" == "selftest" ]] && required_tools+=(sha256sum)
for tool in "${required_tools[@]}"; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "custody-pin-check: required tool not found: $tool" >&2
    echo "custody-pin-check: this check needs GNU sed and coreutils." >&2
    exit 2
  }
done

# The published recipes are executed rather than reimplemented, so they run
# under `sed --sandbox` (see the header). A sed without that flag — BSD/macOS
# sed, notably — cannot run them safely, and would in any case interpret a GNU
# recipe differently and extract different bytes. That is "could not run",
# not "the pins are stale", so it exits 2 rather than 1.
if ! printf '' | sed --sandbox -n '1p' >/dev/null 2>&1; then
  echo "custody-pin-check: this check requires a sed supporting --sandbox (GNU sed)." >&2
  echo "custody-pin-check: the published extraction recipes are executed, and are run" >&2
  echo "custody-pin-check: sandboxed so a document cannot execute commands via sed." >&2
  exit 2
fi

if [[ "${1:-}" == "selftest" ]]; then
  SELFTEST_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  export SELFTEST_SELF
  run_selftest
  exit $?
fi


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

# Blob ids come from `git hash-object`. Outside a work tree that fails for
# every record, which is a tooling problem and not a stale pin.
if ! git -C "$repo_root" rev-parse --git-dir >/dev/null 2>&1; then
  echo "custody-pin-check: $repo_root is not a git repository; cannot compute blob ids" >&2
  exit 2
fi

CUSTODY_DIR="$custody_dir" REPO_ROOT="$repo_root" python3 - <<'PY'
import hashlib
import os
import re
import select
import subprocess
import sys
import time
from pathlib import Path


class RecipeLimit(Exception):
    """A published recipe exceeded its time or output bound."""

custody = Path(os.environ["CUSTODY_DIR"])
repo_root = Path(os.environ["REPO_ROOT"]).resolve()

failures = 0
checks = 0
noted = []


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


RECIPE_TIMEOUT = 30
RECIPE_MAX_BYTES = 64 * 1024 * 1024  # ~400x the largest custody record today


def run_recipe(expr, target):
    """Run a published recipe under sed --sandbox, bounded in time AND output.

    The timeout bounds wall time; it does not bound volume, and a looping
    recipe can emit gigabytes well inside it, all buffered in the runner. So
    stdout is read through select with a deadline and a byte cap, and the
    process is killed the moment either is exceeded.

    Returns (returncode, stdout_bytes, stderr_bytes) or raises RecipeLimit.
    """
    proc = subprocess.Popen(
        ["sed", "--sandbox", "-n", "-e", expr, "--", str(target)],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    chunks, errchunks, total = [], [], 0
    deadline = time.monotonic() + RECIPE_TIMEOUT
    # Both pipes are drained together. Draining stdout alone deadlocks a recipe
    # that writes more than the pipe buffer to stderr: sed blocks on stderr,
    # stdout never becomes readable, and the real diagnostic surfaces 30s later
    # as a timeout instead of as the message sed actually produced.
    open_pipes = [proc.stdout, proc.stderr]
    try:
        while open_pipes:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RecipeLimit(f"did not finish in {RECIPE_TIMEOUT}s")
            ready, _, _ = select.select(open_pipes, [], [], remaining)
            if not ready:
                raise RecipeLimit(f"did not finish in {RECIPE_TIMEOUT}s")
            for pipe in ready:
                chunk = pipe.read1(65536)
                if not chunk:
                    open_pipes.remove(pipe)
                    continue
                if pipe is proc.stderr:
                    if sum(map(len, errchunks)) < 65536:
                        errchunks.append(chunk)
                    continue
                chunks.append(chunk)
                total += len(chunk)
                if total > RECIPE_MAX_BYTES:
                    raise RecipeLimit(
                        f"produced more than {RECIPE_MAX_BYTES} bytes; no custody record "
                        "is remotely this large, so the recipe is looping")
        proc.wait(timeout=max(0.1, deadline - time.monotonic()))
    except (RecipeLimit, subprocess.TimeoutExpired) as exc:
        proc.kill()
        proc.wait()
        raise RecipeLimit(str(exc) if isinstance(exc, RecipeLimit)
                          else f"did not finish in {RECIPE_TIMEOUT}s") from None
    finally:
        proc.stdout.close()
        proc.stderr.close()
    return proc.returncode, b"".join(chunks), b"".join(errchunks)


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
# The published recipes give sed NO filename operand — they pipe into it
# (`git show "$REF:$P" | sed -n '...'`), and the file is named by the `P=`
# assignment above. So the checker supplies the file itself, and that would
# silently diverge from what a reader runs if `P=` named a different file than
# the table's Path row. This captures `P=` so the two can be compared.
P_ASSIGN = re.compile(r"^\s*P=(?P<path>\S+)\s*$", re.M)


def hex_of(text, minimum, maximum):
    """A declared digest, casefolded. Uppercase is a rendering choice, not a
    defect; reporting it as "declares no hash" would blame the wrong thing.

    A backtick-quoted span wins over a bare one: these records write digests in
    backticks, and a loose search can otherwise latch onto an incidental
    hex-looking word elsewhere in the cell.
    """
    quoted = re.search(rf"`([0-9a-fA-F]{{{minimum},{maximum}}})`", text)
    m = quoted or re.search(rf"\b([0-9a-fA-F]{{{minimum},{maximum}}})\b", text)
    return m.group(1).lower() if m else None


def int_before(text, word):
    m = re.search(rf"\b(\d[\d,]*)\s+{word}\b", text)
    return int(m.group(1).replace(",", "")) if m else None


# A markdown header-separator row (`|---|---|`). Two tables written with no
# blank line between them are one run of `|` lines, and merging them produces
# a spurious duplicate-key failure on correct records; the separator is where
# the second table starts.
SEPARATOR = re.compile(r"^\|[\s:|-]*-[\s:|-]*\|\s*$")


def table_blocks(lines):
    block, out = [], []
    for line in lines:
        if not line.startswith("|"):
            if block:
                out.append(block)
            block = []
            continue
        if SEPARATOR.match(line) and block:
            out.append(block)
            block = []
        block.append(line)
    if block:
        out.append(block)
    return out


# SHA-256 row qualifiers that mean "the whole file", enumerated from the
# qualifiers actually present in the records rather than guessed: a bare row,
# "(as landed)", and "re-derived from `main`". These digests are
# content-addressed, so all three are the same bytes. "(dispatched text)" is
# handled separately, and anything else is refused rather than compared against
# bytes this check only assumes are the right ones.
WHOLE_FILE_SHA = re.compile(r"^sha-256(\s*\(as landed\)|\s+re-derived from\b.*)?$")


def is_pin_key(k):
    k = k.lower()
    return (
        k.startswith("git blob id")
        or k.startswith("sha-256")
        or k.startswith("bytes")
        or k.startswith("lines")
    )


# ------------------------------------------------- receipts: tables + extract
# The SCAN is globbed to receipts: the other markdown here (the DRAFT
# authorization acts) runs to thousands of lines of governance tables that are
# not pin declarations, and reading them as receipts produces false failures on
# correct records — measured, not assumed.
#
# The FLOOR below is deliberately NOT globbed the same way. Keying "are there
# records to verify?" off the same CUSTODY-RECEIPT-* pattern the scan uses
# would let a rename defeat both at once: no matches, nothing read, nothing to
# complain about, green. So presence is any markdown in the directory, while
# coverage is Path rows actually read.
receipts = sorted(custody.rglob("CUSTODY-RECEIPT-*.md"))
# Presence is ANY file, not just *.md: receipts renamed to another extension,
# with one inline pin still verifying, would otherwise satisfy both floors
# while the table channel sees nothing — the same shape as the hole the floor
# was added for. The cost is that a custody directory holding records but no
# receipt at all is red; that is loud and one commit to fix, which is the
# trade this whole script exists to make.
records_present = sorted(p for p in custody.rglob("*") if p.is_file())
path_rows_seen = 0

for receipt in receipts:
    text = receipt.read_text(encoding="utf-8")
    lines = text.splitlines()
    rel = receipt.relative_to(repo_root)

    # Every published extraction recipe in this receipt. More than one distinct
    # expression is ambiguous: this script will not guess which table row a
    # given recipe belongs to.
    exprs = sorted({m.group("expr") for m in SED_EXPR.finditer(text)})
    recipe_paths = {m.group("path").strip("\"'`") for m in P_ASSIGN.finditer(text)}

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
        path_rows_seen += 1
        decl_path = decl[path_key].strip("`")
        if is_pin_key(decl_path) or decl_path.lower() == "path":
            # A two-column HEADER row `| Path | Git blob id |` parses as
            # key="Path", value="Git blob id". The `|` guard below only sees
            # three-or-more-column tables, so without this the header row
            # reaches resolve() and reports "no such file" — blaming the
            # record for the parser's assumption.
            fail(f"{rel}: table shape not understood — '{path_key}' names "
                 f"another column heading ({decl_path!r}), not a file")
            continue
        if "|" in decl_path:
            # ROW reads a two-column key/value table. A column-oriented table
            # (`| Path | Git blob id | SHA-256 |` header plus data rows) puts
            # the remaining cells in the value, and the honest report is that
            # the layout was not understood — not that the record names a file
            # that does not exist.
            fail(f"{rel}: table shape not understood — expected a two-column "
                 f"key/value table, got a '{path_key}' value spanning columns: {decl_path!r}")
            continue

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
                # 12, not 7: a 7-character prefix is a weak pin and widens the
                # chance of matching an unrelated hex-looking token.
                declared = hex_of(value, 12, 40)
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
                if not recipe_paths:
                    # `if recipe_paths and ...` would degrade to NO CHECK here:
                    # any P= line the anchored pattern misses yields an empty
                    # set and the cross-check quietly does not run. A receipt
                    # that publishes a recipe owes a readable P=.
                    fail(f"{rel}: publishes a sed recipe but no readable `P=` assignment, "
                         "so which file the recipe reads cannot be confirmed against "
                         f"{name}'s Path row")
                    continue
                if decl_path not in recipe_paths:
                    fail(f"{name}: the published recipe reads {sorted(recipe_paths)} "
                         f"but this row declares {decl_path} — running it against the "
                         "row's file would verify a hash no reader reproduces")
                    continue
                expr = exprs[0]
                # `-e` forces expr to be read as the script even when it
                # begins with "-", and `--` ends option parsing before the
                # filename. Without both, a document supplying `-i ...` or
                # `-f ...` is parsed as OPTIONS: --sandbox blocks the e/r/w
                # COMMANDS, it does not stop sed being handed -i, and -i
                # rewrites files. Verified: `sed --sandbox -n '-i s/a/b/' f`
                # edits f in place; with `-e ... --` it is rejected as an
                # unknown command while a normal range still runs.
                try:
                    rc, extract, errout = run_recipe(expr, target)
                except RecipeLimit as limit:
                    fail(f"{name}: published recipe `sed -n '{expr}'` {limit}")
                    continue
                if rc != 0:
                    fail(f"{name}: published recipe `sed -n '{expr}'` failed: "
                         f"{errout.decode(errors='replace').strip()}")
                    continue
                if not extract:
                    fail(f"{name}: published recipe `sed -n '{expr}'` extracted nothing")
                    continue
                got = hashlib.sha256(extract).hexdigest()
                if declared == got:
                    ok(f"{name}: extract {got[:8]}… via published recipe sed -n '{expr}'")
                else:
                    fail(f"{name}: extract declared {declared}, actual {got}")
                d_bytes, d_lines = int_before(value, "bytes"), int_before(value, "lines")
                if d_bytes is not None:
                    if d_bytes == len(extract):
                        ok(f"{name}: extract bytes {d_bytes}")
                    else:
                        fail(f"{name}: extract bytes declared {d_bytes}, actual {len(extract)}")
                n = extract.count(b"\n")
                if d_lines is not None:
                    if d_lines == n:
                        ok(f"{name}: extract lines {d_lines}")
                    else:
                        fail(f"{name}: extract lines declared {d_lines}, actual {n}")

            elif WHOLE_FILE_SHA.match(k.strip()):
                declared = hex_of(value, 64, 64)
                if declared is None:
                    fail(f"{name}: SHA-256 row declares no hash: {value!r}")
                elif declared == actual["sha"]:
                    ok(f"{name}: sha256 {declared[:8]}…")
                else:
                    fail(f"{name}: sha256 declared {declared}, actual {actual['sha']}")

            elif k.startswith("sha-256"):
                # A SHA-256 row qualified with something this check does not
                # know. The catch-all that used to live here compared, say,
                # `SHA-256 (as sent)` against the WHOLE FILE and failed a
                # correct record with a message about a hash mismatch. Failing
                # on the qualifier says the true thing: it does not know which
                # bytes that row is about.
                fail(f"{name}: '{key}' is a SHA-256 row with a qualifier this check "
                     "does not recognize — it does not know which bytes to hash")

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
                    if d_bytes == actual["bytes"]:
                        ok(f"{name}: bytes {d_bytes}")
                    else:
                        fail(f"{name}: bytes declared {d_bytes}, actual {actual['bytes']}")
                if d_lines is not None:
                    if d_lines == actual["lines"]:
                        ok(f"{name}: lines {d_lines}")
                    else:
                        fail(f"{name}: lines declared {d_lines}, actual {actual['lines']}")

# ------------------------------------------------------------- inline pins
# Inline pins name files anywhere under the command journal, not only under
# custody/: the R4 brief and its addendum pin the implementation plan and its
# addenda, which live one directory up.
JOURNAL_REL = "docs/planning/command-journal/"
# The HEX is case-folded, to match hex_of on the table side: a case-sensitive
# hex class left an uppercase digest neither verified NOR noted. The KEYWORD is
# not — `SHA256 <hex>` with an uppercase keyword is not matched. Measured
# 2026-09-15: zero such pins exist in the records, and the coverage statement in
# the header names the lowercase keyword explicitly rather than claiming more.
PIN = re.compile(r"\bsha256[\s:=]+([0-9a-fA-F]{64})\b")
PATHS = re.compile(rf"({re.escape(JOURNAL_REL)}[^\s`'\"*)\]]+)")
TRIM = "`,;)]*.\"'"
# A directory prefix left dangling at end of line: these records wrap long
# paths, putting `.../custody/` on one line and the filename on the next. The
# path is stated, just not on one line, and reading only the first line finds
# either nothing or a directory.
DANGLING_DIR = re.compile(rf"{re.escape(JOURNAL_REL)}\S*$")


def path_line(lines, j):
    """Line j, with a wrapped path rejoined from the line below it."""
    stripped = lines[j].rstrip()
    if j + 1 < len(lines) and stripped.endswith("/") and DANGLING_DIR.search(stripped):
        return lines[j].rstrip() + lines[j + 1].strip()
    return lines[j]

for record in sorted(custody.rglob("*")):
    if not record.is_file():
        continue
    rel = record.relative_to(repo_root)
    try:
        lines = record.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        # Not a failure — a binary record simply cannot declare a text pin —
        # but said out loud, because a file skipped in silence is how a
        # verifier ends up verifying less than its output implies.
        noted.append(f"  note {rel}: not UTF-8 text; no inline pins read from it")
        continue
    for i, line in enumerate(lines):
      # Every pin on the line, not just the first: dropping a second one would
      # be a silent coverage loss inside the one channel whose whole principle
      # is that nothing goes unreported.
      for pin in PIN.finditer(line):
        pin_hex = pin.group(1).lower()
        # Candidate paths: this line, then backwards a short way. Ambiguity is
        # reported rather than resolved by picking the nearest.
        candidates = []
        for j in range(i, max(-1, i - 4), -1):
            found = sorted({m.group(1).rstrip(TRIM)
                            for m in PATHS.finditer(path_line(lines, j))
                            if not m.group(1).rstrip(TRIM).endswith("/")})
            if found:
                candidates = found
                break
        if not candidates:
            # Not a failure, and deliberately so. These records pin SUPERSEDED
            # revisions — "R1 frozen", "R2 reviewed" — which by construction
            # name no file in the tree; the R1 hash in the R4 brief appears
            # nowhere except as a citation inside custody documents. A hard
            # failure here would be permanently red on correct records. But it
            # is not passed over in silence either: an unattached pin is
            # printed, uncounted, so the output states what it did not verify
            # rather than implying full coverage.
            noted.append(f"  note {rel.name}:{i + 1}: pin {pin_hex[:8]}… names no "
                         "journal path nearby (a superseded revision or an extract, "
                         "both of which name no file — or a moved file)")
            continue
        if len(candidates) > 1:
            fail(f"{rel.name}: pin {pin_hex[:8]}… has {len(candidates)} candidate paths nearby — ambiguous")
            continue
        named = candidates[0]
        target, why = resolve(named)
        if target is None:
            fail(f"{rel.name}: inline pin names an unusable path ({why}): {named}")
            continue
        got = sha256_of(target)
        if pin_hex == got:
            ok(f"{rel.name}: inline pin on {Path(named).name} = {got[:8]}…")
        else:
            fail(f"{rel.name}: inline pin on {Path(named).name} declared {pin_hex}, actual {got}")

# --------------------------------------------------------------- verdict
records = [p for p in custody.rglob("*") if p.is_file()]
print()

# Per-channel floor. The global "zero checks" floor below is not enough on its
# own: the inline-pin channel can keep producing checks while the table channel
# has gone completely blind — renaming the `Path` key in every receipt did
# exactly that, and the run still reported a green PASS on five inline pins.
# The floor counts `Path` ROWS ACTUALLY READ, not receipt filenames: keying it
# off a CUSTODY-RECEIPT-* glob would itself be defeated by renaming the files.
if records_present and path_rows_seen == 0:
    print(
        f"custody-pin-check: FAIL — {len(records_present)} record(s) present but not one "
        "table declared a Path row. This measures only that nothing was read; the cause "
        "is either receipts renamed out of the CUSTODY-RECEIPT-*.md pattern scanned here, "
        "or a table format that moved. Any pins counted came from elsewhere and do not "
        "cover the tables."
    )
    failures += 1

if noted:
    for line in noted:
        print(line)
    print(f"  ({len(noted)} pin(s) not attached to a path — not verified, not counted)")
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
print(
    "  coverage: receipt tables, and inline pins written with a lowercase\n"
    "            `sha256` keyword — `sha256`, `sha256:` or\n"
    "            `sha256=`. Hashes written `SHA-256:` in prose are NOT read —\n"
    "            not verified and not reported. See this script's header.\n")
sys.exit(0)
PY

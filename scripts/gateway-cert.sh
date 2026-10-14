#!/usr/bin/env bash
# Build Room Gateway certification run.
#
# Usage:  bash scripts/gateway-cert.sh <40-hex head SHA> <branch>
#
# Made from the script filed as
# docs/planning/command-journal/custody/LINUX-GATEWAY-EVIDENCE-buildroom-cert-script-20261012.txt
# (FOUNDER-ACT-20261014-BR-SMOKE-CERT-SCRIPTS B3), which stays as filed. It
# differs in three ways: it takes the head and the branch that carries it as
# arguments; it refuses a madventures-tui checkout with any local change, or
# whose HEAD does not descend from the bound base 3d5c4c97; and its storage step
# fails when any test is skipped; the named branch must carry the head. Under
# the act's AMENDMENT-1 a full step must also run at least one test and an n=K
# step exactly K, untracked files in the Build Room checkout count, the run
# stops if its temporary directory cannot be made, and the throwaway cluster
# takes a free port. Under FOUNDER-ACT-20261014-BR-KEYCHAIN-INVENTORY B3 the
# summary's checksums leave out cert.log, the run's own unfinished log.
#
# Runs, at exactly that head: the default suite, every storage suite, the
# runtime-role tier, the Prerequisite C proof (must be 15 of 15 under Node
# v22.23.2 and Bun 1.4.2), the real custody suite of this OS, and
# scripts/gateway-smoke.sh. Everything it creates lives under
# ~/buildroom-cert: a throwaway PostgreSQL 16 cluster (deleted at the end)
# and the log. It touches no real Gateway, no real key, no production
# system, and reads no secret. Paste the final SUMMARY block back.

set -uo pipefail

EXPECT="${1:-}"
BRANCH="${2:-}"
if [[ ! "$EXPECT" =~ ^[0-9a-f]{40}$ || -z "$BRANCH" ]]; then
  echo "usage: bash scripts/gateway-cert.sh <40-hex head SHA> <branch>" >&2
  exit 2
fi

WORK="${CERT_WORK:-$HOME/buildroom-cert}"
BR="$WORK/founder-os-build-room"
TUI="$WORK/madventures-tui"
OS="$(uname -s)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOGDIR="$WORK/logs/$STAMP"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/cert.log"
exec > >(tee -a "$LOG") 2>&1

die() { echo "CERT STOP: $*"; exit 1; }

case "$OS" in
  Linux)  CUSTODY_SCRIPT="test:custody:linux"
          PGBIN_DEFAULT="/usr/lib/postgresql/16/bin" ;;
  Darwin) CUSTODY_SCRIPT="test:custody:macos"
          PGBIN_DEFAULT="$(brew --prefix postgresql@16 2>/dev/null)/bin" ;;
  *)      die "unsupported OS $OS" ;;
esac
PGBIN="${PGBIN:-$PGBIN_DEFAULT}"
NODE_BIN="${NODE_BIN:-$HOME/.nvm/versions/node/v22.23.2/bin}"
BUN_BIN="${BUN_BIN:-$HOME/.bun/bin}"
export PATH="$NODE_BIN:$BUN_BIN:$PATH"

echo "== host"
echo "hostname:   $(hostname)"
echo "uname:      $(uname -srm)"
if [[ "$OS" == Darwin ]]; then
  echo "macOS:      $(sw_vers -productVersion) ($(sw_vers -buildVersion))"
else
  echo "distro:     $(. /etc/os-release && echo "$PRETTY_NAME")"
  echo "systemd:    $(systemctl --version | head -1)"
fi
echo "user:       $(id -un) (uid $(id -u))"
echo "started:    $STAMP"

echo "== preconditions"
[[ "$(id -u)" != 0 ]] || die "run as your normal user, not root (initdb refuses root)"
[[ -d "$BR/.git" ]] || die "no checkout at $BR"
[[ -d "$TUI/.git" ]] || die "no madventures-tui checkout at $TUI"
for b in initdb pg_ctl postgres; do
  [[ -x "$PGBIN/$b" ]] || die "$PGBIN/$b missing: install PostgreSQL 16 server"
done
PGVER="$("$PGBIN/postgres" --version)"
[[ "$PGVER" =~ \ 16\. ]] || die "PostgreSQL 16 required, found: $PGVER"
[[ "$(node --version 2>/dev/null)" == v22.23.2 ]] || die "node v22.23.2 not at $NODE_BIN (found $(node --version 2>/dev/null))"
[[ "$(bun --version 2>/dev/null)" == 1.4.2 ]] || die "bun 1.4.2 not at $BUN_BIN (found $(bun --version 2>/dev/null))"
if [[ "$OS" == Linux ]]; then
  command -v ss >/dev/null || die "ss not found: sudo apt-get install -y iproute2"
  [[ -x /usr/bin/systemd-creds ]] || die "/usr/bin/systemd-creds not found"
fi

git -C "$BR" fetch --quiet origin "$BRANCH" || die "git fetch failed"
# The branch named must carry the head: a typo or another branch would
# otherwise certify a commit that is merely present in the checkout.
git -C "$BR" merge-base --is-ancestor "$EXPECT" FETCH_HEAD 2>/dev/null \
  || die "$EXPECT is not on origin/$BRANCH"
git -C "$BR" checkout --quiet --detach "$EXPECT" || die "cannot check out $EXPECT"
HEAD_NOW="$(git -C "$BR" rev-parse HEAD)"
[[ "$HEAD_NOW" == "$EXPECT" ]] || die "HEAD is $HEAD_NOW, not $EXPECT"
[[ -z "$(git -C "$BR" status --porcelain)" ]] || die "checkout has local changes (untracked files count)"
git -C "$TUI" fetch --quiet origin || true
# The Prerequisite C proof runs the Worker from this checkout, so a change in
# its worktree would run under an unchanged logged HEAD. Untracked files count.
[[ -z "$(git -C "$TUI" status --porcelain)" ]] || die "madventures-tui checkout has local changes"
TUI_BASE="3d5c4c97fd5eba739215688eb2f4f2fa4b7071e3"
git -C "$TUI" merge-base --is-ancestor "$TUI_BASE" HEAD \
  || die "madventures-tui HEAD $(git -C "$TUI" rev-parse HEAD) does not descend from $TUI_BASE"

echo "head:       $HEAD_NOW"
echo "node:       $(node --version) at $(command -v node)"
echo "bun:        $(bun --version) at $(command -v bun)"
echo "npm:        $(npm --version)"
echo "postgres:   $PGVER"
echo "tui head:   $(git -C "$TUI" rev-parse HEAD)"

# A throwaway PostgreSQL 16 cluster, trust auth on loopback only, on a free
# loopback port chosen now rather than a fixed one, so a stale run or another
# service cannot block it. The port is free when chosen; if something takes it
# before the cluster starts, the start fails and the run stops.
PGTMP="$(mktemp -d "$WORK/pg.XXXXXX")" || die "could not make a temporary directory under $WORK"
[[ -n "$PGTMP" && -d "$PGTMP" ]] || die "could not make a temporary directory under $WORK"
PGPORT="$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')" \
  || die "could not choose a free loopback port"
[[ "$PGPORT" =~ ^[0-9]+$ ]] || die "could not choose a free loopback port"
echo "pg port:    $PGPORT"
cleanup() {
  "$PGBIN/pg_ctl" -D "$PGTMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$PGTMP"
}
trap cleanup EXIT
"$PGBIN/initdb" -D "$PGTMP/data" --auth=trust --username=postgres --no-sync >"$LOGDIR/initdb.log" 2>&1 \
  || die "initdb failed (see $LOGDIR/initdb.log)"
"$PGBIN/pg_ctl" -D "$PGTMP/data" -l "$LOGDIR/postgres.log" -w \
  -o "-p $PGPORT -k $PGTMP -c listen_addresses=127.0.0.1" start >/dev/null \
  || die "throwaway PostgreSQL did not start (see $LOGDIR/postgres.log)"
"$PGBIN/createdb" -h 127.0.0.1 -p "$PGPORT" -U postgres buildroom_test \
  || die "could not create the throwaway database"
DBURL="postgresql://postgres:postgres@127.0.0.1:$PGPORT/buildroom_test"

cd "$BR" || die "cd $BR"
export BUILDROOM_TEST_PG_BINDIR="$PGBIN"
export BUILDROOM_PREREQC_TUI_ROOT="$TUI"

RESULTS=()
# step <name> <needs-db:yes|no> <rule> <command...>
#   rule: any  -> exit 0 and "# fail 0"
#         full -> also "# skipped 0" and at least one test run (a suite that
#                 skipped, or ran nothing, proves nothing)
#         n=K  -> also exactly K tests run, all K passing, nothing skipped
step() {
  local name="$1" db="$2" rule="$3"; shift 3
  local out="$LOGDIR/$name.log" rc
  echo "== $name: $*"
  if [[ "$db" == yes ]]; then
    env TEST_DATABASE_URL="$DBURL" "$@" >"$out" 2>&1; rc=$?
  else
    env -u TEST_DATABASE_URL "$@" >"$out" 2>&1; rc=$?
  fi
  local tests pass fail skipped verdict=PASS
  tests="$(grep -E '^(#|ℹ) tests ' "$out" | tail -1 | awk '{print $3}')"
  pass="$(grep -E '^(#|ℹ) pass ' "$out" | tail -1 | awk '{print $3}')"
  fail="$(grep -E '^(#|ℹ) fail ' "$out" | tail -1 | awk '{print $3}')"
  skipped="$(grep -E '^(#|ℹ) skipped ' "$out" | tail -1 | awk '{print $3}')"
  [[ "$rc" == 0 ]] || verdict=FAIL
  [[ -z "$fail" || "$fail" == 0 ]] || verdict=FAIL
  case "$rule" in
    full) [[ "$skipped" == 0 && "$tests" =~ ^[0-9]+$ && "$tests" -gt 0 ]] || verdict=FAIL ;;
    n=*)  [[ "$skipped" == 0 && "$tests" == "${rule#n=}" && "$pass" == "${rule#n=}" ]] || verdict=FAIL ;;
  esac
  grep -E '^(#|ℹ) (tests|pass|fail|skipped) |gateway-smoke: |runtime-role — |^not ok ' "$out" | tail -12
  local line
  line="$(printf '%-16s %s  exit=%s tests=%s pass=%s fail=%s skipped=%s' \
    "$name" "$verdict" "$rc" "${tests:--}" "${pass:--}" "${fail:--}" "${skipped:--}")"
  echo "$line"
  RESULTS+=("$line")
}

step install       no  any    npm ci
[[ "${RESULTS[0]}" == *" PASS "* ]] || die "npm ci failed (see $LOGDIR/install.log)"
step default       no  any    npm test
step storage       yes full   npm run test:storage
step runtime-role  yes full   npm run test:storage:runtime-role
step prereq-c      yes n=15   npm run test:prereq-c
step custody       no  full   npm run "$CUSTODY_SCRIPT"
step smoke         no  any    npm run smoke:gateway

FINAL=PASS
for r in "${RESULTS[@]}"; do [[ "$r" == *" PASS "* ]] || FINAL=FAIL; done

{
  echo
  echo "===== SUMMARY (paste this block back) ====="
  echo "host:     $(hostname) / $OS $(uname -r)"
  echo "head:     $HEAD_NOW"
  echo "expected: $EXPECT"
  echo "node:     $(node --version)   bun: $(bun --version)"
  echo "postgres: $PGVER"
  echo "tui:      $(git -C "$TUI" rev-parse HEAD)"
  echo "started:  $STAMP   finished: $(date -u +%Y%m%dT%H%M%SZ)"
  for r in "${RESULTS[@]}"; do echo "$r"; done
  echo "RESULT:   $FINAL"
  echo "cert.log: not hashed; it is this run's own log, still being written"
} | tee "$LOGDIR/summary.txt"
# cert.log is left out: the run's output is still being appended to it, so a
# checksum taken now could never match the finished file
# (FOUNDER-ACT-20261014-BR-KEYCHAIN-INVENTORY B3).
HASHED=()
for f in "$LOGDIR"/*.log; do
  [[ "$(basename "$f")" == cert.log ]] || HASHED+=("./$(basename "$f")")
done
( cd "$LOGDIR" && shasum -a 256 "${HASHED[@]}" summary.txt 2>/dev/null || sha256sum "${HASHED[@]}" summary.txt )
echo "logs:     $LOGDIR"
echo "===== END SUMMARY ====="
[[ "$FINAL" == PASS ]]

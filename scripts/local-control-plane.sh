#!/usr/bin/env bash
#
# Start, stop and restart a local control plane.
#
# Exists so the Phase 2 run harness can be exercised end to end without a
# deployed service — a dry run that proves the harness, the storage path and
# the restart detection all work before any of it is pointed at real
# infrastructure. `PHASE2_RESTART_COMMAND` can be set to
# `scripts/local-control-plane.sh restart`, which is what makes a local dry run
# a genuine three-condition run rather than a partial one.
#
# This is a development utility. It deploys nothing, provisions nothing, and
# is not the platform port used against Railway — there, the restart is
# performed on the platform and the harness records it as external.
#
# Requires DATABASE_URL and CONTROL_PLANE_TOKEN in the environment. Nothing
# here reads a credential from a file or writes one anywhere.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# State lives in a per-user 0700 directory, not in shared /tmp.
#
# The pidfile was `/tmp/build-room-control-plane.pid` — a predictable path in a
# world-writable directory, whose contents were passed straight to `kill`. On a
# shared machine another local user could pre-create that file, or a symlink to
# somewhere else, and choose what this script signals; a value of `-1` signals
# every process the caller may signal. Raised by CodeRabbit on PR #2.
#
# The directory is created 0700 and its mode is checked, so a pre-existing
# directory belonging to someone else is refused rather than used.
#
# The symlink check comes BEFORE the chmod, and creation is non-recursive.
# `mkdir -p` follows an existing symlink, so the first version chmodded the
# link's TARGET and only then rejected the link — meaning a local user who
# pre-created the path as a symlink could have this script change the mode of a
# directory they chose. Checking after the fact is checking too late. Raised by
# CodeRabbit on PR #2.
#
# `mkdir -m` is also avoided: with `-p` the mode applies only to the deepest
# component (ShellCheck SC2174), so a `umask` subshell around a plain `mkdir`
# is the form that actually creates the directory 0700.
STATE_DIR="${CONTROL_PLANE_STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/build-room-$(id -u)}"
if [[ -e "$STATE_DIR" || -L "$STATE_DIR" ]]; then
  if [[ -L "$STATE_DIR" || ! -d "$STATE_DIR" || ! -O "$STATE_DIR" ]]; then
    echo "state directory $STATE_DIR is a symlink, not a directory, or not owned by this user" >&2
    exit 1
  fi
else
  (umask 077; mkdir "$STATE_DIR")
fi
chmod 0700 "$STATE_DIR"

PIDFILE="${CONTROL_PLANE_PIDFILE:-$STATE_DIR/control-plane.pid}"
LOGFILE="${CONTROL_PLANE_LOGFILE:-$STATE_DIR/control-plane.log}"
LOCKFILE="$STATE_DIR/control-plane.lock"
ENTRY="$ROOT/dist/packages/control-plane/src/main.js"

# start and stop are serialized against each other, so a `restart` racing a
# concurrent `start` cannot leave two processes running or signal a pid the
# other command has already reaped and replaced.
#
# The lock is taken with a TIMEOUT, and the started server is spawned with fd 9
# CLOSED (`9>&-`). Both matter, and the second one bit: a background child
# inherits every open descriptor, so the long-lived `node` process held the
# lock file open after this script exited, and the next invocation blocked
# forever waiting for a lock nothing would ever release. Caught by smoke-testing
# the script rather than by reading it — `start` succeeded and the following
# `status` hung.
exec 9>"$LOCKFILE"
if command -v flock >/dev/null 2>&1; then
  if ! flock -w 30 9; then
    echo "another start/stop is holding $LOCKFILE after 30s" >&2
    exit 1
  fi
fi

# The pid is read through this, never used raw.
#
# Requires a positive decimal integer — which alone excludes `-1` and every
# other negative value, since a negative argument to `kill` names a process
# GROUP rather than a process. Empty, whitespace, or anything non-numeric is
# refused the same way.
read_pid() {
  local raw
  [[ -f "$PIDFILE" ]] || return 1
  raw="$(cat "$PIDFILE" 2>/dev/null || true)"
  [[ "$raw" =~ ^[1-9][0-9]*$ ]] || return 1
  printf '%s' "$raw"
}

# True when the pidfile names a live process that is THIS entry point.
#
# The pid alone is not enough: pids are reused, so a stale pidfile can name a
# process that is very much alive and has nothing to do with the control plane.
# Signalling that would be the same mistake as trusting the file's contents.
owns_entry() {
  local pid="$1" cmdline
  if [[ -r "/proc/$pid/cmdline" ]]; then
    cmdline="$(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null || true)"
  else
    cmdline="$(ps -o args= -p "$pid" 2>/dev/null || true)"
  fi
  [[ "$cmdline" == *"$ENTRY"* ]]
}

running() {
  local pid
  pid="$(read_pid)" || return 1
  kill -0 -- "$pid" 2>/dev/null && owns_entry "$pid"
}

start() {
  if running; then
    echo "control plane already running (pid $(read_pid))"
    return 0
  fi
  # A pidfile that failed the checks above is stale or hostile; either way it
  # is not something to signal, and it must not block a fresh start.
  rm -f "$PIDFILE"

  if [[ ! -f "$ENTRY" ]]; then
    echo "not built — run 'npm run build' first" >&2
    return 1
  fi

  # `9>&-` closes the inherited lock descriptor in the child. Without it the
  # server holds the lock for its whole lifetime and the next invocation of
  # this script waits on it forever.
  node "$ENTRY" >>"$LOGFILE" 2>&1 9>&- &
  local pid=$!
  # Written with a restrictive mode, in a directory only this user can enter.
  (umask 077; echo "$pid" >"$PIDFILE")
  echo "control plane started (pid $pid), logging to $LOGFILE"
}

stop() {
  local pid
  if ! pid="$(read_pid)" || ! kill -0 -- "$pid" 2>/dev/null || ! owns_entry "$pid"; then
    rm -f "$PIDFILE"
    echo "control plane not running"
    return 0
  fi

  # SIGTERM, not SIGKILL: the drained shutdown path is the one a platform
  # restart takes, so a dry run should exercise it rather than route around it.
  #
  # `--` before the pid in every `kill`, so a value that somehow reached here
  # cannot be read as an option.
  kill -TERM -- "$pid" 2>/dev/null || true

  for _ in $(seq 1 50); do
    kill -0 -- "$pid" 2>/dev/null || break
    sleep 0.1
  done

  if kill -0 -- "$pid" 2>/dev/null; then
    echo "did not exit on SIGTERM within 5s; sending SIGKILL" >&2
    # Re-checked: between the SIGTERM and here the pid could have exited and
    # been reused, and SIGKILL to the wrong process is not recoverable.
    if owns_entry "$pid"; then
      kill -KILL -- "$pid" 2>/dev/null || true
    fi
  fi

  rm -f "$PIDFILE"
  echo "control plane stopped"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart)
    stop
    start
    ;;
  status)
    if running; then echo "running (pid $(read_pid))"; else echo "not running"; fi
    ;;
  *)
    echo "usage: $0 {start|stop|restart|status}" >&2
    exit 2
    ;;
esac

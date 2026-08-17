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
# Requires DATABASE_URL in the environment. Nothing here reads a credential
# from a file or writes one anywhere.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDFILE="${CONTROL_PLANE_PIDFILE:-/tmp/build-room-control-plane.pid}"
LOGFILE="${CONTROL_PLANE_LOGFILE:-/tmp/build-room-control-plane.log}"
ENTRY="$ROOT/dist/packages/control-plane/src/main.js"

running() {
  [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null
}

start() {
  if running; then
    echo "control plane already running (pid $(cat "$PIDFILE"))"
    return 0
  fi
  if [[ ! -f "$ENTRY" ]]; then
    echo "not built — run 'npm run build' first" >&2
    return 1
  fi

  node "$ENTRY" >>"$LOGFILE" 2>&1 &
  echo $! >"$PIDFILE"
  echo "control plane started (pid $(cat "$PIDFILE")), logging to $LOGFILE"
}

stop() {
  if ! running; then
    rm -f "$PIDFILE"
    echo "control plane not running"
    return 0
  fi

  local pid
  pid="$(cat "$PIDFILE")"

  # SIGTERM, not SIGKILL: the drained shutdown path is the one a platform
  # restart takes, so a dry run should exercise it rather than route around it.
  kill -TERM "$pid" 2>/dev/null || true

  for _ in $(seq 1 50); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.1
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo "did not exit on SIGTERM within 5s; sending SIGKILL" >&2
    kill -KILL "$pid" 2>/dev/null || true
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
    if running; then echo "running (pid $(cat "$PIDFILE"))"; else echo "not running"; fi
    ;;
  *)
    echo "usage: $0 {start|stop|restart|status}" >&2
    exit 2
    ;;
esac

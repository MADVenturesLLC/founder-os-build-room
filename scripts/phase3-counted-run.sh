#!/usr/bin/env bash
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
cd "$repo"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$node_major" != "22" ]]; then
  echo "phase3:counted-run requires Node 22.x" >&2
  exit 1
fi

before="$(git rev-parse HEAD)"
if [[ -n "$(git status --porcelain=v1 --untracked-files=all --ignore-submodules=none)" ]]; then
  echo "phase3:counted-run requires a clean Build Room checkout" >&2
  exit 1
fi

npm run build

after="$(git rev-parse HEAD)"
if [[ "$before" != "$after" ]] ||
   [[ -n "$(git status --porcelain=v1 --untracked-files=all --ignore-submodules=none)" ]]; then
  echo "phase3:counted-run checkout changed during the build" >&2
  exit 1
fi

export PHASE3_BUILD_VERIFIED_SHA="$after"
exec node dist/packages/run-harness/src/phase3/cli.js

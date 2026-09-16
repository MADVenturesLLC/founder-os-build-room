# HANDOFF — Lane 2: checkpoint writer v0 (`build/checkpoint-writer-v0`)

Commission: FOUNDER ACT — "MiMo→MAD Long-Horizon Core v0" (2026-09-15),
Lane 2. Unbounded logical sessions via cycles: EARLY structured checkpoints
written by an INDEPENDENT writer seat; rebuild injects budgeted state — not
"summarize at 95%". Authorized: implement + commit + push on
`build/checkpoint-writer-v0` only. NOT authorized and NOT claimed: merge,
PR creation, production/live occupancy, live daemon session rebuild,
Dream/Distill self-modification, hook installation on daemon boot/dispatch.

## Identity

| field | value |
|---|---|
| Repository | `MADVenturesLLC/founder-os-build-room` |
| Branch | `build/checkpoint-writer-v0` |
| Base pin (`origin/main` at act start) | `1f8328cce68a35e2b5014693d8138380b9e54734` |
| Head SHA | the commit that adds this file (branch head; reported in the session handoff) |
| Package | `packages/checkpoint-writer` |
| Actor | `session:kimi-code/mimo-evolve-v0-lane2`, surface `kimi-code-cli`, role `builder` |

## Changed paths

- `packages/checkpoint-writer/src/schema.ts` (ADD) — `checkpoint/v1` IR
- `packages/checkpoint-writer/src/triggers.ts` (ADD) — threshold policy
- `packages/checkpoint-writer/src/notes.ts` (ADD) — worker notes scratch
- `packages/checkpoint-writer/src/store.ts` (ADD) — single-writer lock + atomic persistence
- `packages/checkpoint-writer/src/writer.ts` (ADD) — independent writer seat
- `packages/checkpoint-writer/src/assemble.ts` (ADD) — rebuild assembler
- `packages/checkpoint-writer/src/index.ts` (ADD) — package entry
- `packages/checkpoint-writer/README.md` (ADD)
- `test/checkpoint-writer.test.ts` (ADD)
- `tsconfig.json` (MODIFY — one include entry)
- `docs/planning/mimo-evolve-v0/HANDOFF-checkpoint-writer.md` (ADD — this file)

Not changed: any existing package source, `package.json`,
`package-lock.json` (see Open items), `contracts/**`,
`packages/seat-registry/**` (read for vocabulary alignment only), CI.

Paths named in this file that do not exist at the base: everything under
`packages/checkpoint-writer/`, the test file, and this directory.

## What was built (scope → where)

- **Checkpoint IR `checkpoint/v1`** → `schema.ts`. The act's eleven fixed
  fields plus a minimal envelope (`checkpoint_id`, `session_id`, `seq`,
  `created_at_ms`, `trigger_pct`). Hand-rolled validation, no dependency:
  unknown field (top level or nested), wrong type, missing field, or wrong
  `version` is a `CheckpointSchemaError`. Canonical encoding (fixed key
  order, 2-space, trailing LF) re-validates before serializing, so bytes
  the parser would reject can never be produced.
- **Trigger policy** → `triggers.ts`. Defaults per the act: incremental
  writer at 0.20 / 0.45 / 0.70 of the configured context budget; rebuild
  armed at 0.90. Configurable; each threshold fires once per cycle; a jump
  across thresholds reports every crossing in ascending order; `reset()`
  starts a new cycle.
- **Main-worker write channel** → `notes.ts`. Append-only JSONL scratch
  (the MiMo notes.md pattern, MAD-shaped). Multi-line or empty appends
  reject; a corrupt line fails closed on read. Mutations serialize on an
  exclusive `wx` lock file. `clearThrough(maxSeq)` clears exactly the read
  prefix — a note appended WHILE the writer seat is still running survives
  the clear (tested).
- **Independent writer seat** → `writer.ts`. The seat is an injected
  function (`WriterSeatModel`); the package never contacts a provider. The
  seat has its own identity and its own token budget in the API surface
  (`writer_seat_id`, `writer_budget_tokens` on every request) — it is never
  a carve-out of the main worker's budget. Vocabulary alignment:
  `checkpoint-writer` is a PACKAGE-LOCAL identity, documented as NOT one of
  the four Seat Registry V1 seats (`packages/seat-registry/src/vocabulary.ts`,
  unmodified). Promotion protocol: read scratch → seat returns the eleven
  fields → strict-validate → persist durably → only then clear the read
  prefix. A throwing seat or a schema reject writes nothing, leaks no lock,
  and leaves the scratch intact (all tested).
- **SINGLE-WRITER, code-enforced** → `store.ts`. Every checkpoint file is
  written under an exclusive lock (`openSync(path, 'wx')`); a second writer
  for the same file gets `SingleWriterError` naming the recorded owner —
  never a merge, never a silent wait. Write is temp-file + atomic rename;
  the persisted bytes are then re-read and must hash to the recorded
  sha256 or the commit throws. v0 never breaks a stale lock itself — that
  is an operator act, not a library decision.
- **Rebuild injection assembler** → `assemble.ts`. Fixed section order:
  task_tree → latest checkpoint → verbatim recent user/Founder directives →
  provenance-tagged project memory → notes → on-demand path index →
  next-action reminder. HARD per-section token budgets (no borrowing);
  token counting is the documented `ceil(chars/4)` heuristic
  (`estimateTokens`) — never represented as an exact count. Over-budget
  policy is explicit and deterministic: whole-line truncation with a
  `kept K of L` marker; whole-field drops for the checkpoint section with
  dropped fields named; whole verbatim directives, most recent kept,
  earlier ones counted in a marker, one marked hard-clip exception for a
  single oversized directive; a section that cannot fit even its heading
  emits `[section omitted: <name> — over budget]` or nothing. Total ≤
  budget is structural (sum of caps ≤ total) and then asserted —
  `AssemblerBudgetError` instead of ever returning an over-budget prompt.
- **Persistence + hashes** → checkpoint files under
  `<dir>/<session_id>/checkpoint-<seq>.json`, each carrying a verified
  sha256 (scope item 7). Reference anchor, reproducible from
  `dist/packages/checkpoint-writer/src/index.js`: the canonical encoding of
  the fixed reference checkpoint (`checkpoint_id: reference-cp1`,
  `created_at_ms: 1758000000000`) is 1381 bytes and hashes to sha256
  `a5b8808afaefc6fcf7509b479064fed97b260d35ddc36bf3233a728948d886af`,
  round-tripping through the parser unchanged.

## Test evidence

Focused:

```
npm run build && node --test dist/test/checkpoint-writer.test.js
# tests 40 · pass 40 · fail 0
```

Success criteria → tests: 20/45/70 threshold triggers ("fires 20/45/70
exactly once each, never early" + jump coalescing + rebuild arming);
single-writer invariant ("a second writer for the same checkpoint file
fails closed and names the owner"); schema reject (13 strict-reject cases
incl. unknown nested key and envelope-key injection by the seat);
per-section budget caps ("every section is hard-capped at its own budget;
truncation is marked" + directive selection + omission + budget-overrun
fail-closed); rebuild field presence (all eleven `### field` headings in
section-order test and in the dogfood); hash evidence ("recorded hash is
the hash of the persisted bytes"); promote/clear ordering incl. a note
appended mid-seat-flight surviving the clear. Dogfood fixture: a synthetic
60-turn transcript fires exactly [20, 45, 70], the seat runs 3 times on its
own budget, all three checkpoints hash-verify, and the 90% rebuild lands
under budget carrying every required field and the post-70% scratch.

Full suite on this branch (`npm test`, credential-free; storage cases
self-skip as on `main`):

```
# tests 1020 · suites 361 · pass 1017 · fail 3
# = 980 pre-existing + 40 Lane 2 tests
```

The 3 failures are `gateway-daemon-lifecycle` (daemon boots + 2 clean
shutdowns) and are ENVIRONMENTAL, unrelated to this lane's diff: the test
binds a unix socket under `mkdtemp(tmpdir())` and this Mac's default
`TMPDIR` (`/var/folders/x7/q4cptd9d25l_jjks9ms4j5000000gn/T/`) pushes the
socket path past the 104-char `sun_path` limit → `listen EINVAL`. Proof:
`TMPDIR=/tmp node --test dist/test/*.test.js` on this branch →

```
# tests 1020 · suites 361 · pass 1020 · fail 0
```

Gates run locally on the branch head:

```
npm run gate:path-audit            PASS — every audited path reference resolves
npm run gate:attribution-selftest  PASS
attribution-shape-check.sh pr origin/main HEAD build/checkpoint-writer-v0
                                   PASS (every commit in the range, shape-only)
npm run gate:verify-check          PASS — 3 passed, 0 failed, 0 unverified
npm run gate:secret-scan           PASS — gitleaks 8.30.1, no leaks found
npm run lint                       32 errors, all pre-existing in 16 files;
                                   0 findings in this lane's files
npm run gate:integrity             NOT RUN — scans the authorizing contract
                                   document, which lives outside this repo
                                   (ci.yml: deliberately not a CI step;
                                   runs pre-PR with a contract path). There
                                   is no PR in this lane's authorization.
```

## Evolved from MiMo vs invented

**No MiMo or OpenCode source was available locally, and none was read or
vendored.** The semantics follow the Founder Act's description of MiMo's
early-checkpoint mechanism: EARLY checkpoints at ~20% / 45% / 70% of
context budget (not summarization at 95%), an INDEPENDENT writer, the main
worker's notes.md-style append-only scratch with writer-side
promotion/clearing at checkpoint time, and budgeted rebuild injection.

MAD-invented v0 (all of it, since nothing was vendored): the `checkpoint/v1`
IR shapes, key order, and strict reject rules; the JSONL scratch byte
format; the single-writer lock protocol (`wx` lock + temp/rename + re-read
hash verification, `SingleWriterError` naming the owner); the
prefix-preserving `clearThrough` promotion protocol; the assembler's
section set, default shares (15/30/20/10/10/5/10), and
truncation/omission marker policy; the `ceil(chars/4)` token heuristic;
the package-local `checkpoint-writer` seat identity (explicitly not a Seat
Registry V1 seat).

## Blast radius

Library-only. Zero edits to existing source. One include line in
`tsconfig.json`. Nothing consumes the package except
`test/checkpoint-writer.test.ts`; no daemon boot, dispatch, hook, or
session path imports it. No provider contact, no network, no credentials;
filesystem use is confined to caller-supplied directories (tests use
`mkdtemp` under `os.tmpdir()`).

## Open items / decisions

- **No `package.json`, no lockfile registration (deviation from the act's
  package-shape instruction, recorded not decided).** The act asked for a
  `package.json` in the journal shape and an `npm install`-registered
  lockfile entry, citing `build/spend-broker-v0` as the expected lockfile
  shape. Repo reality: `test/room-runtime-phase1-acceptance-gateway.test.ts`
  T18 sha256-pins `package-lock.json` (`82a2ff7c…c38`), so ANY lockfile
  change fails the acceptance suite unless the pin is updated — and the pin
  comment states a pin update rides with a "later, separately authorized
  change", which this lane's authorization does not name. Conversely,
  keeping `package.json` while reverting the lockfile fails `npm ci`
  (`Missing: @build-room/checkpoint-writer@0.0.0 from lock file`, verified
  locally), breaking CI's first step at any future PR. The act's own cited
  example, `build/spend-broker-v0`, carries a package.json but ZERO
  lockfile delta; `seat-registry`, `quarantine-advisor`, `redaction`,
  `seat-output-schema`, and `worker-supervisor` carry no package.json at
  all. Resolution taken: follow the seat-registry pattern (tsconfig-include
  package, no package.json, lockfile byte-identical — T18's pin verified
  intact). If the Founder wants a registered workspace, the single next
  decision is to authorize the T18 pin update alongside the lockfile
  registration; the intended content is on record here —
  `{"name":"@build-room/checkpoint-writer","private":true,"version":"0.0.0","type":"module","main":"src/index.ts","types":"src/index.ts","license":"UNLICENSED"}`,
  zero runtime dependencies.
- **No `packages/build-memory`** exists at the base (confirmed); the act
  allowed reading build-memory APIs if present. Nothing was invented in its
  place; the assembler's `project_memory` section takes provenance-tagged
  excerpts from the caller.
- **The writer seat's budget separation is modeled, not metered.** The
  package carries `writer_budget_tokens` on every seat request so a host can
  route/meter the seat independently; it performs no provider execution and
  no billing enforcement (there is no provider access in this lane).
- **Stale lock protocol:** a crashed writer leaves `<checkpoint>.lock`;
  v0 fails closed forever rather than self-healing. An operator deletes the
  lock file deliberately. A future lane may add recorded stale-lock
  recovery.
- Merge remains a separate Founder act naming the exact head SHA.

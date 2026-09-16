# HANDOFF — Lane B wiring: the redaction boundary under the run-harness writers (v0)

Commission: FOUNDER ACT — Commission Lane B wiring, 2026-09-14 (issued in
session with the two fills below), on the OMP→MAD Evolve Pack v0 Lane B
package merged at `6ef7d120626163a48f0bc22ac3efbf4904256fb0` (PR #34).

Paths named in this file that do not exist at the base
(`6ef7d12`): `packages/run-harness/src/redaction-boundary.ts`,
`packages/run-harness/src/phase3/redacted-evidence.ts`,
`test/run-harness-redaction-wiring.test.ts`, and this file.

## Identity

- Branch: `build/secret-boundary-wiring-v0`
- Base pin: `6ef7d120626163a48f0bc22ac3efbf4904256fb0` (origin/main, Lane B merge)
- Implementation commit: `900bccfaa046d03b45b5b8bd8aa9bb5357b3e773`
- Head (this handoff): named in the PR body
- Role-Id `builder`; Actor-Id `session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp`;
  Execution-Surface `claude-code`

## Founder fills, as received (2026-09-14)

- **Host placement:** darwin gateway host; both the Phase 2 and Phase 3
  harnesses are operator-invoked there. Ubuntu CI and Railway are
  refusal-only in v1; no key is provisioned there. (No workflow in
  `.github/workflows/` runs either harness — verified by grep at the base.)
- **Rotation ruling:** (a) — key rotation is a recorded custody act;
  evidence written under different keys is not byte-comparable, and
  decision records cite the key fingerprint in prose. No evidence-shape
  change in v1.

## Act corrections accepted before implementation

An external review of the draft act (relayed by the Founder before "issue
the act") raised seven points. Each was checked against the code at the
base before being taken:

1. Fills blank — already answered by the Founder; recorded above.
2. **Taken.** `CONTROL_PLANE_TOKEN` matches the `TOKEN` heuristic, so a
   heuristic load followed by a manifest load registered it twice; the
   second is a `duplicate_name` refusal, and the boundary would then refuse
   every write. Manifest names are now excluded from the heuristic scan.
3. **Taken, with one change.** A refusal exits with one line,
   `redaction refused: <code>`, before any collaborator exists. The exit
   code is **3**, not the draft's 2: the Phase 3 harness already returns 2
   for `awaiting_adjudication`. Post-boundary errors leave through the
   boundary's redacting error path; pre-boundary configuration errors carry
   variable names only and keep their exit 1.
4. **Taken.** Narrow injection seams: `keyCustody`, `streams`,
   `writeBundle`, `deps` (Phase 2); `keyCustody`, `streams`,
   `reserveEvidenceFile`, `clients`, `buildRoomPath` (Phase 3); a `write`
   parameter on the Phase 3 evidence wrapper. Fixture custody is constructed
   only by tests.
5. **Taken.** Every environment value is trimmed before registration, so
   the registry holds exactly the token the client sends.
6. **Taken.** Boundary wording: "NO PHASE 2 AUTHORIZATION, ACTIVATION, OR
   GOVERNANCE CLAIM. T6 is fixture-only writer acceptance, not a counted
   Phase 2 run."
7. **Taken.** The key fingerprint is the first 8 hex of SHA-256 over the
   decoded 32 raw key bytes, not the 64-character hex string:
   `security find-generic-password -a hmac-v1 -s mad.redaction.hmac -w | xxd -r -p | shasum -a 256 | cut -c1-8`.

One ordering decision beyond the review: the Phase 3 loader opens the
boundary **after** its pure validation (plan read and checks, path
containment) and **before** its first side effect (evidence directory,
reservation), rather than before the plan is read. A keyless host still
learns about a broken plan; nothing is created or reserved on refusal. The
test pins both halves.

## Changed paths

- `packages/run-harness/src/redaction-boundary.ts` — new: manifest,
  heuristic scan with manifest names ignored, value trimming, custody by
  platform (Keychain on darwin; refusal elsewhere), refusal line, exit code,
  redacted stream helpers. Imports nothing from `packages/gateway-daemon`.
- `packages/run-harness/src/cli.ts` — Phase 2: environment passed in;
  boundary opened after configuration and before any collaborator; bundle
  written through `EvidenceBundleWriter`; stdout, runner log, and errors
  through the boundary; refusal → exit 3.
- `packages/run-harness/src/phase3/cli-config.ts` — boundary opened before
  the evidence directory and the reservation; `redaction` carried in the
  config; reservation injectable.
- `packages/run-harness/src/phase3/cli.ts` — refusal → exit 3 before any
  client; clients constructed by an injectable factory; evidence written
  through the redacting wrapper; stdout and stderr through the boundary.
- `packages/run-harness/src/phase3/redacted-evidence.ts` — new: redact the
  evidence tree, then the untouched `writePhase3Evidence`.
- `packages/redaction/README.md` — "Not wired" section replaced by the wired
  state. `packages/redaction/src/**` is unchanged and hash-pinned by test.
- `test/run-harness-redaction-wiring.test.ts` — new, 14 tests (T1–T4).
- `test/phase3-cli-config.test.ts` — the three tests that reach the
  reservation now pass fixture custody; the rest are unchanged.
- This file.

Not changed: `package.json`, `package-lock.json` (byte-identical; AE-01 T18
pin holds), `tsconfig.json`, anything under `packages/gateway-daemon/`,
anything under `packages/redaction/src/`.

## Test evidence

- `node --test dist/test/run-harness-redaction-wiring.test.js` — 14/14
- `node --test dist/test/phase3-cli-config.test.js` — 11/11 (unchanged count)
- full suite at the implementation commit: 978 PASS / 0 FAIL
- eslint on every changed `.ts`: clean; `git diff --check`: clean;
  `scripts/path-audit.sh`: PASS; `scripts/attribution-shape-check.sh`: PASS
  on each commit; gitleaks scoped to this branch's commits: no leaks found (gitleaks 8.30.1, base..HEAD)

Mapping to the act's tests:

- **T1** — Phase 2 with the fixture token (surrounded by whitespace) in the
  environment and deliberately placed in `PHASE2_ENVIRONMENT`: the bundle
  file contains the token 0 times and `[REDACTED:CONTROL_PLANE_TOKEN:`;
  stdout contains no token; the client received the trimmed token.
- **T2** — `UnavailableHmacKeyCustody` → exit 3, stderr exactly
  `redaction refused: key_unavailable\n`, no evidence directory, zero
  collaborators, zero writes; `key_absent` and `registry_unloadable`
  likewise; stderr never carries the value.
- **T3** — Phase 3 loader on a valid plan: refusal after validation, zero
  reservations, no evidence directory; the same environment with a broken
  plan reports the plan. `main` with a refused boundary: exit 3, one line,
  zero reservations, zero client constructions. Ready path: the writer
  receives an already-redacted tree (both occurrences replaced); under a
  refused boundary the writer is never called; the real write path
  (reservation, closed shape, read-back) produces bytes identical to
  `serializePhase3Evidence`.
- **T4** — the factory and the evidence wrapper import nothing from the
  daemon (import specifiers checked, not prose); the five files under
  `packages/redaction/src/` match their SHA-256 at `6ef7d12`; none reads
  the process environment.
- **T5** — full suite and lockfile, above.
- **T6** — darwin acceptance with the real Keychain item: **performed by
  the Founder on `MikeMacBook.local`, 2026-09-14T10:40:34Z**, from a
  worktree of `main` at `61f4bc4` (the wiring merge). Fixture-only writer
  acceptance, not a counted Phase 2 run: `CONTROL_PLANE_URL` pointed at a
  closed local port, a throwaway `fixture-<random>` value as
  `CONTROL_PLANE_TOKEN` and inside `PHASE2_ENVIRONMENT`, one attempt,
  1 ms windows. Observed: the boundary opened under the real Keychain item
  (no refusal line); exit 1 (gate unsatisfied, as expected with no control
  plane); one evidence file written; `grep -c` of the fixture value in the
  file = 0; `grep -c 'REDACTED:CONTROL_PLANE_TOKEN'` = 1; the stdout
  summary printed the environment already redacted. Pasted into the
  session by the Founder; recorded here from that paste.

## Fail-closed contract, as built

- No key, unloadable registry, or unwired mode → exit 3, one line naming
  the code, no run, no request, no reservation, no file.
- An inner writer failure surfaces as the package's `SinkWriteError`
  through the redacting error path; exit 1.
- No flag, variable, or config field turns the boundary off. Fixture
  custody has no production constructor path: the CLIs' entrypoints pass no
  options.

## Evolved from Lane B vs invented here

- Evolved: everything the package already defined — registry, manifest,
  sinks, custody, refusal codes, token format. The wiring adds no
  redaction semantics.
- Invented here: manifest-name exclusion from the heuristic scan; value
  trimming; platform custody choice; exit 3 and the single refusal line;
  the Phase 3 "validate, then open, then reserve" ordering; the redacted
  stream helper (`HarnessLogSink` v0 has no plain-text stderr path, so
  plain stderr text goes through the boundary's redactor directly — a
  package v0 gap to close in a later package revision, not in this lane,
  since the package is pinned).

## Observations for the Founder

- Every valid Phase 3 evidence shape is closed and regex-bound; no field
  admits free text, so a secret could not survive the shape check there.
  The boundary is applied anyway — the write path is the named control,
  and the two are independent.
- The Phase 2 harness gate wants three consecutive passes; a one-run
  invocation exits 1 with the bundle written. Unchanged behaviour, noted
  because the first version of T1 tripped on it.

## F1 — custody record

- Act: `security add-generic-password -a hmac-v1 -s mad.redaction.hmac -w "$(openssl rand -hex 32)"`,
  performed by the Founder (`Actor-Id: founder`) on `MikeMacBook.local`,
  reported in session on 2026-09-14 shortly before 10:40Z; the exact mint
  timestamp was not captured. The T6 run at 10:40:34Z is the live check
  that the item existed and decoded to a 32-byte key at that time.
- Key fingerprint (first 8 hex of SHA-256 over the decoded 32 raw bytes,
  per correction 7): `db68febb`. Cite this fingerprint in prose in any
  decision record that hashes evidence written under this key (rotation
  ruling (a)).
- The value was never printed, copied, or seen by the agent; only the
  fingerprint was reported.

## Open items

- ~~F1 and T6~~ — done, above.
- ~~A package revision adding a plain-text stderr path to `HarnessLogSink`~~ —
  done, landed on `main` as `57690fb` (`sinks.ts` gains `err(text)`, redacting
  plain text to the err stream under the same `guarded` boundary as `log`), with
  its own handoff at `HANDOFF-redaction-v0.1-stderr-path.md`.
- Journal sink: parked, but **not on the dependency an earlier revision of this
  line named**. That revision said "the command-journal write path (PR2b
  Tranche D)". Tranche D is the *application runtime cutover* — a Railway
  `DATABASE_URL` variable swap and a variable audit, of which the plan says
  "Database objects affected by D: none created"
  (`docs/planning/command-journal/pr2b-implementation-plan-r1.md` §4.4). It is
  not the write path and never was.

  The write path is **Tranche B**, and its code has **merged**: PR #54, on
  `main` at `ddbcbb3fe5f71367fd39ce264cc4c52d138d23f9`, adds migration
  `0006_command_journal_authority_split` with
  `CREATE FUNCTION public.command_journal_append(…) SECURITY DEFINER` owned by
  `command_journal_writer`, the append-only triggers
  `command_journal_events_append_only` and
  `command_journal_chain_head_append_only`, and the B-T2 atomicity proofs in
  `test/journal-append-atomicity.storage.test.ts` (repo-root `test/`, where
  this repository keeps its suites).

  Line numbers are given **as of `ddbcbb3`** and only alongside the symbol
  names, because `migrations.ts` only ever grows and a bare line number goes
  stale on the next migration: `migrations.ts:1371` (the migration id),
  `:1464` (the `CREATE FUNCTION`), `:1449` and `:1452` (the two triggers).
  Grep the symbols if the numbers have drifted.

  **`packages/journal` still exports no append/write/insert, and that is now
  expected rather than pending.** The append is a `SECURITY DEFINER` Postgres
  routine the runtime invokes, not a TypeScript function, so the record model
  was never going to grow one. Its own note —
  `packages/journal/src/envelope.ts`: "Redaction enforcement belongs to the
  write path (2b and later)" — still holds; the write path simply lives in
  SQL.

  What the sink is actually waiting on, both parts:
  1. **Execution authority.** Tranche B's *code* has landed; its *execution* —
     running 0006 against the real database — requires Gate III and, per the
     plan's hard edge "C before B executes", the Tranche C administrative
     migration plane. **As of `f701c2c` (re-verified 2026-09-16), neither has
     happened in this repository:** Tranche C appears only in planning prose,
     with no code under `packages/`. Dated deliberately, and re-dated on
     purpose: this is the one sentence here that can become false with nobody
     editing the file, so the date is the claim's whole warranty.

     Scope of that check, stated so it is not read as more than it is: it is a
     **repository** check, not a live-database one. Whether 0006 has been
     executed against the real instance is not decidable from this tree, and
     `DEC-20260801-02` bar 4 (FounderOS
     `07-decisions/DEC-20260801-02-founder-authorization-handoff-readiness.md`)
     forbids asserting a live-state negative without a named live check.
     **No such check is recorded in this handoff** — a statement about this
     document, not about the world. Saying "nobody has run one" would itself
     be the live-state negative the bar forbids, so it is not said. That is
     why this reads "in this repository" rather than "in production".
  2. **A runtime caller — and this, not the SQL, is the sink's actual scope.**
     The append is SQL, but `envelope.ts` assigns *redaction enforcement* to
     the write path, and enforcement has to run in TypeScript before the SQL
     call is made. So the sink attaches to the code that invokes
     `command_journal_append`, not to the routine itself. **No such caller
     exists.** At `f701c2c`, stated as narrowly as the evidence supports:
     `packages/journal` has **zero runtime importers** — its only `import`
     statements come from `test/`. An earlier revision said it was "imported by
     `migrations.ts` and tests only"; that was wrong, and wrong because the
     check was. `migrations.ts` imports only `type { Pool, PoolClient } from
     'pg'`; every "journal" occurrence in it is prose or SQL text, and a
     content grep counted those as imports. The same correction applies to
     `command_journal_append`: outside `test/` it appears only inside
     `migrations.ts` comments and SQL strings, never as a call.

     **The attach point is NAMED in the plan — in an addendum, as a proposal
     awaiting review.** This sentence has now been wrong three times, in three
     different directions, and the reason was the same every time: it was
     reasoned about instead of looked up. The record, so the pattern is
     visible rather than quietly overwritten:

     - Revision 1 said the attach point "is not recorded anywhere." Wrong.
     - Revision 2 said it was "DETERMINED" by the plan's grant. Wrong
       reasoning — a `GRANT` binds a database role, not a package — and wrong
       conclusion-by-luck.
     - Revision 3 said it was "derivable from the plan, though not named in
       it." Still wrong: it *is* named.

     The root cause was reading `pr2b-implementation-plan-r1.md` and stopping.
     `docs/planning/command-journal/` holds sixteen documents; the answer is in
     `pr2b-implementation-plan-r1-addendum-02-r6.md`, row **B-N2**:

     > `packages/control-plane/src/journal-append.ts` —
     > `appendJournalRecord(client, boundary, record)`: (1) `boundary.require()`,
     > refused → throw before any SQL of its own; (2) `redactValue(record)`;
     > (3) build the closed-key `p_fields` … (4) `EXECUTE
     > public.command_journal_append(...)` on the caller's `client`; (5) return
     > `seq`, `recorded_at`, `envelope_digest`, `chain_hash`. Encodes nothing;
     > imports nothing from `packages/journal` except types. **Dormant on
     > merge: nothing calls it**

     That also answers what an earlier revision called the remaining "open
     design question" about how control-plane obtains redaction: it does not
     take a dependency. The boundary is a **parameter**, and enforcement is
     `boundary.require()` before any SQL. The question was not open; it was
     unread.

     **Three qualifications, none of which the above cancels.**

     1. **That addendum is advisory, not ratified.** Its own header:
        "PROPOSED SCOPE ADDITIONS FOR `br-architect` REVIEW. NO IMPLEMENTATION
        AUTHORITY IS CREATED, IMPLIED, OR CARRIED BY THIS ARTIFACT." Next role
        is `br-architect` review. So B-N2 is a named proposal, not a settled
        specification, and `r1` itself still does not name a package.
     2. **B-N2 has not landed.** At `f701c2c`,
        `packages/control-plane/src/journal-append.ts` is absent, as is its
        test `test/journal-redaction.storage.test.ts` (B-T4).
     3. **B-N2 landing would not, by itself, unblock the sink.** It is
        "dormant on merge: nothing calls it" by design. The sink needs a
        *caller of B-N2*, and no plan row assigns one — that, and not the file
        location, is the genuinely unassigned piece.

- Merge is a separate exact-SHA Founder act; this file asserts none.

Attribution: Role-Id builder; Actor-Id
session:claude-code/session_01KbHPzSthh2gKc8TtsG4QRp; Execution-Surface
claude-code.

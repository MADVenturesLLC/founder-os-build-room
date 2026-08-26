# Phase 3 Counted-Run Harness

Implementation authority: Founder commission v2, rebound to FounderOS
`main@9e87ba2b3cf632d892207b29211727bdf89c87d7`, with Build Room base
`5df7bd222a99e49c5f5a8ea449ffa2ef28a14de4`.

This harness records a future `Phase3-CR1`, `Phase3-CR2`, or `Phase3-CR3`
attempt. Building and testing it authorizes no live attempt. Every run still
requires its own Founder entry authorization.

## Safety boundary

The command is fail-closed and does not mint, enroll, confirm, deny, revoke,
repair custody, remove a staging lock, start the daemon, deploy, or merge. It
reads the existing doctor surface, exact Git identities, the token-guarded
enrollment projection, and the control-plane build identity. A mismatch records
`not_started` when the approved evidence surface remains reachable.

The plan is nonsecret JSON. Credentials belong only in environment variables;
they are never valid plan fields or evidence keys.

## Required environment

```text
CONTROL_PLANE_URL       HTTPS control plane, or HTTP loopback for tests
CONTROL_PLANE_TOKEN     token for the guarded Phase 3 evidence routes
PHASE3_PLAN_PATH        absolute path to the nonsecret JSON plan
PHASE3_EVIDENCE_PATH    absolute private directory outside FounderOS, Build Room, and fixture repositories
```

Run under the repository-required Node `22.x` after `npm ci` and
`npm run build`:

```text
npm run phase3:counted-run
```

The supported launcher requires a clean exact checkout, rebuilds from source,
rechecks SHA and cleanliness, and passes the verified SHA to the CLI. Directly
invoking the compiled JavaScript without that marker is refused.

Before any control-plane request, configuration creates a private `0700`
evidence directory outside all three governed repositories and exclusively
reserves the exact `0600` output file. The writer retains that file handle and
refuses a directory, symlink, inode or filename replacement.

Exit `2` means the technical lifecycle reached `awaiting_adjudication`; it is
not a pass. Exit `1` means `not_started`, `failed`, `interrupted`, or a bounded
configuration/evidence failure. An unresolved write is exported honestly as
`unresolved_commit`; it requires operator review and never becomes a local
failure claim. Failures before any durable attempt use the distinct
`build-room/phase3-local-failure@1` schema. No outcome authorizes anything.

## Plan shape

The plan binds a unique UUID `runAttemptId`, counted-run label, Founder entry
authorization identifier, exact FounderOS repository/root/SHA, exact Build Room
SHA, the sole enrolled gateway, the exact control-plane origin, the complete
expected enrollment projection (terminal history may be present), fixture
repository/path/SHA, environment, machine label, and heartbeat freshness window.
`Phase3-CR3` additionally requires a separate revocation and re-enrollment
authorization identifier.

FounderOS, Build Room, and the fixture are each verified as the exact repository
root with the expected credential-free GitHub origin, clean worktree, commit,
and tree before attempt mutation. A FounderOS mismatch records
`founder_os_invalid`; it cannot be satisfied by a syntactically valid SHA in the
plan.

Attempt creation rereads the complete enrollment projection under the registry
advisory lock. The exact canonical projection digest is retained with the
attempt, so an extra or missing row between local observation and durable start
refuses the run.

The control plane also requires the requested Build Room SHA and retained
control-plane environment to match the process that is accepting the attempt;
a caller cannot make a self-consistent request for a different deployment.

The machine label is exact and locally derived as
`hostname+macOS:product-version+architecture`; a plan for a different host is
`not_started`.

Authorization identifiers are retained attestations. This repository has no
cryptographic Founder-authorization registry, so an identifier never proves its
own authority.

## Fixture contract

The governed fixture repository must have a credential-free GitHub origin that
matches the plan's exact `owner/repo` identity, be clean at its exact commit,
and carry one root `phase3-stub.json` with the strict shape shown in
`test/fixtures/phase3-stub.json`. The harness reads that JSON as data and never
executes fixture code, hooks, package scripts, or network operations.

The fixture JSON is read from the verified Git commit blob, never from the
mutable worktree after verification. The deterministic adapter records exactly:

```text
connect → adapter_registered → request → matched_response → disconnect
```

Git commit, tree and cleanliness are checked before and after the lifecycle.
Missing, duplicate, mismatched or out-of-order evidence fails the attempt;
post-start Git drift interrupts it.

## Heartbeat evidence

Only the first accepted heartbeat for one active attempt is captured. The
control plane rebuilds canonical signed bytes, verifies Ed25519 against the
registry-resolved public key, verifies freshness and session acceptance, then
writes the evidence inside the existing fenced heartbeat transaction. Normal
ten-second heartbeats create no Phase 3 rows when no attempt is active.

The export retains canonical bytes, signature, public key, key ID, sequence,
signed timestamp, acceptance timestamp, window and verification result. It does
not retain headers, source IP, transport bodies, tokens, private keys or
unrestricted payloads.

Before advancing, the harness independently rebuilds the canonical heartbeat,
binds its gateway, key, sequence and timestamp, derives the key ID, repeats
Ed25519 verification and recomputes freshness. The control-plane assertion by
itself cannot pass this gate. If the export shape or expected attempt identity is
untrusted, the runner emits fixed local unresolved evidence and performs no
follow-up evidence write.

## Storage and adjudication

Migration `0005_phase3_run_evidence` adds a retained attempt projection and a
separate append-only event log. It does not edit migrations `0001`–`0004` or
widen the six-event `gateway_registry_events` vocabulary.

The append-only entry event retains the complete bounded, redacted entry
observation and its canonical SHA-256 digest. The export includes both the
preimage and its timestamp so Tier 2 can recompute the digest independently.
Database triggers lock the attempt row, reject invalid event progression at
insert time, and defer a projection-consistency check until commit so an event
cannot persist without its matching projection update.

The control plane derives the next allowed label from durable attempt history
inside the same advisory-lock transaction that creates the attempt. A
`not_started` attempt holds its current label, `failed` or `interrupted` resets
the sequence to `Phase3-CR1`, pending adjudication blocks the next attempt, and
`Phase3-CR3` is admitted only after durable passed CR1 and CR2 attempts.

Ambiguous POST outcomes are reconciled by repeating the same attempt UUID or
event idempotency key and reading the immutable export. A proven committed
finalization continues normally; a write that cannot be resolved returns
`unresolved_commit` with server evidence and no contradictory local verdict.
If the export is also unavailable, the fixed
`build-room/phase3-local-unresolved@1` record states only that remote state is
unknown. When the client has a safe closed classification for the ambiguous
write, it emits `build-room/phase3-local-unresolved@2` instead. The additive
`diagnostic` object contains only an operation stage and failure class from
closed allowlists. Raw exceptions, request data, headers, URLs, credentials,
addresses, and stack traces are never retained. Existing `@1` evidence remains
valid and unchanged. Diagnostic precedence is deterministic: the ambiguous
mutation diagnostic wins when present; otherwise the reconciliation or
recovery-export diagnostic is retained.
Heartbeat identity, proof, signature, and freshness trust stops use the closed
`evidence_export` or `heartbeat_verify` diagnostic stages while preserving the
same zero-follow-up-write behavior.

The operator can end only at `awaiting_adjudication`, `failed`, `interrupted` or
`not_started`. A passing counted run still requires independent Tier 2 evidence
verification and separate Founder confirmation. The ordinary lifecycle route
cannot submit `heartbeat_verified` or `passed`. The Founder-only adjudication
route uses `PHASE3_ADJUDICATION_TOKEN`, which must be distinct from
`CONTROL_PLANE_TOKEN` and is never read by the counted-run harness. When the
credential is unset, the route is absent. The harness refuses to start if that
Founder-only credential is present in its environment, and repository-check
Git subprocesses use `/usr/bin/git` with only a small noncredential environment
allowlist.

The separate act is
`POST /control-plane/phase3/run-attempts/:runAttemptId/adjudication` with one
UUID idempotency key, `passed` or `failed`, a meaningful nonsecret Tier 2
reviewer identifier, the SHA-256 of the evidence Tier 2 reviewed, and a
nonsecret Founder authorization identifier. Reusing the key with different
evidence is refused.
Phase 3 writes run inside the existing leadership fence; a pre-commit demotion
rolls them back, while a post-commit demotion retains the durable write but
withholds a success response. `SIGINT` and `SIGTERM` trigger bounded fixture
teardown and retained `interrupted` evidence.

## Verification

All live-operation paths remain prohibited during implementation review. Use a
throwaway local Postgres through `TEST_DATABASE_URL`; never use `DATABASE_URL`.
The redacted example at
`test/fixtures/phase3-run-evidence.synthetic.json` is synthetic and authorizes
nothing.

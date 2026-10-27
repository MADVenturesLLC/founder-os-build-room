# `@build-room/control-plane`

The single writer to the durable ledger, and the HTTP surface the Phase 2 run
is judged against.

This file exists because the config loader's error messages point at it. If you
arrived here from `DATABASE_URL is required and was not set` or
`CONTROL_PLANE_TOKEN is required and was not set`, the table below is what you
came for.

## Environment

Read once at boot, and **fail closed** — nothing below is defaulted in a way
that would let the process come up believing it has something it does not
(architecture §3.15). Credentials come from the environment and are never
written to the repository (`DEC-20260815-07`; `DEC-20260815-17` Phase 2 exit
criterion 1).

### Required

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string. Must begin `postgres://` or `postgresql://`. Never echoed in an error, because it carries a credential. |
| `CONTROL_PLANE_TOKEN` | Shared secret the room endpoints require on `Authorization: Bearer <token>`. At least 32 characters. Never echoed. |

**`CONTROL_PLANE_TOKEN` has no "unauthenticated" mode, deliberately.** The
service has a public URL; without the guard, any caller who found it could
create rooms, append ledger events, and export a room's full ledger — actor
identities, attribution and evidence payloads included. An *optional* guard is
off wherever someone forgot to turn it on, and the place it gets forgotten is
production, so a missing token is a boot failure on the same footing as a
missing database.

Generate one with `openssl rand -hex 24`. The run harness must be given the
same value as `CONTROL_PLANE_TOKEN`, or every room request answers 401.

### Optional

| Variable | Default | What it is |
|---|---|---|
| `PHASE3_ADJUDICATION_TOKEN` | route absent | Founder-only credential for Phase 3 pass/fail adjudication. At least 32 characters, distinct from `CONTROL_PLANE_TOKEN`, and never available to the counted-run harness. |
| `PHASE4_COUNTED_RUN_TOKEN` | routes 503 | The counted-run credential (run-unit proposal §9): opens the three counted-run routes and nothing else, the plan decision included. At least 32 characters, distinct from `CONTROL_PLANE_TOKEN` and `PHASE3_ADJUDICATION_TOKEN`, or boot refuses. It is the one credential besides the API token that the Phase 4 harness holds. |
| `PHASE4_COUNTED_RUN` | routes inert | The Founder's counted-run act's terms, as JSON `{ actId, gatewayId, planner, seats: { builder, reviewer } }` — **surfaces, never models** (`BR-PHASE4-SURFACE-KEYED-SEATS-R1`): `planner` is the Planner's execution surface and must be the counted run's adapter surface (`antigravity`; an approved-lane surface the adapter cannot run is refused at boot), and each seat is a lane token, `surface` or `surface:provider`, checked against its seat's approved lanes by `surface_id`, `provider` and `binding_status`. A bare surface that carries more than one provider's approved lanes on that seat (today the reviewer's `antigravity`: `antigravity:google` and `antigravity:anthropic`) is refused; name the provider. Models stay in the seat registry as routing detail: the parsed planner carries the approved lane's provider and model, never the act's terms, and each parsed seat carries its surface and the provider of the lane it resolved to (`{ surface, provider }`; a bare surface gets its seat's one provider), never a model. The room's role assignment carries those providers too; the journal does not record them, and G2's `reviewerIsNotBuilder` still compares surfaces. The reviewer's surface must differ from the builder's, and its lane's provider from the builder lane's (`DEC-20261020-01` clause 7). Absent, every counted-run route answers 503. Present, it must be exactly that shape on approved lanes, or boot refuses. Setting it is the Founder's act. |
| `PORT` | `8080` | TCP port for the HTTP surface. |
| `RAILWAY_GIT_COMMIT_SHA` / `COMMIT_SHA` | `unknown` | The commit `/version` reports. Reported as `unknown` rather than guessed — evidence bound to a wrong SHA is worse than evidence bound to none. |
| `RAILWAY_ENVIRONMENT_NAME` / `NODE_ENV` | `unknown` | Environment label, for evidence records. |
| `RAILWAY_DEPLOYMENT_ID` | none | The deployment a counted run's T2 names as its actor (`control-plane:<deployment id>`, Q7b). A round never starts without it. |
| `READY_PROBE_TIMEOUT_MS` | `2000` | How long a `/ready` database probe may take before it fails. |
| `STATEMENT_TIMEOUT_MS` | `10000` | Postgres `statement_timeout` on pooled connections. Lifted for the migration session only — see `migrations.ts`. |
| `PG_POOL_MAX` | `4` | Maximum pooled connections. Neon's small computes are the constraint. |
| `PG_POOL_IDLE_TIMEOUT_MS` | `30000` | Milliseconds before an idle pooled connection is released. |
| `PG_CONNECTION_TIMEOUT_MS` | `10000` | Milliseconds the pool may wait to open a connection. Deliberately larger than `READY_PROBE_TIMEOUT_MS`: a suspended Neon compute takes roughly one to five seconds to resume, and the probe's fast-fail budget is the wrong bound for a real request arriving after an idle period. |

## Endpoints

| Route | Auth | What it answers |
|---|---|---|
| `GET /health` | open | Is this process serving? No database call, deliberately — a liveness probe that fails on a database blip asks the platform to restart a working process. |
| `GET /ready` | open | Can it serve a request that needs the database? Hits the database under a bounded timeout; 503 with a correlation id when it cannot. |
| `GET /version` | open | Commit, environment, Node version, and `startedAt` — the process identity a restart is proved from. |
| `POST /rooms` | **token** | Create a room, idempotently. |
| `GET /rooms/:roomId` | **token** | Log length, entry count, lifecycle snapshot. |
| `POST /rooms/:roomId/events` | **token** | Append an event. A ledger rejection is 409 carrying the reducer's own code and reason — a recorded outcome, not a server fault. |
| `GET /rooms/:roomId/export` | **token** | The room's full ledger: events and rejections. |
| `POST /control-plane/phase3/run-attempts` | **token** | Create one exact started or not-started counted-run attempt. |
| `POST /control-plane/phase3/run-attempts/:runAttemptId/events` | **token** | Append a closed lifecycle stage or technical completion event. Heartbeat and pass claims are refused. |
| `POST /control-plane/phase3/run-attempts/:runAttemptId/adjudication` | **adjudication token** | Record a fenced, idempotent Tier 2 and Founder pass/fail decision. The route is absent when `PHASE3_ADJUDICATION_TOKEN` is unset. |
| `GET /control-plane/phase3/run-attempts/:runAttemptId/export` | **token** | Snapshot-consistent, redacted run evidence. |
| `POST /control-plane/rooms/:roomId/planner-round` | **counted-run token** | Start one Phase 4 planning round for the room, under the configured counted-run act; 202, then the round runs. One round at a time. 503 unless `PHASE4_COUNTED_RUN`, `PHASE4_COUNTED_RUN_TOKEN`, `RAILWAY_DEPLOYMENT_ID` and the `build-room-control-plane` entry in the pinned registry copy (`packages/control-plane/fixtures/`, FounderOS `8146435`, hash-checked) are all present. |
| `GET /control-plane/rooms/:roomId/planner-round` | **counted-run token** | That round's state, with the act, the deployment and the Gateway's liveness. 503 unless `PHASE4_COUNTED_RUN` and `PHASE4_COUNTED_RUN_TOKEN` are set. |
| `GET /control-plane/rooms/:roomId/journal` | **counted-run token** | The room's planner commands, their decision rows, and the journal's verification from genesis. 503 unless `PHASE4_COUNTED_RUN` and `PHASE4_COUNTED_RUN_TOKEN` are set. |

The three open routes stay open because Railway's health check presents no
credential and would fail the deploy if `/health` were guarded, and because the
run harness reads `/version` to prove a restart happened. None of the three
touches the ledger.

## Phase 3 run evidence

Migration `0005_phase3_run_evidence` adds `phase3_run_attempts`, a retained
correlation projection with immutable attempt identity, and
`phase3_run_events`, a closed-schema append-only log. It does not edit the
existing migrations or widen the six-event `gateway_registry_events`
vocabulary.

Started attempts bind the complete expected enrollment projection. Creation
rereads all current rows while holding the registry advisory lock and persists
the canonical projection digest; any extra or missing row refuses the start.

One accepted heartbeat is correlated inside the existing fenced heartbeat
transaction. With no active attempt, the added storage path is a no-op. Client
writes cannot submit heartbeat verification or a passing verdict; technical
completion stops at `awaiting_adjudication`.

Attempt and lifecycle writes use the same three-checkpoint leadership fence as
the signed gateway pipelines. A pre-commit demotion rolls the write back; a
post-commit demotion leaves the legitimately fenced row durable and returns no
success claim from the stale process.

## Errors

An unhandled failure returns `{"error":"internal_error","incidentId":"…"}` and
nothing more. Postgres errors carry role names, host names, table names and SQL
fragments, so returning the message would turn any failing query into an
information-disclosure response on a public URL; the detail goes to the log
under the same `incidentId`. `400` and `404` responses keep their text, because
those strings are author-written and say only what the caller did wrong.

## Related

- `docs/phase-2-known-limits.md` — replay cost per append, recorded rather than
  fixed in this phase
- `docs/phase3-counted-run-harness.md` — Phase 3 plan, fixture, evidence and
  non-authorization contract
- `packages/run-harness` — the harness that exercises this surface

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
| `PORT` | `8080` | TCP port for the HTTP surface. |
| `RAILWAY_GIT_COMMIT_SHA` / `COMMIT_SHA` | `unknown` | The commit `/version` reports. Reported as `unknown` rather than guessed — evidence bound to a wrong SHA is worse than evidence bound to none. |
| `RAILWAY_ENVIRONMENT_NAME` / `NODE_ENV` | `unknown` | Environment label, for evidence records. |
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
| `GET /control-plane/phase3/run-attempts/:runAttemptId/export` | **token** | Snapshot-consistent, redacted run evidence. |

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

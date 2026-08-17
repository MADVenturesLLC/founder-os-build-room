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

The three open routes stay open because Railway's health check presents no
credential and would fail the deploy if `/health` were guarded, and because the
run harness reads `/version` to prove a restart happened. None of the three
touches the ledger.

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
- `packages/run-harness` — the harness that exercises this surface

/**
 * Schema migrations for the durable ledger.
 *
 * Three properties this module exists to guarantee:
 *
 * 1. **Idempotent.** Every migration is recorded in `schema_migrations` and
 *    applied at most once. Running the migrator against an already-migrated
 *    database is a no-op, which is what makes "survives a restart without data
 *    loss" (`DEC-20260815-17`, Phase 2 run condition 3) safe to assert — boot
 *    migrates, and boot happens on every restart.
 * 2. **Serialized.** A Postgres advisory lock is held for the duration, so two
 *    replicas booting at once cannot both apply the same migration.
 * 3. **Append-only at the database, not only in application code.**
 *    `build_room_events` carries triggers that reject UPDATE and DELETE
 *    outright. The ledger is the record of what happened; a record that can be
 *    edited is not one.
 *
 * **What is stored is the input event, not the derived outcome alone.** The
 * pure reducer in `@build-room/ledger` is a total function of (state, event),
 * so a log of the events it accepted reconstructs the state exactly by replay
 * — including the `observedCompanions` a conjunction-pending event leaves
 * behind, which produces no ledger entry and would be lost by a log of entries.
 * `payload` holds the event exactly as it was supplied, and replay reads that
 * column and nothing else, so no column type can round-trip the input into
 * something the reducer would treat differently. The derived columns
 * (`transition_id`, `guard_id`, `from_state`, `resulting_state`) are stored
 * alongside for queryability and export, and are null for a
 * conjunction-pending event, which has no transition yet.
 */

import type { Pool, PoolClient } from 'pg';

export interface Migration {
  readonly id: string;
  readonly statements: readonly string[];
}

/**
 * Ordered, append-only list. Never edit a shipped migration — add another.
 * The `id` is the identity recorded in `schema_migrations`.
 *
 * `0002` carries one edit made after shipping, and the bar it had to clear is
 * the rule, not an exception to it: a database that already ran the old
 * migration must end in the same state as one that runs the new migration and
 * everything after it. That held there because the removed statement is
 * re-issued by `0004` and is a no-op when already applied. An edit that cannot
 * demonstrate that property is not allowed — it gets a new migration.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: '0001_ledger_core',
    statements: [
      `CREATE TABLE IF NOT EXISTS build_room_rooms (
         room_id      uuid        PRIMARY KEY,
         created_at   timestamptz NOT NULL DEFAULT now()
       )`,

      /*
       * One row per event the reducer accepted, in commit order.
       *
       * `seq` is the per-room log position, gapless and assigned by the single
       * writer under the room's row lock. `entry_seq` is the reducer's own
       * entry number and is null for a conjunction-pending event, which
       * occupies a log position but produces no entry.
       *
       * `event_id` is unique per room, which is INV-4 (replay idempotency)
       * enforced by the storage engine as well as by the pure reducer: a
       * replayed event cannot be committed twice even if the caller's
       * in-memory state was stale.
       */
      `CREATE TABLE IF NOT EXISTS build_room_events (
         room_id          uuid        NOT NULL REFERENCES build_room_rooms(room_id),
         seq              bigint      NOT NULL,
         event_id         text        NOT NULL,
         event            text        NOT NULL,
         outcome          text        NOT NULL,
         entry_seq        integer,
         transition_id    text,
         guard_id         text,
         from_state       text,
         resulting_state  text,
         actor            jsonb       NOT NULL,
         attribution      jsonb       NOT NULL,
         scope            jsonb       NOT NULL,
         evidence         jsonb       NOT NULL,
         overlays         jsonb,
         round            integer,
         occurred_at      timestamptz NOT NULL,
         payload          jsonb       NOT NULL,
         committed_at     timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (room_id, seq),
         CONSTRAINT build_room_events_event_id_unique UNIQUE (room_id, event_id),
         CONSTRAINT build_room_events_seq_positive CHECK (seq > 0),
         CONSTRAINT build_room_events_outcome_known
           CHECK (outcome IN ('transition', 'conjunction_pending')),
         CONSTRAINT build_room_events_transition_complete
           CHECK (
             (outcome = 'transition' AND transition_id IS NOT NULL
                                     AND guard_id IS NOT NULL
                                     AND from_state IS NOT NULL
                                     AND resulting_state IS NOT NULL
                                     AND entry_seq IS NOT NULL)
             OR
             (outcome = 'conjunction_pending' AND transition_id IS NULL
                                              AND entry_seq IS NULL)
           )
       )`,

      /*
       * Rejections are visible, not silent (architecture §3.8: rejections are
       * recorded as `event.rejected`). They live in their own table because
       * they are not accepted events and must never occupy a log position.
       */
      `CREATE TABLE IF NOT EXISTS build_room_rejections (
         rejection_id  bigserial   PRIMARY KEY,
         room_id       uuid        NOT NULL REFERENCES build_room_rooms(room_id),
         event_id      text        NOT NULL,
         event         text        NOT NULL,
         code          text        NOT NULL,
         reason        text        NOT NULL,
         actor         jsonb       NOT NULL,
         attempted_at  timestamptz NOT NULL,
         recorded_at   timestamptz NOT NULL DEFAULT now()
       )`,

      `CREATE INDEX IF NOT EXISTS build_room_rejections_room_idx
         ON build_room_rejections (room_id, recorded_at)`,

      /*
       * Append-only, enforced by the database. A rule with `DO INSTEAD
       * NOTHING` would swallow the write silently; these raise instead, so an
       * attempt to mutate history fails loudly and visibly.
       */
      `CREATE OR REPLACE FUNCTION build_room_events_immutable()
         RETURNS trigger AS $$
       BEGIN
         RAISE EXCEPTION 'build_room_events is append-only: % rejected', TG_OP
           USING ERRCODE = 'restrict_violation';
       END;
       $$ LANGUAGE plpgsql`,

      `DROP TRIGGER IF EXISTS build_room_events_no_update ON build_room_events`,
      `CREATE TRIGGER build_room_events_no_update
         BEFORE UPDATE ON build_room_events
         FOR EACH ROW EXECUTE FUNCTION build_room_events_immutable()`,

      `DROP TRIGGER IF EXISTS build_room_events_no_delete ON build_room_events`,
      `CREATE TRIGGER build_room_events_no_delete
         BEFORE DELETE ON build_room_events
         FOR EACH ROW EXECUTE FUNCTION build_room_events_immutable()`,
    ],
  },

  {
    /*
     * A conjunction-pending row must carry NO transition fields at all.
     *
     * `0001`'s constraint required `transition_id` and `entry_seq` to be null
     * for a pending outcome but said nothing about `guard_id`, `from_state` or
     * `resulting_state` — so a writer defect could persist a row claiming a
     * pending event had a guard and a resulting state. In an append-only
     * ledger that row is permanent: the trigger refuses UPDATE and DELETE, so
     * an impossible event could never be corrected, only annotated. The
     * database is the right place to refuse it. Raised by CodeRabbit on PR #2.
     *
     * A NEW migration rather than an edit to `0001`, deliberately. Every
     * environment that already recorded `0001` will never run it again —
     * editing it would change the schema only on databases created after the
     * edit, which is the quiet divergence migrations exist to prevent.
     *
     * `NOT VALID` then `VALIDATE` is the two-step form: the constraint applies
     * to new rows immediately without taking the lock a full-table check needs,
     * and the validation pass then confirms existing rows. On an empty or small
     * table this is indistinguishable from a plain ADD; on a large one it is
     * the difference between a brief lock and a long one.
     *
     * The two steps are two MIGRATIONS, not two statements here. This one adds
     * the constraint NOT VALID and stops; `0004_validate_pending_is_bare` runs
     * the scan. The runner wraps each migration's statements in ONE
     * transaction, so keeping both here held the ADD's ACCESS EXCLUSIVE lock
     * across the validating scan — the exact cost NOT VALID exists to avoid.
     * Written that way it read as the careful two-phase pattern while behaving
     * as the blocking one-phase one.
     *
     * This edits a migration the header says never to edit. The reason that
     * rule exists — that an edit changes what a database which already ran the
     * migration received — does not apply to this edit: the removed statement
     * is re-issued by 0004, and `VALIDATE CONSTRAINT` on an already-validated
     * constraint is a no-op in Postgres. So a database that ran the old 0002
     * ends in the same state as one that runs the new 0002 and then 0004.
     * Anything that does NOT hold that property still gets a new migration.
     */
    id: '0002_pending_rows_carry_no_transition_fields',
    statements: [
      `ALTER TABLE build_room_events
         DROP CONSTRAINT IF EXISTS build_room_events_pending_is_bare`,
      `ALTER TABLE build_room_events
         ADD CONSTRAINT build_room_events_pending_is_bare
         CHECK (
           outcome <> 'conjunction_pending'
           OR (transition_id   IS NULL
               AND guard_id        IS NULL
               AND from_state      IS NULL
               AND resulting_state IS NULL
               AND entry_seq       IS NULL)
         ) NOT VALID`,
    ],
  },


  {
    /*
     * The gateway registry — EIGHT tables (contract §5). The count is eight
     * here, in the PR body, and in every comment that names it; a schema whose
     * size is described differently in two places is a schema nobody can review.
     *
     * Seven of the eight are registry content. The eighth,
     * `control_plane_lease`, is leadership and fencing infrastructure rather
     * than registry content, and lives in this migration because the fence it
     * carries is what every leader-dependent transaction in §7 opens with.
     *
     * Retention classes are split deliberately (§18). `gateway_registry_events`,
     * `gateway_enrollment_refusals` and `gateway_pairing_codes` are the >=7-year
     * class and are never swept. Availability history and message rejections are
     * the 90-day class. Idempotency rows are swept only well beyond the daemon's
     * retry horizon, so the one replayable successful result outlives every
     * legitimate retry.
     */
    id: '0003_gateway_registry',
    statements: [
      /*
       * 1. Append-only lifecycle log. `seq` is the deterministic total order;
       * `recorded_at` is metadata and is NOT the ordering key — two rows written
       * in one transaction share a transaction-stable `recorded_at`, so ordering
       * by it would be ordering by a tie.
       *
       * `gateway_id` is nullable because `minted` precedes any gateway identity:
       * a code exists before the machine that will redeem it does.
       */
      `CREATE TABLE IF NOT EXISTS gateway_registry_events (
         seq             bigserial   PRIMARY KEY,
         event_id        uuid        NOT NULL UNIQUE,
         event_type      text        NOT NULL
           CHECK (event_type IN ('minted','key_received','enrolled','denied','revoked','expired')),
         gateway_id      uuid,
         key_id          text,
         pubkey          bytea,
         host_descriptor jsonb,
         pairing_id      uuid,
         code_hash       text,
         actor           jsonb       NOT NULL,
         attribution     jsonb       NOT NULL,
         occurred_at     timestamptz NOT NULL,
         recorded_at     timestamptz NOT NULL DEFAULT now(),
         payload         jsonb       NOT NULL
       )`,

      `CREATE INDEX IF NOT EXISTS gateway_registry_events_gateway_seq_idx
         ON gateway_registry_events (gateway_id, seq)`,
      `CREATE INDEX IF NOT EXISTS gateway_registry_events_key_idx
         ON gateway_registry_events (key_id) WHERE key_id IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS gateway_registry_events_pairing_idx
         ON gateway_registry_events (pairing_id) WHERE pairing_id IS NOT NULL`,

      /*
       * Same pattern as `build_room_events`: RAISE, not `DO INSTEAD NOTHING`. A
       * rule that swallowed the write would make history editable and silent
       * about it, which is the one failure an append-only log cannot survive.
       */
      `CREATE OR REPLACE FUNCTION gateway_registry_events_immutable()
         RETURNS trigger AS $$
       BEGIN
         RAISE EXCEPTION 'gateway_registry_events is append-only: % rejected', TG_OP
           USING ERRCODE = 'restrict_violation';
       END;
       $$ LANGUAGE plpgsql`,

      `DROP TRIGGER IF EXISTS gateway_registry_events_no_update ON gateway_registry_events`,
      `CREATE TRIGGER gateway_registry_events_no_update
         BEFORE UPDATE ON gateway_registry_events
         FOR EACH ROW EXECUTE FUNCTION gateway_registry_events_immutable()`,

      `DROP TRIGGER IF EXISTS gateway_registry_events_no_delete ON gateway_registry_events`,
      `CREATE TRIGGER gateway_registry_events_no_delete
         BEFORE DELETE ON gateway_registry_events
         FOR EACH ROW EXECUTE FUNCTION gateway_registry_events_immutable()`,

      /*
       * 2. The mutable deterministic projection. A read model only: every
       * mutation happens in the same transaction as its event, under the
       * registry advisory lock, and `test/gateway-projection.storage.test.ts`
       * proves a replay of the log through the pure reducer reproduces this
       * table exactly.
       *
       * The CHECK keeps `is_currently_enrolled` from ever disagreeing with
       * `state`, because the partial unique index below is built on the boolean
       * and an invariant enforced through a column that could lie is not an
       * invariant.
       */
      `CREATE TABLE IF NOT EXISTS gateway_current_state (
         gateway_id                   uuid        PRIMARY KEY,
         state                        text        NOT NULL
           CHECK (state IN ('awaiting_approval','enrolled','denied','revoked','expired')),
         key_id                       text,
         pubkey                       bytea,
         host_descriptor              jsonb,
         state_since                  timestamptz NOT NULL,
         last_event_seq               bigint      NOT NULL REFERENCES gateway_registry_events(seq),
         awaiting_approval_expires_at timestamptz,
         is_currently_enrolled        boolean     NOT NULL DEFAULT false,
         CONSTRAINT gateway_current_state_enrolled_flag_agrees
           CHECK ((state = 'enrolled') = is_currently_enrolled)
       )`,

      /*
       * Clause 5's at-most-one-enrolled invariant, enforced by the database
       * rather than by sequencing. This is what refuses a successor's
       * confirmation while an incumbent is still enrolled — and therefore what
       * enforces the required ordering: revoke the incumbent first, confirm the
       * successor second.
       */
      `CREATE UNIQUE INDEX IF NOT EXISTS gateway_current_state_only_one_enrolled
         ON gateway_current_state (is_currently_enrolled) WHERE is_currently_enrolled`,

      /*
       * 3. Minted pairing codes. Only `sha256(code)` is stored — the plaintext
       * appears exactly once, in the mint response, and is never logged. Never
       * swept: manual Founder mints are few, and the >=7-year event log carries
       * the acts regardless.
       */
      `CREATE TABLE IF NOT EXISTS gateway_pairing_codes (
         pairing_id             uuid        PRIMARY KEY,
         code_hash              text        NOT NULL UNIQUE,
         code_hash_algo         text        NOT NULL DEFAULT 'sha256',
         minted_by              jsonb       NOT NULL,
         minted_at              timestamptz NOT NULL DEFAULT now(),
         expires_at             timestamptz NOT NULL,
         consumed_at            timestamptz,
         consumed_by_gateway_id uuid,
         CONSTRAINT gateway_pairing_codes_consumption_is_complete
           CHECK ((consumed_at IS NULL AND consumed_by_gateway_id IS NULL)
               OR (consumed_at IS NOT NULL AND consumed_by_gateway_id IS NOT NULL))
       )`,

      /*
       * 4. Durable, restart-safe redeem idempotency. Durable rather than
       * in-memory because the retry it protects can outlive the process: the
       * daemon retries a redeem for up to 24 h, and a control-plane redeploy in
       * that window must not turn a retry into a second consumption.
       */
      `CREATE TABLE IF NOT EXISTS gateway_redeem_idempotency (
         idempotency_key text        PRIMARY KEY,
         pairing_id      uuid        NOT NULL,
         code_hash       text        NOT NULL,
         response_json   jsonb       NOT NULL,
         status_code     integer     NOT NULL,
         recorded_at     timestamptz NOT NULL DEFAULT now()
       )`,

      /*
       * 5. Pairing-flow refusals, >=7-year class, never swept. No immutability
       * trigger, following the `build_room_rejections` precedent.
       *
       * `resolved_code_hash` is stored ONLY when the presented code hash matches
       * a minted code. An unresolvable presentation is recorded by kind alone,
       * so no untrusted string an attacker chose becomes durable content in a
       * table nothing ever deletes from.
       */
      `CREATE TABLE IF NOT EXISTS gateway_enrollment_refusals (
         refusal_id         bigserial   PRIMARY KEY,
         kind               text        NOT NULL
           CHECK (kind IN ('unknown_code','code_expired','code_consumed','idempotency_key_mismatch',
                           'malformed_pubkey','invalid_request','fingerprint_mismatch',
                           'not_awaiting_approval','another_gateway_enrolled')),
         gateway_id         uuid,
         pairing_id         uuid,
         resolved_code_hash text,
         idempotency_key    text,
         detail             jsonb       NOT NULL,
         source_ip          text,
         recorded_at        timestamptz NOT NULL DEFAULT now()
       )`,

      /*
       * 6. Signed-message failures, 90-day class, AGGREGATED rather than one row
       * per attempt.
       *
       * The durable identity is the presented `keyId` only when it resolves to a
       * known registry key; every unresolved, absent, malformed or random
       * presentation counts under the literal `unknown`. That is what bounds
       * per-minute cardinality at (registry keys + 1) x sources x error codes: a
       * flood of distinct invented key ids from one source produces one counting
       * row, not one row per attempt.
       */
      `CREATE TABLE IF NOT EXISTS gateway_message_rejections (
         resolved_key_id text        NOT NULL,
         source_ip       text        NOT NULL,
         error_code      text        NOT NULL,
         minute_bucket   timestamptz NOT NULL,
         count           integer     NOT NULL DEFAULT 1,
         first_seen_at   timestamptz NOT NULL DEFAULT now(),
         last_seen_at    timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (resolved_key_id, source_ip, error_code, minute_bucket)
       )`,

      /*
       * 7. Availability transition history, 90-day class, no immutability
       * trigger because the sweep must be able to delete from it.
       *
       * `seq` is the durable insertion order and matters: a stale-liveness beat
       * writes an overdue `went_offline` and the new `went_online` in ONE
       * transaction, so both rows share a transaction-stable `recorded_at` and
       * only `seq` says which came first.
       */
      `CREATE TABLE IF NOT EXISTS gateway_availability_events (
         seq               bigserial   PRIMARY KEY,
         event_id          uuid        NOT NULL UNIQUE,
         gateway_id        uuid        NOT NULL,
         transition        text        NOT NULL CHECK (transition IN ('went_online','went_offline')),
         occurred_at       timestamptz NOT NULL,
         last_heartbeat_at timestamptz,
         recorded_at       timestamptz NOT NULL DEFAULT now()
       )`,

      /*
       * 8. Leadership and fencing infrastructure. One row, forever, enforced by
       * the CHECK on the primary key — the fence's `SELECT ... FOR UPDATE`
       * targets a single known row, and a second row would silently give two
       * leaders two fences.
       */
      `CREATE TABLE IF NOT EXISTS control_plane_lease (
         id                     smallint    PRIMARY KEY CHECK (id = 1),
         owner_id               uuid,
         generation             bigint      NOT NULL DEFAULT 0,
         heartbeat_at           timestamptz,
         challenge              text,
         challenge_published_at timestamptz
       )`,

      `INSERT INTO control_plane_lease (id) VALUES (1) ON CONFLICT DO NOTHING`,
    ],
  },

  {
    /*
     * The validating scan for 0002's constraint, in its own transaction.
     *
     * `VALIDATE CONSTRAINT` takes SHARE UPDATE EXCLUSIVE, which lets reads and
     * writes continue while it scans. That is only true if the ACCESS
     * EXCLUSIVE from the `ADD CONSTRAINT` has already been released, and the
     * runner releases it at COMMIT — so the two have to be separate
     * migrations, not two statements in one.
     *
     * Idempotent on a database that ran the older single-transaction 0002:
     * Postgres skips `VALIDATE CONSTRAINT` when the constraint is already
     * validated rather than erroring, so this applies cleanly and records
     * itself as a no-op.
     */
    id: '0004_validate_pending_is_bare',
    statements: [
      `ALTER TABLE build_room_events
         VALIDATE CONSTRAINT build_room_events_pending_is_bare`,
    ],
  },
];

/** Advisory-lock key. Arbitrary but fixed — any value works if it never changes. */
const MIGRATION_LOCK_KEY = 8_150_817;

/**
 * The registry advisory lock (contract §5, §13 L2).
 *
 * Distinct from `MIGRATION_LOCK_KEY` and deliberately so: a migration and a
 * registry write must be able to block each other only through the schema, not
 * through a shared lock key that would serialize two unrelated concerns and
 * make a slow migration look like a wedged gateway.
 */
export const GATEWAY_REGISTRY_LOCK_KEY = 8_180_818;

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

/**
 * Apply every migration not yet recorded, in order, under an advisory lock.
 * Returns which ran and which were already present, so a boot log can say
 * plainly what it did rather than "migrations ok".
 */
/**
 * Single-quote a value for a `SET` statement.
 *
 * `SET` takes no bind parameters, so the value has to be interpolated. This
 * one comes from `SHOW` — the server's own rendering — so it is not attacker
 * input, but interpolating anything into SQL without quoting it is a habit
 * worth not having.
 */
function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function migrate(pool: Pool): Promise<MigrationResult> {
  const client: PoolClient = await pool.connect();
  const applied: string[] = [];
  const alreadyApplied: string[] = [];
  /*
   * Read rather than assumed. `RESET` would restore the server's default,
   * which is not the pool's — the pool sets the value as a startup option and
   * the two need not agree. Restoring the observed value is unambiguous
   * whatever the connection was configured with.
   */
  let priorStatementTimeout: string | null = null;

  try {
    /*
     * The pool sets `statement_timeout` on every connection (10s by default)
     * to bound a wedged query. That bound is wrong for this session, in two
     * ways that both turn a survivable wait into a failed boot:
     *
     *   - `pg_advisory_lock` BLOCKS while another replica migrates. Postgres
     *     counts that wait against `statement_timeout` and cancels it, so a
     *     concurrent redeploy exits non-zero instead of waiting its turn —
     *     precisely the case the lock exists to handle.
     *   - A DDL statement slower than the timeout is cancelled mid-migration.
     *     The transaction rolls back so no partial schema is recorded, but the
     *     boot still fails, and an index build on a real table can easily take
     *     longer than ten seconds.
     *
     * So the timeout is lifted for the migration session only, and reset in
     * the `finally` below before the connection returns to the pool — leaving
     * it lifted would silently unbound every later query on that connection.
     * Raised by CodeRabbit on PR #2.
     */
    const shown = await client.query<{ statement_timeout: string }>('SHOW statement_timeout');
    priorStatementTimeout = shown.rows[0]?.statement_timeout ?? null;
    await client.query('SET statement_timeout = 0');

    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    // Bootstrap: the migration table cannot record its own precondition.
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id         text        PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );

    const { rows } = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
    const present = new Set(rows.map((row) => row.id));

    for (const migration of MIGRATIONS) {
      if (present.has(migration.id)) {
        alreadyApplied.push(migration.id);
        continue;
      }
      await client.query('BEGIN');
      try {
        for (const statement of migration.statements) {
          await client.query(statement);
        }
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
        await client.query('COMMIT');
        applied.push(migration.id);
      } catch (error) {
        /*
         * Guarded, because an unguarded ROLLBACK can replace the error being
         * reported with its own. The failures that land here include the ones
         * that kill the connection — a cancelled statement, a server restart,
         * a dropped socket — and on a dead connection the ROLLBACK throws
         * too. Its exception then propagates instead of `error`, and the boot
         * log names a rollback failure rather than the migration statement
         * that actually broke. `store.ts` guards the identical pattern in
         * `append`; this one did not.
         *
         * Swallowing it loses nothing: a failed ROLLBACK means the
         * transaction is already gone, which is the state ROLLBACK was for.
         */
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    }

    return { applied, alreadyApplied };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    // Back to the bound this connection carried, before it is reused.
    if (priorStatementTimeout !== null) {
      await client
        .query(`SET statement_timeout = ${quoteLiteral(priorStatementTimeout)}`)
        .catch(() => undefined);
    }
    client.release();
  }
}

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
];

/** Advisory-lock key. Arbitrary but fixed — any value works if it never changes. */
const MIGRATION_LOCK_KEY = 8_150_817;

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly alreadyApplied: readonly string[];
}

/**
 * Apply every migration not yet recorded, in order, under an advisory lock.
 * Returns which ran and which were already present, so a boot log can say
 * plainly what it did rather than "migrations ok".
 */
export async function migrate(pool: Pool): Promise<MigrationResult> {
  const client: PoolClient = await pool.connect();
  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  try {
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
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return { applied, alreadyApplied };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
}

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
      `ALTER TABLE build_room_events
         VALIDATE CONSTRAINT build_room_events_pending_is_bare`,
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
     * Read the honest version first: **on any database that runs the
     * migrations in order, this does nothing.** 0002 already carries its own
     * `VALIDATE CONSTRAINT`, so by the time this runs the constraint is
     * validated, and Postgres skips `VALIDATE CONSTRAINT` on an
     * already-validated constraint rather than erroring. It is a recorded
     * no-op, and saying otherwise would be dressing it up.
     *
     * Why it is here anyway. 0002 pairs `ADD CONSTRAINT ... NOT VALID` with
     * `VALIDATE CONSTRAINT` in one statements array, and the runner wraps each
     * migration in ONE transaction — so the ADD's ACCESS EXCLUSIVE lock is
     * held across the validating scan, which is the cost NOT VALID exists to
     * avoid. Written that way it reads as the careful two-phase pattern while
     * behaving as the blocking one-phase one.
     *
     * The fix for that is NOT to edit 0002. A shipped migration's identity is
     * more than the database state it produces: its checksum, its provenance,
     * and the reproducibility of a run from the recorded history all change
     * when its text changes, and no comment inside the file can grant itself
     * permission to break that (Founder ruling, 2026-08-21, rejecting exactly
     * that edit). So 0002 stands byte for byte and the correctly-transacted
     * validation is recorded here.
     *
     * How much the underlying hazard actually costs, stated plainly: close to
     * nothing. Migrations run at boot, before this process serves a request,
     * and `build_room_events` is empty when 0002 first runs — so the scan it
     * holds the lock across is a scan of no rows. The defect is one of form,
     * and the correction is one of form.
     *
     * **The rule this sets for later migrations.** A `NOT VALID` / `VALIDATE`
     * pair goes in TWO migrations from the start — the ADD in one, the scan in
     * the next. Doing it in one is only cheap while the table is empty, and
     * discovering that after the migration ships leaves no good move: editing
     * it is refused, and a follow-up like this one cannot undo the lock the
     * original already took.
     */
    id: '0004_validate_pending_is_bare',
    statements: [
      `ALTER TABLE build_room_events
         VALIDATE CONSTRAINT build_room_events_pending_is_bare`,
    ],
  },

  {
    /*
     * Phase 3 counted-run evidence. Additive and separate from the closed
     * six-event enrollment registry: a ten-second heartbeat must never widen
     * that lifecycle vocabulary or become an unbounded long-retention stream.
     *
     * `phase3_run_attempts` is the replayable correlation projection. Its
     * identity and governing metadata are immutable; only the derived progress
     * fields may change. `phase3_run_events` is the append-only evidence log.
     */
    id: '0005_phase3_run_evidence',
    statements: [
      `CREATE TABLE IF NOT EXISTS phase3_run_attempts (
         attempt_seq             bigserial   UNIQUE NOT NULL,
         run_attempt_id          uuid        PRIMARY KEY,
         run_label               text        NOT NULL
           CHECK (run_label IN ('Phase3-CR1','Phase3-CR2','Phase3-CR3')),
         entry_authorization_id  text        NOT NULL
           CHECK (length(entry_authorization_id) BETWEEN 1 AND 128
              AND entry_authorization_id ~ '^[A-Za-z0-9._:/-]+$'),
         revocation_authorization_id text
           CHECK (revocation_authorization_id IS NULL OR
                  (length(revocation_authorization_id) BETWEEN 1 AND 128
                   AND revocation_authorization_id ~ '^[A-Za-z0-9._:/-]+$')),
         founder_os_sha          text        NOT NULL CHECK (founder_os_sha ~ '^[0-9a-f]{40}$'),
         build_room_sha          text        NOT NULL CHECK (build_room_sha ~ '^[0-9a-f]{40}$'),
         fixture_repository      text        NOT NULL
           CHECK (length(fixture_repository) BETWEEN 1 AND 200
              AND fixture_repository ~ '^[A-Za-z0-9._/-]+$'),
         fixture_sha             text        NOT NULL CHECK (fixture_sha ~ '^[0-9a-f]{40}$'),
         requested_gateway_id    uuid        NOT NULL,
         gateway_id              uuid        REFERENCES gateway_current_state(gateway_id),
         enrollment_projection_sha256 text   NOT NULL
           CHECK (enrollment_projection_sha256 ~ '^[0-9a-f]{64}$'),
         machine_identity        text        NOT NULL CHECK (length(machine_identity) BETWEEN 1 AND 128),
         environment_label       text        NOT NULL CHECK (length(environment_label) BETWEEN 1 AND 128),
         entry_evidence_sha256   text        NOT NULL
           CHECK (entry_evidence_sha256 ~ '^[0-9a-f]{64}$'),
         state                   text        NOT NULL
           CHECK (state IN ('active','failure_pending_teardown','passed','failed',
                            'interrupted','not_started','awaiting_adjudication')),
         heartbeat_captured      boolean     NOT NULL DEFAULT false,
         lifecycle_position      smallint    NOT NULL DEFAULT 0
           CHECK (lifecycle_position BETWEEN 0 AND 5),
         last_event_index        integer     NOT NULL DEFAULT 0 CHECK (last_event_index >= 0),
         started_at              timestamptz NOT NULL,
         capture_expires_at      timestamptz NOT NULL,
         finished_at             timestamptz,
         created_at              timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT phase3_run_attempts_capture_window_positive
           CHECK (capture_expires_at > started_at),
         CONSTRAINT phase3_run_attempts_cr3_authorization_agrees
           CHECK ((run_label = 'Phase3-CR3') = (revocation_authorization_id IS NOT NULL)),
         CONSTRAINT phase3_run_attempts_gateway_binding_agrees
           CHECK ((state = 'not_started' AND gateway_id IS NULL)
               OR (state <> 'not_started' AND gateway_id = requested_gateway_id)),
         CONSTRAINT phase3_run_attempts_finished_state_agrees
           CHECK ((state IN ('active','failure_pending_teardown','awaiting_adjudication')
                    AND finished_at IS NULL)
               OR (state IN ('passed','failed','interrupted','not_started')
                    AND finished_at IS NOT NULL))
       )`,

      `CREATE UNIQUE INDEX IF NOT EXISTS phase3_run_attempts_one_active_gateway
         ON phase3_run_attempts ((true))
         WHERE state IN ('active','failure_pending_teardown','awaiting_adjudication')`,

      `CREATE TABLE IF NOT EXISTS phase3_run_events (
         seq                        bigserial   PRIMARY KEY,
         event_id                   uuid        NOT NULL UNIQUE,
         run_attempt_id             uuid        NOT NULL
           REFERENCES phase3_run_attempts(run_attempt_id),
         event_index                integer     NOT NULL CHECK (event_index > 0),
         event_type                 text        NOT NULL
           CHECK (event_type IN ('attempt_started','attempt_not_started','entry_verified',
                                 'heartbeat_verified','lifecycle_stage_recorded',
                                 'lifecycle_stage_refused','attempt_finished',
                                 'attempt_adjudicated')),
         idempotency_key            uuid,
         request_sha256             text
           CHECK (request_sha256 IS NULL OR request_sha256 ~ '^[0-9a-f]{64}$'),
         entry_evidence             jsonb,
         entry_evidence_sha256      text
           CHECK (entry_evidence_sha256 IS NULL OR entry_evidence_sha256 ~ '^[0-9a-f]{64}$'),
         lifecycle_stage            text
           CHECK (lifecycle_stage IS NULL OR lifecycle_stage IN
                  ('connect','adapter_registered','request','matched_response','disconnect')),
         stage_artifact_sha256       text
           CHECK (stage_artifact_sha256 IS NULL OR stage_artifact_sha256 ~ '^[0-9a-f]{64}$'),
         exchange_id                uuid,
         matched_request_event_id   uuid,
         match_verified             boolean,
         reason_code                text
           CHECK (reason_code IS NULL OR reason_code IN
                  ('attempt_identity_invalid','authorization_invalid','governing_sha_invalid',
                   'founder_os_invalid',
                   'gateway_identity_invalid','context_invalid','gateway_health_failed',
                   'enrollment_projection_failed','control_plane_status_failed','daemon_unreachable',
                   'lane_state_failed','custody_failed','staging_lock_present','build_sha_mismatch',
                   'node_version_mismatch','build_failed','fixture_sha_mismatch','gateway_not_enrolled',
                   'heartbeat_timeout','heartbeat_invalid','bad_signature','stale_heartbeat',
                   'fixture_unavailable','missing_stage',
                   'duplicate_stage','out_of_order_stage','response_mismatch','operator_interrupted',
                   'adjudication_failed','teardown_failed','evidence_write_failed','internal_error')),
         result                     text
           CHECK (result IS NULL OR result IN
                  ('awaiting_adjudication','passed','failed','interrupted')),
         teardown_result            text
           CHECK (teardown_result IS NULL OR teardown_result IN ('completed','failed','not_required')),
         teardown_evidence_sha256   text
           CHECK (teardown_evidence_sha256 IS NULL OR teardown_evidence_sha256 ~ '^[0-9a-f]{64}$'),
         adjudication               jsonb,
         heartbeat_key_id           text,
         heartbeat_sequence         bigint,
         heartbeat_timestamp_ms     bigint,
         heartbeat_signed_bytes     bytea,
         heartbeat_signature        bytea,
         heartbeat_public_key       bytea,
         heartbeat_accepted_at      timestamptz,
         heartbeat_window_ms        integer,
         signature_verified         boolean,
         occurred_at                timestamptz NOT NULL,
         recorded_at                timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT phase3_run_events_idempotency_shape
           CHECK ((idempotency_key IS NULL) = (request_sha256 IS NULL)),
         CONSTRAINT phase3_run_events_entry_evidence_shape
           CHECK (
             (event_type IN ('entry_verified','attempt_not_started')
               AND entry_evidence IS NOT NULL
               AND jsonb_typeof(entry_evidence) = 'object'
               AND entry_evidence_sha256 IS NOT NULL)
             OR
             (event_type NOT IN ('entry_verified','attempt_not_started')
               AND entry_evidence IS NULL AND entry_evidence_sha256 IS NULL)
           ),
         CONSTRAINT phase3_run_events_attempt_index_unique
           UNIQUE (run_attempt_id, event_index),
         CONSTRAINT phase3_run_events_attempt_event_unique
           UNIQUE (run_attempt_id, event_id),
         CONSTRAINT phase3_run_events_matched_request_same_attempt
           FOREIGN KEY (run_attempt_id, matched_request_event_id)
           REFERENCES phase3_run_events (run_attempt_id, event_id),
         CONSTRAINT phase3_run_events_heartbeat_shape
           CHECK (
             (event_type = 'heartbeat_verified'
               AND heartbeat_key_id IS NOT NULL
               AND heartbeat_sequence IS NOT NULL AND heartbeat_sequence > 0
               AND heartbeat_timestamp_ms IS NOT NULL
               AND heartbeat_signed_bytes IS NOT NULL
               AND heartbeat_signature IS NOT NULL AND octet_length(heartbeat_signature) = 64
               AND heartbeat_public_key IS NOT NULL AND octet_length(heartbeat_public_key) = 32
               AND heartbeat_accepted_at IS NOT NULL
               AND heartbeat_window_ms IS NOT NULL AND heartbeat_window_ms > 0
               AND signature_verified IS TRUE)
             OR
             (event_type <> 'heartbeat_verified'
               AND heartbeat_key_id IS NULL AND heartbeat_sequence IS NULL
               AND heartbeat_timestamp_ms IS NULL AND heartbeat_signed_bytes IS NULL
               AND heartbeat_signature IS NULL AND heartbeat_public_key IS NULL
               AND heartbeat_accepted_at IS NULL AND heartbeat_window_ms IS NULL
               AND signature_verified IS NULL)
           ),
         CONSTRAINT phase3_run_events_lifecycle_shape
           CHECK (
             (event_type = 'lifecycle_stage_recorded'
               AND lifecycle_stage IS NOT NULL AND stage_artifact_sha256 IS NOT NULL
               AND reason_code IS NULL)
             OR
             (event_type = 'lifecycle_stage_refused'
               AND lifecycle_stage IS NOT NULL AND reason_code IS NOT NULL)
             OR
             (event_type NOT IN ('lifecycle_stage_recorded','lifecycle_stage_refused')
               AND lifecycle_stage IS NULL AND stage_artifact_sha256 IS NULL
               AND exchange_id IS NULL AND matched_request_event_id IS NULL
               AND match_verified IS NULL)
           ),
         CONSTRAINT phase3_run_events_lifecycle_exchange_shape
           CHECK (
             (event_type = 'lifecycle_stage_recorded' AND lifecycle_stage = 'request'
               AND exchange_id IS NOT NULL AND matched_request_event_id IS NULL
               AND match_verified IS NULL)
             OR
             (event_type = 'lifecycle_stage_recorded' AND lifecycle_stage = 'matched_response'
               AND exchange_id IS NOT NULL AND matched_request_event_id IS NOT NULL
               AND match_verified IS TRUE)
             OR
             (event_type = 'lifecycle_stage_recorded'
               AND lifecycle_stage IN ('connect','adapter_registered','disconnect')
               AND exchange_id IS NULL AND matched_request_event_id IS NULL
               AND match_verified IS NULL)
             OR
             (event_type <> 'lifecycle_stage_recorded'
               AND exchange_id IS NULL AND matched_request_event_id IS NULL
               AND match_verified IS NULL)
           ),
         CONSTRAINT phase3_run_events_terminal_shape
           CHECK (
             (event_type IN ('attempt_finished','attempt_adjudicated')
               AND result IS NOT NULL AND teardown_result IS NOT NULL
               AND teardown_evidence_sha256 IS NOT NULL
               AND ((result IN ('awaiting_adjudication','passed')
                     AND reason_code IS NULL AND teardown_result = 'completed')
                 OR (result IN ('failed','interrupted') AND reason_code IS NOT NULL)))
             OR
             (event_type = 'attempt_not_started'
               AND reason_code IS NOT NULL AND result IS NULL
               AND teardown_result = 'not_required')
             OR
             (event_type NOT IN ('attempt_finished','attempt_adjudicated','attempt_not_started')
               AND result IS NULL AND teardown_result IS NULL
               AND teardown_evidence_sha256 IS NULL
               AND (event_type = 'lifecycle_stage_refused' OR reason_code IS NULL))
           )
       )`,

      `CREATE UNIQUE INDEX IF NOT EXISTS phase3_run_events_idempotency_unique
         ON phase3_run_events (run_attempt_id, idempotency_key)
         WHERE idempotency_key IS NOT NULL`,
      `CREATE UNIQUE INDEX IF NOT EXISTS phase3_run_events_one_heartbeat
         ON phase3_run_events (run_attempt_id) WHERE event_type = 'heartbeat_verified'`,
      `CREATE UNIQUE INDEX IF NOT EXISTS phase3_run_events_one_accepted_stage
         ON phase3_run_events (run_attempt_id, lifecycle_stage)
         WHERE event_type = 'lifecycle_stage_recorded'`,
      `CREATE UNIQUE INDEX IF NOT EXISTS phase3_run_events_one_refusal
         ON phase3_run_events (run_attempt_id) WHERE event_type = 'lifecycle_stage_refused'`,

      `CREATE OR REPLACE FUNCTION phase3_jsonb_exact_keys(value jsonb, expected text[])
         RETURNS boolean AS $$
       BEGIN
         IF value IS NULL OR jsonb_typeof(value) <> 'object' THEN
           RETURN false;
         END IF;
         RETURN (SELECT count(*) FROM jsonb_object_keys(value)) = cardinality(expected)
           AND NOT EXISTS (
             SELECT 1 FROM jsonb_object_keys(value) AS key
              WHERE NOT (key = ANY(expected))
           );
       END;
       $$ LANGUAGE plpgsql IMMUTABLE`,

      `CREATE OR REPLACE FUNCTION phase3_iso_timestamp_valid(value text)
         RETURNS boolean AS $$
       DECLARE
         parsed timestamptz;
       BEGIN
         IF value IS NULL OR value !~
            '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$' THEN
           RETURN false;
         END IF;
         BEGIN
           parsed := value::timestamptz;
         EXCEPTION WHEN others THEN
           RETURN false;
         END;
         RETURN to_char(parsed AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = value;
       END;
       $$ LANGUAGE plpgsql IMMUTABLE`,

      `CREATE OR REPLACE FUNCTION phase3_jsonb_string_matches(
           value jsonb,
           key text,
           pattern text
         ) RETURNS boolean AS $$
       BEGIN
         RETURN value IS NOT NULL
           AND jsonb_typeof(value) = 'object'
           AND jsonb_typeof(value->key) = 'string'
           AND COALESCE(value->>key,'') ~ pattern;
       END;
       $$ LANGUAGE plpgsql IMMUTABLE`,

      `CREATE OR REPLACE FUNCTION phase3_jsonb_positive_safe_integer(value jsonb)
         RETURNS boolean AS $$
       BEGIN
         IF value IS NULL OR jsonb_typeof(value) <> 'number'
            OR value#>>'{}' !~ '^[1-9][0-9]*$' THEN
           RETURN false;
         END IF;
         RETURN (value#>>'{}')::numeric <= 9007199254740991;
       END;
       $$ LANGUAGE plpgsql IMMUTABLE`,

      `CREATE OR REPLACE FUNCTION phase3_repository_evidence_valid(value jsonb, build_room boolean)
         RETURNS boolean AS $$
       BEGIN
         IF NOT phase3_jsonb_exact_keys(
           value,
           CASE WHEN build_room
             THEN ARRAY['repository','sha','treeSha','clean','buildPassed']
             ELSE ARRAY['repository','sha','treeSha','clean']
           END
         ) THEN
           RETURN false;
         END IF;
         RETURN phase3_jsonb_string_matches(
             value, 'repository', '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
           )
           AND phase3_jsonb_string_matches(value, 'sha', '^[0-9a-f]{40}$')
           AND phase3_jsonb_string_matches(value, 'treeSha', '^[0-9a-f]{40}$')
           AND jsonb_typeof(value->'clean') = 'boolean'
           AND (NOT build_room OR jsonb_typeof(value->'buildPassed') = 'boolean');
       END;
       $$ LANGUAGE plpgsql IMMUTABLE`,

      `CREATE OR REPLACE FUNCTION phase3_entry_evidence_valid(evidence jsonb)
         RETURNS boolean AS $$
       DECLARE
         expected jsonb;
         control_plane jsonb;
         doctor jsonb;
       BEGIN
         IF evidence IS NULL OR jsonb_typeof(evidence) <> 'object'
            OR jsonb_typeof(evidence->'observedAt') <> 'string'
            OR NOT phase3_iso_timestamp_valid(evidence->>'observedAt') THEN
           RETURN false;
         END IF;

         IF evidence->>'status' = 'incomplete' THEN
           IF NOT phase3_jsonb_exact_keys(
             evidence,
             ARRAY['status','observedAt','failureReason','expected']
           ) THEN
             RETURN false;
           END IF;
           expected := evidence->'expected';
           RETURN phase3_jsonb_exact_keys(
               expected,
               ARRAY['founderOsSha','buildRoomSha','fixtureRepository','fixtureSha',
                     'environment','machineIdentity','gatewayId']
             )
             AND phase3_jsonb_string_matches(evidence, 'failureReason', '^[a-z_]{1,64}$')
             AND phase3_jsonb_string_matches(expected, 'founderOsSha', '^[0-9a-f]{40}$')
             AND phase3_jsonb_string_matches(expected, 'buildRoomSha', '^[0-9a-f]{40}$')
             AND phase3_jsonb_string_matches(
               expected, 'fixtureRepository', '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'
             )
             AND phase3_jsonb_string_matches(expected, 'fixtureSha', '^[0-9a-f]{40}$')
             AND phase3_jsonb_string_matches(
               expected, 'environment', '^[A-Za-z0-9._:/+ -]{1,128}$'
             )
             AND phase3_jsonb_string_matches(
               expected, 'machineIdentity', '^[A-Za-z0-9._:/+ -]{1,128}$'
             )
             AND phase3_jsonb_string_matches(
               expected,
               'gatewayId',
               '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             );
         END IF;

         IF evidence->>'status' <> 'complete'
            OR NOT phase3_jsonb_exact_keys(
              evidence,
              ARRAY['status','observedAt','founderOs','buildRoom','fixture','controlPlane',
                    'machineIdentity','nodeMajor','enrollments','doctor']
            )
            OR NOT phase3_repository_evidence_valid(evidence->'founderOs', false)
            OR NOT phase3_repository_evidence_valid(evidence->'buildRoom', true)
            OR NOT phase3_repository_evidence_valid(evidence->'fixture', false)
            OR NOT phase3_jsonb_string_matches(
              evidence, 'machineIdentity', '^[A-Za-z0-9._:/+ -]{1,128}$'
            )
            OR NOT phase3_jsonb_positive_safe_integer(evidence->'nodeMajor')
            OR jsonb_typeof(evidence->'enrollments') <> 'array'
            OR jsonb_array_length(evidence->'enrollments') > 1000 THEN
           RETURN false;
         END IF;

         control_plane := evidence->'controlPlane';
         doctor := evidence->'doctor';
         IF NOT phase3_jsonb_exact_keys(control_plane, ARRAY['commit','environment','status'])
            OR NOT phase3_jsonb_string_matches(control_plane, 'commit', '^[0-9a-f]{40}$')
            OR NOT phase3_jsonb_string_matches(
              control_plane, 'environment', '^[A-Za-z0-9._:/+ -]{1,128}$'
            )
            OR NOT (
              control_plane->'status' = 'null'::jsonb
              OR (jsonb_typeof(control_plane->'status') = 'number'
                  AND COALESCE(control_plane->>'status','') ~ '^[1-5][0-9]{2}$')
            )
            OR NOT phase3_jsonb_exact_keys(
              doctor,
              ARRAY['daemonReachable','primaryLane','stagingLane','primaryCustody',
                    'stagingCustody','custodyError','stagingLockPresent']
            )
            OR jsonb_typeof(doctor->'daemonReachable') <> 'boolean'
            OR NOT phase3_jsonb_string_matches(
              doctor, 'primaryLane', '^[A-Za-z0-9._:/+ -]{1,128}$'
            )
            OR NOT phase3_jsonb_string_matches(
              doctor, 'stagingLane', '^[A-Za-z0-9._:/+ -]{1,128}$'
            )
            OR jsonb_typeof(doctor->'primaryCustody') <> 'boolean'
            OR jsonb_typeof(doctor->'stagingCustody') <> 'boolean'
            OR jsonb_typeof(doctor->'custodyError') <> 'boolean'
            OR jsonb_typeof(doctor->'stagingLockPresent') <> 'boolean' THEN
           RETURN false;
         END IF;

         IF EXISTS (
           SELECT 1
             FROM jsonb_array_elements(evidence->'enrollments') AS item
            WHERE NOT phase3_jsonb_exact_keys(item, ARRAY['gatewayId','state'])
               OR NOT phase3_jsonb_string_matches(
                    item,
                    'gatewayId',
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                  )
               OR jsonb_typeof(item->'state') <> 'string'
               OR COALESCE(item->>'state','') NOT IN
                  ('awaiting_approval','enrolled','denied','revoked','expired')
         ) THEN
           RETURN false;
         END IF;
         RETURN (
           SELECT count(*) = count(DISTINCT item->>'gatewayId')
             FROM jsonb_array_elements(evidence->'enrollments') AS item
         );
       END;
       $$ LANGUAGE plpgsql IMMUTABLE`,

      `CREATE OR REPLACE FUNCTION phase3_adjudication_evidence_valid(evidence jsonb)
         RETURNS boolean AS $$
       BEGIN
         RETURN phase3_jsonb_exact_keys(
             evidence,
             ARRAY['verdict','tier2ReviewerId','tier2EvidenceSha256','founderAuthorizationId']
           )
           AND jsonb_typeof(evidence->'verdict') = 'string'
           AND COALESCE(evidence->>'verdict','') IN ('passed','failed')
           AND phase3_jsonb_string_matches(
             evidence, 'tier2ReviewerId', '^[A-Za-z0-9._:/+() -]{1,128}$'
           )
           AND COALESCE(evidence->>'tier2ReviewerId','') ~ '[A-Za-z0-9]'
           AND phase3_jsonb_string_matches(
             evidence, 'tier2EvidenceSha256', '^[0-9a-f]{64}$'
           )
           AND phase3_jsonb_string_matches(
             evidence, 'founderAuthorizationId', '^[A-Za-z0-9._:/-]{1,128}$'
           );
       END;
       $$ LANGUAGE plpgsql IMMUTABLE`,
      `ALTER TABLE phase3_run_events
         ADD CONSTRAINT phase3_run_events_adjudication_shape
         CHECK (
           (event_type = 'attempt_adjudicated'
             AND phase3_adjudication_evidence_valid(adjudication)
             AND adjudication->>'verdict' = result)
           OR (event_type <> 'attempt_adjudicated' AND adjudication IS NULL)
         )`,

      `CREATE OR REPLACE FUNCTION phase3_run_events_validate_insert()
         RETURNS trigger AS $$
       DECLARE
         attempt phase3_run_attempts%ROWTYPE;
         expected_stage text;
         presented_position integer;
       BEGIN
         SELECT * INTO attempt
           FROM phase3_run_attempts
          WHERE run_attempt_id = NEW.run_attempt_id
          FOR UPDATE;
         IF NOT FOUND THEN
           RAISE EXCEPTION 'phase3_run_events invalid progression'
             USING ERRCODE = 'restrict_violation';
         END IF;

         IF NEW.event_type IN ('entry_verified','attempt_not_started') THEN
           IF NEW.entry_evidence_sha256 IS DISTINCT FROM attempt.entry_evidence_sha256 THEN
             RAISE EXCEPTION 'phase3_run_events invalid progression'
               USING ERRCODE = 'restrict_violation';
           END IF;
           IF phase3_entry_evidence_valid(NEW.entry_evidence) IS NOT TRUE THEN
             RAISE EXCEPTION 'phase3_run_events invalid entry evidence'
               USING ERRCODE = 'restrict_violation';
           END IF;
           IF (NEW.event_type = 'entry_verified' AND NEW.entry_evidence->>'status' <> 'complete')
              OR (NEW.event_type = 'attempt_not_started'
                  AND NEW.entry_evidence->>'status' = 'incomplete'
                  AND NEW.entry_evidence->>'failureReason' IS DISTINCT FROM NEW.reason_code) THEN
             RAISE EXCEPTION 'phase3_run_events invalid entry evidence'
               USING ERRCODE = 'restrict_violation';
           END IF;
           IF abs(extract(epoch FROM (
                (NEW.entry_evidence->>'observedAt')::timestamptz - attempt.started_at
              )) * 1000) >
              extract(epoch FROM (attempt.capture_expires_at - attempt.started_at)) * 1000 THEN
             RAISE EXCEPTION 'phase3_run_events invalid entry evidence'
               USING ERRCODE = 'restrict_violation';
           END IF;
         END IF;

         IF NEW.event_type = 'attempt_not_started' THEN
           IF NEW.event_index = 1
              AND attempt.state = 'not_started'
              AND attempt.last_event_index = 1
              AND attempt.started_at = NEW.occurred_at
              AND attempt.finished_at = NEW.occurred_at
              AND NOT EXISTS (
                SELECT 1 FROM phase3_run_events
                 WHERE run_attempt_id = NEW.run_attempt_id
              ) THEN
             RETURN NEW;
           END IF;
         ELSIF NEW.event_type = 'attempt_started' THEN
           IF NEW.event_index = 1
              AND attempt.state = 'active'
              AND attempt.last_event_index = 2
              AND attempt.heartbeat_captured IS FALSE
              AND attempt.lifecycle_position = 0
              AND attempt.started_at = NEW.occurred_at
              AND NOT EXISTS (
                SELECT 1 FROM phase3_run_events
                 WHERE run_attempt_id = NEW.run_attempt_id
              ) THEN
             RETURN NEW;
           END IF;
         ELSIF NEW.event_type = 'entry_verified' THEN
           IF NEW.event_index = 2
              AND attempt.state = 'active'
              AND attempt.last_event_index = 2
              AND attempt.heartbeat_captured IS FALSE
              AND attempt.lifecycle_position = 0
              AND attempt.started_at = NEW.occurred_at
              AND EXISTS (
                SELECT 1 FROM phase3_run_events
                 WHERE run_attempt_id = NEW.run_attempt_id
                   AND event_index = 1
                   AND event_type = 'attempt_started'
              )
              AND NOT EXISTS (
                SELECT 1 FROM phase3_run_events
                 WHERE run_attempt_id = NEW.run_attempt_id
                   AND event_index = 2
              ) THEN
             RETURN NEW;
           END IF;
         ELSIF NEW.event_index = attempt.last_event_index + 1 THEN
           expected_stage := CASE attempt.lifecycle_position
             WHEN 0 THEN 'connect'
             WHEN 1 THEN 'adapter_registered'
             WHEN 2 THEN 'request'
             WHEN 3 THEN 'matched_response'
             WHEN 4 THEN 'disconnect'
             ELSE NULL
           END;

           IF NEW.event_type = 'heartbeat_verified'
              AND attempt.state = 'active'
              AND attempt.heartbeat_captured IS FALSE
              AND attempt.lifecycle_position = 0 THEN
             RETURN NEW;
           END IF;

           IF NEW.event_type = 'lifecycle_stage_recorded'
              AND attempt.state = 'active'
              AND attempt.heartbeat_captured IS TRUE
              AND NEW.lifecycle_stage = expected_stage THEN
             IF NEW.lifecycle_stage <> 'matched_response'
                OR EXISTS (
                  SELECT 1 FROM phase3_run_events request
                   WHERE request.run_attempt_id = NEW.run_attempt_id
                     AND request.event_id = NEW.matched_request_event_id
                     AND request.event_type = 'lifecycle_stage_recorded'
                     AND request.lifecycle_stage = 'request'
                     AND request.exchange_id = NEW.exchange_id
                ) THEN
               RETURN NEW;
             END IF;
           END IF;

           IF NEW.event_type = 'lifecycle_stage_refused'
              AND attempt.state = 'active' THEN
             IF attempt.heartbeat_captured IS FALSE
                AND NEW.reason_code = 'out_of_order_stage' THEN
               RETURN NEW;
             END IF;
             presented_position := array_position(
               ARRAY['connect','adapter_registered','request','matched_response','disconnect'],
               NEW.lifecycle_stage
             ) - 1;
             IF attempt.heartbeat_captured IS TRUE
                AND NEW.lifecycle_stage IS DISTINCT FROM expected_stage
                AND ((presented_position < attempt.lifecycle_position
                      AND NEW.reason_code = 'duplicate_stage')
                  OR (presented_position > attempt.lifecycle_position
                      AND NEW.reason_code = 'out_of_order_stage')) THEN
               RETURN NEW;
             END IF;
             IF attempt.heartbeat_captured IS TRUE
                AND expected_stage = 'matched_response'
                AND NEW.lifecycle_stage = expected_stage
                AND NEW.reason_code = 'response_mismatch' THEN
               RETURN NEW;
             END IF;
           END IF;

           IF NEW.event_type = 'attempt_finished' THEN
             IF NEW.result = 'awaiting_adjudication'
                AND attempt.state = 'active'
                AND attempt.heartbeat_captured IS TRUE
                AND attempt.lifecycle_position = 5
                AND NEW.teardown_result = 'completed' THEN
               RETURN NEW;
             END IF;
             IF NEW.result IN ('failed','interrupted')
                AND attempt.state IN ('active','failure_pending_teardown')
                AND ((attempt.state = 'active'
                      AND attempt.lifecycle_position = 0
                      AND NEW.teardown_result = 'not_required')
                  OR NEW.teardown_result IN ('completed','failed'))
                AND (attempt.lifecycle_position < 5 OR NEW.teardown_result = 'completed') THEN
               RETURN NEW;
             END IF;
           END IF;
           IF NEW.event_type = 'attempt_adjudicated'
              AND attempt.state = 'awaiting_adjudication'
              AND attempt.heartbeat_captured IS TRUE
              AND attempt.lifecycle_position = 5
              AND NEW.result IN ('passed','failed')
              AND NEW.teardown_result = 'completed'
              AND EXISTS (
                SELECT 1 FROM phase3_run_events completed
                 WHERE completed.run_attempt_id = NEW.run_attempt_id
                   AND completed.event_index = attempt.last_event_index
                   AND completed.event_type = 'attempt_finished'
                   AND completed.result = 'awaiting_adjudication'
                   AND completed.teardown_evidence_sha256 = NEW.teardown_evidence_sha256
              )
              AND ((NEW.result = 'passed' AND NEW.reason_code IS NULL)
                OR (NEW.result = 'failed' AND NEW.reason_code = 'adjudication_failed')) THEN
             RETURN NEW;
           END IF;
         END IF;

         RAISE EXCEPTION 'phase3_run_events invalid progression'
           USING ERRCODE = 'restrict_violation';
       END;
       $$ LANGUAGE plpgsql`,
      `DROP TRIGGER IF EXISTS phase3_run_events_validate_insert ON phase3_run_events`,
      `CREATE TRIGGER phase3_run_events_validate_insert
         BEFORE INSERT ON phase3_run_events
         FOR EACH ROW EXECUTE FUNCTION phase3_run_events_validate_insert()`,

      `CREATE OR REPLACE FUNCTION phase3_run_event_projection_consistent()
         RETURNS trigger AS $$
       DECLARE
         projected_index integer;
       BEGIN
         SELECT last_event_index INTO projected_index
           FROM phase3_run_attempts
          WHERE run_attempt_id = NEW.run_attempt_id;
         IF projected_index IS NULL OR projected_index < NEW.event_index THEN
           RAISE EXCEPTION 'phase3_run_events projection not advanced'
             USING ERRCODE = 'restrict_violation';
         END IF;
         RETURN NULL;
       END;
       $$ LANGUAGE plpgsql`,
      `DROP TRIGGER IF EXISTS phase3_run_events_projection_consistent ON phase3_run_events`,
      `CREATE CONSTRAINT TRIGGER phase3_run_events_projection_consistent
         AFTER INSERT ON phase3_run_events
         DEFERRABLE INITIALLY DEFERRED
         FOR EACH ROW EXECUTE FUNCTION phase3_run_event_projection_consistent()`,

      `CREATE OR REPLACE FUNCTION phase3_run_attempt_initial_events_present()
         RETURNS trigger AS $$
       BEGIN
         IF NEW.state = 'not_started' THEN
           IF NOT EXISTS (
             SELECT 1 FROM phase3_run_events
              WHERE run_attempt_id = NEW.run_attempt_id
                AND event_index = 1
                AND event_type = 'attempt_not_started'
           ) THEN
             RAISE EXCEPTION 'phase3_run_attempts initial events missing'
               USING ERRCODE = 'restrict_violation';
           END IF;
         ELSIF NOT (
           EXISTS (
             SELECT 1 FROM phase3_run_events
              WHERE run_attempt_id = NEW.run_attempt_id
                AND event_index = 1
                AND event_type = 'attempt_started'
           )
           AND EXISTS (
             SELECT 1 FROM phase3_run_events
              WHERE run_attempt_id = NEW.run_attempt_id
                AND event_index = 2
                AND event_type = 'entry_verified'
           )
         ) THEN
           RAISE EXCEPTION 'phase3_run_attempts initial events missing'
             USING ERRCODE = 'restrict_violation';
         END IF;
         RETURN NULL;
       END;
       $$ LANGUAGE plpgsql`,
      `DROP TRIGGER IF EXISTS phase3_run_attempts_initial_events_present ON phase3_run_attempts`,
      `CREATE CONSTRAINT TRIGGER phase3_run_attempts_initial_events_present
         AFTER INSERT ON phase3_run_attempts
         DEFERRABLE INITIALLY DEFERRED
         FOR EACH ROW EXECUTE FUNCTION phase3_run_attempt_initial_events_present()`,

      `CREATE OR REPLACE FUNCTION phase3_run_attempts_protect_identity()
         RETURNS trigger AS $$
       DECLARE
         appended_type text;
         appended_stage text;
         appended_result text;
         appended_reason text;
         appended_teardown text;
         appended_occurred timestamptz;
       BEGIN
         IF TG_OP = 'DELETE' THEN
           RAISE EXCEPTION 'phase3_run_attempts retained projection: DELETE rejected'
             USING ERRCODE = 'restrict_violation';
         END IF;
         IF OLD.run_attempt_id          IS DISTINCT FROM NEW.run_attempt_id
            OR OLD.attempt_seq          IS DISTINCT FROM NEW.attempt_seq
            OR OLD.run_label            IS DISTINCT FROM NEW.run_label
            OR OLD.entry_authorization_id IS DISTINCT FROM NEW.entry_authorization_id
            OR OLD.revocation_authorization_id IS DISTINCT FROM NEW.revocation_authorization_id
            OR OLD.founder_os_sha       IS DISTINCT FROM NEW.founder_os_sha
            OR OLD.build_room_sha       IS DISTINCT FROM NEW.build_room_sha
            OR OLD.fixture_repository   IS DISTINCT FROM NEW.fixture_repository
            OR OLD.fixture_sha          IS DISTINCT FROM NEW.fixture_sha
            OR OLD.requested_gateway_id IS DISTINCT FROM NEW.requested_gateway_id
            OR OLD.gateway_id           IS DISTINCT FROM NEW.gateway_id
            OR OLD.enrollment_projection_sha256 IS DISTINCT FROM NEW.enrollment_projection_sha256
            OR OLD.machine_identity     IS DISTINCT FROM NEW.machine_identity
            OR OLD.environment_label    IS DISTINCT FROM NEW.environment_label
            OR OLD.entry_evidence_sha256 IS DISTINCT FROM NEW.entry_evidence_sha256
            OR OLD.started_at           IS DISTINCT FROM NEW.started_at
            OR OLD.capture_expires_at   IS DISTINCT FROM NEW.capture_expires_at
            OR OLD.created_at           IS DISTINCT FROM NEW.created_at THEN
           RAISE EXCEPTION 'phase3_run_attempts immutable identity: UPDATE rejected'
             USING ERRCODE = 'restrict_violation';
         END IF;

         IF NEW.last_event_index <> OLD.last_event_index + 1 THEN
           RAISE EXCEPTION 'phase3_run_attempts projection update lacks matching event'
             USING ERRCODE = 'restrict_violation';
         END IF;
         SELECT event_type, lifecycle_stage, result, reason_code, teardown_result, occurred_at
           INTO appended_type, appended_stage, appended_result, appended_reason,
                appended_teardown, appended_occurred
           FROM phase3_run_events
          WHERE run_attempt_id = NEW.run_attempt_id
            AND event_index = NEW.last_event_index;
         IF NOT FOUND THEN
           RAISE EXCEPTION 'phase3_run_attempts projection update lacks matching event'
             USING ERRCODE = 'restrict_violation';
         END IF;

         IF OLD.state = 'active'
            AND NEW.heartbeat_captured IS TRUE AND OLD.heartbeat_captured IS FALSE
            AND NEW.lifecycle_position = OLD.lifecycle_position
            AND NEW.state = OLD.state
            AND NEW.finished_at IS NOT DISTINCT FROM OLD.finished_at
            AND appended_type = 'heartbeat_verified' THEN
           RETURN NEW;
         END IF;

         IF OLD.state = 'active'
            AND OLD.heartbeat_captured IS TRUE
            AND NEW.heartbeat_captured = OLD.heartbeat_captured
            AND NEW.lifecycle_position = OLD.lifecycle_position + 1
            AND NEW.state = OLD.state
            AND NEW.finished_at IS NOT DISTINCT FROM OLD.finished_at
            AND appended_type = 'lifecycle_stage_recorded'
            AND appended_stage = (CASE OLD.lifecycle_position
              WHEN 0 THEN 'connect'
              WHEN 1 THEN 'adapter_registered'
              WHEN 2 THEN 'request'
              WHEN 3 THEN 'matched_response'
              WHEN 4 THEN 'disconnect'
              ELSE NULL
            END) THEN
           RETURN NEW;
         END IF;

         IF NEW.heartbeat_captured = OLD.heartbeat_captured
            AND NEW.lifecycle_position = OLD.lifecycle_position
            AND OLD.state = 'active'
            AND NEW.state = 'failure_pending_teardown'
            AND NEW.finished_at IS NOT DISTINCT FROM OLD.finished_at
            AND appended_type = 'lifecycle_stage_refused' THEN
           RETURN NEW;
         END IF;

         IF NEW.heartbeat_captured = OLD.heartbeat_captured
            AND NEW.lifecycle_position = OLD.lifecycle_position
            AND OLD.state = 'active'
            AND NEW.state = 'awaiting_adjudication'
            AND OLD.heartbeat_captured IS TRUE
            AND OLD.lifecycle_position = 5
            AND NEW.finished_at IS NULL
            AND appended_type = 'attempt_finished'
            AND appended_result = 'awaiting_adjudication'
            AND appended_teardown = 'completed' THEN
           RETURN NEW;
         END IF;

         IF NEW.heartbeat_captured = OLD.heartbeat_captured
            AND NEW.lifecycle_position = OLD.lifecycle_position
            AND OLD.state IN ('active','failure_pending_teardown')
            AND NEW.state IN ('failed','interrupted')
            AND appended_type = 'attempt_finished'
            AND appended_result = NEW.state
            AND NEW.finished_at IS NOT DISTINCT FROM appended_occurred
            AND ((OLD.state = 'active' AND OLD.lifecycle_position = 0
                  AND appended_teardown = 'not_required')
              OR appended_teardown IN ('completed','failed'))
            AND (OLD.lifecycle_position < 5 OR appended_teardown = 'completed') THEN
           RETURN NEW;
         END IF;

         IF NEW.heartbeat_captured = OLD.heartbeat_captured
            AND NEW.lifecycle_position = OLD.lifecycle_position
            AND OLD.state = 'awaiting_adjudication'
            AND NEW.state IN ('passed','failed')
            AND appended_type = 'attempt_adjudicated'
            AND appended_result = NEW.state
            AND ((NEW.state = 'passed' AND appended_reason IS NULL)
              OR (NEW.state = 'failed' AND appended_reason = 'adjudication_failed'))
            AND appended_teardown = 'completed'
            AND NEW.finished_at IS NOT DISTINCT FROM appended_occurred THEN
           RETURN NEW;
         END IF;

         RAISE EXCEPTION 'phase3_run_attempts projection update lacks matching event'
           USING ERRCODE = 'restrict_violation';
       END;
       $$ LANGUAGE plpgsql`,
      `DROP TRIGGER IF EXISTS phase3_run_attempts_protect ON phase3_run_attempts`,
      `CREATE TRIGGER phase3_run_attempts_protect
         BEFORE UPDATE OR DELETE ON phase3_run_attempts
         FOR EACH ROW EXECUTE FUNCTION phase3_run_attempts_protect_identity()`,

      `CREATE OR REPLACE FUNCTION phase3_run_events_immutable()
         RETURNS trigger AS $$
       BEGIN
         RAISE EXCEPTION 'phase3_run_events is append-only: % rejected', TG_OP
           USING ERRCODE = 'restrict_violation';
       END;
       $$ LANGUAGE plpgsql`,
      `DROP TRIGGER IF EXISTS phase3_run_events_no_update ON phase3_run_events`,
      `CREATE TRIGGER phase3_run_events_no_update
         BEFORE UPDATE ON phase3_run_events
         FOR EACH ROW EXECUTE FUNCTION phase3_run_events_immutable()`,
      `DROP TRIGGER IF EXISTS phase3_run_events_no_delete ON phase3_run_events`,
      `CREATE TRIGGER phase3_run_events_no_delete
         BEFORE DELETE ON phase3_run_events
         FOR EACH ROW EXECUTE FUNCTION phase3_run_events_immutable()`,
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

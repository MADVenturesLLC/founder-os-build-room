/**
 * Read-only boot schema preflight — PR 2b Tranche A (r6 §2.8, §12 R-4/R-5;
 * staged-enforcement rulings r3/r5 §3).
 *
 * This module REPLACES the boot-applied `migrate(pool)` call. The contract it
 * keeps is the original boot contract — "the process does not begin serving
 * until the schema is present" — and the actor it changes is the runtime: the
 * runtime now ASSERTS the schema, and only the administrative plane ever
 * changes it (r6 §12: "Runtime must never regain owner authority to repair
 * schema automatically").
 *
 * Hard rules, structural rather than conventional:
 *
 *   - **Read-only.** Every statement this module issues is a `SELECT` against
 *     `pg_catalog` / `information_schema` / `schema_migrations`. There is no
 *     DDL path, no repair path, and no `INSERT`/`UPDATE`/`DELETE`. A-R2/A-T2
 *     observe this from the database side with an event trigger: zero DDL on
 *     the boot connection.
 *   - **Fail closed on schema.** A missing required `schema_migrations` id —
 *     or an unrecordable schema state (no `schema_migrations` table at all,
 *     unreadable catalog) — rejects with `SchemaPreflightError` BEFORE
 *     readiness, so `main()` exits non-zero and the process never answers
 *     `/health` (PC-22). It reports and exits; it never creates, alters, or
 *     repairs (r6 §12).
 *   - **Privilege audit is detection-only in Tranche A** (staged enforcement,
 *     r3 §3 / r5 §3). While the documented owner-class runtime remains in
 *     use, forbidden attributes/memberships are READ and REPORTED as
 *     `pending_cutover`; they MUST NOT block boot and MUST NOT be reported
 *     as compliance. Hard enforcement of the privilege audit takes effect
 *     only in Tranche D, after `DATABASE_URL` is cut over to
 *     `br_app_runtime` — this module structures for that switch by exposing
 *     the audit separately (`auditRuntimePrivileges`) and keeping its
 *     blocking decision out of Tranche A's boot path.
 *   - **Emission ban** (r3 §3.4 / r5 §3.4). No secret or credential value is
 *     emitted. Errors name ids, roles, and catalog attributes only — never
 *     connection strings, passwords, or tokens.
 */

import type { Pool, PoolClient } from 'pg';
import { MIGRATIONS } from './migrations.js';

/** The ids every deployed runtime schema must record (r6 §12; r1 §4.1 A-N1). */
export const REQUIRED_MIGRATION_IDS: readonly string[] = MIGRATIONS.map((m) => m.id);

/**
 * Forbidden role attributes (r6 §3.2). The runtime login must hold NONE of
 * them once Tranche D cuts over; in Tranche A their presence is an audit
 * FINDING, not a boot failure.
 */
export const FORBIDDEN_ROLE_ATTRIBUTES = [
  'rolsuper',
  'rolcreaterole',
  'rolcreatedb',
  'rolbypassrls',
  'rolreplication',
] as const;

/**
 * Forbidden membership targets (r6 §3.2, R-1): any edge — direct or
 * transitive, with ANY modifier including `INHERIT FALSE` / `SET FALSE` —
 * from the runtime login to these roles is a finding. The audit walks
 * `pg_auth_members` recursively because R-1's measurement showed modifier
 * edges still execute `SET ROLE`.
 */
export const FORBIDDEN_MEMBERSHIP_ROLES = [
  'neondb_owner',
  'neon_superuser',
  'br_journal_owner',
  'command_journal_writer',
] as const;

/** `pg_read_all_data` / `pg_write_all_data`-class predefined roles (r6 §3.2). */
export const FORBIDDEN_PREDEFINED_ROLE_PREFIXES = ['pg_write_all_data', 'pg_read_all_data'] as const;

/** The staged-enforcement status of the privilege audit. */
export type PrivilegeAuditStatus = 'pending_cutover';

export interface PrivilegeAudit {
  /** The role the audited connection is actually running as. */
  readonly role: string;
  /**
   * Tranche A: always `pending_cutover` — the audit detects and reports, and
   * defers the hard-fail decision to Tranche D. It never declares compliance:
   * an empty findings list means "nothing forbidden OBSERVED on this
   * connection", not "this deployment is authorized to serve".
   */
  readonly status: PrivilegeAuditStatus;
  /** Forbidden attributes observed on the connected role (may be empty). */
  readonly forbiddenAttributes: readonly string[];
  /**
   * Forbidden memberships reachable from the connected role, each rendered
   * `<role>@depth<N>` along the recursive walk. Modifier edges included —
   * a `WITH INHERIT FALSE` edge appears exactly like a plain one (R-1/R-3).
   */
  readonly forbiddenMemberships: readonly string[];
}

export interface SchemaPreflightReport {
  readonly ok: true;
  /** The role the preflight ran as (informational; never a secret). */
  readonly role: string;
  /** Every required migration id present in `schema_migrations`. */
  readonly migrationsPresent: readonly string[];
  /** The detection-only privilege audit (staged enforcement, r5 §3.2). */
  readonly privilegeAudit: PrivilegeAudit;
}

/**
 * The single failure type of this module. Carries the missing ids so the
 * boot log can name exactly what the administrative plane must apply —
 * and nothing that could be a credential.
 */
export class SchemaPreflightError extends Error {
  readonly missingMigrations: readonly string[];

  constructor(message: string, missingMigrations: readonly string[] = []) {
    super(message);
    this.name = 'SchemaPreflightError';
    this.missingMigrations = missingMigrations;
  }
}

type Queryable = Pool | PoolClient;

/**
 * The read-only privilege audit, catalog-only by construction: it queries
 * `pg_roles` / `pg_auth_members`, which any role may read, so it works even
 * on a zero-grant connection (the A-R3 fixture proves this through SET ROLE).
 *
 * Detection only. Never blocks, never repairs, never emits a credential.
 */
export async function auditRuntimePrivileges(target: Queryable): Promise<PrivilegeAudit> {
  let role: string;
  let forbiddenAttributes: string[];
  let forbiddenMemberships: string[];

  try {
    const who = await target.query<{ rolname: string }>('SELECT current_user AS rolname');
    role = who.rows[0]?.rolname ?? '(unknown)';

    /*
     * Attributes of the connected role. Catalog read, no privilege needed.
     * A query failure here is fail-closed at the CALLER (schemaPreflight
     * treats an unreadable catalog as incompatible), never silently clean.
     * The five forbidden flags come back as one boolean row and are mapped
     * against the enumerated names — names live in this module, not in SQL.
     */
    const attrs = await target.query<{
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolbypassrls: boolean;
      rolreplication: boolean;
    }>(
      `SELECT r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolbypassrls, r.rolreplication
         FROM pg_roles r
        WHERE r.rolname = current_user`,
    );
    const row = attrs.rows[0];
    if (row === undefined) {
      throw new SchemaPreflightError(
        'privilege audit found no pg_roles entry for the connected role',
      );
    }
    forbiddenAttributes = FORBIDDEN_ROLE_ATTRIBUTES.filter((attr) => row[attr]);

    /*
     * Memberships: a recursive walk over pg_auth_members, so transitive and
     * modifier-bearing edges (INHERIT FALSE / SET FALSE) are found at any
     * depth — R-1 proved a single-level lookup misses the SET-ROLE path.
     * `pg_read_all_data` / `pg_write_all_data`-class predefined roles are
     * matched by prefix on the target role name.
     */
    const members = await target.query<{ member_role: string; depth: number }>(
      `WITH RECURSIVE edges AS (
         SELECT m.member, m.roleid, 1 AS depth
           FROM pg_auth_members m
           JOIN pg_roles r ON r.oid = m.member
          WHERE r.rolname = current_user
         UNION ALL
         SELECT m.member, m.roleid, e.depth + 1
           FROM pg_auth_members m
           JOIN edges e ON e.roleid = m.member
          WHERE e.depth < 16
       )
       SELECT DISTINCT gr.rolname AS member_role, min(e.depth) AS depth
         FROM edges e
         JOIN pg_roles gr ON gr.oid = e.roleid
        GROUP BY gr.rolname
        ORDER BY gr.rolname`,
    );

    const forbiddenTargets = new Set<string>(FORBIDDEN_MEMBERSHIP_ROLES);
    forbiddenMemberships = members.rows
      .filter(
        (row) =>
          forbiddenTargets.has(row.member_role) ||
          FORBIDDEN_PREDEFINED_ROLE_PREFIXES.some((prefix) => row.member_role.startsWith(prefix)),
      )
      .map((row) => `${row.member_role}@depth${row.depth}`);
  } catch (error) {
    /*
     * Fail closed on an unreadable catalog: an audit that cannot read
     * pg_roles/pg_auth_members must not report "clean". The error carries no
     * connection detail beyond PostgreSQL's own message (which never contains
     * a password).
     */
    throw new SchemaPreflightError(
      `privilege audit could not read the role catalog: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return {
    role,
    status: 'pending_cutover',
    forbiddenAttributes,
    forbiddenMemberships,
  };
}

/**
 * The boot assertion itself. Resolves ONLY when every required migration id
 * is recorded in `schema_migrations`; rejects with `SchemaPreflightError`
 * otherwise — before the caller may become ready. Read-only throughout: a
 * rejection leaves the catalog byte-identical (A-R4/A-R5 prove this with an
 * event trigger and a before/after catalog snapshot).
 *
 * The privilege audit rides along in the report as detection-only
 * (`pending_cutover`); it never contributes to the rejection in Tranche A.
 * Tranche D wires `auditRuntimePrivileges` findings into a hard-fail — the
 * seam is the separate export above.
 */
export async function schemaPreflight(target: Queryable): Promise<SchemaPreflightReport> {
  /*
   * `schema_migrations` must exist and be readable. Its absence is the
   * degenerate incompatible-schema case: the database was never migrated.
   * `to_regclass` is a catalog function (no DDL); a NULL means "not there".
   */
  const table = await target.query<{ reg: string | null }>(
    `SELECT to_regclass('public.schema_migrations')::text AS reg`,
  ).catch((error: unknown) => {
    throw new SchemaPreflightError(
      `schema preflight could not read the catalog: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });

  if (table.rows[0]?.reg === null || table.rows[0]?.reg === undefined) {
    throw new SchemaPreflightError(
      'schema preflight failed: schema_migrations is absent — the administrative ' +
        'plane must migrate this database before the runtime may serve ' +
        '(read-only: no repair attempted)',
      [...REQUIRED_MIGRATION_IDS],
    );
  }

  const present = await target
    .query<{ id: string }>('SELECT id FROM schema_migrations')
    .catch((error: unknown) => {
      throw new SchemaPreflightError(
        `schema preflight could not read schema_migrations: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

  const presentIds = new Set(present.rows.map((row) => row.id));
  const missing = REQUIRED_MIGRATION_IDS.filter((id) => !presentIds.has(id));

  // The audit is detection-only here, but it still must not fail open: an
  // unreadable role catalog rejects (see auditRuntimePrivileges).
  const privilegeAudit = await auditRuntimePrivileges(target);

  if (missing.length > 0) {
    /*
     * Fail closed, naming exactly what the administrative plane must apply.
     * The message contains migration ids only — never a credential, never a
     * connection string (emission ban, r5 §3.4).
     */
    throw new SchemaPreflightError(
      `schema preflight failed: required migration id(s) absent from ` +
        `schema_migrations: ${missing.join(', ')} — the runtime does not ` +
        `repair schema; the administrative plane must migrate this database ` +
        `before the runtime may serve`,
      missing,
    );
  }

  return {
    ok: true,
    role: privilegeAudit.role,
    migrationsPresent: [...REQUIRED_MIGRATION_IDS],
    privilegeAudit,
  };
}

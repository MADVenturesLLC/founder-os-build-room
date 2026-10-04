/**
 * Boot-time privilege enforcement, keyed on the connected role (PR 2b
 * Tranche D; Founder decision of 2026-10-04).
 *
 *   - `br_app_runtime` with ANY forbidden attribute or membership refuses to
 *     boot; with none it boots, labelled `enforced`;
 *   - any other role — `neondb_owner` until cutover step 10, a CI superuser —
 *     is tolerated and labelled `pending_cutover`, findings reported, so a
 *     rollback of `DATABASE_URL` to the owner identity restores service;
 *   - the refusal names attributes and memberships only, never anything that
 *     could be a credential.
 *
 * These cases need no database. The audit's SQL is exercised against a real
 * PostgreSQL in `schema-preflight.storage.test.ts` and
 * `runtime-role-boot.storage.test.ts`; here a fake answers the audit's four
 * catalog reads, so the DECISION logic is verified in the credential-free
 * `build-and-test` job as well.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { MIGRATIONS } from '../packages/control-plane/src/migrations.js';
import {
  ENFORCED_RUNTIME_ROLE,
  REQUIRED_MIGRATION_IDS,
  SchemaPreflightError,
  auditRuntimePrivileges,
  privilegeAuditRefusal,
  schemaPreflight,
  type PrivilegeAudit,
} from '../packages/control-plane/src/schema-preflight.js';
import { JOURNAL_RUNTIME_ROLE } from '../packages/control-plane/src/journal-store.js';

interface Connection {
  readonly role: string;
  /** Attribute flags that read `true` for the role; everything else is `false`. */
  readonly attributes?: readonly string[];
  /** `{ role, depth }` edges the recursive membership walk returns. */
  readonly memberships?: readonly { role: string; depth: number }[];
  /** Migration ids recorded in `schema_migrations`; defaults to every required id. */
  readonly recorded?: readonly string[];
}

/**
 * A stand-in for the four catalog reads `schemaPreflight` and
 * `auditRuntimePrivileges` make. Matched by the SQL's own distinguishing text;
 * an unexpected statement throws, so a new read cannot slip in unobserved.
 */
function connection(spec: Connection): Pool {
  const flags = new Set(spec.attributes ?? []);
  const fake = {
    async query(sql: string): Promise<{ rows: unknown[] }> {
      if (sql.includes('SELECT current_user')) return { rows: [{ rolname: spec.role }] };
      if (sql.includes('r.rolsuper')) {
        return {
          rows: [
            {
              rolsuper: flags.has('rolsuper'),
              rolcreaterole: flags.has('rolcreaterole'),
              rolcreatedb: flags.has('rolcreatedb'),
              rolbypassrls: flags.has('rolbypassrls'),
              rolreplication: flags.has('rolreplication'),
            },
          ],
        };
      }
      if (sql.includes('WITH RECURSIVE edges')) {
        return {
          rows: (spec.memberships ?? []).map((m) => ({ member_role: m.role, depth: m.depth, truncated: false })),
        };
      }
      if (sql.includes('to_regclass')) return { rows: [{ reg: 'public.schema_migrations' }] };
      if (sql.includes('FROM schema_migrations')) {
        return { rows: (spec.recorded ?? REQUIRED_MIGRATION_IDS).map((id) => ({ id })) };
      }
      throw new Error(`unexpected statement in the fake connection: ${sql.slice(0, 80)}`);
    },
  };
  return fake as unknown as Pool;
}

const RUNTIME = ENFORCED_RUNTIME_ROLE;

describe('privilege audit enforcement — the runtime identity', () => {
  it('boots when br_app_runtime holds nothing forbidden, labelled enforced', async () => {
    const report = await schemaPreflight(connection({ role: RUNTIME }));
    assert.equal(report.role, RUNTIME);
    assert.equal(report.privilegeAudit.status, 'enforced');
    assert.deepEqual(report.privilegeAudit.forbiddenAttributes, []);
    assert.deepEqual(report.privilegeAudit.forbiddenMemberships, []);
  });

  for (const attribute of ['rolsuper', 'rolcreaterole', 'rolcreatedb', 'rolbypassrls', 'rolreplication']) {
    it(`refuses to boot when br_app_runtime holds ${attribute}`, async () => {
      const error = await schemaPreflight(connection({ role: RUNTIME, attributes: [attribute] })).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      assert.ok(error instanceof SchemaPreflightError, 'the preflight must reject with SchemaPreflightError');
      assert.match(error.message, new RegExp(attribute));
      assert.match(error.message, /privilege audit refused/);
      assert.match(error.message, /br_app_runtime/);
    });
  }

  for (const target of ['neondb_owner', 'neon_superuser', 'br_journal_owner', 'command_journal_writer']) {
    it(`refuses to boot when br_app_runtime is a member of ${target}, at any depth`, async () => {
      const error = await schemaPreflight(
        connection({ role: RUNTIME, memberships: [{ role: 'intermediate_role', depth: 1 }, { role: target, depth: 2 }] }),
      ).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      assert.ok(error instanceof SchemaPreflightError);
      assert.match(error.message, new RegExp(`${target}@depth2`));
    });
  }

  it('refuses a predefined data-access role by prefix', async () => {
    const error = await schemaPreflight(
      connection({ role: RUNTIME, memberships: [{ role: 'pg_write_all_data', depth: 1 }] }),
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    assert.ok(error instanceof SchemaPreflightError);
    assert.match(error.message, /pg_write_all_data@depth1/);
  });

  it('refuses on a missing migration as well, so the schema contract still holds for the runtime', async () => {
    const error = await schemaPreflight(connection({ role: RUNTIME, recorded: REQUIRED_MIGRATION_IDS.slice(0, -1) })).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    assert.ok(error instanceof SchemaPreflightError);
    assert.deepEqual(error.missingMigrations, [REQUIRED_MIGRATION_IDS.at(-1)]);
  });

  it('the refusal names attributes and memberships only, never a credential-shaped string', async () => {
    const error = await schemaPreflight(
      connection({ role: RUNTIME, attributes: ['rolcreatedb'], memberships: [{ role: 'br_journal_owner', depth: 1 }] }),
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    assert.ok(error instanceof SchemaPreflightError);
    assert.match(error.message, /rolcreatedb/);
    assert.match(error.message, /br_journal_owner@depth1/);
    assert.doesNotMatch(error.message, /postgres(ql)?:\/\//i, 'no connection string');
    assert.doesNotMatch(error.message, /password|secret|token/i, 'no credential vocabulary');
  });
});

describe('privilege audit enforcement — every other role is tolerated until cutover step 10', () => {
  for (const role of ['neondb_owner', 'postgres', 'some_ci_login']) {
    it(`${role} boots with findings reported and the audit labelled pending_cutover`, async () => {
      const report = await schemaPreflight(
        connection({
          role,
          attributes: ['rolcreaterole', 'rolcreatedb', 'rolbypassrls', 'rolreplication'],
          memberships: [
            { role: 'neon_superuser', depth: 1 },
            { role: 'pg_write_all_data', depth: 2 },
          ],
        }),
      );
      assert.equal(report.privilegeAudit.status, 'pending_cutover');
      assert.deepEqual(report.privilegeAudit.forbiddenAttributes, [
        'rolcreaterole',
        'rolcreatedb',
        'rolbypassrls',
        'rolreplication',
      ]);
      assert.deepEqual(report.privilegeAudit.forbiddenMemberships, ['neon_superuser@depth1', 'pg_write_all_data@depth2']);
    });
  }

  it('a missing migration still refuses the owner-class runtime: the schema contract is not staged', async () => {
    const error = await schemaPreflight(connection({ role: 'neondb_owner', recorded: [] })).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    assert.ok(error instanceof SchemaPreflightError);
  });

  it('auditRuntimePrivileges itself never blocks: it labels and reports for either mode', async () => {
    const owner = await auditRuntimePrivileges(connection({ role: 'neondb_owner', attributes: ['rolsuper'] }));
    const runtime = await auditRuntimePrivileges(connection({ role: RUNTIME, attributes: ['rolsuper'] }));
    assert.equal(owner.status, 'pending_cutover');
    assert.equal(runtime.status, 'enforced');
    assert.deepEqual(runtime.forbiddenAttributes, ['rolsuper']);
  });
});

describe('privilegeAuditRefusal', () => {
  const base: PrivilegeAudit = { role: RUNTIME, status: 'enforced', forbiddenAttributes: [], forbiddenMemberships: [] };

  it('is null for a clean enforced audit', () => {
    assert.equal(privilegeAuditRefusal(base), null);
  });

  it('is null for a pending_cutover audit even with findings', () => {
    assert.equal(
      privilegeAuditRefusal({ ...base, role: 'neondb_owner', status: 'pending_cutover', forbiddenAttributes: ['rolsuper'] }),
      null,
    );
  });

  it('names both kinds of finding when both are present', () => {
    const refusal = privilegeAuditRefusal({
      ...base,
      forbiddenAttributes: ['rolcreatedb'],
      forbiddenMemberships: ['neondb_owner@depth1'],
    });
    assert.ok(refusal !== null);
    assert.match(refusal, /attributes \[rolcreatedb\]/);
    assert.match(refusal, /memberships \[neondb_owner@depth1\]/);
  });
});

describe('the runtime role has one name', () => {
  it('the enforced role is the role the journal latch requires', () => {
    assert.equal(ENFORCED_RUNTIME_ROLE, JOURNAL_RUNTIME_ROLE);
  });

  it('migration 0006 creates that role, and 0008 grants to it and to nothing else', () => {
    const journal = MIGRATIONS.find((m) => m.id === '0006_command_journal_authority_split');
    assert.ok(journal !== undefined);
    assert.ok(
      journal.statements.some((sql) => new RegExp(`CREATE ROLE ${ENFORCED_RUNTIME_ROLE}\\b`).test(sql)),
      '0006 must create the enforced runtime role',
    );
    const grants = MIGRATIONS.find((m) => m.id === '0008_runtime_operational_grants');
    assert.ok(grants !== undefined);
    for (const sql of grants.statements) {
      assert.match(sql, /^GRANT\b/, 'every 0008 statement is a GRANT');
      assert.match(sql, new RegExp(`TO ${ENFORCED_RUNTIME_ROLE}\\s*$`), 'to the runtime role only');
      assert.doesNotMatch(sql, /\bALL\b/i, 'no blanket ALL (r6 §3.3)');
      assert.doesNotMatch(sql, /\bTO\s+PUBLIC\b/i, 'nothing granted to PUBLIC');
      assert.doesNotMatch(sql, /command_journal/, 'nothing on the journal');
      assert.doesNotMatch(sql, /WITH GRANT OPTION/i, 'the runtime cannot re-grant');
    }
  });
});

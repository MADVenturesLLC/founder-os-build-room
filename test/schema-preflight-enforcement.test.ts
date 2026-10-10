/**
 * Boot-time privilege enforcement (PR 2b Tranche D; Founder decision of
 * 2026-10-04; Founder act of 2026-10-10 ending the tolerance for other roles).
 *
 *   - `br_app_runtime` with ANY forbidden attribute or membership refuses to
 *     boot; with none it boots, labelled `enforced`;
 *   - any other role — `neondb_owner`, a superuser, any other login — refuses
 *     to boot whatever it holds, so rolling `DATABASE_URL` back to the owner
 *     identity no longer restores service;
 *   - the refusals name the roles, attributes and memberships only, never
 *     anything that could be a credential.
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

describe('privilege audit enforcement — every other role is refused', () => {
  for (const role of ['neondb_owner', 'postgres', 'some_ci_login']) {
    it(`${role} is refused before readiness even when it holds nothing forbidden`, async () => {
      const error = await schemaPreflight(connection({ role })).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      assert.ok(error instanceof SchemaPreflightError, 'the preflight must reject with SchemaPreflightError');
      assert.equal(error.missingMigrations.length, 0, 'refused for its identity, not for the schema');
      assert.match(error.message, new RegExp(`the connected role is ${role}, not the runtime identity br_app_runtime`));
    });

    it(`${role} is refused when it holds forbidden authority, and the refusal names only the two roles`, async () => {
      const error = await schemaPreflight(
        connection({
          role,
          attributes: ['rolsuper', 'rolcreaterole', 'rolcreatedb', 'rolbypassrls', 'rolreplication'],
          memberships: [
            { role: 'neon_superuser', depth: 1 },
            { role: 'pg_write_all_data', depth: 2 },
          ],
        }),
      ).then(
        () => undefined,
        (caught: unknown) => caught,
      );
      assert.ok(error instanceof SchemaPreflightError);
      assert.match(error.message, new RegExp(role));
      assert.match(error.message, /br_app_runtime/);
      assert.doesNotMatch(error.message, /rol(super|createrole|createdb|bypassrls|replication)/, 'no attribute list');
      assert.doesNotMatch(error.message, /@depth/, 'no membership list');
      assert.doesNotMatch(error.message, /postgres(ql)?:\/\//i, 'no connection string');
      assert.doesNotMatch(error.message, /password|secret|token/i, 'no credential vocabulary');
    });
  }

  it('a role other than br_app_runtime is refused before the schema check, even with nothing recorded', async () => {
    const error = await schemaPreflight(connection({ role: 'neondb_owner', recorded: [] })).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    assert.ok(error instanceof SchemaPreflightError);
    assert.match(error.message, /not the runtime identity/);
  });

  it('auditRuntimePrivileges itself never blocks: it reads and reports for any role', async () => {
    const owner = await auditRuntimePrivileges(connection({ role: 'neondb_owner', attributes: ['rolsuper'] }));
    const runtime = await auditRuntimePrivileges(connection({ role: RUNTIME, attributes: ['rolsuper'] }));
    assert.equal(owner.status, 'enforced');
    assert.deepEqual(owner.forbiddenAttributes, ['rolsuper']);
    assert.equal(runtime.status, 'enforced');
    assert.deepEqual(runtime.forbiddenAttributes, ['rolsuper']);
  });
});

describe('privilegeAuditRefusal', () => {
  const base: PrivilegeAudit = { role: RUNTIME, status: 'enforced', forbiddenAttributes: [], forbiddenMemberships: [] };

  it('is null for a clean enforced audit', () => {
    assert.equal(privilegeAuditRefusal(base), null);
  });

  it('refuses any role other than br_app_runtime, with or without findings', () => {
    for (const audit of [
      { ...base, role: 'neondb_owner' },
      { ...base, role: 'postgres', forbiddenAttributes: ['rolsuper'] },
    ]) {
      const refusal = privilegeAuditRefusal(audit);
      assert.ok(refusal !== null);
      assert.match(refusal, new RegExp(`the connected role is ${audit.role}, not the runtime identity br_app_runtime`));
    }
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

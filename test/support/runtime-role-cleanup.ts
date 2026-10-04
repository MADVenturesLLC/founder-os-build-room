/**
 * Teardown support for owned-instance suites that apply the full migration
 * sequence.
 *
 * Migration `0008_runtime_operational_grants` gives `br_app_runtime` privileges
 * on the application's ordinary tables and sequences. Those tables are not
 * dropped by the suites' enumerated journal cleanup, and a role that still
 * holds privileges cannot be dropped (`2BP01`), so the role's privileges are
 * removed first.
 *
 * It is a REVOKE, never `DROP OWNED BY`: the suites' cleanups are enumerated
 * on purpose, because `DROP OWNED BY` would also destroy any object the role
 * owns. Revoking changes only access control lists and destroys nothing.
 *
 * It is one statement and tolerates a missing role, because the suites'
 * `after` hooks must stay safe to run when their own setup failed before
 * migration `0006` created the role.
 */
export const REVOKE_RUNTIME_GRANTS_SQL = `DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'br_app_runtime') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM br_app_runtime';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM br_app_runtime';
  END IF;
END
$$`;

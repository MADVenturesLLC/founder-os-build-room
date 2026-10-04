/**
 * The runtime-role switch (PR 2b Tranche D).
 *
 * `BUILDROOM_RUNTIME_ROLE=1` makes a storage suite connect the APPLICATION
 * code under test as `br_app_runtime`, the login the control plane uses after
 * the Tranche D cutover, while setup, direct assertions and the schema-level
 * proofs keep a superuser connection. See `test/gateway-storage-helpers.ts`
 * for the harness-based suites and `test/support/runtime-role-tier.ts` for the
 * list of suites the tier runs.
 *
 * Without the switch every suite behaves exactly as it did before: the
 * application URL IS the superuser URL.
 */

export const RUNTIME_ROLE_MODE: boolean = process.env['BUILDROOM_RUNTIME_ROLE'] === '1';

/** The login the application connects as in runtime-role mode. */
export const RUNTIME_LOGIN = 'br_app_runtime';

/**
 * The same server and database, as the runtime login. The owned instances
 * trust loopback and the role has no password, so there is no credential here
 * and nothing to print.
 */
export function asRuntimeLogin(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.username = RUNTIME_LOGIN;
  url.password = '';
  return url.toString();
}

/** The URL application objects connect with: the runtime login in the mode, otherwise unchanged. */
export function applicationUrl(databaseUrl: string): string {
  return RUNTIME_ROLE_MODE ? asRuntimeLogin(databaseUrl) : databaseUrl;
}

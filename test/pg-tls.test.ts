/**
 * pg-tls — the TLS decision for every Postgres connection, and the
 * administrative runner's use of it.
 *
 * Every assertion reads the settings node-postgres actually connects with: a
 * `Client` built from the settings resolves them exactly as a connection does
 * (the parsed connection string applied over the explicit options), without
 * connecting. Reading the settings object alone would not catch a URL
 * parameter that node-postgres lets override it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pgDefault from 'pg';
import { pgConnectionSettings } from '../packages/control-plane/src/pg-tls.js';

const { Client } = pgDefault;

const CLI_JS = fileURLToPath(new URL('../packages/control-plane/src/migrate-cli.js', import.meta.url));

interface EffectiveParameters {
  readonly ssl: unknown;
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly application_name?: string;
}

function effective(url: string): EffectiveParameters {
  const client = new Client({ ...pgConnectionSettings(url) });
  return (client as unknown as { connectionParameters: EffectiveParameters }).connectionParameters;
}

const VERIFY = { rejectUnauthorized: true };

describe('pg-tls — the decision', () => {
  const cases: readonly { url: string; ssl: false | typeof VERIFY; why: string }[] = [
    { url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=require', ssl: VERIFY, why: 'sslmode=require' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=prefer', ssl: VERIFY, why: 'sslmode=prefer' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=allow', ssl: VERIFY, why: 'sslmode=allow' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=verify-full', ssl: VERIFY, why: 'sslmode=verify-full' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db', ssl: VERIFY, why: 'no sslmode' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=no-verify', ssl: VERIFY, why: 'sslmode=no-verify' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?SSLMODE=no-verify', ssl: VERIFY, why: 'upper-case SSLMODE=no-verify' },
    {
      url: 'postgresql://u:p@ep-x.neon.tech/db?sslmode=require&uselibpqcompat=true',
      ssl: VERIFY,
      why: 'libpq-compatible sslmode=require',
    },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?ssl=0', ssl: VERIFY, why: 'ssl=0' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?ssl=false', ssl: VERIFY, why: 'ssl=false' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?sslrootcert=/tmp/x.pem', ssl: VERIFY, why: 'a certificate-file parameter' },
    { url: 'postgres://u:p@ep-x.neon.tech/db?sslmode=no-verify', ssl: VERIFY, why: 'postgres:// scheme' },
    { url: 'postgresql://u:p@host/db?sslmode=disable', ssl: false, why: 'sslmode=disable' },
    { url: 'postgresql://u:p@host/db?sslmode=DISABLE', ssl: false, why: 'sslmode=DISABLE' },
    { url: 'postgresql://u:p@127.0.0.1:5432/db', ssl: false, why: 'loopback 127.0.0.1' },
    { url: 'postgresql://u:p@localhost:5432/db', ssl: false, why: 'loopback by name' },
    { url: 'postgresql://u:p@[::1]:5432/db', ssl: false, why: 'loopback ::1' },
    { url: 'postgresql://u:p@localhost:5432/db?sslmode=require', ssl: false, why: 'loopback with sslmode=require' },
    // node-postgres connects to a `host` query parameter over the authority's
    // host, so the loopback exception must cover every host the URL names.
    { url: 'postgresql://u:p@localhost/db?host=ep-x.neon.tech', ssl: VERIFY, why: 'loopback authority, remote host parameter' },
    {
      url: 'postgresql://u:p@localhost/db?host=ep-x.neon.tech&sslmode=require',
      ssl: VERIFY,
      why: 'loopback authority, remote host parameter, sslmode=require',
    },
    { url: 'postgresql://u:p@ep-x.neon.tech/db?host=localhost', ssl: VERIFY, why: 'remote authority, loopback host parameter' },
    { url: 'postgresql://u:p@localhost/db?host=127.0.0.1', ssl: false, why: 'loopback authority and loopback host parameter' },
    { url: 'postgresql://u:p@localhost/db?host=%2Fvar%2Frun%2Fpostgresql', ssl: VERIFY, why: 'socket-path host parameter' },
    { url: 'postgresql://u:localhost@ep-x.neon.tech/db', ssl: VERIFY, why: 'password merely contains localhost' },
    { url: 'postgresql://u:sslmode%3Ddisable@ep-x.neon.tech/db', ssl: VERIFY, why: 'password merely contains sslmode=disable' },
    { url: 'postgresql://u:p@ep-x.neon.tech/db_sslmode=disable', ssl: VERIFY, why: 'database name merely contains sslmode=disable' },
  ];

  for (const { url, ssl, why } of cases) {
    it(`${ssl === false ? 'no TLS' : 'verified TLS'} — ${why}`, () => {
      assert.deepEqual(effective(url).ssl, ssl);
    });
  }
});

describe('pg-tls — the connection string node-postgres sees', () => {
  it('removes every TLS parameter and keeps every other one, in order', () => {
    const { connectionString } = pgConnectionSettings(
      'postgresql://u:p@ep-x.neon.tech:6543/db?application_name=br&sslmode=require&channel_binding=require&uselibpqcompat=true&sslrootcert=/x&ssl=0&options=-c%20search_path%3Dpublic',
    );
    assert.equal(
      connectionString,
      'postgresql://u:p@ep-x.neon.tech:6543/db?application_name=br&channel_binding=require&options=-c+search_path%3Dpublic',
    );
  });

  it('passes the scheme, credentials, host, port and database through unchanged', () => {
    const url = 'postgresql://br_app%40x:p%2Fw%3Fd@ep-x.neon.tech:6543/neondb?sslmode=require';
    const { connectionString } = pgConnectionSettings(url);
    assert.equal(connectionString, 'postgresql://br_app%40x:p%2Fw%3Fd@ep-x.neon.tech:6543/neondb');
    const params = effective(url);
    assert.equal(params.user, 'br_app@x');
    assert.equal(params.password, 'p/w?d');
    assert.equal(params.host, 'ep-x.neon.tech');
    assert.equal(params.port, 6543);
    assert.equal(params.database, 'neondb');
  });

  it('drops the "?" when only TLS parameters were present', () => {
    assert.equal(
      pgConnectionSettings('postgresql://u:p@ep-x.neon.tech/db?sslmode=require').connectionString,
      'postgresql://u:p@ep-x.neon.tech/db',
    );
  });

  it('connects to the host parameter it judged, so the decision is about the host actually used', () => {
    const params = effective('postgresql://u:p@localhost/db?host=ep-x.neon.tech');
    assert.equal(params.host, 'ep-x.neon.tech');
    assert.deepEqual(params.ssl, VERIFY);
  });

  it('stops the query at a fragment and passes the fragment through', () => {
    const url = 'postgresql://u:p@ep-x.neon.tech/db?application_name=br&sslmode=no-verify#frag';
    assert.equal(pgConnectionSettings(url).connectionString, 'postgresql://u:p@ep-x.neon.tech/db?application_name=br#frag');
    assert.equal(effective(url).application_name, 'br');
    assert.deepEqual(effective(url).ssl, VERIFY);
  });

  it('treats a "?" inside a fragment as part of the fragment, not a query', () => {
    const url = 'postgresql://u:p@ep-x.neon.tech/db#x?sslmode=disable';
    assert.equal(pgConnectionSettings(url).connectionString, url);
    assert.deepEqual(effective(url).ssl, VERIFY);
  });

  it('leaves a URL without a query exactly as given', () => {
    const url = 'postgresql://u:p@ep-x.neon.tech/db';
    assert.equal(pgConnectionSettings(url).connectionString, url);
  });

  it('refuses an unparseable URL without echoing it', () => {
    const url = 'postgresql://u:secret-password@[not-a-host/db';
    assert.throws(
      () => pgConnectionSettings(url),
      (error: unknown) => error instanceof Error && !error.message.includes('secret-password'),
    );
  });
});

describe('pg-tls — the administrative runner', () => {
  it('migrate-cli builds both of its connections from pgConnectionSettings, never from the bare URL', () => {
    const compiled = readFileSync(CLI_JS, 'utf8');
    assert.match(compiled, /pgConnectionSettings\(adminUrl\)/);
    assert.doesNotMatch(compiled, /connectionString:\s*(adminUrl|url)\b/);
    assert.match(compiled, /new Client\(\{ \.\.\.admin \}\)/);
    assert.match(compiled, /new Pool\(\{ \.\.\.admin, max: 1 \}\)/);
  });

  it('refuses an unparseable administrative URL with a usage error that does not echo it', () => {
    const result = spawnSync(process.execPath, [CLI_JS, '0001_ledger_core'], {
      env: { PATH: process.env['PATH'] ?? '', MIGRATE_ADMIN_DATABASE_URL: 'postgresql://u:secret-password@[nope/db' },
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(result.status, 2, `exit code (stderr: ${result.stderr})`);
    assert.match(result.stderr, /MIGRATE_ADMIN_DATABASE_URL is not a parseable connection string/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /secret-password/);
  });
});

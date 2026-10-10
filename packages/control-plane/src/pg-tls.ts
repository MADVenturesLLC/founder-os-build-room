/**
 * The TLS decision for every Postgres connection this repository opens.
 *
 * Rule: TLS is ON, with the server's certificate and host name verified,
 * unless the URL says `sslmode=disable` or every host it names (the
 * authority's and any `host` query parameter) is loopback, which is where a
 * local development cluster runs without a certificate. No other URL
 * parameter can turn TLS off or turn verification off.
 *
 * Why the URL's TLS parameters are removed rather than overridden:
 * node-postgres parses the connection string and applies the result OVER the
 * options it was given (`Object.assign({}, config, parse(connectionString))`
 * in pg's connection-parameters.js). An explicit
 * `ssl: { rejectUnauthorized: true }` therefore loses to the URL. With pg
 * 8.13 and pg-connection-string 2.14, `sslmode=no-verify` yields
 * `rejectUnauthorized: false`, `ssl=0` yields no TLS at all, and
 * `sslmode=require&uselibpqcompat=true` yields `rejectUnauthorized: false`;
 * from pg 9, plain `sslmode=require` does too. So the TLS parameters are
 * stripped from the string node-postgres sees, and `ssl` is set here, where
 * nothing applies over it.
 *
 * No error raised here carries the URL: it holds a password.
 */

/** What a pg `Pool` or `Client` is given in place of a bare connection string. */
export interface PgConnectionSettings {
  readonly connectionString: string;
  readonly ssl: false | { readonly rejectUnauthorized: true };
}

/**
 * Query parameters node-postgres reads to configure TLS: every `ssl*` key
 * (`ssl`, `sslmode`, `sslcert`, `sslkey`, `sslrootcert`, ...) and
 * `uselibpqcompat`, which changes what `sslmode` means.
 */
function isTlsParameter(name: string): boolean {
  const key = name.toLowerCase();
  return key.startsWith('ssl') || key === 'uselibpqcompat';
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function pgConnectionSettings(databaseUrl: string): PgConnectionSettings {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('the database connection string is not a parseable URL');
  }

  const sslmode = parsed.searchParams.get('sslmode');
  // node-postgres connects to a `host` query parameter when one is present
  // and to the authority's host only otherwise, so the loopback exception
  // holds only when EVERY host the URL names is loopback. A URL such as
  // postgresql://u:p@localhost/db?host=db.example.com is not local.
  const hosts = [parsed.hostname];
  for (const [name, value] of parsed.searchParams) {
    if (name.toLowerCase() === 'host') hosts.push(value);
  }
  const loopback = hosts.every(isLoopbackHost);
  const tls = !(sslmode !== null && sslmode.toLowerCase() === 'disable') && !loopback;

  // The query runs from the first "?" to the first "#" after it, as the URL
  // parser reads it; a "?" inside a fragment is not a query.
  const fragmentStart = databaseUrl.indexOf('#');
  const queryStart = databaseUrl.indexOf('?');
  let connectionString = databaseUrl;
  if (queryStart !== -1 && (fragmentStart === -1 || queryStart < fragmentStart)) {
    // Only the query is rebuilt; the scheme, credentials, host, database and
    // any fragment are passed through exactly as given.
    const queryEnd = fragmentStart === -1 ? databaseUrl.length : fragmentStart;
    const kept = new URLSearchParams();
    for (const [name, value] of new URLSearchParams(databaseUrl.slice(queryStart + 1, queryEnd))) {
      if (!isTlsParameter(name)) kept.append(name, value);
    }
    const query = kept.toString();
    connectionString =
      databaseUrl.slice(0, queryStart) + (query === '' ? '' : `?${query}`) + databaseUrl.slice(queryEnd);
  }

  return { connectionString, ssl: tls ? { rejectUnauthorized: true } : false };
}

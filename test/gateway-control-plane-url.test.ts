/**
 * §16 (correction 9, finding #1) — the validated control-plane URL is the one
 * that goes on the wire.
 *
 * `validateControlPlaneUrl` returned `URL.toString()`, which serializes an
 * origin-only URL with a trailing slash. `ControlPlaneClient.request` builds
 * `${baseUrl}${path}` and every path already begins with "/", so the ruled
 * default `http://127.0.0.1:8080` produced `http://127.0.0.1:8080//gateway/…`.
 * Express does not collapse a doubled path segment; it 404s. Both real entry
 * points — `gateway-cli/src/bin.ts` and `gateway-daemon/src/main.ts` — feed the
 * validated value straight into the client, so enroll, challenge, session-start
 * and heartbeat would every one of them have failed in production.
 *
 * **Why it survived three correction rounds, and what this file changes.** The
 * existing suites construct `ControlPlaneClient` with a raw base string and
 * never with `validateControlPlaneUrl`'s return value, so the validator and the
 * client were each correct in isolation and wrong in composition — a shape no
 * test could see. The wire cases below close that specific gap: they take the
 * validator's OWN output and assert the URL the client hands to `fetch`.
 * Testing the two halves separately again would reproduce the blind spot.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ControlPlaneClient,
  validateControlPlaneUrl,
  type FetchLike,
} from '../packages/gateway-daemon/src/client.js';

/** Captures the exact URL the client requests, then answers unusably. */
function capturing(seen: string[]): FetchLike {
  return async (input: string | URL | Request) => {
    seen.push(typeof input === 'string' ? input : input.toString());
    return new Response('{}', { status: 599, headers: { 'content-type': 'application/json' } });
  };
}

function validatedUrl(raw: string): string {
  const verdict = validateControlPlaneUrl(raw);
  assert.equal(verdict.ok, true, `expected ${raw} to validate: ${JSON.stringify(verdict)}`);
  return (verdict as { readonly ok: true; readonly url: string }).url;
}

describe('gateway control-plane URL · the validated value is concatenation-safe', () => {
  it('the ruled loopback default does not gain a trailing slash', () => {
    assert.equal(validatedUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
  });

  it('an explicitly trailing-slashed URL is normalized the same way', () => {
    assert.equal(validatedUrl('https://control.example.com/'), 'https://control.example.com');
  });

  it('repeated trailing slashes are all removed', () => {
    assert.equal(validatedUrl('https://control.example.com///'), 'https://control.example.com');
  });

  it('a base path is preserved, without its trailing slash', () => {
    assert.equal(validatedUrl('https://control.example.com/base/'), 'https://control.example.com/base');
    assert.equal(validatedUrl('https://control.example.com/base'), 'https://control.example.com/base');
  });

  it('a query string is refused rather than trimmed', () => {
    const verdict = validateControlPlaneUrl('https://control.example.com/?token=x');
    assert.equal(verdict.ok, false);
  });

  it('a fragment is refused rather than trimmed', () => {
    const verdict = validateControlPlaneUrl('https://control.example.com/#frag');
    assert.equal(verdict.ok, false);
  });

  it('the scheme rules are unchanged by this correction', () => {
    assert.equal(validateControlPlaneUrl('http://example.com').ok, false); // non-loopback http
    assert.equal(validateControlPlaneUrl('https://example.com').ok, true);
    assert.equal(validateControlPlaneUrl('http://localhost:8080').ok, true);
    assert.equal(validateControlPlaneUrl('ftp://example.com').ok, false);
    assert.equal(validateControlPlaneUrl('not a url').ok, false);
  });
});

describe('gateway control-plane URL · on the wire, from the validator’s own output', () => {
  it('the ruled default produces a single-slash path for every verb', async () => {
    const seen: string[] = [];
    const client = new ControlPlaneClient(validatedUrl('http://127.0.0.1:8080'), capturing(seen));

    await client.challenge();
    await client.enroll({});

    assert.deepEqual(seen, [
      'http://127.0.0.1:8080/gateway/session-challenge',
      'http://127.0.0.1:8080/gateway/enroll',
    ]);
    for (const url of seen) {
      assert.equal(new URL(url).pathname.startsWith('//'), false, `doubled path segment in ${url}`);
    }
  });

  it('a trailing-slashed and a bare URL reach the identical wire URL', async () => {
    const bare: string[] = [];
    const slashed: string[] = [];
    await new ControlPlaneClient(validatedUrl('https://c.example.com'), capturing(bare)).challenge();
    await new ControlPlaneClient(validatedUrl('https://c.example.com/'), capturing(slashed)).challenge();

    assert.deepEqual(bare, ['https://c.example.com/gateway/session-challenge']);
    assert.deepEqual(slashed, bare);
  });

  it('a based URL keeps its base and gains no doubled slash', async () => {
    const seen: string[] = [];
    await new ControlPlaneClient(validatedUrl('https://c.example.com/base/'), capturing(seen)).challenge();
    assert.deepEqual(seen, ['https://c.example.com/base/gateway/session-challenge']);
  });
});

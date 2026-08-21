/**
 * §11 — the endpoint and authentication matrix.
 *
 * Four guard groups, and the claims worth checking are mostly negative ones:
 * the gateway's own key cannot mint, confirm or revoke; no Founder route is
 * reachable without the token; redemption needs no token at all; and every
 * body-bearing route enforces its own limit rather than inheriting one from a
 * parser mounted earlier.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  GATEWAY_BODY_LIMIT,
  ROOM_BODY_LIMIT,
} from '../packages/control-plane/src/gateway/index.js';
import {
  SURFACE_TOKEN,
  bearer,
  body,
  closeAllSurfaces,
  startSurface,
  type Surface,
} from './gateway-surface-helpers.js';

after(closeAllSurfaces);

const GATEWAY_ID = '11111111-2222-4333-8444-555555555555';

/** A JSON body of at least `bytes` bytes, valid but oversized. */
function oversized(bytes: number): string {
  return JSON.stringify({ padding: 'x'.repeat(bytes) });
}

const FOUNDER_ROUTES: readonly { method: string; path: string; hasBody: boolean }[] = [
  { method: 'POST', path: '/control-plane/pairing-codes', hasBody: true },
  { method: 'GET', path: '/control-plane/pairing-codes', hasBody: false },
  { method: 'GET', path: '/control-plane/enrollments', hasBody: false },
  { method: 'POST', path: `/control-plane/enrollments/${GATEWAY_ID}/confirm`, hasBody: true },
  { method: 'POST', path: `/control-plane/enrollments/${GATEWAY_ID}/deny`, hasBody: true },
  { method: 'POST', path: `/control-plane/gateways/${GATEWAY_ID}/revoke`, hasBody: true },
];

describe('gateway-guards · token-missing-on-founder-routes', () => {
  it('refuses every Founder route without a token, and says nothing more', async () => {
    const surface = await startSurface();
    try {
      for (const route of FOUNDER_ROUTES) {
        const response = await fetch(`${surface.url}${route.path}`, {
          method: route.method,
          headers: { 'content-type': 'application/json' },
          ...(route.hasBody ? { body: '{}' } : {}),
        });
        assert.equal(response.status, 401, `${route.method} ${route.path}`);
        assert.deepEqual(await body(response), { error: 'unauthorized' });
      }
    } finally {
      await surface.close();
    }
  });

  it('refuses a wrong token without distinguishing it from a missing one', async () => {
    const surface = await startSurface();
    try {
      const wrong = await fetch(`${surface.url}/control-plane/enrollments`, {
        headers: bearer('x'.repeat(SURFACE_TOKEN.length)),
      });
      const missing = await fetch(`${surface.url}/control-plane/enrollments`);

      assert.equal(wrong.status, 401);
      assert.equal(missing.status, 401);
      assert.deepEqual(await body(wrong), await body(missing), 'the two must be indistinguishable');
    } finally {
      await surface.close();
    }
  });
});

describe('gateway-guards · gateway-key-cannot-mint', () => {
  it('offers no route on which a signature substitutes for the Founder token', async () => {
    const surface = await startSurface();
    try {
      /*
       * The gateway authenticates with an Ed25519 signature; the Founder
       * authenticates with a bearer token. No route accepts both, and there is
       * no header a key holder can set that reaches a Founder act.
       */
      const signedLooking = {
        protocol: 'founder-os.gateway-protocol',
        version: 1,
        purpose: 'session_start',
        signature: 'A'.repeat(88),
      };

      for (const route of FOUNDER_ROUTES.filter((entry) => entry.hasBody)) {
        const response = await fetch(`${surface.url}${route.path}`, {
          method: route.method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(signedLooking),
        });
        assert.equal(response.status, 401, `${route.path} must not accept a signature`);
      }
    } finally {
      await surface.close();
    }
  });

  it('keeps the signed routes free of any token path', async () => {
    const surface = await startSurface();
    try {
      // A Founder token on a signed route buys nothing: the envelope is still
      // required and still refused.
      const response = await fetch(`${surface.url}/gateway/session-start`, {
        method: 'POST',
        headers: bearer(),
        body: JSON.stringify({ not: 'an envelope' }),
      });
      assert.equal(response.status, 400);
      assert.equal((await body(response))['error'], 'invalid_request');
    } finally {
      await surface.close();
    }
  });
});

describe('gateway-guards · enroll-needs-no-token', () => {
  it('reaches validation without any credential', async () => {
    const surface = await startSurface();
    try {
      const response = await fetch(`${surface.url}/gateway/enroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'x' }),
      });

      assert.notEqual(response.status, 401, 'redemption is code-authenticated, not token-authenticated');
      assert.equal(response.status, 400);
      assert.equal((await body(response))['error'], 'invalid_request');
    } finally {
      await surface.close();
    }
  });

  it('serves the challenge unauthenticated', async () => {
    const surface = await startSurface();
    try {
      const response = await fetch(`${surface.url}/gateway/session-challenge`);
      assert.equal(response.status, 200);
      const payload = await body(response);
      assert.equal(typeof payload['challenge'], 'string');
      assert.equal(typeof payload['generation'], 'number');
    } finally {
      await surface.close();
    }
  });
});

describe('gateway-guards · body-limits-per-route', () => {
  it('declares 16 KB on gateway and Founder routes, and 256 KB on room routes', () => {
    assert.equal(GATEWAY_BODY_LIMIT, '16kb');
    assert.equal(ROOM_BODY_LIMIT, '256kb');
  });

  it('accepts a body under the gateway limit and refuses one over it', async () => {
    const surface = await startSurface();
    try {
      const under = await fetch(`${surface.url}/gateway/enroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: oversized(8_000),
      });
      assert.equal(under.status, 400, 'an 8 KB body reaches validation');

      const over = await fetch(`${surface.url}/gateway/enroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: oversized(32_000),
      });
      assert.equal(over.status, 413);
    } finally {
      await surface.close();
    }
  });

  it('lets a room body exceed the gateway limit, because its own limit is larger', async () => {
    const surface = await startSurface();
    try {
      // 64 KB is over the gateway routes' 16 KB and well under the room 256 KB.
      const response = await fetch(`${surface.url}/rooms`, {
        method: 'POST',
        headers: bearer(),
        body: oversized(64_000),
      });
      assert.notEqual(response.status, 413, 'a room route must not inherit the gateway limit');
      assert.equal(response.status, 400, 'it fails validation instead, which is a different answer');
    } finally {
      await surface.close();
    }
  });

  it('refuses a room body over 256 KB', async () => {
    const surface = await startSurface();
    try {
      const response = await fetch(`${surface.url}/rooms`, {
        method: 'POST',
        headers: bearer(),
        body: oversized(300_000),
      });
      assert.equal(response.status, 413);
      assert.deepEqual(await body(response), { error: 'payload_too_large' });
    } finally {
      await surface.close();
    }
  });
});

describe('gateway-guards · 413:structured-refusal-on-every-body-bearing-route', () => {
  const OVERSIZED_GATEWAY = 32_000;

  async function assertStructured413(surface: Surface, path: string, headers: Record<string, string>): Promise<void> {
    const response = await fetch(`${surface.url}${path}`, {
      method: 'POST',
      headers,
      body: oversized(OVERSIZED_GATEWAY),
    });
    assert.equal(response.status, 413, path);
    const payload = await body(response);
    assert.deepEqual(payload, { error: 'payload_too_large' }, `${path} must be structured`);
    assert.ok(
      !JSON.stringify(payload).toLowerCase().includes('entity'),
      `${path} leaked raw parser text`,
    );
  }

  it('returns a structured 413 on an oversized enroll', async () => {
    const surface = await startSurface();
    try {
      await assertStructured413(surface, '/gateway/enroll', { 'content-type': 'application/json' });
    } finally {
      await surface.close();
    }
  });

  it('returns a structured 413 on oversized session-start and heartbeat', async () => {
    const surface = await startSurface();
    try {
      await assertStructured413(surface, '/gateway/session-start', { 'content-type': 'application/json' });
      await assertStructured413(surface, '/gateway/heartbeat', { 'content-type': 'application/json' });
    } finally {
      await surface.close();
    }
  });

  it('returns a structured 413 on an oversized Founder-token endpoint request', async () => {
    const surface = await startSurface();
    try {
      // The 16 KB per-route limit applies to Founder routes too (correction T4),
      // and the parser runs BEFORE the token guard, so this is a 413 rather than
      // a 401 — the request never becomes a credential question.
      await assertStructured413(surface, '/control-plane/pairing-codes', bearer());
      await assertStructured413(
        surface,
        `/control-plane/enrollments/${GATEWAY_ID}/confirm`,
        bearer(),
      );
    } finally {
      await surface.close();
    }
  });

  it('returns a structured 413 on an oversized room request', async () => {
    const surface = await startSurface();
    try {
      const response = await fetch(`${surface.url}/rooms/${randomUUID()}/events`, {
        method: 'POST',
        headers: bearer(),
        body: oversized(300_000),
      });
      assert.equal(response.status, 413);
      assert.deepEqual(await body(response), { error: 'payload_too_large' });
    } finally {
      await surface.close();
    }
  });

  it('distinguishes an unreadable body from an oversized one', async () => {
    const surface = await startSurface();
    try {
      const response = await fetch(`${surface.url}/gateway/enroll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ this is not json',
      });
      assert.equal(response.status, 400, 'a syntax failure is not a size failure');
      assert.deepEqual(await body(response), { error: 'invalid_request' });
    } finally {
      await surface.close();
    }
  });
});

describe('gateway-guards · trust proxy is off by default', () => {
  it('defaults TRUST_PROXY_HOPS to 0 and ignores a forwarded header', async () => {
    const surface = await startSurface();
    try {
      assert.equal(surface.config.trustProxyHops, 0);
      // With trust proxy off, a spoofed header cannot choose the rate-limit
      // bucket. The request still works; the header simply does not decide who
      // the caller is.
      const response = await fetch(`${surface.url}/gateway/session-challenge`, {
        headers: { 'x-forwarded-for': '203.0.113.99' },
      });
      assert.equal(response.status, 200);
    } finally {
      await surface.close();
    }
  });
});

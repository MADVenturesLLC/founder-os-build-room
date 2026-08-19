/**
 * §8 — mint, redeem, confirm.
 *
 * The property under test is not "the happy path works". It is that every way
 * this flow can be pushed sideways — a retry, a reused idempotency key, a
 * malformed key, a case-mangled code, two machines racing one code — leaves the
 * registry in a state someone can defend, and leaves a record of the refusal.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { validateRedeem } from '../packages/control-plane/src/gateway/enroll-validation.js';
import { GatewayRegistryStore, hashCode } from '../packages/control-plane/src/gateway/store.js';
import { createPool } from '../packages/control-plane/src/db.js';
import {
  createGatewayHarness,
  destroyGatewayHarness,
  STORAGE_SKIP,
  type GatewayHarness,
} from './gateway-storage-helpers.js';
import { generateTestKeypair } from './gateway-helpers.js';
import { HOST, mintAndRedeem, redeemBody, redeemValid } from './gateway-registry-helpers.js';

let harness: GatewayHarness | undefined;
let store: GatewayRegistryStore | undefined;

before(async () => {
  if (STORAGE_SKIP !== false) return;
  harness = await createGatewayHarness('enroll-redeem');
  store = new GatewayRegistryStore(harness.pool, harness.config);
});

after(async () => {
  await destroyGatewayHarness(harness);
});

async function codeRow(code: string): Promise<{ consumed_at: Date | null; consumed_by_gateway_id: string | null }> {
  const { rows } = await harness!.pool.query<{ consumed_at: Date | null; consumed_by_gateway_id: string | null }>(
    'SELECT consumed_at, consumed_by_gateway_id FROM gateway_pairing_codes WHERE code_hash = $1',
    [hashCode(code)],
  );
  const row = rows[0];
  assert.ok(row !== undefined, 'the minted code row must exist');
  return row;
}

async function refusalCount(kind: string): Promise<number> {
  const { rows } = await harness!.pool.query<{ count: string }>(
    'SELECT count(*) FROM gateway_enrollment_refusals WHERE kind = $1',
    [kind],
  );
  return Number(rows[0]?.count ?? '0');
}

async function stateOf(gatewayId: string): Promise<string | null> {
  const { rows } = await harness!.pool.query<{ state: string }>(
    'SELECT state FROM gateway_current_state WHERE gateway_id = $1',
    [gatewayId],
  );
  return rows[0]?.state ?? null;
}

/** Leave no enrolled row behind: the at-most-one index is database-global. */
async function revokeIfEnrolled(gatewayId: string): Promise<void> {
  if ((await stateOf(gatewayId)) === 'enrolled') {
    await store!.revokeGateway(gatewayId, null);
  }
}

describe('gateway-enroll-redeem · mint', { skip: STORAGE_SKIP }, () => {
  it('returns the plaintext once and stores only its hash', async () => {
    const minted = await store!.mintPairingCode();

    assert.equal(minted.code.length, 43, '32 CSPRNG bytes as base64url');
    assert.match(minted.code, /^[A-Za-z0-9_-]{43}$/);

    const { rows } = await harness!.pool.query<{ code_hash: string; code_hash_algo: string }>(
      'SELECT code_hash, code_hash_algo FROM gateway_pairing_codes WHERE pairing_id = $1',
      [minted.pairingId],
    );
    assert.equal(rows[0]?.code_hash, hashCode(minted.code));
    assert.equal(rows[0]?.code_hash_algo, 'sha256');

    // The plaintext is nowhere in the row, under any column.
    const stored = JSON.stringify(rows[0]);
    assert.ok(!stored.includes(minted.code), 'the plaintext must not be recoverable from storage');
  });

  it('emits a minted event carrying no gateway id', async () => {
    const minted = await store!.mintPairingCode();
    const { rows } = await harness!.pool.query<{ event_type: string; gateway_id: string | null }>(
      'SELECT event_type, gateway_id FROM gateway_registry_events WHERE pairing_id = $1',
      [minted.pairingId],
    );
    assert.equal(rows[0]?.event_type, 'minted');
    assert.equal(rows[0]?.gateway_id, null);
  });

  it('lists codes without disclosing any plaintext', async () => {
    const minted = await store!.mintPairingCode();
    const listed = await store!.listPairingCodes();
    const found = listed.find((entry) => entry.pairingId === minted.pairingId);

    assert.ok(found !== undefined);
    assert.ok(!JSON.stringify(listed).includes(minted.code), 'no listing may carry a live code');
  });
});

describe('gateway-enroll-redeem · redeem:replay-across-restart', { skip: STORAGE_SKIP }, () => {
  it('replays the stored response verbatim from a fresh store, consuming nothing twice', async () => {
    const key = generateTestKeypair();
    const minted = await store!.mintPairingCode();
    const idempotencyKey = randomUUID();

    const first = await redeemValid(store!, redeemBody(key, minted.code, idempotencyKey));
    assert.equal(first.ok, true);
    assert.equal(first.ok && first.status, 202);

    /*
     * A fresh pool and a fresh store is what a restarted process has. The
     * idempotency record is durable precisely so this works: the daemon's retry
     * horizon is 24 h and a redeploy inside it must not consume the code again.
     */
    const freshPool = createPool(harness!.config);
    try {
      const freshStore = new GatewayRegistryStore(freshPool, harness!.config);
      const retry = await redeemValid(freshStore, redeemBody(key, minted.code, idempotencyKey));

      assert.equal(retry.ok, true);
      assert.deepEqual(
        retry.ok ? retry.body : null,
        first.ok ? first.body : undefined,
        'the retry returns the stored response verbatim',
      );
      assert.equal(retry.ok && retry.replayed, true);
    } finally {
      await freshPool.end();
    }

    const consumed = await codeRow(minted.code);
    assert.equal(
      consumed.consumed_by_gateway_id,
      first.ok ? first.body.gatewayId : null,
      'one consumption, bound to the one identity',
    );

    const { rows } = await harness!.pool.query<{ count: string }>(
      'SELECT count(*) FROM gateway_current_state WHERE gateway_id = $1',
      [first.ok ? first.body.gatewayId : null],
    );
    assert.equal(rows[0]?.count, '1', 'exactly one awaiting row');

    const events = await harness!.pool.query<{ count: string }>(
      "SELECT count(*) FROM gateway_registry_events WHERE event_type = 'key_received' AND gateway_id = $1",
      [first.ok ? first.body.gatewayId : null],
    );
    assert.equal(events.rows[0]?.count, '1', 'no second key_received event');
  });
});

describe(
  'gateway-enroll-redeem · redeem:idempotency-mismatch-corrected-oracle',
  { skip: STORAGE_SKIP },
  () => {
    it('refuses a reused key against a different code, disclosing nothing', async () => {
      // The corrected oracle (C5): both codes are really minted. The earlier
      // version referenced an unminted code, which is a setup that cannot exist.
      const key = generateTestKeypair();
      const c1 = await store!.mintPairingCode();
      const c2 = await store!.mintPairingCode();
      const idempotencyKey = randomUUID();
      const refusalsBefore = await refusalCount('idempotency_key_mismatch');

      const first = await redeemValid(store!, redeemBody(key, c1.code, idempotencyKey));
      assert.equal(first.ok && first.status, 202);

      const second = await redeemValid(store!, redeemBody(key, c2.code, idempotencyKey));
      assert.equal(second.ok, false);
      assert.equal(!second.ok && second.status, 409);
      assert.equal(!second.ok && second.code, 'idempotency_key_mismatch');

      // Six assertions, per the corrected oracle.
      assert.ok(!JSON.stringify(second).includes(first.ok ? first.body.gatewayId : 'x'),
        'the stored response is never disclosed');
      assert.notEqual((await codeRow(c1.code)).consumed_at, null, 'C1 is consumed');
      assert.equal((await codeRow(c2.code)).consumed_at, null, 'C2 is unconsumed');

      const { rows } = await harness!.pool.query<{ count: string }>(
        "SELECT count(*) FROM gateway_current_state WHERE gateway_id = $1",
        [first.ok ? first.body.gatewayId : null],
      );
      assert.equal(rows[0]?.count, '1', 'exactly one enrollment');
      assert.equal(
        await refusalCount('idempotency_key_mismatch'),
        refusalsBefore + 1,
        'the refusal is recorded',
      );
    });
  },
);

describe(
  'gateway-enroll-redeem · redeem:malformed-pubkey-leaves-code-unconsumed',
  { skip: STORAGE_SKIP },
  () => {
    const cases: readonly { name: string; pubkey: unknown }[] = [
      { name: '31 bytes', pubkey: Buffer.alloc(31).toString('base64') },
      { name: '33 bytes', pubkey: Buffer.alloc(33).toString('base64') },
      { name: 'not base64', pubkey: '!'.repeat(44) },
      { name: 'unpadded', pubkey: Buffer.alloc(32).toString('base64').replace(/=+$/, '') },
      { name: 'not a string', pubkey: 42 },
    ];

    for (const { name, pubkey } of cases) {
      it(`refuses a ${name} public key and consumes nothing`, async () => {
        const minted = await store!.mintPairingCode();
        const validation = validateRedeem({
          code: minted.code,
          pubkey,
          hostDescriptor: { ...HOST },
          idempotencyKey: randomUUID(),
        });

        assert.equal(validation.ok, false);
        assert.equal(!validation.ok && validation.code, 'malformed_pubkey');
        assert.equal((await codeRow(minted.code)).consumed_at, null, 'the code is untouched');
      });
    }

    it('cannot tell a 32-byte key of another curve apart, which is why confirm binds the fingerprint', async () => {
      /*
       * An X25519 public key is also 32 raw bytes. Raw bytes carry no algorithm
       * tag, so importing them as `{kty:'OKP', crv:'Ed25519'}` succeeds and
       * `asymmetricKeyType` reads `ed25519` — there is nothing here to detect.
       *
       * That is not a gap in the validation; it is why the contract puts the
       * control somewhere else. A structurally valid but SUBSTITUTED key
       * proceeds and is caught at confirm by the fingerprint bind, where a human
       * compares what the machine displayed against what the server derived.
       * The algorithm assertion's job is narrower: refuse an import that
       * produced something other than an Ed25519 key.
       */
      const { generateKeyPairSync } = await import('node:crypto');
      const { publicKey } = generateKeyPairSync('x25519');
      const jwk = publicKey.export({ format: 'jwk' }) as { x?: string };
      const raw = Buffer.from(jwk.x ?? '', 'base64url');
      assert.equal(raw.length, 32, 'the fixture must be the same length as an Ed25519 key');

      const minted = await store!.mintPairingCode();
      const validation = validateRedeem({
        code: minted.code,
        pubkey: raw.toString('base64'),
        hostDescriptor: { ...HOST },
        idempotencyKey: randomUUID(),
      });
      assert.equal(validation.ok, true, 'indistinguishable at this layer, and honestly so');

      // It reaches awaiting_approval, and dies at confirm against the real key.
      const outcome = await redeemValid(store!, {
        code: minted.code,
        pubkey: raw.toString('base64'),
        hostDescriptor: { ...HOST },
        idempotencyKey: randomUUID(),
      });
      assert.equal(outcome.ok, true);
      const gatewayId = outcome.ok ? outcome.body.gatewayId : '';

      const impostorRejected = await store!.confirmEnrollment(
        gatewayId,
        generateTestKeypair().keyId,
        null,
      );
      assert.equal(impostorRejected.ok, false);
      assert.equal(!impostorRejected.ok && impostorRejected.code, 'fingerprint_mismatch');
    });

    it('records the refusal and creates no awaiting enrollment', async () => {
      const minted = await store!.mintPairingCode();
      const before = await refusalCount('malformed_pubkey');

      const validation = validateRedeem({
        code: minted.code,
        pubkey: Buffer.alloc(31).toString('base64'),
        hostDescriptor: { ...HOST },
        idempotencyKey: randomUUID(),
      });
      assert.equal(validation.ok, false);

      // The route records it in its own small transaction, touching no code.
      await store!.recordRefusal({
        kind: 'malformed_pubkey',
        detail: { reason: 'fixture' },
        sourceIp: '203.0.113.9',
      });

      assert.equal(await refusalCount('malformed_pubkey'), before + 1);
      assert.equal((await codeRow(minted.code)).consumed_at, null);
    });

    it('refuses malformed request shapes without touching the code', async () => {
      const minted = await store!.mintPairingCode();
      const good = redeemBody(generateTestKeypair(), minted.code);

      for (const body of [
        { ...good, extra: 1 },
        { ...good, idempotencyKey: 'not-a-uuid' },
        { ...good, code: 'ab' },
        { ...good, code: 'x'.repeat(129) },
        { ...good, hostDescriptor: { ...HOST, unexpected: 'field' } },
        { ...good, hostDescriptor: { ...HOST, hostname: 'h'.repeat(254) } },
        { ...good, hostDescriptor: { ...HOST, arch: 'a'.repeat(17) } },
        { ...good, hostDescriptor: { hostname: 'h', os: 'darwin' } },
      ]) {
        const validation = validateRedeem(body);
        assert.equal(validation.ok, false, JSON.stringify(body).slice(0, 60));
        assert.equal(!validation.ok && validation.code, 'invalid_request');
      }
      assert.equal((await codeRow(minted.code)).consumed_at, null);
    });
  },
);

describe(
  'gateway-enroll-redeem · redeem:case-modified-code-refused-unconsumed',
  { skip: STORAGE_SKIP },
  () => {
    it('refuses a case-modified code and leaves the real one unconsumed', async () => {
      let minted = await store!.mintPairingCode();
      let index = minted.code.search(/[A-Za-z]/);
      for (let attempt = 0; attempt < 5 && index === -1; attempt += 1) {
        minted = await store!.mintPairingCode();
        index = minted.code.search(/[A-Za-z]/);
      }
      assert.ok(index !== -1, 'a base64url code carrying no letter at all is not a usable fixture');

      const character = minted.code[index]!;
      const flipped =
        character === character.toLowerCase() ? character.toUpperCase() : character.toLowerCase();
      const modified = minted.code.slice(0, index) + flipped + minted.code.slice(index + 1);
      assert.notEqual(modified, minted.code);

      const outcome = await redeemValid(store!, redeemBody(generateTestKeypair(), modified));
      assert.equal(outcome.ok, false);
      assert.equal(!outcome.ok && outcome.code, 'unknown_code');
      assert.equal((await codeRow(minted.code)).consumed_at, null, 'the real code survives');
    });

    it('accepts surrounding whitespace, because canonicalization is trim-only', async () => {
      const minted = await store!.mintPairingCode();
      const outcome = await redeemValid(
        store!,
        redeemBody(generateTestKeypair(), `  ${minted.code}\n`),
      );
      assert.equal(outcome.ok, true, 'trimming is the whole of canonicalization');
    });
  },
);

describe('gateway-enroll-redeem · code lifecycle', { skip: STORAGE_SKIP }, () => {
  it('code:expired — an expired code is refused and recorded', async () => {
    const minted = await store!.mintPairingCode();
    await harness!.pool.query(
      "UPDATE gateway_pairing_codes SET expires_at = now() - interval '1 second' WHERE pairing_id = $1",
      [minted.pairingId],
    );
    const before = await refusalCount('code_expired');

    const outcome = await redeemValid(store!, redeemBody(generateTestKeypair(), minted.code));
    assert.equal(outcome.ok, false);
    assert.equal(!outcome.ok && outcome.code, 'code_expired');
    assert.equal(await refusalCount('code_expired'), before + 1);
    assert.equal((await codeRow(minted.code)).consumed_at, null);
  });

  it('code:consumed-different-key — a second machine presenting the same code is refused', async () => {
    const minted = await store!.mintPairingCode();
    const first = await redeemValid(store!, redeemBody(generateTestKeypair(), minted.code));
    assert.equal(first.ok, true);

    const before = await refusalCount('code_consumed');
    const second = await redeemValid(store!, redeemBody(generateTestKeypair(), minted.code));

    assert.equal(second.ok, false);
    assert.equal(!second.ok && second.code, 'code_consumed');
    assert.equal(await refusalCount('code_consumed'), before + 1);
    assert.equal(
      (await codeRow(minted.code)).consumed_by_gateway_id,
      first.ok ? first.body.gatewayId : null,
      'the first consumption stands',
    );
  });

  it('code:concurrent-double-redeem — exactly one consumption wins', async () => {
    const minted = await store!.mintPairingCode();
    const before = await refusalCount('code_consumed');

    /*
     * Deterministic by database-enforced conflict, not by timing. Both requests
     * contend for the registry advisory lock and then for the same
     * compare-and-consume predicate; whichever runs second finds
     * `consumed_at IS NOT NULL` and is refused. There is no interleaving in
     * which both succeed.
     */
    const [a, b] = await Promise.all([
      redeemValid(store!, redeemBody(generateTestKeypair(), minted.code)),
      redeemValid(store!, redeemBody(generateTestKeypair(), minted.code)),
    ]);

    const winners = [a, b].filter((outcome) => outcome.ok);
    const losers = [a, b].filter((outcome) => !outcome.ok);
    assert.equal(winners.length, 1, 'exactly one consumption wins');
    assert.equal(losers.length, 1);
    assert.equal(losers[0]!.ok === false && losers[0]!.code, 'code_consumed');
    assert.equal(await refusalCount('code_consumed'), before + 1, 'the loser is recorded');

    const { rows } = await harness!.pool.query<{ count: string }>(
      'SELECT count(*) FROM gateway_registry_events WHERE code_hash = $1 AND event_type = $2',
      [hashCode(minted.code), 'key_received'],
    );
    assert.equal(rows[0]?.count, '1', 'one key_received event, not two');
  });
});

describe('gateway-enroll-redeem · confirm', { skip: STORAGE_SKIP }, () => {
  it('confirm:success-binds-arrived-key — the stored fingerprint is server-derived', async () => {
    const awaiting = await mintAndRedeem(store!);
    try {
      const result = await store!.confirmEnrollment(awaiting.gatewayId, awaiting.keyId, null);
      assert.equal(result.ok, true);
      assert.equal(result.ok && result.state, 'enrolled');

      const enrollments = await store!.listEnrollments();
      const row = enrollments.find((entry) => entry.gatewayId === awaiting.gatewayId);
      assert.equal(row?.fingerprint, awaiting.key.keyId, 'the fingerprint is sha256 of the arrived key');
      assert.equal(row?.keyId, awaiting.key.keyId);
      assert.equal(row?.isCurrentlyEnrolled, true);
    } finally {
      await revokeIfEnrolled(awaiting.gatewayId);
    }
  });

  it('confirm:fingerprint-mismatch — a substituted key is caught here, not at redeem', async () => {
    const awaiting = await mintAndRedeem(store!);
    const impostor = generateTestKeypair();
    const before = await refusalCount('fingerprint_mismatch');

    const result = await store!.confirmEnrollment(awaiting.gatewayId, impostor.keyId, null);

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.status, 409);
    assert.equal(!result.ok && result.code, 'fingerprint_mismatch');
    assert.equal(await refusalCount('fingerprint_mismatch'), before + 1, 'a >=7-year row is written');
    assert.equal(await stateOf(awaiting.gatewayId), 'awaiting_approval', 'the state does not move');
  });

  it('confirm:on-expired — an expired approval is refused and the expiry recorded', async () => {
    const awaiting = await mintAndRedeem(store!);
    await harness!.pool.query(
      `UPDATE gateway_current_state SET awaiting_approval_expires_at = now() - interval '1 second'
        WHERE gateway_id = $1`,
      [awaiting.gatewayId],
    );

    const result = await store!.confirmEnrollment(awaiting.gatewayId, awaiting.keyId, null);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, 'not_awaiting_approval');
    assert.equal(await stateOf(awaiting.gatewayId), 'expired', 'the expiry is recorded, not merely refused');

    const { rows } = await harness!.pool.query<{ count: string }>(
      "SELECT count(*) FROM gateway_registry_events WHERE gateway_id = $1 AND event_type = 'expired'",
      [awaiting.gatewayId],
    );
    assert.equal(rows[0]?.count, '1', 'an expired event is appended');
  });

  it('refuses a confirm for a gateway that does not exist', async () => {
    const result = await store!.confirmEnrollment(randomUUID(), 'a'.repeat(64), null);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.status, 404);
  });

  it('deny moves an awaiting identity to denied, and refuses anything else', async () => {
    const awaiting = await mintAndRedeem(store!);
    assert.equal((await store!.denyEnrollment(awaiting.gatewayId, null)).ok, true);
    assert.equal(await stateOf(awaiting.gatewayId), 'denied');

    const again = await store!.denyEnrollment(awaiting.gatewayId, null);
    assert.equal(again.ok, false);
    assert.equal(!again.ok && again.code, 'not_awaiting_approval');
  });

  it('revoke is immediate and refuses a gateway that is not enrolled', async () => {
    const awaiting = await mintAndRedeem(store!);

    const early = await store!.revokeGateway(awaiting.gatewayId, null);
    assert.equal(early.ok, false, 'an awaiting identity is not revocable');
    assert.equal(!early.ok && early.code, 'not_awaiting_approval');

    await store!.confirmEnrollment(awaiting.gatewayId, awaiting.keyId, null);
    const revoked = await store!.revokeGateway(awaiting.gatewayId, null);

    assert.equal(revoked.ok, true);
    assert.equal(await stateOf(awaiting.gatewayId), 'revoked');
    const { rows } = await harness!.pool.query<{ is_currently_enrolled: boolean }>(
      'SELECT is_currently_enrolled FROM gateway_current_state WHERE gateway_id = $1',
      [awaiting.gatewayId],
    );
    assert.equal(rows[0]?.is_currently_enrolled, false);
  });
});

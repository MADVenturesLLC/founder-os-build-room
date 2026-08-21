/**
 * Fixtures for the enrollment, invariant and projection suites.
 */

import { randomUUID } from 'node:crypto';
import { validateRedeem } from '../packages/control-plane/src/gateway/enroll-validation.js';
import {
  GatewayRegistryStore,
  type RedeemOutcome,
} from '../packages/control-plane/src/gateway/store.js';
import { generateTestKeypair, type TestKeypair } from './gateway-helpers.js';

export const HOST: { hostname: string; os: string; arch: string } = {
  hostname: 'example-host.test',
  os: 'darwin',
  arch: 'arm64',
};

export function redeemBody(
  key: TestKeypair,
  code: string,
  idempotencyKey: string = randomUUID(),
): Record<string, unknown> {
  return { code, pubkey: key.pubkeyBase64, hostDescriptor: { ...HOST }, idempotencyKey };
}

/** Validate then redeem, the way the route does. Asserts validation passed. */
export async function redeemValid(
  store: GatewayRegistryStore,
  body: Record<string, unknown>,
  sourceIp: string | null = '203.0.113.10',
): Promise<RedeemOutcome> {
  const validation = validateRedeem(body);
  if (!validation.ok) throw new Error(`fixture body failed validation: ${validation.detail}`);
  return store.redeem(validation.request, sourceIp);
}

export interface AwaitingGateway {
  readonly gatewayId: string;
  readonly keyId: string;
  readonly key: TestKeypair;
  readonly code: string;
  readonly pairingId: string;
}

/** Mint a code and redeem it, leaving one gateway awaiting approval. */
export async function mintAndRedeem(store: GatewayRegistryStore): Promise<AwaitingGateway> {
  const key = generateTestKeypair();
  const minted = await store.mintPairingCode();
  const outcome = await redeemValid(store, redeemBody(key, minted.code));
  if (!outcome.ok) throw new Error(`fixture redeem refused: ${outcome.code}`);
  return {
    gatewayId: outcome.body.gatewayId,
    keyId: outcome.body.keyId,
    key,
    code: minted.code,
    pairingId: minted.pairingId,
  };
}

/**
 * A whole serving control plane, in one object, over a scripted clock.
 *
 * The clock's wall time is seeded from the DATABASE's `now()` rather than from
 * a fixed literal. Challenge freshness is judged as `wallNow -
 * challenge_published_at`, and `challenge_published_at` is written by the
 * database — so a scripted wall pinned to an arbitrary epoch would make every
 * challenge look centuries overdue and every case here would fail for a reason
 * that has nothing to do with what it tests. Seeded this way the clock still
 * never moves unless a test moves it, which is the property the determinism
 * requirement is actually about.
 */

import type { Pool } from 'pg';
import type { Config } from '../packages/control-plane/src/config.js';
import { ClockGate, ScriptedClock, primeClockGate } from '../packages/control-plane/src/gateway/clock.js';
import { createGatewaySurface, type GatewaySurface } from '../packages/control-plane/src/gateway/index.js';
import type { GatewayHooks } from '../packages/control-plane/src/gateway/hooks.js';
import type { GatewayLeadership } from '../packages/control-plane/src/gateway/leadership.js';
import type { GatewaySessionState } from '../packages/control-plane/src/gateway/session-state.js';
import type { GatewaySessionService, RouteResult } from '../packages/control-plane/src/gateway/session.js';
import type { GatewayRegistryStore } from '../packages/control-plane/src/gateway/store.js';
import type { GatewaySweeps } from '../packages/control-plane/src/gateway/sweeps.js';
import { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import type { GatewayHarness } from './gateway-storage-helpers.js';
import { generateTestKeypair, hex32, makeHeartbeat, makeSessionStart, type TestKeypair } from './gateway-helpers.js';
import { mintAndRedeem } from './gateway-registry-helpers.js';
import { registerLeadership } from './gateway-leadership-helpers.js';
import { closeServer } from './support/close-server.js';

export interface SessionNode {
  readonly surface: GatewaySurface;
  readonly leadership: GatewayLeadership;
  readonly service: GatewaySessionService;
  readonly store: GatewayRegistryStore;
  readonly session: GatewaySessionState;
  readonly sweeps: GatewaySweeps;
  /** The ledger store, wired to the gateway's fence and derivation. */
  readonly rooms: PostgresLedgerStore;
  readonly clock: ScriptedClock;
  readonly gate: ClockGate;
  readonly config: Config;
  readonly pool: Pool;
}

export interface SessionNodeOptions {
  readonly hooks?: GatewayHooks;
  readonly configOverrides?: Partial<Config>;
}

export async function makeSessionNode(
  harness: GatewayHarness,
  options: SessionNodeOptions = {},
): Promise<SessionNode> {
  const config = { ...harness.config, ...options.configOverrides } as Config;

  const { rows } = await harness.pool.query<{ now: Date }>('SELECT now() AS now');
  const wall = rows[0]?.now.getTime();
  if (wall === undefined) throw new Error('the database returned no timestamp');

  const clock = new ScriptedClock(wall, 1_000_000);

  /*
   * Built through the real composition root, not a hand-assembled stack. These
   * suites then exercise the same wiring `main.ts` produces — including the
   * reconciler injection and the room-append fence — rather than a parallel
   * assembly that could drift from it.
   */
  const surface = createGatewaySurface({
    pool: harness.appPool,
    config,
    clock,
    hooks: options.hooks ?? {},
    log: () => undefined,
  });

  primeClockGate(surface.clock, clock);
  registerLeadership(surface.leadership);

  return {
    surface,
    leadership: surface.leadership,
    service: surface.service,
    store: surface.store,
    session: surface.session,
    sweeps: surface.sweeps,
    rooms: new PostgresLedgerStore(harness.appPool, surface.roomAppendFence),
    clock,
    gate: surface.clock,
    config,
    pool: harness.pool,
  };
}

/** Acquire, reconcile, and serve. */
export async function promoteNode(node: SessionNode): Promise<void> {
  await node.leadership.attemptAcquisition();
  if (!node.leadership.canServe()) {
    throw new Error(
      `node failed to reach serving state (leader=${node.leadership.isLeader}, serving=${String(node.leadership.servingGeneration)})`,
    );
  }
}

export interface EnrolledGateway {
  readonly gatewayId: string;
  readonly keyId: string;
  readonly key: TestKeypair;
}

/** Mint, redeem, confirm — one enrolled gateway, ready to sign. */
export async function enrollGateway(node: SessionNode): Promise<EnrolledGateway> {
  const awaiting = await mintAndRedeem(node.store);
  const confirmed = await node.store.confirmEnrollment(awaiting.gatewayId, awaiting.keyId, null);
  if (!confirmed.ok) throw new Error(`fixture confirm refused: ${confirmed.code}`);
  return { gatewayId: awaiting.gatewayId, keyId: awaiting.keyId, key: awaiting.key };
}

/** Mint and redeem only — one gateway left awaiting approval. */
export async function awaitingGateway(node: SessionNode): Promise<EnrolledGateway> {
  const awaiting = await mintAndRedeem(node.store);
  return { gatewayId: awaiting.gatewayId, keyId: awaiting.keyId, key: awaiting.key };
}

export interface Challenge {
  readonly generation: number;
  readonly challenge: string;
}

export async function currentChallenge(node: SessionNode): Promise<Challenge> {
  const result = await node.service.challenge();
  if (result.status !== 200) throw new Error(`challenge unavailable: ${JSON.stringify(result.body)}`);
  return {
    generation: result.body['generation'] as number,
    challenge: result.body['challenge'] as string,
  };
}

export interface StartOverrides {
  readonly generation?: number;
  readonly challenge?: string;
  readonly nonce?: string;
  readonly timestampMs?: number;
  readonly signWith?: TestKeypair;
}

/** A signed session-start envelope against the node's current challenge. */
export async function signedStart(
  node: SessionNode,
  gateway: EnrolledGateway,
  overrides: StartOverrides = {},
): Promise<Record<string, unknown>> {
  const current = await currentChallenge(node);
  const signer = overrides.signWith ?? gateway.key;
  return makeSessionStart(signer, {
    gatewayId: gateway.gatewayId,
    keyId: gateway.keyId,
    generation: overrides.generation ?? current.generation,
    challenge: overrides.challenge ?? current.challenge,
    nonce: overrides.nonce ?? hex32(),
    timestampMs: overrides.timestampMs ?? node.clock.wallNow(),
  }) as unknown as Record<string, unknown>;
}

export interface BeatOverrides {
  readonly epoch?: string;
  readonly sequence?: number;
  readonly nonce?: string;
  readonly timestampMs?: number;
}

export function signedBeat(
  node: SessionNode,
  gateway: EnrolledGateway,
  epoch: string,
  sequence: number,
  overrides: BeatOverrides = {},
): Record<string, unknown> {
  return makeHeartbeat(gateway.key, {
    gatewayId: gateway.gatewayId,
    keyId: gateway.keyId,
    epoch: overrides.epoch ?? epoch,
    sequence: overrides.sequence ?? sequence,
    nonce: overrides.nonce ?? hex32(),
    timestampMs: overrides.timestampMs ?? node.clock.wallNow(),
  }) as unknown as Record<string, unknown>;
}

export const TEST_IP = '203.0.113.7';

/** Start a session and return its epoch. Fails loudly if it was not accepted. */
export async function openSession(node: SessionNode, gateway: EnrolledGateway): Promise<string> {
  const result: RouteResult = await node.service.sessionStart(await signedStart(node, gateway), TEST_IP);
  if (result.status !== 200) {
    throw new Error(`session-start refused: ${result.status} ${JSON.stringify(result.body)}`);
  }
  return result.body['epoch'] as string;
}

export async function availabilityRows(
  pool: Pool,
  gatewayId: string,
): Promise<readonly { transition: string; occurredAt: Date; seq: number }[]> {
  const { rows } = await pool.query<{ transition: string; occurred_at: Date; seq: string }>(
    'SELECT transition, occurred_at, seq FROM gateway_availability_events WHERE gateway_id = $1 ORDER BY seq ASC',
    [gatewayId],
  );
  return rows.map((row) => ({
    transition: row.transition,
    occurredAt: row.occurred_at,
    seq: Number(row.seq),
  }));
}

export async function rejectionCount(
  pool: Pool,
  resolvedKeyId: string,
  errorCode: string,
): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `SELECT COALESCE(sum(count), 0) AS total FROM gateway_message_rejections
      WHERE resolved_key_id = $1 AND error_code = $2`,
    [resolvedKeyId, errorCode],
  );
  return Number(rows[0]?.total ?? '0');
}

export { generateTestKeypair };

/**
 * Put a real HTTP surface in front of a session node.
 *
 * The lane suites need the daemon to talk to something over a socket, because
 * the property they check — that each lane observes only its own identity's
 * state — is about what the SERVER tells each signed request, and stubbing that
 * out would leave nothing to check.
 */
export async function startNodeServer(
  harness: GatewayHarness,
  node: SessionNode,
): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer } = await import('../packages/control-plane/src/server.js');
  const { PostgresLedgerStore } = await import('../packages/control-plane/src/store.js');
  const http = await import('node:http');

  const app = createServer({
    config: node.config,
    pool: harness.appPool,
    store: new PostgresLedgerStore(harness.appPool, node.surface.roomAppendFence),
    startedAt: node.clock.wallNow(),
    gateway: node.surface,
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    close: () => closeServer(server),
  };
}

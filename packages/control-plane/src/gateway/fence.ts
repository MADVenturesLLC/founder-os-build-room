/**
 * L1 — the transaction fence (contract §7, §13, correction C1).
 *
 * The `requireLeader` middleware is a pre-filter and nothing more. A request can
 * pass it, pause on a slow query or a scheduler hiccup, lose the lease while it
 * waits, and resume — and a middleware check that already returned cannot
 * refuse anything. So the real control is here: every leader-dependent
 * transaction opens by taking the lease row `FOR UPDATE` and comparing it
 * against the snapshot the request captured at entry. The row lock is held to
 * COMMIT or ROLLBACK, so no acquire, renew or release can interleave, and a
 * request whose generation has been superseded cannot commit.
 */

import type { PoolClient, Pool } from 'pg';

/**
 * The first statement of every leader-dependent transaction.
 *
 * The columns `verifyFence` actually compares are the ones the contract names —
 * owner, generation, heartbeat freshness — but the row is read WHOLE. Two
 * pipelines need the challenge and its publication time from inside the fenced
 * transaction: session-start compares the envelope's challenge against the
 * current one and checks its freshness there, and rotation binds the generation
 * it is replacing. Reading those columns in a second statement would mean a
 * second round trip while holding a row lock every leader-dependent transaction
 * queues behind, for a value the first statement already had in hand.
 */
export const LEASE_FENCE_SQL =
  'SELECT id, owner_id, generation, heartbeat_at, challenge, challenge_published_at ' +
  'FROM control_plane_lease WHERE id = 1 FOR UPDATE';

/** The same row without the lock, for the unauthenticated challenge read. */
export const LEASE_READ_SQL =
  'SELECT id, owner_id, generation, heartbeat_at, challenge, challenge_published_at ' +
  'FROM control_plane_lease WHERE id = 1';

interface RawLeaseRow {
  readonly id: number;
  readonly owner_id: string | null;
  readonly generation: string;
  readonly heartbeat_at: Date | null;
  readonly challenge?: string | null;
  readonly challenge_published_at?: Date | null;
}

export interface LeaseRow {
  readonly ownerId: string | null;
  readonly generation: number;
  readonly heartbeatAt: Date | null;
  readonly challenge: string | null;
  readonly challengePublishedAt: Date | null;
}

export class LeaseRowMissingError extends Error {
  override readonly name = 'LeaseRowMissingError';
  constructor() {
    super('control_plane_lease row 1 is absent; migration 0003 seeds it and nothing may delete it');
  }
}

/**
 * `generation` is `bigint`, which node-postgres hands back as a string so a
 * value past 2^53 is not silently rounded. It is parsed here rather than
 * anywhere else, and a value that would not survive the round trip is raised
 * rather than compared — a generation comparison that quietly succeeded on
 * rounded values is a fence that quietly passes.
 */
function parseGeneration(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`lease generation ${raw} exceeds the safe-integer range`);
  }
  return parsed;
}

function toLeaseRow(raw: RawLeaseRow): LeaseRow {
  return {
    ownerId: raw.owner_id,
    generation: parseGeneration(raw.generation),
    heartbeatAt: raw.heartbeat_at,
    challenge: raw.challenge ?? null,
    challengePublishedAt: raw.challenge_published_at ?? null,
  };
}

/** Take the fence. Callers must already be inside a transaction. */
export async function takeFence(client: PoolClient): Promise<LeaseRow> {
  const { rows } = await client.query<RawLeaseRow>(LEASE_FENCE_SQL);
  const row = rows[0];
  if (row === undefined) throw new LeaseRowMissingError();
  return toLeaseRow(row);
}

/** Read the lease row without locking it. Any replica may do this. */
export async function readLease(pool: Pool): Promise<LeaseRow> {
  const { rows } = await pool.query<RawLeaseRow>(LEASE_READ_SQL);
  const row = rows[0];
  if (row === undefined) throw new LeaseRowMissingError();
  return toLeaseRow(row);
}

/** What a leader-dependent request captured at handler entry. */
export interface LeaseSnapshot {
  readonly ownerId: string;
  readonly generation: number;
}

export type FenceRefusal =
  | 'owner_changed'
  | 'generation_changed'
  | 'not_leader_locally'
  | 'serving_generation_mismatch'
  | 'renewal_stale';

/**
 * Compare a fenced row against the request's snapshot and the process's own
 * leadership state.
 *
 * `verifyServingGeneration` is false for exactly one caller: promotion
 * reconciliation, which is the act that sets `servingGeneration` and therefore
 * cannot be asked to prove it is already set (contract §7, §13).
 */
export function verifyFence(input: {
  readonly row: LeaseRow;
  readonly snapshot: LeaseSnapshot;
  readonly isLeader: boolean;
  readonly servingGeneration: number | null;
  readonly verifyServingGeneration: boolean;
  readonly monotonicNow: number;
  readonly lastRenewalOkAt: number;
  readonly safetyDeadlineMs: number;
}): FenceRefusal | null {
  if (input.row.ownerId !== input.snapshot.ownerId) return 'owner_changed';
  if (input.row.generation !== input.snapshot.generation) return 'generation_changed';
  if (!input.isLeader) return 'not_leader_locally';
  if (input.verifyServingGeneration && input.servingGeneration !== input.row.generation) {
    return 'serving_generation_mismatch';
  }
  if (input.monotonicNow - input.lastRenewalOkAt > input.safetyDeadlineMs) return 'renewal_stale';
  return null;
}

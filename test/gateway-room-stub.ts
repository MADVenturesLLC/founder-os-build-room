/**
 * A stubbed database for the runtime-room suites that run a real gateway
 * surface without credentials (FOUNDER-ACT-20261117-BR-PHASE5-STEP1 B2).
 *
 * It answers the statements leadership, session-start, heartbeat and the
 * session-bound routes need, and nothing else: the lease row (holding the
 * challenge acquisition minted, so the session store's epoch and the lease
 * agree), the registry rows of the Gateways a suite registers, and the
 * message-rejection aggregate, which it records instead of storing. Every
 * other statement answers no rows. Lives outside `packages/*​/src` like the
 * other gateway helpers: nothing here ships.
 */

import type { Pool } from 'pg';
import { FIXED_WALL_MS } from './gateway-helpers.js';

export interface RegistryRow {
  readonly keyId: string;
  state: string;
  /** The 32 raw public-key bytes, as the registry stores them. */
  readonly pubkey: Buffer;
}

export interface RoomStub {
  readonly pool: Pool;
  readonly registry: Map<string, RegistryRow>;
  readonly rejections: { resolvedKeyId: unknown; errorCode: unknown }[];
}

export function roomStub(): RoomStub {
  let ownerId: string | null = null;
  let challenge: string | null = null;
  const registry = new Map<string, RegistryRow>();
  const rejections: { resolvedKeyId: unknown; errorCode: unknown }[] = [];
  const leaseRow = () => ({
    id: 1,
    owner_id: ownerId,
    generation: '1',
    heartbeat_at: new Date(FIXED_WALL_MS),
    challenge,
    challenge_published_at: new Date(FIXED_WALL_MS),
  });

  const answer = async (sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> => {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (/UPDATE control_plane_lease SET owner_id = \$1, generation/.test(text)) {
      ownerId = String(params[0]);
      challenge = String(params[1]);
      return { rows: [{ generation: '1', challenge }], rowCount: 1 };
    }
    if (/FROM control_plane_lease WHERE id = 1( FOR UPDATE)?$/.test(text)) return { rows: [leaseRow()], rowCount: 1 };
    if (/SELECT now\(\)/.test(text)) return { rows: [{ now: new Date(FIXED_WALL_MS) }], rowCount: 1 };
    if (/FROM gateway_current_state WHERE gateway_id = \$1 AND key_id = \$2/.test(text)) {
      const row = registry.get(String(params[0]));
      if (row === undefined || row.keyId !== params[1]) return { rows: [], rowCount: 0 };
      return { rows: [{ gateway_id: params[0], key_id: row.keyId, state: row.state, pubkey: row.pubkey }], rowCount: 1 };
    }
    if (/^SELECT gateway_id, state, key_id FROM gateway_current_state WHERE gateway_id = \$1$/.test(text)) {
      const row = registry.get(String(params[0]));
      if (row === undefined) return { rows: [], rowCount: 0 };
      return { rows: [{ gateway_id: params[0], state: row.state, key_id: row.keyId }], rowCount: 1 };
    }
    if (/INSERT INTO gateway_message_rejections/.test(text)) {
      rejections.push({ resolvedKeyId: params[0], errorCode: params[2] });
      return { rows: [], rowCount: 1 };
    }
    if (/RETURNING seq/.test(text)) return { rows: [{ seq: '1' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };

  const client = { query: (sql: string, params?: unknown[]) => answer(sql, params), release: () => undefined };
  const pool = {
    query: (sql: string, params?: unknown[]) => answer(sql, params),
    connect: async () => client,
    on: () => undefined,
    end: async () => undefined,
  } as unknown as Pool;
  return { pool, registry, rejections };
}

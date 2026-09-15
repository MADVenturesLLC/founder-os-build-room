/**
 * A live HTTP surface over a stubbed database, for the credential-free suites.
 *
 * Guard order, body limits and rate-limit windows are all decided BEFORE any
 * handler touches storage — a 413 is the parser's verdict, a 401 is the token
 * guard's, a 429 is the limiter's. So these suites need a real server and a
 * real gateway surface, and no database at all, which is what keeps them in the
 * credential-free CI job.
 */

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { loadConfig, type Config } from '../packages/control-plane/src/config.js';
import { createServer } from '../packages/control-plane/src/server.js';
import {
  createGatewaySurface,
  type GatewaySurface,
} from '../packages/control-plane/src/gateway/index.js';
import { ScriptedClock } from '../packages/control-plane/src/gateway/clock.js';
import { PostgresLedgerStore } from '../packages/control-plane/src/store.js';
import { FIXED_WALL_MS } from './gateway-helpers.js';

export const SURFACE_TOKEN = 'surface-suite-token-that-is-long-enough';

export function surfaceConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    DATABASE_URL: 'postgresql://user:secret@host.neon.tech/db?sslmode=require',
    CONTROL_PLANE_TOKEN: SURFACE_TOKEN,
    ...overrides,
  });
}

/**
 * A pool that answers the statements leadership needs and nothing else.
 *
 * Deliberately not a mock of the gateway: the leadership supervisor, the route
 * table, the parsers and the limiter are all the real ones. Only the database
 * is stubbed, so what these suites assert is the surface's own behaviour.
 */
export function stubPool(): Pool {
  let ownerId: string | null = null;
  const challenge = 'a'.repeat(64);

  const answer = async (
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount: number }> => {
    if (/UPDATE control_plane_lease\s+SET owner_id = \$1, generation/.test(sql)) {
      ownerId = String(params[0]);
      return { rows: [{ generation: '1', challenge: String(params[1]) }], rowCount: 1 };
    }
    if (/FROM control_plane_lease WHERE id = 1 FOR UPDATE/.test(sql)) {
      return {
        rows: [
          {
            id: 1,
            owner_id: ownerId,
            generation: '1',
            heartbeat_at: new Date(FIXED_WALL_MS),
            challenge,
            challenge_published_at: new Date(FIXED_WALL_MS),
          },
        ],
        rowCount: 1,
      };
    }
    if (/FROM control_plane_lease WHERE id = 1$/.test(sql.trim())) {
      return {
        rows: [
          {
            id: 1,
            owner_id: ownerId,
            generation: '1',
            heartbeat_at: new Date(FIXED_WALL_MS),
            challenge,
            challenge_published_at: new Date(FIXED_WALL_MS),
          },
        ],
        rowCount: 1,
      };
    }
    if (/SELECT now\(\)/.test(sql)) return { rows: [{ now: new Date(FIXED_WALL_MS) }], rowCount: 1 };
    if (/RETURNING seq/.test(sql)) return { rows: [{ seq: '1' }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  };

  const client = {
    query: (sql: string, params?: unknown[]) => answer(sql, params),
    release: () => undefined,
  };

  return {
    query: (sql: string, params?: unknown[]) => answer(sql, params),
    connect: async () => client,
    on: () => undefined,
    end: async () => undefined,
  } as unknown as Pool;
}

export interface Surface {
  readonly url: string;
  readonly gateway: GatewaySurface;
  readonly config: Config;
  readonly close: () => Promise<void>;
}

const openServers: Server[] = [];

/**
 * `server.close()` alone waits for every keep-alive socket to end on its
 * own — several real seconds per test, left to Node's and the client's
 * idle timeouts. `closeAllConnections()` destroys every socket
 * immediately, including one still mid-request, so callers MUST await
 * their last response before calling this.
 */
function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      // A double close() is a harmless no-op, matching the prior
      // always-resolves behavior; anything else is a real failure the
      // caller should see rather than have silently swallowed.
      if (error != null && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeAllConnections();
  });
}

export async function startSurface(
  overrides: Record<string, string> = {},
  pool: Pool = stubPool(),
): Promise<Surface> {
  const config = surfaceConfig(overrides);

  const clock = new ScriptedClock(FIXED_WALL_MS, 1_000_000);
  const gateway = createGatewaySurface({ pool, config, clock, log: () => undefined });

  // Two clean readings, as the boot requirement demands, without waiting.
  gateway.clock.sample();
  clock.advance(100);
  gateway.clock.sample();

  const store = new PostgresLedgerStore(pool, gateway.roomAppendFence);
  const app = createServer({ config, pool, store, startedAt: FIXED_WALL_MS, gateway });

  const server = app.listen(0);
  openServers.push(server);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;

  await gateway.leadership.attemptAcquisition();

  return {
    url: `http://127.0.0.1:${port}`,
    gateway,
    config,
    close: async () => {
      await gateway.stop();
      await closeServer(server);
    },
  };
}

export async function closeAllSurfaces(): Promise<void> {
  await Promise.all(openServers.map((server) => closeServer(server)));
}

export function bearer(token: string = SURFACE_TOKEN): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

export async function body(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

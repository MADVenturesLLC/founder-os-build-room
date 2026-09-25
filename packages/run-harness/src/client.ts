/**
 * A thin HTTP client for the deployed control plane.
 *
 * Deliberately thin: it reports what the service said, and makes no judgement
 * about what that means. The judgement lives in `runner.ts`, and the meaning
 * of the judgement lives in `record.ts`. A client that decided "healthy" for
 * itself would put the pass/fail rule in three places.
 */

export interface VersionResponse {
  readonly service?: string;
  readonly commit?: string;
  readonly environment?: string;
  readonly node?: string;
  /** Identity of the running process. A change here means a new process. */
  readonly startedAt?: string;
  readonly uptimeSeconds?: number;
}

export interface Probe {
  readonly ok: boolean;
  readonly status: number;
  readonly body: unknown;
  readonly latencyMs: number;
  readonly error?: string;
}

export class ControlPlaneClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number = 10_000,
    /**
     * Shared secret for the room endpoints. `null` sends no credential, which
     * is right for `/health`, `/ready` and `/version` and wrong for everything
     * else — the room routes answer 401 without it.
     *
     * Held here rather than threaded through every call so it cannot end up in
     * a URL, and it is never written into a probe: the evidence bundle records
     * every request this client makes.
     */
    private readonly token: string | null = null,
  ) {}

  health(): Promise<Probe> {
    return this.get('/health');
  }

  ready(): Promise<Probe> {
    return this.get('/ready');
  }

  async version(): Promise<Probe & { readonly version: VersionResponse }> {
    const probe = await this.get('/version');
    return { ...probe, version: (probe.body ?? {}) as VersionResponse };
  }

  createRoom(roomId: string): Promise<Probe> {
    return this.request('POST', '/rooms', { roomId });
  }

  appendEvent(roomId: string, event: unknown): Promise<Probe> {
    return this.request('POST', `/rooms/${roomId}/events`, event);
  }

  getRoom(roomId: string): Promise<Probe> {
    return this.get(`/rooms/${roomId}`);
  }

  exportRoom(roomId: string): Promise<Probe> {
    return this.get(`/rooms/${roomId}/export`);
  }

  /** The persisted gate-run sequence (`GET /gate/runs`). */
  listGateRuns(): Promise<Probe> {
    return this.get('/gate/runs');
  }

  /** Append one run to the persisted gate sequence (`POST /gate/runs`). */
  appendGateRun(body: unknown): Promise<Probe> {
    return this.request('POST', '/gate/runs', body);
  }

  private get(path: string): Promise<Probe> {
    return this.request('GET', path);
  }

  private async request(method: string, path: string, body?: unknown): Promise<Probe> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {};
      if (this.token !== null) headers['authorization'] = `Bearer ${this.token}`;
      if (body !== undefined) headers['content-type'] = 'application/json';

      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // A non-JSON body is itself an observation worth keeping verbatim.
      }

      return {
        ok: response.ok,
        status: response.status,
        body: parsed,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: null,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

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

  private get(path: string): Promise<Probe> {
    return this.request('GET', path);
  }

  private async request(method: string, path: string, body?: unknown): Promise<Probe> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
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

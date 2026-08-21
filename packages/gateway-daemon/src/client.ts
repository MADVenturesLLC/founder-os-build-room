/**
 * The control-plane client (contract §14).
 *
 * Its whole job is to turn an HTTP exchange into one of two things: a member of
 * the server's closed response vocabulary, or a transport event. There is no
 * third category, and there is deliberately no catch-all disposition — a
 * response the client cannot parse, or one carrying a code outside the declared
 * vocabulary, IS the transport category, and the transport rows say retain and
 * retry within the bounded horizon.
 *
 * The SUCCESS bodies are part of that closed vocabulary too (correction T1,
 * Rev 4.7 tester). A 202 that parses as JSON but is missing its `gatewayId` is
 * not a success — downstream it would have been coerced into an empty-string
 * identity and persisted as if the Founder had confirmed it. Each verb here
 * declares the shape its success body must hold, and a structurally invalid
 * success body is classified exactly like an unparseable one: transport, with
 * a detail that `doctor` surfaces. Refusal bodies (`4xx`/`5xx` carrying an
 * `error` member) are passed through untouched — their disposition belongs to
 * the §14 tables, not to this module.
 *
 * Every request is BOUNDED (correction B6, Rev 4.7 tester). A control plane
 * that accepts the connection and never answers is a transport event, not a
 * hang: the bound is passed to the platform fetch as an abort signal AND
 * raced independently, so even an injected FetchLike that ignores the signal
 * cannot hold a tick forever. The default sits under the heartbeat cadence so
 * one bounded failure cannot eat the whole cadence budget.
 */

import { isCanonicalUuid, isLowercaseHex } from '../../gateway-protocol/src/index.js';

export interface ControlPlaneResponse {
  readonly status: number;
  readonly error: string | null;
  readonly body: Record<string, unknown> | null;
  /** True for a network failure, a timeout, or an unreadable response. */
  readonly transport: boolean;
  /** Set when the payload could not be read; surfaced through `doctor`. */
  readonly detail?: string;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The success status and required shape of one verb's response body. */
interface SuccessShape {
  readonly status: number;
  readonly validate: (body: Record<string, unknown>) => boolean;
}

function isTimestamp(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

const challengeShape: SuccessShape = {
  status: 200,
  validate: (body) =>
    typeof body['generation'] === 'number' &&
    Number.isInteger(body['generation']) &&
    (body['generation'] as number) > 0 &&
    typeof body['challenge'] === 'string' &&
    isLowercaseHex(body['challenge'], 64) &&
    isTimestamp(body['issuedAt']),
};

const enrollShape: SuccessShape = {
  status: 202,
  validate: (body) =>
    typeof body['gatewayId'] === 'string' &&
    isCanonicalUuid(body['gatewayId']) &&
    typeof body['keyId'] === 'string' &&
    isLowercaseHex(body['keyId'], 64) &&
    typeof body['fingerprint'] === 'string' &&
    isLowercaseHex(body['fingerprint'], 64) &&
    isTimestamp(body['awaitingApprovalExpiresAt']),
};

const sessionStartShape: SuccessShape = {
  status: 200,
  validate: (body) =>
    body['ok'] === true &&
    body['state'] === 'enrolled' &&
    typeof body['epoch'] === 'string' &&
    isLowercaseHex(body['epoch'], 64) &&
    typeof body['gatewayId'] === 'string' &&
    isCanonicalUuid(body['gatewayId']),
};

const heartbeatShape: SuccessShape = {
  status: 200,
  validate: (body) =>
    body['ok'] === true &&
    body['state'] === 'enrolled' &&
    typeof body['epoch'] === 'string' &&
    isLowercaseHex(body['epoch'], 64),
};

/** The default request bound: under the 10 s heartbeat cadence (§15). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

export class ControlPlaneClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ) {}

  challenge(): Promise<ControlPlaneResponse> {
    return this.request('GET', '/gateway/session-challenge', undefined, challengeShape);
  }

  enroll(body: Record<string, unknown>): Promise<ControlPlaneResponse> {
    return this.request('POST', '/gateway/enroll', body, enrollShape);
  }

  sessionStart(envelope: Record<string, unknown>): Promise<ControlPlaneResponse> {
    return this.request('POST', '/gateway/session-start', envelope, sessionStartShape);
  }

  heartbeat(envelope: Record<string, unknown>): Promise<ControlPlaneResponse> {
    return this.request('POST', '/gateway/heartbeat', envelope, heartbeatShape);
  }

  /**
   * The platform fetch gets an abort signal; every fetch gets the race. An
   * injected or non-conforming FetchLike that ignores the signal still loses
   * the race, so nothing can hold a tick past the bound. The timer is unref'd
   * and cleared on settlement — it never keeps the process alive and never
   * fires after a completed exchange.
   */
  private boundFetch(url: string, init: RequestInit): Promise<Response> {
    const signal = AbortSignal.timeout(this.requestTimeoutMs);
    const attempt = this.fetchImpl(url, { ...init, signal });
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`request exceeded its ${this.requestTimeoutMs}ms bound`)),
        this.requestTimeoutMs,
      );
      timer.unref();
      attempt.then(
        (response) => {
          clearTimeout(timer);
          resolve(response);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    success?: SuccessShape,
  ): Promise<ControlPlaneResponse> {
    let response: Response;
    try {
      response = await this.boundFetch(`${this.baseUrl}${path}`, {
        method,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      // DNS, TLS, connection refused, timeout — all one category.
      return {
        status: 0,
        error: null,
        body: null,
        transport: true,
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    const text = await response.text().catch(() => '');
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = text === '' ? null : (JSON.parse(text) as Record<string, unknown>);
    } catch {
      /*
       * An unparseable payload is a transport event, not a vocabulary member.
       * Repeated occurrences surface through `doctor` rather than being retried
       * forever in silence.
       */
      return { status: response.status, error: null, body: null, transport: true, detail: 'unparseable response' };
    }

    /*
     * A SUCCESS body must hold its declared shape. One that does not is outside
     * the closed vocabulary — the same category as an unparseable payload, for
     * the same reason: the client cannot turn it into a trustworthy fact.
     */
    if (success !== undefined && response.status === success.status) {
      /*
       * An EMPTY body is not a success either (correction 5, finding #7): a
       * null `parsed` used to skip the shape check entirely, so a 200 with no
       * payload flowed downstream as a success whose members were all
       * undefined. The declared shape is the bar, with no exemption for
       * emptiness.
       */
      if (parsed === null || !success.validate(parsed)) {
        return {
          status: response.status,
          error: null,
          body: null,
          transport: true,
          detail: `invalid success body for ${method} ${path}`,
        };
      }
    }

    const error = typeof parsed?.['error'] === 'string' ? (parsed['error'] as string) : null;
    return { status: response.status, error, body: parsed, transport: false };
  }
}

/**
 * §16 (correction 5, findings #3 and M2) — the control-plane URL is an
 * authenticator, so the entry points that read it from the environment
 * validate it BEFORE any request is signed toward it. HTTPS anywhere; plain
 * HTTP only on loopback, which is the local-development carve-out. This lives
 * with the client (the one module both entry points already share) and is
 * applied at the entries, not in the client's constructor — the client is also
 * a test seam whose injected fetch deliberately points at unreachable hosts.
 */
export function validateControlPlaneUrl(
  raw: string,
): { readonly ok: true; readonly url: string } | { readonly ok: false; readonly reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'not a valid URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: `unsupported protocol "${parsed.protocol}"` };
  }
  if (parsed.protocol === 'http:') {
    const hostname = parsed.hostname.toLowerCase();
    const loopback = hostname === '127.0.0.1' || hostname === '[::1]' || hostname === 'localhost';
    if (!loopback) {
      return { ok: false, reason: 'plain "http://" is allowed only on loopback; use "https://"' };
    }
  }
  /*
   * (correction 9, finding #1) A base URL must be safe to CONCATENATE, because
   * that is what the client does with it: `request()` builds
   * `${this.baseUrl}${path}` and every path already begins with "/".
   *
   * `URL.toString()` serializes an origin-only URL with a trailing slash, so
   * the ruled default `http://127.0.0.1:8080` came back as
   * `http://127.0.0.1:8080/` and produced `http://127.0.0.1:8080//gateway/...`.
   * Express does not collapse that: the doubled path 404s, which would have
   * broken enroll, challenge, session-start and heartbeat on every request made
   * through a validated URL — i.e. both real entry points.
   *
   * A query or fragment is refused rather than trimmed. Neither is meaningful
   * on a control-plane base, and concatenation would bury the path inside them
   * ("…/?x=1" + "/gateway/enroll") instead of failing where it can be seen.
   */
  if (parsed.search !== '' || parsed.hash !== '') {
    return { ok: false, reason: 'the control-plane URL must carry no query string or fragment' };
  }
  return { ok: true, url: parsed.toString().replace(/\/+$/, '') };
}

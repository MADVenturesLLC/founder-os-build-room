/**
 * The authoritative response-disposition tables (contract §14).
 *
 * These tables are the SINGLE authority for what each lane does with each
 * response class. No other statement overrides them, and any prose that appears
 * to conflict is read as superseded by them.
 *
 * The rule they replace — a blanket "any classified 4xx discards staging" — is
 * deleted, and it is worth remembering why: it would have discarded the only
 * staging private key during the normal `awaiting_approval` polling state,
 * which is the state a successor sits in for as long as it takes the Founder to
 * look at it (correction F2).
 *
 * There are no catch-alls. The protocol-integrity set is enumerated exactly,
 * and a response outside the declared server vocabulary is not a vocabulary
 * member at all — it is an unparseable transport event, handled by the
 * transport row (correction, Rev 4.3 tightening 1).
 */

export type Disposition =
  /** Keep the staging key; the flow continues. */
  | 'retain_and_continue'
  /** Keep the key; retry within the bounded budget. */
  | 'retain_and_retry'
  /** Terminal refusal: delete staging custody and report through `doctor`. */
  | 'delete_staging_terminal'
  /** Park the lane; custody untouched; human investigation required. */
  | 'halt_fail_closed'
  /** Promotion may begin, per the four custody steps. */
  | 'promote'
  /** Terminal for the primary lane: stop, persist, display. No key deletion. */
  | 'terminal_stop_no_deletion'
  /** Re-fetch a challenge and perform a fresh signed session start. */
  | 'resync_session';

export type LaneTable = 'stagingRedeem' | 'stagingProbe' | 'primary';

/**
 * The closed server response vocabulary, BY ENDPOINT.
 *
 * `test/gateway-cli.test.ts` declares its own literal copy of this rather than
 * importing it, so the disposition test cannot pass by agreeing with the
 * implementation about a vocabulary they both got wrong.
 */
export const SERVER_VOCABULARY: Readonly<Record<string, readonly string[]>> = {
  'POST /gateway/enroll': [
    '202',
    '400 invalid_request',
    '400 malformed_pubkey',
    '409 unknown_code',
    '409 code_expired',
    '409 code_consumed',
    '409 idempotency_key_mismatch',
    '413 payload_too_large',
    '429 rate_limited',
    '5xx',
  ],
  'GET /gateway/session-challenge': ['200', '429 rate_limited', '5xx'],
  'POST /gateway/session-start': [
    '200',
    '400 invalid_request',
    '401 unknown_key',
    '401 bad_signature',
    '401 purpose_mismatch',
    '403 awaiting_approval',
    '403 denied',
    '403 expired',
    '403 revoked',
    '409 stale_generation',
    '409 stale_challenge',
    '409 stale_timestamp',
    '409 nonce_replay',
    '413 payload_too_large',
    '429 rate_limited',
    '503 not_leader',
    '503 clock_unreliable',
    '503 nonce_capacity',
    '503 challenge_overdue',
    '5xx',
  ],
  'POST /gateway/heartbeat': [
    '200',
    '400 invalid_request',
    '401 unknown_key',
    '401 bad_signature',
    '401 purpose_mismatch',
    '403 revoked',
    '403 awaiting_approval',
    '403 denied',
    '403 expired',
    '409 session_required',
    '409 stale_sequence',
    '409 stale_timestamp',
    '413 payload_too_large',
    '429 rate_limited',
    '503 not_leader',
    '503 clock_unreliable',
    '5xx',
  ],
};

/**
 * The enumerated protocol-integrity set. None of these is repairable by
 * repetition, and a compliant envelope cannot reach 413 — so the lane halts and
 * a human looks at it rather than a retry loop hiding it.
 */
export const PROTOCOL_INTEGRITY_CODES: readonly string[] = [
  '401 unknown_key',
  '401 bad_signature',
  '401 purpose_mismatch',
  '400 invalid_request',
  '413 payload_too_large',
];

/** Staging lane, redeem phase (`POST /gateway/enroll`). */
export const STAGING_REDEEM_TABLE: Readonly<Record<string, Disposition>> = {
  '202': 'retain_and_continue',
  '400 invalid_request': 'delete_staging_terminal',
  '400 malformed_pubkey': 'delete_staging_terminal',
  '409 unknown_code': 'delete_staging_terminal',
  '409 code_expired': 'delete_staging_terminal',
  '409 code_consumed': 'delete_staging_terminal',
  '409 idempotency_key_mismatch': 'delete_staging_terminal',
  // A compliant §8 request cannot exceed 16 KB, so the sender is defective.
  '413 payload_too_large': 'delete_staging_terminal',
  '429 rate_limited': 'retain_and_retry',
  '5xx': 'retain_and_retry',
};

/**
 * Staging lane, probe phase (signed session-start probes while `AWAITING`).
 *
 * `session_required` is deliberately ABSENT: it is heartbeat-only by the
 * vocabulary's own definition and assigning it here was correction T3.
 */
export const STAGING_PROBE_TABLE: Readonly<Record<string, Disposition>> = {
  '200': 'promote',
  '403 awaiting_approval': 'retain_and_continue',
  '403 denied': 'delete_staging_terminal',
  '403 expired': 'delete_staging_terminal',
  '403 revoked': 'delete_staging_terminal',
  '409 stale_generation': 'retain_and_retry',
  '409 stale_challenge': 'retain_and_retry',
  '409 stale_timestamp': 'retain_and_retry',
  '409 nonce_replay': 'retain_and_retry',
  '429 rate_limited': 'retain_and_retry',
  '503 not_leader': 'retain_and_retry',
  '503 clock_unreliable': 'retain_and_retry',
  '503 nonce_capacity': 'retain_and_retry',
  '503 challenge_overdue': 'retain_and_retry',
  '5xx': 'retain_and_retry',
  '401 unknown_key': 'halt_fail_closed',
  '401 bad_signature': 'halt_fail_closed',
  '401 purpose_mismatch': 'halt_fail_closed',
  '400 invalid_request': 'halt_fail_closed',
  '413 payload_too_large': 'halt_fail_closed',
};

/** Primary lane (heartbeat and session-start traffic). */
export const PRIMARY_TABLE: Readonly<Record<string, Disposition>> = {
  '200': 'retain_and_continue',
  '409 session_required': 'resync_session',
  '409 stale_sequence': 'resync_session',
  '409 stale_timestamp': 'resync_session',
  '409 stale_generation': 'resync_session',
  '409 stale_challenge': 'resync_session',
  '403 revoked': 'terminal_stop_no_deletion',
  '403 awaiting_approval': 'halt_fail_closed',
  '403 denied': 'halt_fail_closed',
  '403 expired': 'halt_fail_closed',
  '429 rate_limited': 'retain_and_retry',
  '503 not_leader': 'retain_and_retry',
  '503 clock_unreliable': 'retain_and_retry',
  '503 nonce_capacity': 'retain_and_retry',
  '503 challenge_overdue': 'retain_and_retry',
  '409 nonce_replay': 'retain_and_retry',
  '5xx': 'retain_and_retry',
  '401 unknown_key': 'halt_fail_closed',
  '401 bad_signature': 'halt_fail_closed',
  '401 purpose_mismatch': 'halt_fail_closed',
  '400 invalid_request': 'halt_fail_closed',
  '413 payload_too_large': 'halt_fail_closed',
};

export const DISPOSITION_TABLES: Readonly<Record<LaneTable, Readonly<Record<string, Disposition>>>> = {
  stagingRedeem: STAGING_REDEEM_TABLE,
  stagingProbe: STAGING_PROBE_TABLE,
  primary: PRIMARY_TABLE,
};

/** Render a response as a vocabulary key. `5xx` collapses the server-fault class. */
export function vocabularyKey(status: number, error: string | null): string {
  if (status >= 500 && status !== 503) return '5xx';
  if (status === 200 || status === 202) return String(status);
  if (error === null) return '5xx';
  return `${status} ${error}`;
}

/**
 * Disposition a response, or report it as a transport event.
 *
 * A response outside the table is NOT given a catch-all disposition. It is
 * returned as `null`, and the caller treats it as the transport category —
 * retain, bounded retry, and surface repeated occurrences through `doctor`.
 */
export function disposition(table: LaneTable, key: string): Disposition | null {
  return DISPOSITION_TABLES[table][key] ?? null;
}

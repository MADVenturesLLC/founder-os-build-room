/**
 * Protocol identity and the closed purpose set.
 *
 * Four purposes exist and no more. There is deliberately **no enrollment
 * purpose** — redemption is code-authenticated (contract §3, §8) — and **no
 * rejection-record purpose**, because rejections are server-side records that
 * no client ever signs.
 *
 * `planner_poll` and `planner_report` are the Gateway's pull channel for
 * planner commands (Founder answer to Phase 4 plan r1 Q2b, "Gateway pulls,
 * in Phase 4"): the Gateway asks for work and reports on it over its
 * existing session, so the PC still accepts no inbound connection
 * (`DEC-20260815-15` clause 2, outbound-only HTTPS long-poll + POST). Both
 * are session-bound like `heartbeat`: same epoch, same sequence counter.
 */

export const PROTOCOL_ID = 'founder-os.gateway-protocol';

export const VERSION = 1;

export type Purpose = 'session_start' | 'heartbeat' | 'planner_poll' | 'planner_report';

export const PURPOSES: readonly Purpose[] = ['session_start', 'heartbeat', 'planner_poll', 'planner_report'];

export function isPurpose(value: unknown): value is Purpose {
  return (
    value === 'session_start' || value === 'heartbeat' || value === 'planner_poll' || value === 'planner_report'
  );
}

/**
 * The largest `planner_report` payload, in UTF-8 bytes. A report carries a
 * PlanDoc, which can outgrow the 16 KB gateway body limit, so the report
 * route has its own limit and this bound sits under it with room for the
 * envelope's other members.
 */
export const MAX_PLANNER_PAYLOAD_BYTES = 200 * 1024;

/**
 * The domain-separation tag prefix. The purpose is appended, so the full tag
 * differs per purpose and a signature over one purpose cannot be replayed as
 * the other even before the array itself is compared.
 */
export const DOMAIN_TAG_PREFIX = `${PROTOCOL_ID}/v${VERSION}/`;

/** The single separator byte between the domain tag and the JSON body. */
export const DOMAIN_SEPARATOR_BYTE = 0x00;

/** Raw Ed25519 public keys are 32 bytes; signatures are 64. */
export const PUBKEY_BYTE_LENGTH = 32;
export const SIGNATURE_BYTE_LENGTH = 64;

/** Standard padded base64 lengths for the two fixed byte lengths above. */
export const PUBKEY_BASE64_LENGTH = 44;
export const SIGNATURE_BASE64_LENGTH = 88;

/** 32-byte CSPRNG values are carried as 64 lowercase hex characters. */
export const HEX32_LENGTH = 64;

/** Canonical lowercase UUID length. */
export const UUID_LENGTH = 36;

/** `sequence` is a positive safe integer, monotonic within an epoch. */
export const MIN_SEQUENCE = 1;
export const MAX_SEQUENCE = Number.MAX_SAFE_INTEGER;

/** `generation` is the lease generation the challenge was fetched under. */
export const MIN_GENERATION = 1;

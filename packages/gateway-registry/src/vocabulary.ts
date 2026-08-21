/**
 * The closed lifecycle vocabulary (contract §5 table 1).
 *
 * Six event types and five states, stated once here and imported everywhere
 * else — including by the migration's CHECK constraints, which are written from
 * these lists rather than beside them. Two copies of a vocabulary drift; one
 * copy cannot.
 *
 * The six types are the ruling's clause-7 sequence — code minted, key received,
 * enrolled, revoked — plus the two ruled terminations, denied and expired.
 */

export type GatewayEventType =
  | 'minted'
  | 'key_received'
  | 'enrolled'
  | 'denied'
  | 'revoked'
  | 'expired';

export const GATEWAY_EVENT_TYPES: readonly GatewayEventType[] = [
  'minted',
  'key_received',
  'enrolled',
  'denied',
  'revoked',
  'expired',
];

export type GatewayState = 'awaiting_approval' | 'enrolled' | 'denied' | 'revoked' | 'expired';

export const GATEWAY_STATES: readonly GatewayState[] = [
  'awaiting_approval',
  'enrolled',
  'denied',
  'revoked',
  'expired',
];

/**
 * States from which no further transition is defined.
 *
 * A gateway identity is single-use by construction: re-enrollment mints a fresh
 * gateway id and a fresh key rather than resurrecting a terminated one
 * (contract §15), so these are ends, not pauses.
 */
export const TERMINAL_GATEWAY_STATES: readonly GatewayState[] = ['denied', 'revoked', 'expired'];

export function isGatewayEventType(value: unknown): value is GatewayEventType {
  return typeof value === 'string' && (GATEWAY_EVENT_TYPES as readonly string[]).includes(value);
}

export function isGatewayState(value: unknown): value is GatewayState {
  return typeof value === 'string' && (GATEWAY_STATES as readonly string[]).includes(value);
}

export function isTerminalGatewayState(value: GatewayState): boolean {
  return (TERMINAL_GATEWAY_STATES as readonly string[]).includes(value);
}

/**
 * The state each state-bearing event produces.
 *
 * `minted` is absent deliberately: a minted code precedes any gateway identity
 * and carries a null `gateway_id`, so it moves no projection row.
 */
export const EVENT_RESULTING_STATE: Readonly<Record<GatewayEventType, GatewayState | null>> = {
  minted: null,
  key_received: 'awaiting_approval',
  enrolled: 'enrolled',
  denied: 'denied',
  revoked: 'revoked',
  expired: 'expired',
};

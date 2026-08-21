/**
 * The five ruled verbs, stated once (contract §16).
 *
 * `DEC-20260815-13` superseded the `fosbr-gateway` command set. The FIVE VERBS
 * are the commitment; the binary name `buildroom` is unruled implementation
 * detail. A sixth verb is not a feature, it is a contract change.
 */

export const VERBS = ['enroll', 'status', 'doctor', 'providers', 'tail'] as const;

export type Verb = (typeof VERBS)[number];

export function isVerb(value: string): value is Verb {
  return (VERBS as readonly string[]).includes(value);
}

export const USAGE = `buildroom <verb>

  enroll     redeem a Founder-minted pairing code and stage a new identity
  status     both lane states, from the running daemon
  doctor     custody, daemon, control plane, and staging-lock diagnosis
  providers  refuses: no provider registry is authorized in Phase 3
  tail       recent daemon ring-buffer entries
`;

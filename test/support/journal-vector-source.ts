/**
 * Deterministic source fixtures for journal golden vectors.
 * Hashes are produced by the implementation, never hand-authored.
 */

import {
  encodeEnvelope,
  envelopeDigest,
  encodeCommandEventRow,
  chainHash,
  GENESIS_CHAIN_HASH,
  hexOf,
  type NormalizedCommandEnvelope,
  type CommandEventRow,
} from '../../packages/journal/src/index.js';

export const FIXED_RECORDED_AT = '2026-08-31T18:00:00.000000Z';

export function sampleEnvelope(): NormalizedCommandEnvelope {
  return {
    envelopeVersion: '1',
    commandKind: 'planner.invoke',
    argv: ['--goal', 'phase4-journal-foundation', '--dry-run'],
    targetRepository: 'MADVenturesLLC/founder-os-build-room',
    scopeRef: 'scope:phase4-7.1-7.3',
  };
}

export function sampleRows(): CommandEventRow[] {
  const env = sampleEnvelope();
  const canonical = encodeEnvelope(env);
  const digest = envelopeDigest(env);
  const shared = {
    recordClass: 'command' as const,
    actorId: 'hephaestus-br',
    roleId: 'builder',
    envelopeDigest: digest,
    authorizationRef: 'auth:HO-20260831-01',
    recordedAt: FIXED_RECORDED_AT,
    envelopeCanonicalHex: hexOf(canonical),
  };
  return [
    {
      ...shared,
      seq: '1',
      commandId: 'cmd_vector000000000001',
      eventType: 'journaled',
    },
    {
      ...shared,
      seq: '2',
      commandId: 'cmd_vector000000000001',
      eventType: 'dispatched',
    },
    {
      ...shared,
      seq: '3',
      commandId: 'cmd_vector000000000002',
      eventType: 'journaled',
      envelopeCanonicalHex: undefined,
    },
  ];
}

export function buildChainVectors() {
  const envelope = sampleEnvelope();
  const envelopeBytes = encodeEnvelope(envelope);
  const envelopeHex = hexOf(envelopeBytes);
  const digest = envelopeDigest(envelope);

  const rows = sampleRows();
  let prior = GENESIS_CHAIN_HASH;
  const chain = rows.map((row) => {
    const bytes = encodeCommandEventRow(row);
    const hash = chainHash(prior, bytes);
    const entry = {
      seq: row.seq,
      commandId: row.commandId,
      eventType: row.eventType,
      priorChainHash: prior,
      chainHash: hash,
      rowCanonicalHex: hexOf(bytes),
      rowDigest: digest, // note: envelope digest constant across rows sharing envelope
    };
    prior = hash;
    return entry;
  });

  return {
    spec: {
      envelope: 'BRJ:a:1',
      row: 'BRJ:c-min:1',
      genesis: GENESIS_CHAIN_HASH,
      algorithm: 'SHA-256',
    },
    envelope: {
      digest,
      canonicalHex: envelopeHex,
      value: envelope,
    },
    chain,
    headChainHash: prior,
  };
}

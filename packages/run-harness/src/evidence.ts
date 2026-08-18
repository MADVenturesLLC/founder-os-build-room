/**
 * The evidence bundle — `DEC-20260815-17` exit criterion 5, *"evidence
 * retained and exportable"*.
 *
 * Assembly is pure: this module builds and serializes a bundle and writes
 * nothing. The CLI decides where it lands, so the bundle can be tested without
 * a filesystem and inspected without running anything.
 *
 * **What the bundle deliberately does not do is summarize away the failures.**
 * Every run is present with its own sequence number and verdict, and the gate
 * line states the failure count even when the gate is satisfied. Exit
 * criterion 4 requires a failed run to be visible as an interruption of the
 * sequence; a bundle that reported only the passing three would satisfy the
 * count while defeating the requirement.
 */

import { gateStatus, type RunSequence } from './sequence.js';

export interface BundleContext {
  /** When the bundle was assembled, RFC3339 UTC. Supplied, not read. */
  readonly assembledAt: string;
  /** The commit the runs were performed against, as the service reported it. */
  readonly commit: string;
  readonly baseUrl: string;
  readonly environment: string;
  /** How deploy and restart were performed, in the platform port's own words. */
  readonly platformKind: string;
  /** Who ran the harness. Never inferred. */
  readonly attribution: {
    readonly roleId: string | null;
    readonly actorId: string;
    readonly actualModel: string;
    readonly executionSurface: string;
  };
}

export interface EvidenceBundle {
  readonly schema: 'build-room/phase-2-run-evidence@1';
  readonly context: BundleContext;
  readonly gate: ReturnType<typeof gateStatus>;
  readonly runs: RunSequence['runs'];
  /** Stated in the bundle so a reader is never left to infer it. */
  readonly authorizes: string;
}

export function buildBundle(sequence: RunSequence, context: BundleContext): EvidenceBundle {
  return {
    schema: 'build-room/phase-2-run-evidence@1',
    context,
    gate: gateStatus(sequence),
    runs: sequence.runs,
    authorizes:
      'Nothing. Architecture §3.17: "Completing three runs authorizes nothing." This bundle is ' +
      'evidence for the Founder-confirmed Phase 2 stop gate under DEC-20260815-17 clause 2. It ' +
      'confers no activation, no further phase, and no spend authority.',
  };
}

export function serializeBundle(bundle: EvidenceBundle): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

/** A short human-readable summary, for a terminal or a PR body. */
export function summarizeBundle(bundle: EvidenceBundle): string {
  const lines = [
    `Build Room Phase 2 — run evidence`,
    `  commit:      ${bundle.context.commit}`,
    `  environment: ${bundle.context.environment}`,
    `  platform:    ${bundle.context.platformKind}`,
    `  assembled:   ${bundle.context.assembledAt}`,
    ``,
    `  ${bundle.gate.summary}`,
    ``,
  ];

  for (const run of bundle.runs) {
    lines.push(`  #${run.seq} ${run.verdict.toUpperCase()} (${run.runId})`);
    for (const condition of run.conditions) {
      lines.push(`      ${condition.held ? 'held    ' : 'FAILED  '} ${condition.condition}`);
    }
    if (run.failureReason !== undefined) {
      lines.push(`      reason: ${run.failureReason}`);
    }
  }

  lines.push('', `  ${bundle.authorizes}`);
  return lines.join('\n');
}

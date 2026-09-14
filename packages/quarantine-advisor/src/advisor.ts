/**
 * The pre-dispatch quarantine advisor (OMP→MAD Evolve Pack v0, Lane E).
 *
 * An INDEPENDENT reviewer seat consumes transcript/delta BATCHES — not a
 * continuous chat stream — and emits findings in the closed enum
 * `nit | concern | blocker`. The advisor keeps, per scope, the open
 * blockers, the concerns and nits, and one of the states below; the Lane D
 * pre-hook (`quarantine-hook.ts`) turns that state into a dispatch decision.
 *
 *   unreviewed  — no review has covered this scope yet
 *   clear       — reviewed, no open blocker, no concern
 *   concerns    — reviewed, no open blocker, at least one concern
 *   blocked     — at least one open blocker
 *   quarantined — the seat's output was unparseable, unsafe, or the seat
 *                 threw; sticky until a person lifts it
 *   deferred    — the last batch was rate-limited and is held for the next
 *                 permitted review (its deltas are coalesced into it)
 *
 * The reviewer seat is INJECTED (`ReviewerSeat`); this package performs no
 * provider execution and ships no adapter. Rate limiting is global to the
 * advisor and uses an injected clock. Blockers and quarantines are cleared
 * only by explicit, recorded acts (`resolveFinding`, `liftQuarantine`) —
 * never by a later review that happens to say nothing.
 */

import { matchTool, type PreHookDecision, type ToolCall } from '../../gateway-daemon/src/hooks/index.js';
import { SlidingWindowLimiter, type RateLimitPolicy } from './rate-limit.js';
import { parseAdvisorOutput, type AdvisorFinding, type AdvisorReview } from './verdict.js';

export interface TranscriptDelta {
  readonly seq: number;
  readonly role: 'seat' | 'tool' | 'system';
  readonly text: string;
}

export interface TranscriptBatch {
  readonly batch_id: string;
  readonly scope: string;
  readonly deltas: readonly TranscriptDelta[];
}

/** The independent reviewer seat — injected; the package never contacts a provider. */
export type ReviewerSeat = (batch: TranscriptBatch) => unknown | Promise<unknown>;

export type ScopeReviewState = 'unreviewed' | 'clear' | 'concerns' | 'blocked' | 'quarantined' | 'deferred';

export const SCOPE_REVIEW_STATES: readonly ScopeReviewState[] = ['unreviewed', 'clear', 'concerns', 'blocked', 'quarantined', 'deferred'] as const;

export interface Resolution {
  readonly by: string;
  readonly note: string;
  readonly at_ms: number;
}

export interface RecordedFinding extends AdvisorFinding {
  readonly batch_id: string;
  readonly resolution: Resolution | null;
}

export interface ScopeStatus {
  readonly scope: string;
  readonly state: ScopeReviewState;
  readonly open_blockers: readonly RecordedFinding[];
  readonly concerns: readonly RecordedFinding[];
  readonly nits: readonly RecordedFinding[];
  readonly resolved: readonly RecordedFinding[];
  readonly quarantine: { readonly reason: string; readonly batch_id: string; readonly at_ms: number } | null;
  readonly deferred_batches: number;
  readonly reviews: number;
  readonly last_batch_id: string | null;
}

export type SubmitResult =
  | { readonly kind: 'reviewed'; readonly scope: string; readonly review: AdvisorReview; readonly coalesced_batches: number }
  | { readonly kind: 'quarantined'; readonly scope: string; readonly reason: string }
  | { readonly kind: 'rate_limited'; readonly scope: string; readonly retry_after_ms: number; readonly deferred_batches: number };

export interface AdvisorDeps {
  readonly seat: ReviewerSeat;
  readonly clock: () => number;
  readonly rate_limit: RateLimitPolicy;
  /**
   * Fail-closed default: a scope no review has covered (or with a deferred,
   * unreviewed batch) is blocked. `false` lets such scopes dispatch, with
   * only blockers and quarantine blocking.
   */
  readonly require_review?: boolean;
}

export const ADVISOR_BLOCK_CODES = {
  quarantined: 'advisor_quarantined',
  blocker: 'advisor_blocker',
  review_pending: 'advisor_review_pending',
} as const;

interface ScopeRecord {
  findings: RecordedFinding[];
  quarantine: { reason: string; batch_id: string; at_ms: number } | null;
  deferred: TranscriptBatch[];
  reviews: number;
  lastBatchId: string | null;
}

export class QuarantineAdvisorError extends Error {
  override readonly name = 'QuarantineAdvisorError';
}

export class QuarantineAdvisor {
  private readonly scopes = new Map<string, ScopeRecord>();
  private readonly limiter: SlidingWindowLimiter;
  private readonly requireReview: boolean;

  constructor(private readonly deps: AdvisorDeps) {
    if (typeof deps.seat !== 'function') throw new QuarantineAdvisorError('a reviewer seat is required');
    this.limiter = new SlidingWindowLimiter(deps.rate_limit, deps.clock);
    this.requireReview = deps.require_review ?? true;
  }

  /** Consume one batch. Rate-limited batches are held and coalesced into the next permitted review of the scope. */
  async submit(batch: TranscriptBatch): Promise<SubmitResult> {
    const record = this.record(batch.scope);
    record.lastBatchId = batch.batch_id;
    const acquired = this.limiter.tryAcquire();
    if (!acquired.allowed) {
      record.deferred.push(batch);
      return { kind: 'rate_limited', scope: batch.scope, retry_after_ms: acquired.retry_after_ms, deferred_batches: record.deferred.length };
    }
    const deferred = record.deferred.splice(0, record.deferred.length);
    const coalesced: TranscriptBatch = {
      batch_id: batch.batch_id,
      scope: batch.scope,
      deltas: [...deferred.flatMap((b) => b.deltas), ...batch.deltas],
    };
    let raw: unknown;
    try {
      raw = await this.deps.seat(coalesced);
    } catch (error) {
      const reason = `seat threw: ${error instanceof Error ? error.message : String(error)}`;
      record.quarantine = { reason, batch_id: batch.batch_id, at_ms: this.deps.clock() };
      return { kind: 'quarantined', scope: batch.scope, reason };
    }
    const parsed = parseAdvisorOutput(raw);
    if (parsed.kind === 'quarantined') {
      record.quarantine = { reason: parsed.reason, batch_id: batch.batch_id, at_ms: this.deps.clock() };
      return { kind: 'quarantined', scope: batch.scope, reason: parsed.reason };
    }
    record.reviews += 1;
    for (const finding of parsed.review.findings) {
      if (record.findings.some((f) => f.finding_id === finding.finding_id)) continue; // ids are stable across reviews
      record.findings.push({ ...finding, batch_id: batch.batch_id, resolution: null });
    }
    return { kind: 'reviewed', scope: batch.scope, review: parsed.review, coalesced_batches: deferred.length };
  }

  status(scope: string): ScopeStatus {
    const record = this.scopes.get(scope);
    if (record === undefined) {
      return { scope, state: 'unreviewed', open_blockers: [], concerns: [], nits: [], resolved: [], quarantine: null, deferred_batches: 0, reviews: 0, last_batch_id: null };
    }
    const open = record.findings.filter((f) => f.resolution === null);
    const blockers = open.filter((f) => f.severity === 'blocker');
    const concerns = open.filter((f) => f.severity === 'concern');
    const nits = open.filter((f) => f.severity === 'nit');
    const resolved = record.findings.filter((f) => f.resolution !== null);
    let state: ScopeReviewState;
    if (record.quarantine !== null) state = 'quarantined';
    else if (blockers.length > 0) state = 'blocked';
    else if (record.deferred.length > 0) state = 'deferred';
    else if (record.reviews === 0) state = 'unreviewed';
    else if (concerns.length > 0) state = 'concerns';
    else state = 'clear';
    return {
      scope,
      state,
      open_blockers: blockers,
      concerns,
      nits,
      resolved,
      quarantine: record.quarantine,
      deferred_batches: record.deferred.length,
      reviews: record.reviews,
      last_batch_id: record.lastBatchId,
    };
  }

  /** Explicit, recorded resolution of one finding. Returns false when no such open finding exists. */
  resolveFinding(scope: string, findingId: string, resolution: { by: string; note: string }): boolean {
    const record = this.scopes.get(scope);
    if (record === undefined) return false;
    if (typeof resolution.by !== 'string' || resolution.by.trim() === '' || typeof resolution.note !== 'string' || resolution.note.trim() === '') {
      throw new QuarantineAdvisorError('a resolution names who resolved it and why');
    }
    const index = record.findings.findIndex((f) => f.finding_id === findingId && f.resolution === null);
    if (index === -1) return false;
    const finding = record.findings[index]!;
    record.findings[index] = { ...finding, resolution: { ...resolution, at_ms: this.deps.clock() } };
    return true;
  }

  /** Explicit, recorded lift of a quarantine. Findings and deferred batches survive; the state is recomputed. */
  liftQuarantine(scope: string, lift: { by: string; note: string }): boolean {
    const record = this.scopes.get(scope);
    if (record === undefined || record.quarantine === null) return false;
    if (typeof lift.by !== 'string' || lift.by.trim() === '' || typeof lift.note !== 'string' || lift.note.trim() === '') {
      throw new QuarantineAdvisorError('a quarantine lift names who lifted it and why');
    }
    record.quarantine = null;
    return true;
  }

  /** The pre-dispatch decision for one call; consumed by the Lane D hook. */
  decide(call: ToolCall): PreHookDecision {
    const status = this.status(call.scope);
    if (status.state === 'quarantined') {
      return { decision: 'block', code: ADVISOR_BLOCK_CODES.quarantined, reason: `advisor output for scope ${JSON.stringify(call.scope)} is quarantined: ${status.quarantine?.reason ?? ''}` };
    }
    const hit = status.open_blockers.find((b) => targets(b, call));
    if (hit !== undefined) {
      return { decision: 'block', code: `${ADVISOR_BLOCK_CODES.blocker}:${hit.finding_id}`, reason: hit.summary };
    }
    if (this.requireReview && (status.state === 'unreviewed' || status.state === 'deferred')) {
      return {
        decision: 'block',
        code: ADVISOR_BLOCK_CODES.review_pending,
        reason: status.state === 'deferred' ? `${status.deferred_batches} batch(es) held by the rate limit are not yet reviewed` : 'no advisor review covers this scope yet',
      };
    }
    return { decision: 'allow' };
  }

  private record(scope: string): ScopeRecord {
    let record = this.scopes.get(scope);
    if (record === undefined) {
      record = { findings: [], quarantine: null, deferred: [], reviews: 0, lastBatchId: null };
      this.scopes.set(scope, record);
    }
    return record;
  }
}

function targets(finding: RecordedFinding, call: ToolCall): boolean {
  switch (finding.target.kind) {
    case 'scope':
      return true;
    case 'tool':
      return matchTool(finding.target.tool_pattern, call.tool);
    case 'call':
      return finding.target.call_id === call.call_id;
    default:
      return true; // an unknown target shape blocks; it never widens
  }
}

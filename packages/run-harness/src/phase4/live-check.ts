/**
 * The live check of FOUNDER-ACT-20261029-BR-PLANNER-READINESS Part B, as
 * FOUNDER-ACT-20261102-BR-PHASE4-COUNTED-RUNS E2 restates it: Phase4-CR1's
 * first planner command is the check. Once its first round has settled, the
 * room's journal route is read, and the run continues and counts only if
 * that command's dispatched row carries `init_model` and
 * `provider_conversation_id`, each non-empty. Otherwise the run stops there
 * and does not count.
 *
 * Pure: it reads the journal route's answer and judges it. Reading the route
 * and printing the result are the caller's.
 */

export interface Phase4LiveCheckReading {
  readonly passed: boolean;
  /** The command the check read: the room's first planner command, or null when none was journaled. */
  readonly commandId: string | null;
  readonly initModel: string | null;
  readonly providerConversationId: string | null;
  /** Why the check failed, in words; absent when it passed. */
  readonly reason?: string;
}

export function evaluatePhase4LiveCheck(
  commands: readonly { readonly commandId: string; readonly rows: readonly Record<string, unknown>[] }[],
): Phase4LiveCheckReading {
  const first = commands[0];
  if (first === undefined) {
    return { passed: false, commandId: null, initModel: null, providerConversationId: null, reason: 'no planner command is journaled for the room' };
  }
  const dispatched = first.rows.filter((row) => row['eventType'] === 'dispatched');
  if (dispatched.length === 0) {
    return { passed: false, commandId: first.commandId, initModel: null, providerConversationId: null, reason: 'the first planner command has no dispatched row' };
  }
  const row = dispatched[0]!;
  const initModel = nonEmpty(row['initModel']);
  const providerConversationId = nonEmpty(row['providerConversationId']);
  if (initModel === null || providerConversationId === null) {
    const missing = [initModel === null ? 'init_model' : null, providerConversationId === null ? 'provider_conversation_id' : null].filter(
      (field): field is string => field !== null,
    );
    return {
      passed: false,
      commandId: first.commandId,
      initModel,
      providerConversationId,
      reason: `the dispatched row lacks ${missing.join(' and ')}`,
    };
  }
  return { passed: true, commandId: first.commandId, initModel, providerConversationId };
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

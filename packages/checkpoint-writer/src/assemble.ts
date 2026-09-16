/**
 * Rebuild injection assembler (Lane 2): when a session cycle rebuilds, the
 * next worker instance is seeded with ORDERED sections under HARD per-
 * section token budgets — not a free-form "summary at 95%".
 *
 * Section order (fixed, per the act):
 *   task_tree → latest checkpoint → verbatim recent user/Founder directives
 *   → project memory (provenance-tagged) → notes → on-demand path index
 *   → next-action reminder.
 *
 * Token counting is a documented HEURISTIC: `ceil(chars / 4)`
 * (`estimateTokens`). It is monotone and conservative for budgeting, and it
 * is never represented as an exact tokenizer count.
 *
 * Over-budget policy (explicit, deterministic):
 *   1. A section never borrows from another; its emitted text is hard-capped
 *      at its own budget.
 *   2. Over-budget bodies truncate at WHOLE-LINE granularity, keeping the
 *      earliest lines, and append a `[… truncated: kept K of L lines]`
 *      marker whenever it fits.
 *   3. The checkpoint section truncates at WHOLE-FIELD granularity in fixed
 *      IR field order, listing dropped fields in a marker.
 *   4. Directives are verbatim and whole: the most recent directives that
 *      fit are kept (earlier ones dropped with a count marker). A single
 *      directive that alone exceeds the section budget is hard-clipped at
 *      a character boundary with a marker — the one bounded, marked
 *      exception to verbatim.
 *   5. A section whose budget cannot fit even its heading emits the single
 *      line `[section omitted: <name> — over budget]` when that fits, else
 *      nothing at all.
 *   6. Total output ≤ configured budget is STRUCTURAL (sum of caps ≤ total)
 *      and then asserted: a violation throws AssemblerBudgetError instead
 *      of returning an over-budget prompt.
 */

import type { NoteEntry } from './notes.js';
import type { CheckpointV1, TaskNodeV1 } from './schema.js';

/** Documented heuristic: ~4 chars per token. Never an exact count. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const SECTION_ORDER = [
  'task_tree',
  'checkpoint',
  'directives',
  'project_memory',
  'notes',
  'path_index',
  'next_action',
] as const;

export type SectionName = (typeof SECTION_ORDER)[number];

/** Default per-section shares of the total rebuild budget (sum = 1.00). */
export const DEFAULT_SECTION_SHARES: Readonly<Record<SectionName, number>> = {
  task_tree: 0.15,
  checkpoint: 0.3,
  directives: 0.2,
  project_memory: 0.1,
  notes: 0.1,
  path_index: 0.05,
  next_action: 0.1,
};

export interface MemoryExcerpt {
  /** Where this excerpt comes from (file path, doc id, …). Always shown. */
  readonly provenance: string;
  readonly text: string;
}

export interface RebuildInput {
  readonly task_tree: readonly TaskNodeV1[];
  readonly latest_checkpoint: CheckpointV1 | null;
  /** Verbatim recent user/Founder directives, chronological order. */
  readonly directives: readonly string[];
  readonly project_memory: readonly MemoryExcerpt[];
  readonly notes: readonly NoteEntry[];
  readonly path_index: readonly string[];
  readonly next_action: string;
}

export interface SectionReport {
  readonly name: SectionName;
  readonly budget_tokens: number;
  readonly used_tokens: number;
  readonly truncated: boolean;
  readonly omitted: boolean;
}

export interface RebuildOutput {
  readonly text: string;
  readonly total_tokens: number;
  readonly budget_tokens: number;
  readonly sections: readonly SectionReport[];
}

export class AssemblerBudgetError extends Error {
  override readonly name = 'AssemblerBudgetError';
}

export type BudgetOverrides = Partial<Record<SectionName, number>>;

/** Resolve absolute per-section budgets; fail closed when they overrun the total. */
export function resolveSectionBudgets(totalBudgetTokens: number, overrides: BudgetOverrides = {}): Record<SectionName, number> {
  if (!Number.isInteger(totalBudgetTokens) || totalBudgetTokens < 1) {
    throw new AssemblerBudgetError(`total budget must be an integer >= 1, got ${totalBudgetTokens}`);
  }
  const budgets = {} as Record<SectionName, number>;
  let sum = 0;
  for (const name of SECTION_ORDER) {
    const override = overrides[name];
    let value: number;
    if (override === undefined) {
      value = Math.floor(totalBudgetTokens * DEFAULT_SECTION_SHARES[name]);
    } else {
      if (!Number.isInteger(override) || override < 0) {
        throw new AssemblerBudgetError(`section budget ${name} must be an integer >= 0, got ${override}`);
      }
      value = override;
    }
    budgets[name] = value;
    sum += value;
  }
  if (sum > totalBudgetTokens) {
    throw new AssemblerBudgetError(`section budgets sum to ${sum}, over the total budget ${totalBudgetTokens}`);
  }
  return budgets;
}

interface Fit {
  readonly text: string;
  readonly truncated: boolean;
  readonly omitted: boolean;
}

function omissionLine(name: string): string {
  return `[section omitted: ${name} — over budget]`;
}

/** Cap `heading + body-lines` at `budget` tokens, whole lines, earliest kept. */
function fitLines(heading: string, name: SectionName, lines: readonly string[], budget: number): Fit {
  const markerFor = (kept: number, total: number) => `[… truncated: kept ${kept} of ${total} lines]`;
  for (let kept = lines.length; kept >= 0; kept--) {
    const truncated = kept < lines.length;
    const parts = [heading, ...lines.slice(0, kept)];
    if (truncated) parts.push(markerFor(kept, lines.length));
    const text = `${parts.join('\n')}\n`;
    if (estimateTokens(text) <= budget) return { text, truncated, omitted: false };
  }
  const omitted = omissionLine(name);
  if (estimateTokens(`${omitted}\n`) <= budget) return { text: `${omitted}\n`, truncated: false, omitted: true };
  return { text: '', truncated: false, omitted: true };
}

/** Directives: verbatim and whole, most-recent-first selection, chronological render. */
function fitDirectives(heading: string, budget: number, directives: readonly string[]): Fit {
  const render = (kept: readonly string[], dropped: number, clip?: { keptChars: number; totalChars: number }): string => {
    const parts = [heading];
    if (dropped > 0) parts.push(`[${dropped} earlier directive(s) omitted]`);
    for (const d of kept) parts.push(`> ${d}`);
    if (clip) parts.push(`[… truncated: kept ${clip.keptChars} of ${clip.totalChars} chars of the most recent directive]`);
    return `${parts.join('\n')}\n`;
  };
  // Whole-directive fit: keep the longest recent suffix that fits. At least
  // the newest directive is attempted whole; "show zero directives" is
  // never preferred over a marked clip of the newest one.
  for (let count = directives.length; count >= 1; count--) {
    const kept = directives.slice(directives.length - count);
    const dropped = directives.length - count;
    const text = render(kept, dropped);
    if (estimateTokens(text) <= budget) return { text, truncated: dropped > 0, omitted: false };
  }
  // Single newest directive alone is oversized: bounded hard-clip (marked).
  const newest = directives[directives.length - 1]!;
  for (let chars = newest.length; chars >= 0; chars--) {
    const text = render([newest.slice(0, chars)], directives.length - 1, { keptChars: chars, totalChars: newest.length });
    if (estimateTokens(text) <= budget) return { text, truncated: true, omitted: false };
  }
  const omitted = omissionLine('directives');
  if (estimateTokens(`${omitted}\n`) <= budget) return { text: `${omitted}\n`, truncated: false, omitted: true };
  return { text: '', truncated: false, omitted: true };
}

function renderTaskTreeLines(nodes: readonly TaskNodeV1[], depth: number, out: string[]): void {
  for (const node of nodes) {
    out.push(`${'  '.repeat(depth)}- [${node.status}] ${node.id}: ${node.title}`);
    renderTaskTreeLines(node.children, depth + 1, out);
  }
}

/** Checkpoint section: whole fields in fixed IR order; dropped fields are listed. */
function fitCheckpoint(heading: string, budget: number, checkpoint: CheckpointV1): Fit {
  const fields: readonly [string, string][] = [
    ['current_intent', checkpoint.current_intent],
    ['next_action', checkpoint.next_action],
    ['working_constraints', checkpoint.working_constraints.map((c) => `- ${c}`).join('\n')],
    ['task_tree', checkpoint.task_tree.map((t) => `- [${t.status}] ${t.id}: ${t.title}`).join('\n')],
    ['current_work', checkpoint.current_work],
    ['involved_files', checkpoint.involved_files.map((f) => `- ${f}`).join('\n')],
    ['cross_task_discoveries', checkpoint.cross_task_discoveries.map((d) => `- ${d}`).join('\n')],
    ['errors_and_fixes', checkpoint.errors_and_fixes.map((e) => `- error: ${e.error}\n  fix: ${e.fix}`).join('\n')],
    ['runtime_state', Object.entries(checkpoint.runtime_state).map(([k, v]) => `- ${k} = ${v}`).join('\n')],
    ['design_decisions', checkpoint.design_decisions.map((d) => `- ${d.decision} (rationale: ${d.rationale})`).join('\n')],
    ['misc_notes', checkpoint.misc_notes.map((n) => `- ${n}`).join('\n')],
    ['evidence_refs', checkpoint.evidence_refs.map((r) => `- ${[r.path, r.sha, r.note].filter(Boolean).join(' — ')}`).join('\n')],
  ];
  for (let kept = fields.length; kept >= 0; kept--) {
    const dropped = fields.slice(kept).map(([name]) => name);
    const parts = [heading, `checkpoint_id: ${checkpoint.checkpoint_id} · seq ${checkpoint.seq} · trigger_pct ${checkpoint.trigger_pct ?? 'manual'}`];
    for (const [name, body] of fields.slice(0, kept)) parts.push(`### ${name}\n${body.length > 0 ? body : '(empty)'}`);
    if (dropped.length > 0) parts.push(`[fields omitted: ${dropped.join(', ')}]`);
    const text = `${parts.join('\n')}\n`;
    if (estimateTokens(text) <= budget) {
      return { text, truncated: dropped.length > 0, omitted: false };
    }
  }
  const omitted = omissionLine('checkpoint');
  if (estimateTokens(`${omitted}\n`) <= budget) return { text: `${omitted}\n`, truncated: false, omitted: true };
  return { text: '', truncated: false, omitted: true };
}

/**
 * Assemble the rebuild injection. Guarantees `total_tokens <= budget_tokens`
 * or throws AssemblerBudgetError — an over-budget rebuild prompt is never
 * returned.
 */
export function assembleRebuild(
  input: RebuildInput,
  budgetTokens: number,
  overrides: BudgetOverrides = {},
): RebuildOutput {
  const budgets = resolveSectionBudgets(budgetTokens, overrides);
  const sections: SectionReport[] = [];
  const chunks: string[] = [];

  const emit = (name: SectionName, fit: Fit): void => {
    chunks.push(fit.text);
    sections.push({
      name,
      budget_tokens: budgets[name],
      used_tokens: estimateTokens(fit.text),
      truncated: fit.truncated,
      omitted: fit.omitted,
    });
  };

  const taskLines: string[] = [];
  renderTaskTreeLines(input.task_tree, 0, taskLines);
  emit('task_tree', fitLines('## TASK TREE', 'task_tree', taskLines.length > 0 ? taskLines : ['_none recorded_'], budgets.task_tree));

  emit(
    'checkpoint',
    input.latest_checkpoint === null
      ? fitLines('## LATEST CHECKPOINT', 'checkpoint', ['_none recorded_'], budgets.checkpoint)
      : fitCheckpoint('## LATEST CHECKPOINT', budgets.checkpoint, input.latest_checkpoint),
  );

  emit(
    'directives',
    input.directives.length === 0
      ? fitLines('## DIRECTIVES (verbatim)', 'directives', ['_none recorded_'], budgets.directives)
      : fitDirectives('## DIRECTIVES (verbatim)', budgets.directives, input.directives),
  );

  const memoryLines = input.project_memory.map((m) => `- [${m.provenance}] ${m.text}`);
  emit('project_memory', fitLines('## PROJECT MEMORY (provenance-tagged)', 'project_memory', memoryLines.length > 0 ? memoryLines : ['_none recorded_'], budgets.project_memory));

  const noteLines = input.notes.map((n) => `- [note ${n.seq}] ${n.text}`);
  emit('notes', fitLines('## NOTES', 'notes', noteLines.length > 0 ? noteLines : ['_none recorded_'], budgets.notes));

  emit('path_index', fitLines('## PATH INDEX (on demand)', 'path_index', input.path_index.length > 0 ? [...input.path_index] : ['_none recorded_'], budgets.path_index));

  emit('next_action', fitLines('## NEXT ACTION', 'next_action', [`> NEXT: ${input.next_action}`], budgets.next_action));

  const text = chunks.join('\n');
  const total = estimateTokens(text);
  if (total > budgetTokens) {
    // Structural invariant violated — fail closed rather than return it.
    throw new AssemblerBudgetError(`assembled rebuild is ${total} tokens over the ${budgetTokens} budget`);
  }
  return { text, total_tokens: total, budget_tokens: budgetTokens, sections };
}

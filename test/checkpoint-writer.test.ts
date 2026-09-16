/**
 * Checkpoint Writer v0 — Lane 2 tests.
 *
 * Authority: Founder Act "MiMo→MAD Long-Horizon Core v0" (2026-09-15),
 * Lane 2 — unbounded logical sessions via cycles: early structured
 * checkpoints by an independent writer seat; notes-scratch promotion;
 * hard-budgeted rebuild injection. No MiMo/OpenCode source exists locally;
 * semantics follow the act's description of the mechanism.
 *
 * Requirements:
 * - imports only the public entry point (../packages/checkpoint-writer/src/index.js)
 * - filesystem fixtures live in a fresh mkdtemp under os.tmpdir()
 * - no production logic in test/
 *
 * Covered: schema accept + strict rejects; 20/45/70 threshold triggers;
 * rebuild arming; append-only notes channel and promote/clear ordering;
 * single-writer invariant (fail-closed); atomic persistence with verified
 * sha256; per-section budget caps and the total-budget guarantee; rebuild
 * field presence; the dogfood long-transcript cycle end to end.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import {
  CHECKPOINT_IR_VERSION,
  CheckpointStore,
  CheckpointTriggerTracker,
  CheckpointWriter,
  NotesLog,
  SingleWriterError,
  CheckpointSchemaError,
  AssemblerBudgetError,
  assembleRebuild,
  encodeCheckpointV1,
  estimateTokens,
  parseCheckpointV1,
  resolveSectionBudgets,
  validateCheckpointFieldsV1,
  type CheckpointFieldsV1,
  type CheckpointV1,
  type WriterSeatRequest,
} from '../packages/checkpoint-writer/src/index.js';

function freshDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `checkpoint-writer-${label}-`));
}

function sha256Of(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

let clockNow = 1_000_000;
function clock(): number {
  return clockNow++;
}

/** A complete, valid set of the eleven content fields. */
function validFields(tag: string): CheckpointFieldsV1 {
  return {
    current_intent: `intent ${tag}`,
    next_action: `next ${tag}`,
    working_constraints: [`constraint ${tag}`],
    task_tree: [
      { id: 't1', title: `root ${tag}`, status: 'in_progress', children: [
        { id: 't1.1', title: `child ${tag}`, status: 'done', children: [] },
      ] },
    ],
    current_work: `work ${tag}`,
    involved_files: [`src/${tag}.ts`],
    cross_task_discoveries: [`discovery ${tag}`],
    errors_and_fixes: [{ error: `err ${tag}`, fix: `fix ${tag}` }],
    runtime_state: { phase: tag },
    design_decisions: [{ decision: `decision ${tag}`, rationale: `rationale ${tag}` }],
    misc_notes: [`misc ${tag}`],
    evidence_refs: [{ path: `evidence/${tag}.json`, sha: 'a'.repeat(64), note: `note ${tag}` }],
  };
}

function validCheckpoint(seq: number): CheckpointV1 {
  return {
    version: CHECKPOINT_IR_VERSION,
    checkpoint_id: `session-a-cp${seq}`,
    session_id: 'session-a',
    seq,
    created_at_ms: 1_700_000_000_000,
    trigger_pct: 20,
    ...validFields(`cp${seq}`),
  };
}

describe('schema — checkpoint/v1 accept', () => {
  it('round-trips a valid checkpoint through canonical bytes', () => {
    const checkpoint = validCheckpoint(1);
    const encoded = encodeCheckpointV1(checkpoint);
    assert.ok(encoded.endsWith('\n'), 'canonical bytes end with LF');
    const parsed = parseCheckpointV1(encoded);
    assert.deepEqual(parsed, checkpoint);
  });

  it('accepts an evidence ref with only a path, and only a sha', () => {
    const fields = validFields('x');
    const onlyPath = validateCheckpointFieldsV1({ ...fields, evidence_refs: [{ path: 'a/b.ts' }] });
    assert.equal(onlyPath.evidence_refs[0]?.path, 'a/b.ts');
    const onlySha = validateCheckpointFieldsV1({ ...fields, evidence_refs: [{ sha: 'b'.repeat(40) }] });
    assert.equal(onlySha.evidence_refs[0]?.sha, 'b'.repeat(40));
  });
});

describe('schema — strict rejects', () => {
  const rejects: readonly [string, (cp: Record<string, unknown>) => void][] = [
    ['unknown top-level field', (cp) => { cp.surprise = 1; }],
    ['wrong version', (cp) => { cp.version = 'checkpoint/v2'; }],
    ['missing content field', (cp) => { delete cp.current_intent; }],
    ['wrong type: task_tree not an array', (cp) => { cp.task_tree = 'nope'; }],
    ['wrong type: runtime_state value not a string', (cp) => { cp.runtime_state = { phase: 3 }; }],
    ['unknown nested field', (cp) => {
      cp.errors_and_fixes = [{ error: 'e', fix: 'f', extra: 'x' }];
    }],
    ['bad task status', (cp) => {
      cp.task_tree = [{ id: 't', title: 't', status: 'lurking', children: [] }];
    }],
    ['evidence ref with neither path nor sha', (cp) => { cp.evidence_refs = [{ note: 'bare' }]; }],
    ['evidence ref with a non-hex sha', (cp) => { cp.evidence_refs = [{ sha: 'not-a-sha' }]; }],
    ['trigger_pct out of range', (cp) => { cp.trigger_pct = 140; }],
    ['seq not an integer', (cp) => { cp.seq = 1.5; }],
  ];
  for (const [label, mutate] of rejects) {
    it(`rejects: ${label}`, () => {
      const candidate = JSON.parse(encodeCheckpointV1(validCheckpoint(1))) as Record<string, unknown>;
      mutate(candidate);
      assert.throws(() => parseCheckpointV1(JSON.stringify(candidate)), CheckpointSchemaError);
    });
  }

  it('rejects invalid JSON', () => {
    assert.throws(() => parseCheckpointV1('{not json'), CheckpointSchemaError);
  });

  it('rejects seat output that tries to set envelope keys', () => {
    assert.throws(
      () => validateCheckpointFieldsV1({ ...validFields('y'), seq: 99 }),
      CheckpointSchemaError,
    );
  });
});

describe('trigger policy', () => {
  it('fires 20/45/70 exactly once each, never early', () => {
    const tracker = new CheckpointTriggerTracker();
    assert.deepEqual(tracker.observe(0.19), []);
    assert.deepEqual(tracker.observe(0.2), [{ kind: 'checkpoint', threshold: 0.2 }]);
    assert.deepEqual(tracker.observe(0.2), [], 'no refire at the same level');
    assert.deepEqual(tracker.observe(0.44), []);
    assert.deepEqual(tracker.observe(0.45), [{ kind: 'checkpoint', threshold: 0.45 }]);
    assert.deepEqual(tracker.observe(0.69), []);
    assert.deepEqual(tracker.observe(0.7), [{ kind: 'checkpoint', threshold: 0.7 }]);
    assert.deepEqual(tracker.firedThresholds, [0.2, 0.45, 0.7]);
  });

  it('a jump across thresholds reports all of them ascending, then rebuild arms and stays armed', () => {
    const tracker = new CheckpointTriggerTracker();
    assert.deepEqual(tracker.observe(0.5), [
      { kind: 'checkpoint', threshold: 0.2 },
      { kind: 'checkpoint', threshold: 0.45 },
    ]);
    assert.deepEqual(tracker.observe(0.95), [
      { kind: 'checkpoint', threshold: 0.7 },
      { kind: 'rebuild' },
    ]);
    assert.deepEqual(tracker.observe(0.96), [{ kind: 'rebuild' }], 'rebuild stays armed');
    tracker.reset();
    assert.deepEqual(tracker.observe(0.21), [{ kind: 'checkpoint', threshold: 0.2 }], 'new cycle refires');
  });

  it('rejects invalid policy config', () => {
    assert.throws(() => new CheckpointTriggerTracker({ checkpoint_thresholds: [] }));
    assert.throws(() => new CheckpointTriggerTracker({ checkpoint_thresholds: [0.5, 0.4] }));
    assert.throws(() => new CheckpointTriggerTracker({ checkpoint_thresholds: [1.2] }));
    assert.throws(() => new CheckpointTriggerTracker({ checkpoint_thresholds: [0.5], rebuild_fraction: 0.5 }));
  });
});

describe('notes scratch channel', () => {
  it('append → readAll round-trips in append order; clear returns and empties', () => {
    const notes = new NotesLog(join(freshDir('notes'), 'notes.jsonl'));
    assert.deepEqual(notes.readAll(), []);
    notes.append('first note', 10);
    notes.append('second note', 20);
    const all = notes.readAll();
    assert.deepEqual(all.map((n) => [n.seq, n.at_ms, n.text]), [[1, 10, 'first note'], [2, 20, 'second note']]);
    const cleared = notes.clear();
    assert.equal(cleared.length, 2);
    assert.deepEqual(notes.readAll(), [], 'scratch is empty after clear');
  });

  it('rejects multi-line notes (single-line scratch record)', () => {
    const notes = new NotesLog(join(freshDir('notes'), 'notes.jsonl'));
    assert.throws(() => notes.append('two\nlines', 1));
  });

  it('clearThrough clears only the read prefix; notes appended later survive', () => {
    const notes = new NotesLog(join(freshDir('notes'), 'notes.jsonl'));
    notes.append('a', 1);
    notes.append('b', 2);
    notes.append('c', 3);
    const cleared = notes.clearThrough(2);
    assert.deepEqual(cleared.map((n) => n.text), ['a', 'b']);
    assert.deepEqual(notes.readAll().map((n) => n.text), ['c']);
  });

  it('a corrupt scratch line fails closed', () => {
    const dir = freshDir('notes');
    const path = join(dir, 'notes.jsonl');
    writeFileSync(path, '{"at_ms":1,"text":"ok"}\nnot-json\n', 'utf8');
    const notes = new NotesLog(path);
    assert.throws(() => notes.readAll(), /corrupt scratch line 2/);
  });
});

describe('single-writer store + persistence', () => {
  it('a second writer for the same checkpoint file fails closed and names the owner', () => {
    const store = new CheckpointStore(freshDir('store'));
    const target = store.pathFor('session-a', 1);
    const lease = store.beginWrite(target, 'checkpoint-writer', clock());
    assert.ok(store.isLocked(target));
    assert.throws(() => store.beginWrite(target, 'checkpoint-writer-2', clock()), SingleWriterError);
    try {
      store.beginWrite(target, 'checkpoint-writer-2', clock());
    } catch (cause) {
      assert.match((cause as Error).message, /checkpoint-writer/, 'error names the recorded owner');
    }
    store.abort(lease);
    assert.ok(!store.isLocked(target), 'abort releases the lock');
  });

  it('commit persists atomically with a verified sha256 that matches the bytes on disk', () => {
    const store = new CheckpointStore(freshDir('store'));
    const target = store.pathFor('session-a', 1);
    const persisted = store.commit(store.beginWrite(target, 'checkpoint-writer', clock()), validCheckpoint(1));
    assert.ok(!store.isLocked(target), 'commit releases the lock');
    const onDisk = readFileSync(target, 'utf8');
    assert.equal(persisted.sha256, sha256Of(onDisk), 'recorded hash is the hash of the persisted bytes');
    assert.equal(persisted.bytes, Buffer.byteLength(onDisk, 'utf8'));
    const reread = store.read(target);
    assert.equal(reread.sha256, persisted.sha256);
    assert.deepEqual(reread.checkpoint, validCheckpoint(1));
  });

  it('readLatest returns the highest-seq checkpoint, or null when none', () => {
    const dir = freshDir('store');
    const store = new CheckpointStore(dir);
    assert.equal(store.readLatest('session-a'), null);
    store.commit(store.beginWrite(store.pathFor('session-a', 1), 'w', clock()), validCheckpoint(1));
    store.commit(store.beginWrite(store.pathFor('session-a', 2), 'w', clock()), validCheckpoint(2));
    assert.equal(store.readLatest('session-a')?.checkpoint.seq, 2);
  });

  it('rejects an unsafe session id (path traversal fails closed)', () => {
    const store = new CheckpointStore(freshDir('store'));
    assert.throws(() => store.pathFor('../escape', 1));
  });
});

describe('writer seat orchestration', () => {
  function rig(dir: string, seat: (req: WriterSeatRequest) => unknown) {
    const store = new CheckpointStore(dir);
    const notes = new NotesLog(join(dir, 'scratch.jsonl'));
    const writer = new CheckpointWriter(
      { session_id: 'session-a', writer_budget_tokens: 4_000, clock },
      store,
      notes,
      seat,
    );
    return { store, notes, writer };
  }

  it('promotes notes into the seat request, persists, and only then clears the scratch', async () => {
    const dir = freshDir('writer');
    const seen: WriterSeatRequest[] = [];
    const { notes, writer } = rig(dir, (req) => {
      seen.push(req);
      return { ...validFields(`s${req.seq}`), misc_notes: req.notes.map((n) => n.text) };
    });
    notes.append('promote me', 1);
    notes.append('promote me too', 2);
    const result = await writer.checkpoint({ transcript_window: 'window-1', trigger_pct: 20 });

    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.writer_seat_id, 'checkpoint-writer');
    assert.equal(seen[0]?.writer_budget_tokens, 4_000, 'the seat carries its OWN budget');
    assert.deepEqual(seen[0]?.notes.map((n) => n.text), ['promote me', 'promote me too']);
    assert.equal(seen[0]?.prior_checkpoint, null);

    assert.equal(result.seq, 1);
    assert.equal(result.notes_promoted, 2);
    assert.equal(result.notes_cleared, 2);
    assert.deepEqual(notes.readAll(), [], 'scratch cleared after durable persist');
    assert.equal(result.checkpoint.trigger_pct, 20);
    assert.deepEqual(result.checkpoint.misc_notes, ['promote me', 'promote me too'], 'notes promoted into structured fields');
    assert.equal(result.sha256, sha256Of(readFileSync(result.path, 'utf8')));
  });

  it('feeds the prior checkpoint to the seat on the second cycle', async () => {
    const dir = freshDir('writer');
    const seen: WriterSeatRequest[] = [];
    const { writer } = rig(dir, (req) => {
      seen.push(req);
      return validFields(`s${req.seq}`);
    });
    await writer.checkpoint({ transcript_window: 'w1', trigger_pct: 20 });
    await writer.checkpoint({ transcript_window: 'w2', trigger_pct: 45 });
    assert.equal(seen[1]?.prior_checkpoint?.seq, 1);
    assert.equal(seen[1]?.prior_checkpoint?.current_intent, 'intent s1');
  });

  it('seat schema reject: nothing written, scratch intact, lock released', async () => {
    const dir = freshDir('writer');
    const { store, notes, writer } = rig(dir, () => ({ ...validFields('bad'), current_intent: '' }));
    notes.append('still here', 1);
    await assert.rejects(() => writer.checkpoint({ transcript_window: 'w', trigger_pct: 20 }), CheckpointSchemaError);
    assert.equal(store.readLatest('session-a'), null, 'no checkpoint persisted');
    assert.equal(notes.readAll().length, 1, 'scratch not cleared on failure');
    assert.ok(!store.isLocked(store.pathFor('session-a', 1)), 'no lock leaked');
  });

  it('a note appended while the seat is still writing survives the clear', async () => {
    const dir = freshDir('writer');
    const { notes, writer } = rig(dir, (req) => {
      // The worker keeps working while the writer seat runs.
      notes.append('late note, not promoted', 99);
      return { ...validFields(`s${req.seq}`), misc_notes: req.notes.map((n) => n.text) };
    });
    notes.append('promoted note', 1);
    const result = await writer.checkpoint({ transcript_window: 'w', trigger_pct: 20 });
    assert.deepEqual(result.checkpoint.misc_notes, ['promoted note']);
    assert.equal(result.notes_promoted, 1);
    assert.equal(result.notes_cleared, 1);
    assert.deepEqual(notes.readAll().map((n) => n.text), ['late note, not promoted'], 'the late note was never eaten');
  });

  it('a throwing seat fails closed the same way', async () => {
    const dir = freshDir('writer');
    const { store, notes, writer } = rig(dir, () => {
      throw new Error('provider exploded');
    });
    notes.append('still here', 1);
    await assert.rejects(() => writer.checkpoint({ transcript_window: 'w', trigger_pct: null }), /provider exploded/);
    assert.equal(store.readLatest('session-a'), null);
    assert.equal(notes.readAll().length, 1);
  });
});

describe('rebuild injection assembler', () => {
  function input(overrides: Partial<Parameters<typeof assembleRebuild>[0]> = {}) {
    return {
      task_tree: validFields('a').task_tree,
      latest_checkpoint: validCheckpoint(2),
      directives: ['Directive one: stay in the worktree.', 'Directive two: no merge.'],
      project_memory: [{ provenance: 'MEMORY.md#lane2', text: 'The writer seat is independent.' }],
      notes: [{ seq: 1, at_ms: 7, text: 'scratch note after cp70' }],
      path_index: ['packages/checkpoint-writer/src/schema.ts', 'packages/checkpoint-writer/src/store.ts'],
      next_action: 'write the 45% checkpoint',
      ...overrides,
    };
  }

  it('section order is the act order, all checkpoint fields present, total under budget', () => {
    const out = assembleRebuild(input(), 8_000);
    assert.ok(out.total_tokens <= 8_000);
    const order = ['## TASK TREE', '## LATEST CHECKPOINT', '## DIRECTIVES', '## PROJECT MEMORY', '## NOTES', '## PATH INDEX', '## NEXT ACTION'];
    const positions = order.map((h) => out.text.indexOf(h));
    assert.ok(positions.every((p) => p >= 0), `every section heading present: ${positions}`);
    for (let i = 1; i < positions.length; i++) {
      assert.ok(positions[i]! > positions[i - 1]!, `section ${order[i]} comes after ${order[i - 1]}`);
    }
    // The checkpoint section round-trips every one of the eleven IR fields.
    for (const field of [
      'current_intent', 'next_action', 'working_constraints', 'task_tree', 'current_work',
      'involved_files', 'cross_task_discoveries', 'errors_and_fixes', 'runtime_state',
      'design_decisions', 'misc_notes', 'evidence_refs',
    ]) {
      assert.ok(out.text.includes(`### ${field}`), `checkpoint field ${field} present in the rebuild`);
    }
    assert.ok(out.text.includes('> Directive one: stay in the worktree.'), 'directive verbatim');
    assert.ok(out.text.includes('[MEMORY.md#lane2]'), 'memory provenance tag present');
    assert.ok(out.sections.every((s) => !s.truncated && !s.omitted), 'nothing truncated at this budget');
  });

  it('every section is hard-capped at its own budget; truncation is marked', () => {
    const longNote = 'x'.repeat(400);
    const out = assembleRebuild(input({ notes: [{ seq: 1, at_ms: 1, text: longNote }] }), 8_000, { notes: 40 });
    const notesSection = out.sections.find((s) => s.name === 'notes');
    assert.ok(notesSection, 'notes section reported');
    assert.ok(notesSection.used_tokens <= 40, `notes capped at 40, used ${notesSection.used_tokens}`);
    assert.ok(notesSection.truncated);
    assert.ok(out.text.includes('[… truncated:'), 'truncation marker present');
    assert.ok(out.total_tokens <= 8_000);
  });

  it('directives: whole and verbatim, most recent kept, earlier dropped with a count marker', () => {
    const directives = ['first directive '.repeat(10).trim(), 'second directive '.repeat(10).trim()];
    const out = assembleRebuild(input({ directives }), 8_000, { directives: 70 });
    const section = out.sections.find((s) => s.name === 'directives');
    assert.ok(section && section.used_tokens <= 70);
    assert.ok(!out.text.includes('first directive'), 'oldest dropped first');
    assert.ok(out.text.includes('> second directive'), 'newest kept verbatim and whole');
    assert.ok(out.text.includes('[1 earlier directive(s) omitted]'));
  });

  it('a single oversized directive is hard-clipped with a marker (the one marked exception to verbatim)', () => {
    const huge = 'h'.repeat(2_000);
    const out = assembleRebuild(input({ directives: [huge] }), 8_000, { directives: 60 });
    const section = out.sections.find((s) => s.name === 'directives');
    assert.ok(section && section.used_tokens <= 60);
    assert.ok(section.truncated);
    assert.ok(out.text.includes('[… truncated: kept'), 'clip marker present');
    assert.ok(!out.text.includes(huge), 'the full directive does not fit');
  });

  it('a section whose budget fits nothing emits the omission line, and output stays under budget', () => {
    const out = assembleRebuild(input(), 8_000, { project_memory: 2 });
    const section = out.sections.find((s) => s.name === 'project_memory');
    assert.ok(section?.omitted);
    assert.ok(out.text.includes('[section omitted: project_memory — over budget]') || section.used_tokens === 0);
    assert.ok(out.total_tokens <= 8_000);
  });

  it('null checkpoint / empty inputs render explicit "_none recorded_", never silence', () => {
    const out = assembleRebuild(
      input({ latest_checkpoint: null, directives: [], project_memory: [], notes: [], path_index: [], task_tree: [] }),
      8_000,
    );
    assert.equal(out.text.match(/_none recorded_/g)?.length, 6);
  });

  it('section budgets that overrun the total fail closed', () => {
    assert.throws(
      () => resolveSectionBudgets(100, { checkpoint: 90, directives: 90 }),
      AssemblerBudgetError,
    );
  });

  it('checkpoint field drops are listed when the checkpoint section is squeezed', () => {
    const out = assembleRebuild(input(), 8_000, { checkpoint: 120 });
    const section = out.sections.find((s) => s.name === 'checkpoint');
    assert.ok(section && section.used_tokens <= 120);
    assert.ok(section.truncated);
    assert.ok(out.text.includes('[fields omitted:'), 'dropped fields are named');
  });
});

describe('dogfood — synthetic long transcript through one full cycle', () => {
  it('checkpoints fire at 20/45/70 with verified hashes; the 90% rebuild stays under budget and round-trips every field', async () => {
    const dir = freshDir('dogfood');
    const store = new CheckpointStore(dir);
    const notes = new NotesLog(join(dir, 'scratch.jsonl'));

    // Deterministic fake seat: the host binds a real model in production;
    // the package only requires the eleven fields back.
    const seatRequests: WriterSeatRequest[] = [];
    const writer = new CheckpointWriter(
      { session_id: 'dogfood', writer_budget_tokens: 4_000, clock },
      store,
      notes,
      (req) => {
        seatRequests.push(req);
        return {
          ...validFields(`seq${req.seq}`),
          misc_notes: req.notes.map((n) => n.text),
          evidence_refs: [{ path: `packages/checkpoint-writer/src/writer.ts`, sha: 'c'.repeat(64) }],
        };
      },
    );

    const budgetTokens = 10_000;
    const tracker = new CheckpointTriggerTracker();
    const firedPcts: number[] = [];
    let transcript = '';
    let rebuilt = false;

    // Drive a synthetic long session: each turn adds ~1 009 chars ≈ 252
    // heuristic tokens, so the 20/45/70 thresholds and the 90% rebuild
    // ceiling cross at turns 8 / 18 / 28 / 36 against the 10 000 budget.
    for (let turn = 1; turn <= 60 && !rebuilt; turn++) {
      transcript += `turn ${turn}: ${'work '.repeat(200)}`;
      if (turn % 5 === 0) notes.append(`worker note at turn ${turn}`, turn);
      const fraction = estimateTokens(transcript) / budgetTokens;
      for (const event of tracker.observe(fraction)) {
        if (event.kind === 'checkpoint') {
          const result = await writer.checkpoint({ transcript_window: transcript, trigger_pct: Math.round(event.threshold * 100) });
          firedPcts.push(result.checkpoint.trigger_pct ?? -1);
        } else {
          const latest = store.readLatest('dogfood');
          assert.ok(latest, 'a checkpoint exists before rebuild');
          const rebuild = assembleRebuild(
            {
              task_tree: latest.checkpoint.task_tree,
              latest_checkpoint: latest.checkpoint,
              directives: ['Founder: library-only, never wire the live daemon.', 'Founder: commit with attribution trailers.'],
              project_memory: [{ provenance: 'MEMORY.md#lane2', text: 'Checkpoints are early and structured.' }],
              notes: notes.readAll(),
              path_index: ['packages/checkpoint-writer/src/index.ts'],
              next_action: latest.checkpoint.next_action,
            },
            8_000,
          );
          assert.ok(rebuild.total_tokens <= rebuild.budget_tokens, `rebuild ${rebuild.total_tokens} <= ${rebuild.budget_tokens}`);
          for (const field of [
            'current_intent', 'next_action', 'working_constraints', 'task_tree', 'current_work',
            'involved_files', 'cross_task_discoveries', 'errors_and_fixes', 'runtime_state',
            'design_decisions', 'misc_notes', 'evidence_refs',
          ]) {
            assert.ok(rebuild.text.includes(`### ${field}`), `rebuild carries ${field}`);
          }
          // The notes appended after the 70% checkpoint are in the rebuild…
          assert.ok(rebuild.text.includes('worker note at turn 35'), 'post-checkpoint scratch reaches the rebuild');
          assert.ok(rebuild.text.includes('worker note at turn 30'), 'the whole post-cp70 scratch is present');
          rebuilt = true;
        }
      }
    }

    assert.ok(rebuilt, 'the rebuild ceiling was reached');
    assert.deepEqual(firedPcts, [20, 45, 70], 'exactly the act thresholds fired, in order');
    assert.equal(seatRequests.length, 3, 'the writer seat ran three times');
    assert.equal(seatRequests[0]?.writer_budget_tokens, 4_000, 'writer ran on its own budget every time');

    // Every persisted checkpoint carries a hash that matches its bytes.
    for (let seq = 1; seq <= 3; seq++) {
      const persisted = store.read(store.pathFor('dogfood', seq));
      assert.equal(persisted.sha256, sha256Of(readFileSync(persisted.path, 'utf8')));
      assert.equal(persisted.checkpoint.session_id, 'dogfood');
      assert.equal(persisted.checkpoint.seq, seq);
    }
    // Promotion really happened: each checkpoint holds the notes the worker
    // wrote since the previous one, and the scratch was cleared each time.
    const cp1 = store.read(store.pathFor('dogfood', 1));
    assert.deepEqual(cp1.checkpoint.misc_notes, ['worker note at turn 5']);
    const cp3 = store.read(store.pathFor('dogfood', 3));
    assert.deepEqual(cp3.checkpoint.misc_notes, ['worker note at turn 20', 'worker note at turn 25']);
  });
});

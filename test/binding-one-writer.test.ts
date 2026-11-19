/**
 * One writer for the binding (FOUNDER-ACT-20261119-BR-PHASE5-STEP1-BOUNDARY,
 * B2): "No production code writes a runtime_room.bound entry, a binding record
 * or a Builder command's journaled row except through the governed path. A
 * test in the build lane checks that only the governed path calls the store
 * functions that write them; a change that adds another caller is a defect."
 *
 * The governed path is `bindFirstBuilderCommand` and
 * `journalLaterBuilderCommand` in packages/control-plane/src/runtime-room-binding.ts.
 *
 * Every TypeScript file under packages/{name}/src is parsed with the
 * TypeScript compiler, so comments and the text inside other strings never
 * count, and each rule names the only files where its construct may appear:
 *
 *   1. a call of `.appendRecorded(...)`, the lifecycle store's recorded
 *      append, which alone writes a `runtime_room.bound` entry;
 *   2. a call of `.appendBinding(...)`, the journal store's binding record;
 *   3. the Builder command kind, as the identifier `BUILDER_COMMAND_KIND` or
 *      the string 'builder.invoke': where it is defined, where the journal
 *      refuses or checks it, and the governed path, which alone builds one;
 *   4. the string 'runtime_room.bound' itself: its definition in the event
 *      vocabulary, the journal's binding class, the generic route's refused
 *      set, and the governed path, which alone builds the event;
 *   5. SQL that writes the rows directly: an INSERT into the lifecycle log
 *      only in the lifecycle store, and a call of the journal's append
 *      routine only in the journal store.
 *
 * A new entry in any allowlist below is a change the act makes reviewable:
 * it is a second writer unless the reviewer finds it only refuses or reads.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOVERNED_PATH = 'packages/control-plane/src/runtime-room-binding.ts';

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) files.push(path);
    }
  };
  const packages = join(REPO_ROOT, 'packages');
  for (const name of readdirSync(packages)) {
    const src = join(packages, name, 'src');
    try {
      if (statSync(src).isDirectory()) walk(src);
    } catch {
      // A package with no src directory has no production code to check.
    }
  }
  return files.map((path) => relative(REPO_ROOT, path).split(sep).join('/')).sort();
}

interface Sites {
  readonly appendRecorded: Set<string>;
  readonly appendBinding: Set<string>;
  readonly builderKind: Set<string>;
  readonly boundEvent: Set<string>;
  readonly lifecycleInsert: Set<string>;
  readonly journalRoutine: Set<string>;
}

function scan(): Sites {
  const sites: Sites = {
    appendRecorded: new Set(),
    appendBinding: new Set(),
    builderKind: new Set(),
    boundEvent: new Set(),
    lifecycleInsert: new Set(),
    journalRoutine: new Set(),
  };
  for (const file of sourceFiles()) {
    const text = readFileSync(join(REPO_ROOT, file), 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : null;
        if (name === 'appendRecorded') sites.appendRecorded.add(file);
        if (name === 'appendBinding') sites.appendBinding.add(file);
      }
      if (ts.isIdentifier(node) && node.text === 'BUILDER_COMMAND_KIND') sites.builderKind.add(file);
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)
        || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        const value = node.text;
        if (value === 'builder.invoke') sites.builderKind.add(file);
        if (value === 'runtime_room.bound') sites.boundEvent.add(file);
        if (/\bINSERT\s+INTO\s+(?:public\.)?build_room_events\b/i.test(value)) sites.lifecycleInsert.add(file);
        if (/\bcommand_journal_append\s*\(/i.test(value) && !/\b(?:CREATE|ALTER|REVOKE|GRANT|COMMENT|DROP)\b/i.test(value)) {
          sites.journalRoutine.add(file);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return sites;
}

const sorted = (set: ReadonlySet<string>): string[] => [...set].sort();

describe('binding-one-writer · only the governed path writes the binding (boundary act B2)', () => {
  const sites = scan();

  it('scans every package\'s source, the governed path included', () => {
    const files = sourceFiles();
    assert.ok(files.includes(GOVERNED_PATH), 'the governed path is scanned');
    assert.ok(files.includes('packages/control-plane/src/store.ts'));
    assert.ok(files.includes('packages/control-plane/src/journal-store.ts'));
    assert.ok(files.length > 50, `only ${files.length} files found`);
  });

  it('calls the lifecycle store\'s recorded append, the only writer of a runtime_room.bound entry, only from the governed path', () => {
    assert.deepEqual(sorted(sites.appendRecorded), [GOVERNED_PATH]);
  });

  it('calls the journal store\'s binding-record append only from the governed path', () => {
    assert.deepEqual(sorted(sites.appendBinding), [GOVERNED_PATH]);
  });

  it('names the Builder command kind only where it is defined, refused or checked, and in the governed path', () => {
    assert.deepEqual(sorted(sites.builderKind), [
      'packages/control-plane/src/journal-store.ts',
      GOVERNED_PATH,
      'packages/journal/src/binding-row.ts',
      'packages/journal/src/index.ts',
      'packages/journal/src/sequence.ts',
    ].sort());
  });

  it('names runtime_room.bound only in its definitions, the generic route\'s refused set, and the governed path', () => {
    assert.deepEqual(sorted(sites.boundEvent), BOUND_EVENT_SITES);
  });

  it('writes the lifecycle log by SQL only in the lifecycle store, and calls the journal\'s append routine only in the journal store', () => {
    assert.deepEqual(sorted(sites.lifecycleInsert), ['packages/control-plane/src/store.ts']);
    assert.deepEqual(sorted(sites.journalRoutine), ['packages/control-plane/src/journal-store.ts']);
  });
});

/** Where the string 'runtime_room.bound' may stand on its own; see rule 4. */
const BOUND_EVENT_SITES: string[] = [
  'packages/contracts/src/events.ts',
  'packages/control-plane/src/governed-events.ts',
  GOVERNED_PATH,
  'packages/journal/src/binding-row.ts',
].sort();

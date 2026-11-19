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
 * TypeScript compiler, so comments never count. Each rule names the only files
 * where its construct may appear:
 *
 *   1. the NAME `appendRecorded`, the lifecycle store's recorded append, which
 *      alone writes a `runtime_room.bound` entry: as an identifier anywhere
 *      (a call, a property read, a bound or destructured alias, a type
 *      member, an import) or as a string or template text (bracket access,
 *      a `Pick` key). A rule on the name, not on one call shape, so a second
 *      caller cannot pass by aliasing the method;
 *   2. the NAME `appendBinding`, the journal store's binding-record append,
 *      the same way;
 *   3. the Builder command kind, as the identifier `BUILDER_COMMAND_KIND` (an
 *      import of it, renamed or not, names it) or the string 'builder.invoke':
 *      where it is defined, where the journal refuses or checks it, and the
 *      governed path, which alone builds one;
 *   4. the string 'runtime_room.bound' itself: its definition in the event
 *      vocabulary, the journal's binding class, the generic route's refused
 *      set, and the governed path, which alone builds the event;
 *   5. SQL that writes the rows directly: an INSERT into the lifecycle log
 *      only in the lifecycle store, and a call of the journal's append
 *      routine only in the journal store.
 *
 * Each rule is pinned by fixtures: every ordinary way to reach the construct
 * is detected, and a comment or a longer name that merely contains it is
 * not. What the check cannot see is a name assembled at run time (string
 * concatenation, a computed key built from parts); it reads names as written.
 *
 * A new entry in any allowlist below is a change the act makes reviewable:
 * it is a second writer unless the reviewer finds it only defines, refuses,
 * checks or reads.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOVERNED_PATH = 'packages/control-plane/src/runtime-room-binding.ts';

type Rule = 'appendRecorded' | 'appendBinding' | 'builderKind' | 'boundEvent' | 'lifecycleInsert' | 'journalRoutine';
const RULES: readonly Rule[] = ['appendRecorded', 'appendBinding', 'builderKind', 'boundEvent', 'lifecycleInsert', 'journalRoutine'];

/** The text of a node that carries source text: an identifier or any string or template part. */
function textOf(node: ts.Node): { readonly kind: 'name' | 'string'; readonly text: string } | null {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return { kind: 'name', text: node.text };
  if (
    ts.isStringLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node)
    || ts.isTemplateHead(node)
    || ts.isTemplateMiddle(node)
    || ts.isTemplateTail(node)
  ) {
    return { kind: 'string', text: node.text };
  }
  return null;
}

/** The rules one source text touches. */
export function rulesTouched(file: string, text: string): Set<Rule> {
  const touched = new Set<Rule>();
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node: ts.Node): void => {
    const carried = textOf(node);
    if (carried !== null) {
      const value = carried.text;
      if (value === 'appendRecorded') touched.add('appendRecorded');
      if (value === 'appendBinding') touched.add('appendBinding');
      if (carried.kind === 'name' && value === 'BUILDER_COMMAND_KIND') touched.add('builderKind');
      if (carried.kind === 'string') {
        if (value === 'builder.invoke') touched.add('builderKind');
        if (value === 'runtime_room.bound') touched.add('boundEvent');
        if (/\bINSERT\s+INTO\s+(?:public\.)?build_room_events\b/i.test(value)) touched.add('lifecycleInsert');
        if (/\bcommand_journal_append\s*\(/i.test(value) && !/\b(?:CREATE|ALTER|REVOKE|GRANT|COMMENT|DROP)\b/i.test(value)) {
          touched.add('journalRoutine');
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return touched;
}

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

function scan(): Record<Rule, string[]> {
  const sites = Object.fromEntries(RULES.map((rule) => [rule, [] as string[]])) as Record<Rule, string[]>;
  for (const file of sourceFiles()) {
    for (const rule of rulesTouched(file, readFileSync(join(REPO_ROOT, file), 'utf8'))) sites[rule].push(file);
  }
  for (const rule of RULES) sites[rule].sort();
  return sites;
}

/** Where each construct may appear in production source. */
const ALLOWED: Record<Rule, string[]> = {
  // The method's definition, and the governed path's call and its deps type.
  appendRecorded: ['packages/control-plane/src/store.ts', GOVERNED_PATH],
  // The joined append's definition and its interface, and the governed path's call.
  appendBinding: ['packages/control-plane/src/journal-store.ts', GOVERNED_PATH],
  builderKind: [
    'packages/control-plane/src/journal-store.ts',
    GOVERNED_PATH,
    'packages/journal/src/binding-row.ts',
    'packages/journal/src/index.ts',
    'packages/journal/src/sequence.ts',
  ],
  boundEvent: [
    'packages/contracts/src/events.ts',
    'packages/control-plane/src/governed-events.ts',
    GOVERNED_PATH,
    'packages/journal/src/binding-row.ts',
  ],
  lifecycleInsert: ['packages/control-plane/src/store.ts'],
  journalRoutine: ['packages/control-plane/src/journal-store.ts'],
};
for (const rule of RULES) ALLOWED[rule].sort();

describe('binding-one-writer · only the governed path writes the binding (boundary act B2)', () => {
  const sites = scan();

  it('scans every package\'s source, the governed path and both stores included', () => {
    const files = sourceFiles();
    for (const file of [GOVERNED_PATH, 'packages/control-plane/src/store.ts', 'packages/control-plane/src/journal-store.ts']) {
      assert.ok(files.includes(file), file);
    }
    assert.ok(files.length > 50, `only ${files.length} files found`);
  });

  for (const rule of RULES) {
    it(`finds ${rule} only where it is allowed`, () => {
      assert.deepEqual(sites[rule], ALLOWED[rule]);
    });
  }
});

describe('binding-one-writer · every ordinary way to reach a writer is detected', () => {
  const detects = (rule: Rule, text: string): void => {
    assert.ok(rulesTouched('fixture.ts', text).has(rule), `${rule} not detected in:\n${text}`);
  };
  const ignores = (rule: Rule, text: string): void => {
    assert.equal(rulesTouched('fixture.ts', text).has(rule), false, `${rule} wrongly detected in:\n${text}`);
  };

  const methodForms = (name: 'appendRecorded' | 'appendBinding'): readonly string[] => [
    `await store.${name}(roomId, spec);`,
    `await store?.${name}?.(roomId, spec);`,
    `const write = store.${name}.bind(store); await write(roomId, spec);`,
    `const write = store.${name}; await write.call(store, roomId, spec);`,
    `await store.${name}.apply(store, [roomId, spec]);`,
    `await Reflect.apply(store.${name}, store, [roomId, spec]);`,
    `const { ${name} } = journal.inTransaction(client); await ${name}(row);`,
    `const { ${name}: write } = tx; await write(row);`,
    `function take({ ${name} }: Tx) { return ${name}; }`,
    `await store['${name}'](roomId, spec);`,
    `await store[\`${name}\`](roomId, spec);`,
    `const key = '${name}'; await store[key](roomId, spec);`,
    `type Writer = Pick<Store, '${name}'>;`,
    `const proto = Store.prototype.${name};`,
    `export { ${name} } from './store.js';`,
  ];

  it('appendRecorded: a direct call, an optional call, a bound, called or applied alias, a destructured method, bracket access, a key held in a variable, a type key, the prototype and a re-export', () => {
    for (const text of methodForms('appendRecorded')) detects('appendRecorded', text);
  });

  it('appendBinding: the same forms', () => {
    for (const text of methodForms('appendBinding')) detects('appendBinding', text);
  });

  it('the Builder command kind: the constant, imported plain or renamed, and the literal', () => {
    detects('builderKind', `if (kind === BUILDER_COMMAND_KIND) return;`);
    detects('builderKind', `import { BUILDER_COMMAND_KIND as K } from './journal.js';`);
    detects('builderKind', `const command = { commandKind: 'builder.invoke' };`);
    detects('builderKind', 'const command = { commandKind: `builder.invoke` };');
  });

  it('runtime_room.bound as a string or a template', () => {
    detects('boundEvent', `const event = { event: 'runtime_room.bound' };`);
    detects('boundEvent', 'const event = { event: `runtime_room.bound` };');
  });

  it('SQL that writes the rows, in a string or a template', () => {
    detects('lifecycleInsert', `await client.query('INSERT INTO build_room_events (room_id) VALUES ($1)', [id]);`);
    detects('lifecycleInsert', 'await client.query(`insert into public.build_room_events (room_id) values (${"$"}1)`, [id]);');
    detects('journalRoutine', `await client.query('SELECT * FROM public.command_journal_append($1, $2, $3, $4, $5)', args);`);
  });

  it('ignores a comment, and a longer name or text that merely contains a construct', () => {
    ignores('appendRecorded', `// store.appendRecorded(roomId, spec) is the governed path's\nconst x = 1;`);
    ignores('appendRecorded', `/* appendRecorded */ const appendRecordedCount = 0;`);
    ignores('appendBinding', `const label = 'appendBindingRow';`);
    ignores('boundEvent', `const sql = "SELECT 1 FROM build_room_events WHERE event = 'runtime_room.bound'";`);
    ignores('lifecycleInsert', `const sql = 'SELECT * FROM build_room_events';`);
    ignores('journalRoutine', `const ddl = 'GRANT EXECUTE ON FUNCTION public.command_journal_append(text) TO r';`);
  });
});

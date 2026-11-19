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
 * WHY NAMES ARE ENOUGH. Each of the three rows has exactly one store method
 * that writes it, and every other store method refuses it at run time, whoever
 * calls it and whatever it forwards:
 *
 *   - a `runtime_room.bound` entry: `PostgresLedgerStore.appendRecorded`;
 *     `append` and `appendDerived` throw on a recorded event before writing;
 *   - a binding record: the joined `appendBinding`;
 *   - a Builder command's `journaled` row: the joined `appendBuilderJournaled`;
 *     the standalone and the joined `appendJournaled` both refuse
 *     `builder.invoke`, so a caller that forwards a Builder request it was
 *     handed, without ever naming the kind, is refused there.
 *
 * Below those methods sit the stores' private write helpers, and below them
 * SQL. So a second writer must name one of those methods or helpers, or carry
 * SQL that writes the two tables or calls the journal's append routine. This
 * test parses every TypeScript file under packages/{name}/src with the
 * TypeScript compiler (comments never count) and allows each of those names
 * and SQL forms only where the rules below say:
 *
 *   1. `appendRecorded`, 2. `appendBinding`, 3. `appendBuilderJournaled`:
 *      the name as an identifier anywhere (a call, a property read, a bound,
 *      called, applied or destructured alias, a type member, an import or
 *      export) or as string or template text (bracket access, a key held in a
 *      variable, a `Pick` key): only where the method is defined and in the
 *      governed path;
 *   4. the stores' private write helpers (`appendCommandRow`,
 *      `appendBindingRow`, `appendWithin`, `insertEvent`), the same way: only
 *      in the store that defines each;
 *   5. SQL that writes the lifecycle log or the journal's table (INSERT INTO,
 *      MERGE INTO, COPY or UPDATE, with the schema and the table name quoted
 *      or not), or calls the journal's append routine (its name quoted or
 *      not, in anything but DDL): only in the store that owns it, and the
 *      routine's own definition in the migrations.
 *
 * Two further rules are an inventory, not the enforcement, which the five
 * above are: where the Builder command kind is spelled (`BUILDER_COMMAND_KIND`,
 * imported plain or renamed, or 'builder.invoke'), and where the event's name
 * is (`BINDING_EVENT`, likewise, or 'runtime_room.bound'). A value reached
 * another way (an array lookup, a forwarded request) cannot write anything
 * without one of the methods above.
 *
 * Each rule is pinned by fixtures: every ordinary form is detected, and a
 * comment, a read-only query or a longer name is not. What the check cannot
 * see is a name or SQL text assembled at run time from parts; it reads names
 * and SQL as written.
 *
 * A new entry in an allowlist is a change the act makes reviewable: it is a
 * second writer unless the reviewer finds it only defines, refuses, checks or
 * reads.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOVERNED_PATH = 'packages/control-plane/src/runtime-room-binding.ts';
const LIFECYCLE_STORE = 'packages/control-plane/src/store.ts';
const JOURNAL_STORE = 'packages/control-plane/src/journal-store.ts';
const MIGRATIONS = 'packages/control-plane/src/migrations.ts';

type Rule =
  | 'appendRecorded'
  | 'appendBinding'
  | 'appendBuilderJournaled'
  | 'journalHelpers'
  | 'lifecycleHelpers'
  | 'lifecycleSql'
  | 'journalSql'
  | 'builderKind'
  | 'boundEvent';
const RULES: readonly Rule[] = [
  'appendRecorded',
  'appendBinding',
  'appendBuilderJournaled',
  'journalHelpers',
  'lifecycleHelpers',
  'lifecycleSql',
  'journalSql',
  'builderKind',
  'boundEvent',
];

const NAMES: ReadonlyMap<string, Rule> = new Map<string, Rule>([
  ['appendRecorded', 'appendRecorded'],
  ['appendBinding', 'appendBinding'],
  ['appendBuilderJournaled', 'appendBuilderJournaled'],
  ['appendCommandRow', 'journalHelpers'],
  ['appendBindingRow', 'journalHelpers'],
  ['appendWithin', 'journalHelpers'],
  ['insertEvent', 'lifecycleHelpers'],
]);

/** A write to a table: INSERT INTO, MERGE INTO, COPY or UPDATE, schema and name quoted or not. */
function writesTable(sql: string, table: string): boolean {
  const pattern = new RegExp(
    String.raw`\b(?:INSERT\s+INTO|MERGE\s+INTO|COPY|UPDATE)\s+(?:ONLY\s+)?(?:(?:"public"|public)\s*\.\s*)?(?:"${table}"|${table}\b)`,
    'i',
  );
  return pattern.test(sql);
}

/** A call of the journal's append routine, its name quoted or not, outside DDL. */
function callsJournalRoutine(sql: string): boolean {
  return /(?:"command_journal_append"|\bcommand_journal_append\b)\s*\(/i.test(sql)
    && !/\b(?:CREATE|ALTER|REVOKE|GRANT|COMMENT|DROP)\b/i.test(sql);
}

/** The text a node carries as written: an identifier, or a string or template part. */
function textOf(node: ts.Node): { readonly kind: 'name' | 'string'; readonly text: string } | null {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return { kind: 'name', text: node.text.replace(/^#/, '') };
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
      const named = NAMES.get(value);
      if (named !== undefined) touched.add(named);
      if (carried.kind === 'name') {
        if (value === 'BUILDER_COMMAND_KIND') touched.add('builderKind');
        if (value === 'BINDING_EVENT') touched.add('boundEvent');
      } else {
        if (value === 'builder.invoke') touched.add('builderKind');
        if (value === 'runtime_room.bound') touched.add('boundEvent');
        if (writesTable(value, 'build_room_events')) touched.add('lifecycleSql');
        if (writesTable(value, 'command_journal_events') || callsJournalRoutine(value)) touched.add('journalSql');
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
  // The definition, and the governed path's call and its deps type.
  appendRecorded: [LIFECYCLE_STORE, GOVERNED_PATH],
  // The joined appends' definitions and interface, and the governed path's calls.
  appendBinding: [JOURNAL_STORE, GOVERNED_PATH],
  appendBuilderJournaled: [JOURNAL_STORE, GOVERNED_PATH],
  journalHelpers: [JOURNAL_STORE],
  lifecycleHelpers: [LIFECYCLE_STORE],
  lifecycleSql: [LIFECYCLE_STORE],
  // The journal store's routine call, and the routine's own body in migration 0006.
  journalSql: [JOURNAL_STORE, MIGRATIONS],
  builderKind: [
    JOURNAL_STORE,
    GOVERNED_PATH,
    'packages/journal/src/binding-row.ts',
    'packages/journal/src/index.ts',
    'packages/journal/src/sequence.ts',
  ],
  boundEvent: [
    'packages/contracts/src/events.ts',
    'packages/control-plane/src/governed-events.ts',
    JOURNAL_STORE,
    GOVERNED_PATH,
    'packages/journal/src/binding-row.ts',
    'packages/journal/src/index.ts',
  ],
};
for (const rule of RULES) ALLOWED[rule].sort();

describe('binding-one-writer · only the governed path writes the binding (boundary act B2)', () => {
  const sites = scan();

  it('scans every package\'s source, the governed path, both stores and the migrations included', () => {
    const files = sourceFiles();
    for (const file of [GOVERNED_PATH, LIFECYCLE_STORE, JOURNAL_STORE, MIGRATIONS]) assert.ok(files.includes(file), file);
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

  const nameForms = (name: string): readonly string[] => [
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
    `await (store as any).${name}(roomId, spec);`,
    `type Writer = Pick<Store, '${name}'>;`,
    `const proto = Store.prototype.${name};`,
    `export { ${name} } from './store.js';`,
    `import { ${name} as write } from './store.js';`,
  ];

  for (const [name, rule] of NAMES) {
    it(`${name} (${rule}): a call, an optional call, a bound, called or applied alias, a destructuring, bracket access, a key in a variable, a cast, a type key, the prototype, an import and a re-export`, () => {
      for (const text of nameForms(name)) detects(rule, text);
    });
  }

  it('SQL writing the lifecycle log: each verb, the schema and the name quoted or not, in a string or a template', () => {
    for (const sql of [
      'INSERT INTO build_room_events (room_id) VALUES ($1)',
      'insert into public.build_room_events (room_id) values ($1)',
      'INSERT INTO "build_room_events" (room_id) VALUES ($1)',
      'INSERT INTO public."build_room_events" (room_id) VALUES ($1)',
      'INSERT INTO "public"."build_room_events" (room_id) VALUES ($1)',
      'INSERT INTO "public" . "build_room_events" (room_id) VALUES ($1)',
      'MERGE INTO build_room_events AS t USING src ON false WHEN NOT MATCHED THEN INSERT DEFAULT VALUES',
      'COPY build_room_events (room_id) FROM STDIN',
      'UPDATE ONLY "build_room_events" SET event = $1',
    ]) {
      detects('lifecycleSql', `await client.query('${sql}', args);`);
      detects('lifecycleSql', `await client.query(\`${sql}\`, args);`);
    }
  });

  it('SQL writing the journal: its table by each verb, or its append routine, the name quoted or not', () => {
    for (const sql of [
      'INSERT INTO command_journal_events (seq) VALUES ($1)',
      'INSERT INTO "public"."command_journal_events" (seq) VALUES ($1)',
      'COPY "command_journal_events" FROM STDIN',
      'SELECT * FROM public.command_journal_append($1, $2, $3, $4, $5)',
      'SELECT * FROM public."command_journal_append"($1, $2, $3, $4, $5)',
      'SELECT "command_journal_append" ($1, $2, $3, $4, $5)',
    ]) {
      detects('journalSql', `await client.query('${sql}', args);`);
    }
  });

  it('the Builder command kind and the event name: the constants, imported plain or renamed, and the literals', () => {
    detects('builderKind', `if (kind === BUILDER_COMMAND_KIND) return;`);
    detects('builderKind', `import { BUILDER_COMMAND_KIND as K } from './journal.js';`);
    detects('builderKind', `const command = { commandKind: 'builder.invoke' };`);
    detects('builderKind', 'const command = { commandKind: `builder.invoke` };');
    detects('boundEvent', `const event = { event: BINDING_EVENT };`);
    detects('boundEvent', `import { BINDING_EVENT as E } from '../../journal/src/index.js';`);
    detects('boundEvent', `const event = { event: 'runtime_room.bound' };`);
    detects('boundEvent', 'const event = { event: `runtime_room.bound` };');
  });

  it('ignores a comment, a read-only query, DDL, and a longer name or text that merely contains a construct', () => {
    ignores('appendRecorded', `// store.appendRecorded(roomId, spec) is the governed path's\nconst x = 1;`);
    ignores('appendRecorded', `/* appendRecorded */ const appendRecordedCount = 0;`);
    ignores('appendBinding', `const label = 'appendBindingRows';`);
    ignores('lifecycleHelpers', `const insertEvents = 0;`);
    ignores('boundEvent', `const sql = "SELECT 1 FROM build_room_events WHERE event = 'runtime_room.bound'";`);
    ignores('lifecycleSql', `const sql = 'SELECT * FROM "build_room_events"';`);
    ignores('lifecycleSql', `const sql = 'INSERT INTO build_room_events_archive SELECT 1';`);
    ignores('lifecycleSql', `const sql = 'INSERT INTO "build_room_events_archive" SELECT 1';`);
    ignores('journalSql', `const ddl = 'GRANT EXECUTE ON FUNCTION public.command_journal_append(text) TO r';`);
    ignores('journalSql', `const sql = 'SELECT seq FROM command_journal_events';`);
  });
});

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
 * SQL that writes the two tables or calls the journal's append routine.
 *
 * WHAT IS COUNTED. Every TypeScript file under packages/{name}/src is parsed
 * with the TypeScript compiler (comments never count). For each writer method
 * and helper, every occurrence of its name is counted per file and sorted into
 *
 *   - a DECLARATION: the name a method, function, property or interface
 *     member is declared under;
 *   - a USE: anything else, whether an identifier (a call, a property read,
 *     a bound, called, applied or destructured alias, a type, an import or
 *     export) or string or template text (bracket access, a key held in a
 *     variable, a `Pick` key).
 *
 * For SQL, every string or template part that writes the lifecycle log or the
 * journal's table (INSERT INTO, MERGE INTO, COPY or UPDATE, schema and name
 * quoted or not), or calls the journal's append routine outside DDL, counts as
 * one use, read after SQL comments are removed, so a comment between keywords
 * hides nothing.
 *
 * The counts must equal EXPECTED exactly, file by file. A second caller fails
 * the test wherever it is added, an allowed file included: a new use of
 * `appendRecorded` inside store.ts, or of `appendBuilderJournaled` inside
 * journal-store.ts, changes that file's count. A change to EXPECTED is a
 * change the act makes reviewable: it is a second writer unless the reviewer
 * finds it only defines, refuses, checks or reads.
 *
 * Two further rules are an inventory, not the enforcement: where the Builder
 * command kind is spelled (`BUILDER_COMMAND_KIND`, imported plain or renamed,
 * or 'builder.invoke'), and where the event's name is (`BINDING_EVENT`,
 * likewise, or 'runtime_room.bound'). They are checked by file. A value
 * reached another way (an array lookup, a forwarded request) cannot write
 * anything without one of the counted methods.
 *
 * Fixtures pin each ordinary form, a second caller added inside an allowed
 * file, and comments inside SQL. What the check cannot see is a name or SQL
 * text assembled at run time from parts; it reads names and SQL as written.
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

type WriterRule =
  | 'appendRecorded'
  | 'appendBinding'
  | 'appendBuilderJournaled'
  | 'appendCommandRow'
  | 'appendBindingRow'
  | 'appendWithin'
  | 'insertEvent'
  | 'lifecycleSql'
  | 'journalSql';
type InventoryRule = 'builderKind' | 'boundEvent';

const WRITER_NAMES: ReadonlySet<string> = new Set<WriterRule>([
  'appendRecorded',
  'appendBinding',
  'appendBuilderJournaled',
  'appendCommandRow',
  'appendBindingRow',
  'appendWithin',
  'insertEvent',
]);

/** "declarations/uses" for one file. */
type Tally = string;
type Tallies = Partial<Record<WriterRule, Record<string, Tally>>>;

/** SQL with its comments replaced by a space: `--` to a line feed or carriage return, and nested block comments; quoted text is kept. */
export function withoutSqlComments(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;
    if (ch === "'" || ch === '"') {
      let end = i + 1;
      while (end < sql.length) {
        if (sql[end] === ch) {
          if (sql[end + 1] === ch) {
            end += 2;
            continue;
          }
          break;
        }
        end += 1;
      }
      out += sql.slice(i, end + 1);
      i = end + 1;
    } else if (sql.startsWith('--', i)) {
      i += 2;
      while (i < sql.length && sql[i] !== '\n' && sql[i] !== '\r') i += 1;
      out += ' ';
    } else if (sql.startsWith('/*', i)) {
      let depth = 0;
      while (i < sql.length) {
        if (sql.startsWith('/*', i)) {
          depth += 1;
          i += 2;
        } else if (sql.startsWith('*/', i)) {
          depth -= 1;
          i += 2;
          if (depth === 0) break;
        } else {
          i += 1;
        }
      }
      out += ' ';
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

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

const DECLARING = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.PropertyDeclaration,
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
]);

/** Whether an identifier is the name something is declared under. */
function isDeclarationName(node: ts.Identifier | ts.PrivateIdentifier): boolean {
  const parent = node.parent;
  return parent !== undefined && DECLARING.has(parent.kind) && (parent as { name?: ts.Node }).name === node;
}

interface FileFindings {
  readonly writers: Map<WriterRule, { declarations: number; uses: number }>;
  readonly inventory: Set<InventoryRule>;
}

/** What one source text holds: counts for each writer rule, and the inventory rules it touches. */
export function findingsIn(file: string, text: string): FileFindings {
  const writers = new Map<WriterRule, { declarations: number; uses: number }>();
  const inventory = new Set<InventoryRule>();
  const count = (rule: WriterRule, declaration: boolean): void => {
    const current = writers.get(rule) ?? { declarations: 0, uses: 0 };
    if (declaration) current.declarations += 1;
    else current.uses += 1;
    writers.set(rule, current);
  };
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      const name = node.text.replace(/^#/, '');
      if (WRITER_NAMES.has(name)) count(name as WriterRule, isDeclarationName(node));
      if (name === 'BUILDER_COMMAND_KIND') inventory.add('builderKind');
      if (name === 'BINDING_EVENT') inventory.add('boundEvent');
    } else if (
      ts.isStringLiteral(node)
      || ts.isNoSubstitutionTemplateLiteral(node)
      || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node)
      || ts.isTemplateTail(node)
    ) {
      const value = node.text;
      if (WRITER_NAMES.has(value)) count(value as WriterRule, false);
      if (value === 'builder.invoke') inventory.add('builderKind');
      if (value === 'runtime_room.bound') inventory.add('boundEvent');
      const sql = withoutSqlComments(value);
      if (writesTable(sql, 'build_room_events')) count('lifecycleSql', false);
      if (writesTable(sql, 'command_journal_events') || callsJournalRoutine(sql)) count('journalSql', false);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { writers, inventory };
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

const readSource = (file: string): string => readFileSync(join(REPO_ROOT, file), 'utf8');

/** Every writer rule's counts, file by file, and every inventory rule's files, over the given sources. */
function scan(sources: ReadonlyMap<string, string>): { writers: Tallies; inventory: Record<InventoryRule, string[]> } {
  const writers: Tallies = {};
  const inventory: Record<InventoryRule, string[]> = { builderKind: [], boundEvent: [] };
  for (const [file, text] of [...sources].sort(([a], [b]) => a.localeCompare(b))) {
    const found = findingsIn(file, text);
    for (const [rule, { declarations, uses }] of found.writers) {
      (writers[rule] ??= {})[file] = `${declarations}/${uses}`;
    }
    for (const rule of found.inventory) inventory[rule].push(file);
  }
  return { writers, inventory };
}

const productionSources = (): Map<string, string> => new Map(sourceFiles().map((file) => [file, readSource(file)]));

/**
 * Each writer rule, file by file, as "declarations/uses". A use in the
 * governed path is a write it makes or a type it names; a use in a store is
 * that store's own plumbing, and the counts pin it.
 */
const EXPECTED: Tallies = {
  // The lifecycle store's declaration; the governed path's call and its deps' Pick key.
  appendRecorded: { [GOVERNED_PATH]: '0/2', [LIFECYCLE_STORE]: '1/0' },
  // The joined append and its interface member; the governed path's call.
  appendBinding: { [GOVERNED_PATH]: '0/1', [JOURNAL_STORE]: '2/0' },
  // The joined append and its interface member; the governed path's two calls.
  appendBuilderJournaled: { [GOVERNED_PATH]: '0/2', [JOURNAL_STORE]: '2/0' },
  // The private helpers: declared once each, used only by their own store's methods.
  appendCommandRow: { [JOURNAL_STORE]: '1/5' },
  appendBindingRow: { [JOURNAL_STORE]: '1/1' },
  appendWithin: { [JOURNAL_STORE]: '1/3' },
  insertEvent: { [LIFECYCLE_STORE]: '1/3' },
  lifecycleSql: { [LIFECYCLE_STORE]: '0/1' },
  // The journal store's routine call, and the routine's own body in migration 0006.
  journalSql: { [JOURNAL_STORE]: '0/1', [MIGRATIONS]: '0/1' },
};

const INVENTORY: Record<InventoryRule, string[]> = {
  builderKind: [
    JOURNAL_STORE,
    GOVERNED_PATH,
    'packages/journal/src/binding-row.ts',
    'packages/journal/src/index.ts',
    'packages/journal/src/sequence.ts',
  ].sort(),
  boundEvent: [
    'packages/contracts/src/events.ts',
    'packages/control-plane/src/governed-events.ts',
    JOURNAL_STORE,
    GOVERNED_PATH,
    'packages/journal/src/binding-row.ts',
    'packages/journal/src/index.ts',
  ].sort(),
};

describe('binding-one-writer · only the governed path writes the binding (boundary act B2)', () => {
  const sources = productionSources();
  const { writers, inventory } = scan(sources);

  it('scans every package\'s source, the governed path, both stores and the migrations included', () => {
    for (const file of [GOVERNED_PATH, LIFECYCLE_STORE, JOURNAL_STORE, MIGRATIONS]) assert.ok(sources.has(file), file);
    assert.ok(sources.size > 50, `only ${sources.size} files found`);
  });

  it('counts every writer\'s declarations and uses exactly, file by file', () => {
    assert.deepEqual(writers, EXPECTED);
  });

  it('finds the Builder command kind and the event name only in the inventoried files', () => {
    assert.deepEqual(inventory, INVENTORY);
  });
});

describe('binding-one-writer · a second caller fails, wherever it is added', () => {
  const sources = productionSources();
  const withAdded = (file: string, code: string): Tallies => {
    const tampered = new Map(sources);
    tampered.set(file, `${sources.get(file)!}\n${code}\n`);
    return scan(tampered).writers;
  };
  const caught = (file: string, code: string, rule: WriterRule): void => {
    const writers = withAdded(file, code);
    assert.notDeepEqual(writers, EXPECTED, `not caught in ${file}:\n${code}`);
    assert.notEqual(writers[rule]?.[file], EXPECTED[rule]?.[file], `${rule} in ${file} unchanged`);
  };

  it('a second use of appendRecorded inside the lifecycle store', () => {
    caught(LIFECYCLE_STORE, 'export async function second(s: PostgresLedgerStore): Promise<void> { await s.appendRecorded("r", {} as never); }', 'appendRecorded');
  });

  it('a second use of appendBuilderJournaled or appendBinding inside the journal store', () => {
    caught(JOURNAL_STORE, 'export async function second(tx: JournalTransaction): Promise<void> { await tx.appendBuilderJournaled({} as never, {}); }', 'appendBuilderJournaled');
    caught(JOURNAL_STORE, 'export async function second(tx: JournalTransaction): Promise<void> { await tx.appendBinding({} as never); }', 'appendBinding');
  });

  it('a third call inside the governed path itself', () => {
    caught(GOVERNED_PATH, 'export async function third(tx: JournalTransaction): Promise<void> { await tx.appendBuilderJournaled({} as never, {}); }', 'appendBuilderJournaled');
  });

  it('a new caller of a private helper, or new SQL, inside its own store', () => {
    caught(JOURNAL_STORE, 'export async function second(s: JournalStore): Promise<void> { await (s as any).appendCommandRow(null, {}); }', 'appendCommandRow');
    caught(LIFECYCLE_STORE, 'export async function second(c: PoolClient): Promise<void> { await insertEvent(c, {} as never); }', 'insertEvent');
    caught(LIFECYCLE_STORE, "export const sql = 'INSERT INTO build_room_events (room_id) VALUES ($1)';", 'lifecycleSql');
    caught(JOURNAL_STORE, "export const sql = 'SELECT * FROM public.command_journal_append($1, $2, $3, $4, $5)';", 'journalSql');
  });

  it('a first caller anywhere else', () => {
    caught('packages/control-plane/src/planner-loop.ts', 'export const w = (s: { appendRecorded: unknown }) => s.appendRecorded;', 'appendRecorded');
  });
});

describe('binding-one-writer · every ordinary form is counted', () => {
  const usesOf = (rule: WriterRule, text: string): number => findingsIn('fixture.ts', text).writers.get(rule)?.uses ?? 0;
  const declarationsOf = (rule: WriterRule, text: string): number => findingsIn('fixture.ts', text).writers.get(rule)?.declarations ?? 0;
  const inventoried = (rule: InventoryRule, text: string): boolean => findingsIn('fixture.ts', text).inventory.has(rule);

  const nameForms = (name: string): readonly string[] => [
    `await store.${name}(roomId, spec);`,
    `await store?.${name}?.(roomId, spec);`,
    `const write = store.${name}.bind(store); await write(roomId, spec);`,
    `const write = store.${name}; await write.call(store, roomId, spec);`,
    `await store.${name}.apply(store, [roomId, spec]);`,
    `await Reflect.apply(store.${name}, store, [roomId, spec]);`,
    `const { ${name}: write } = tx; await write(row);`,
    `await store['${name}'](roomId, spec);`,
    `await store[\`${name}\`](roomId, spec);`,
    `const key = '${name}'; await store[key](roomId, spec);`,
    `await (store as any).${name}(roomId, spec);`,
    `type Writer = Pick<Store, '${name}'>;`,
    `const proto = Store.prototype.${name};`,
    `export { ${name} } from './store.js';`,
    `import { ${name} as write } from './store.js';`,
  ];

  for (const name of WRITER_NAMES) {
    it(`${name}: every call, alias, access and type form is a use, and each one adds to the count`, () => {
      for (const text of nameForms(name)) assert.ok(usesOf(name as WriterRule, text) >= 1, `${name} not counted in:\n${text}`);
      assert.equal(usesOf(name as WriterRule, `a.${name}(); b.${name}(); c['${name}']();`), 3, 'three uses');
    });
  }

  it('a declaration is counted apart from a use', () => {
    assert.equal(declarationsOf('appendRecorded', 'class S { async appendRecorded() { return 1; } }'), 1);
    assert.equal(usesOf('appendRecorded', 'class S { async appendRecorded() { return 1; } }'), 0);
    assert.equal(declarationsOf('appendBinding', 'interface T { appendBinding(row: unknown): void }'), 1);
    assert.equal(declarationsOf('appendBinding', 'const tx = { appendBinding: async () => 1 };'), 1);
    assert.equal(declarationsOf('insertEvent', 'async function insertEvent() { return 1; }'), 1);
    assert.equal(usesOf('appendBinding', 'const tx = { appendBinding: async () => 1 }; await tx.appendBinding();'), 1);
  });

  it('SQL writing the lifecycle log: each verb, quoted or not, with comments anywhere between its words', () => {
    for (const sql of [
      'INSERT INTO build_room_events (room_id) VALUES ($1)',
      'insert into public.build_room_events (room_id) values ($1)',
      'INSERT INTO "public"."build_room_events" (room_id) VALUES ($1)',
      'INSERT INTO "public" . "build_room_events" (room_id) VALUES ($1)',
      'INSERT /* note */ INTO build_room_events (room_id) VALUES ($1)',
      'INSERT /* a /* nested */ note */ INTO /* b */ public /* c */ . /* d */ "build_room_events" (room_id) VALUES ($1)',
      'INSERT -- note\nINTO build_room_events (room_id) VALUES ($1)',
      'INSERT -- note\rINTO build_room_events (room_id) VALUES ($1)',
      'MERGE /* x */ INTO build_room_events AS t USING src ON false WHEN NOT MATCHED THEN INSERT DEFAULT VALUES',
      'COPY build_room_events (room_id) FROM STDIN',
      'UPDATE ONLY "build_room_events" SET event = $1',
    ]) {
      assert.equal(usesOf('lifecycleSql', `await client.query(${JSON.stringify(sql)}, args);`), 1, sql);
      assert.equal(usesOf('lifecycleSql', `await client.query(\`${sql.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}\`, args);`), 1, `template: ${sql}`);
    }
  });

  it('SQL writing the journal: its table by each verb, or its append routine, with comments anywhere', () => {
    for (const sql of [
      'INSERT INTO command_journal_events (seq) VALUES ($1)',
      'INSERT /* x */ INTO "public"."command_journal_events" (seq) VALUES ($1)',
      'COPY "command_journal_events" FROM STDIN',
      'SELECT * FROM public.command_journal_append($1, $2, $3, $4, $5)',
      'SELECT * FROM public."command_journal_append" /* x */ ($1, $2, $3, $4, $5)',
      'SELECT command_journal_append -- x\n ($1, $2, $3, $4, $5)',
    ]) {
      assert.equal(usesOf('journalSql', `await client.query(${JSON.stringify(sql)}, args);`), 1, sql);
    }
  });

  it('the Builder command kind and the event name: the constants, imported plain or renamed, and the literals', () => {
    assert.ok(inventoried('builderKind', `if (kind === BUILDER_COMMAND_KIND) return;`));
    assert.ok(inventoried('builderKind', `import { BUILDER_COMMAND_KIND as K } from './journal.js';`));
    assert.ok(inventoried('builderKind', `const command = { commandKind: 'builder.invoke' };`));
    assert.ok(inventoried('boundEvent', `const event = { event: BINDING_EVENT };`));
    assert.ok(inventoried('boundEvent', `import { BINDING_EVENT as E } from '../../journal/src/index.js';`));
    assert.ok(inventoried('boundEvent', 'const event = { event: `runtime_room.bound` };'));
  });

  it('ignores a comment, a read-only query, DDL, quoted text, and a longer name that merely contains a construct', () => {
    assert.equal(usesOf('appendRecorded', `// store.appendRecorded(roomId, spec)\n/* appendRecorded */ const appendRecordedCount = 0;`), 0);
    assert.equal(usesOf('appendBinding', `const label = 'appendBindingRows';`), 0);
    assert.equal(usesOf('insertEvent', `const insertEvents = 0;`), 0);
    assert.equal(usesOf('lifecycleSql', `const sql = 'SELECT * FROM "build_room_events"';`), 0);
    assert.equal(usesOf('lifecycleSql', `const sql = 'INSERT INTO build_room_events_archive SELECT 1';`), 0);
    assert.equal(usesOf('lifecycleSql', `const sql = 'SELECT 1 /* INSERT INTO build_room_events */';`), 0);
    assert.equal(usesOf('journalSql', `const ddl = 'GRANT EXECUTE ON FUNCTION public.command_journal_append(text) TO r';`), 0);
    assert.equal(usesOf('journalSql', `const sql = 'SELECT seq FROM command_journal_events';`), 0);
    assert.equal(withoutSqlComments("SELECT '--not a comment', \"a/*b\" -- gone\n/* gone */ FROM t"), "SELECT '--not a comment', \"a/*b\"  \n  FROM t");
  });
});

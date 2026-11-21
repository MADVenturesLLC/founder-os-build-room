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
 * WHICH FILES. The production build's own file set, as the TypeScript
 * compiler resolves it with the repository's options (NodeNext): every
 * .ts, .mts or .cts file under packages/{name}/src, and every file those
 * import, transitively, wherever it lives and whatever its extension (an
 * .mjs import resolving to an .mts module included). Declaration files and
 * node_modules are excluded. JavaScript is not compiled here (no allowJs).
 *
 * WHAT IS COUNTED. Each of those files is parsed with the TypeScript compiler
 * (comments never count). For each writer method and helper, every
 * occurrence of its name is counted at its SITE, the top-level declaration
 * that lexically contains it (a function, a variable, an interface or type,
 * or a class member as `Class.member`; a nested function belongs to the
 * outer one; anything else is `<module>`), and sorted into
 *
 *   - a DECLARATION: the name a method, function, property or interface
 *     member is declared under;
 *   - a USE: anything else, whether an identifier (a call, a property read,
 *     a bound, called, applied or destructured alias, a type, an import or
 *     export) or string or template text (bracket access, a key held in a
 *     variable, a `Pick` key).
 *
 * For SQL, every whole string expression (see below) is read after its
 * comments are removed, so a comment between keywords hides nothing, and each match in it
 * counts as one use: each write to the lifecycle log or the journal's table
 * (INSERT INTO, MERGE INTO, COPY or UPDATE, schema and name quoted or not),
 * and each call of the journal's append routine (its name quoted or not,
 * followed by an opening parenthesis), except where the keyword FUNCTION,
 * ROUTINE or PROCEDURE names the routine as the object of DDL. No other text
 * in the string exempts it, so a column alias such as "comment" or a GRANT
 * earlier in the same string hides no call, and a call inside a function body
 * a migration defines is counted.
 *
 * The counts must equal EXPECTED exactly, site by site. The three writes are
 * pinned to the two governed functions, so a second caller fails the test
 * wherever it is added, an allowed file included, and so does a write moved
 * out of bindFirstBuilderCommand or journalLaterBuilderCommand into a helper
 * other code can call, even in the same file with the file's totals
 * unchanged. A change to EXPECTED is a change the act makes reviewable: it is
 * a second writer unless the reviewer finds it only defines, refuses, checks
 * or reads.
 *
 * Two further rules are an inventory, not the enforcement: where the Builder
 * command kind is spelled (`BUILDER_COMMAND_KIND`, imported plain or renamed,
 * or 'builder.invoke'), and where the event's name is (`BINDING_EVENT`,
 * likewise, or 'runtime_room.bound'). They are checked by file. A value
 * reached another way (an array lookup, a forwarded request) cannot write
 * anything without one of the counted methods.
 *
 * A WHOLE STRING EXPRESSION is a literal, a template (tagged or not), a `+`
 * chain, or a `[…].join` or `concat` call, read as one text with every part
 * the TypeScript type checker can resolve statically resolved first: a
 * literal type (a const, an `as const` property, a union of literals, an enum
 * member), else the initializer of what the part names, wherever it is
 * declared (a const, let or var, an object property, shorthand included, a
 * class field, a parameter's or a destructured binding's default), by name,
 * property access or literal element access, through imports. Where a part
 * can take several values, the most writes any of them makes is counted. A
 * composed value that spells a writer's name counts as the literal would.
 *
 * A third SQL rule pins MENTIONS: every occurrence, in any whole string
 * expression and in any case, of the two tables' names and the append
 * routine's, whatever statement it is in or none. A write needs the table's
 * name spelled somewhere, so a name handed to a generic helper as an argument
 * (`insertInto('build_room_events')`) is caught where it is written, though
 * what the helper does with it is not known statically.
 *
 * Fixtures pin each ordinary form, a second caller added inside an allowed
 * file, a write moved into a shared helper, comments inside SQL, SQL built
 * from constants and declared values, and a table name handed to a helper.
 * What the check cannot see: a name assembled at run time from parts none of
 * which spells it (input, a call other than join or concat, text appended
 * with `+=` or pushed into an array), and a closure created inside a governed
 * function that escapes it at run time (sites are lexical).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOVERNED_PATH = 'packages/control-plane/src/runtime-room-binding.ts';
const LIFECYCLE_STORE = 'packages/control-plane/src/store.ts';
const JOURNAL_STORE = 'packages/control-plane/src/journal-store.ts';
const MIGRATIONS = 'packages/control-plane/src/migrations.ts';
const GATEWAY_ROOM_STATE = 'packages/control-plane/src/gateway/room-state.ts';
const PLAN_STORE = 'packages/control-plane/src/plan-store.ts';
const PLANNER_LOOP = 'packages/control-plane/src/planner-loop.ts';

type WriterRule =
  | 'appendRecorded'
  | 'appendBinding'
  | 'appendBuilderJournaled'
  | 'appendCommandRow'
  | 'appendBindingRow'
  | 'appendWithin'
  | 'insertEvent'
  | 'lifecycleSql'
  | 'journalSql'
  | 'tableNames';
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

/** "declarations/uses" for one site. */
type Tally = string;
/** Per writer rule, keyed "file :: declaration" (see `siteOf`). */
type Tallies = Partial<Record<WriterRule, Record<string, Tally>>>;
type Counts = { declarations: number; uses: number };

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

const matches = (pattern: RegExp, text: string): number => [...text.matchAll(pattern)].length;

/** Writes to a table: INSERT INTO, MERGE INTO, COPY or UPDATE, schema and name quoted or not; one per match. */
export function tableWrites(sql: string, table: string): number {
  return matches(
    new RegExp(
      String.raw`\b(?:INSERT\s+INTO|MERGE\s+INTO|COPY|UPDATE)\s+(?:ONLY\s+)?(?:(?:"public"|public)\s*\.\s*)?(?:"${table}"|${table}\b)`,
      'gi',
    ),
    sql,
  );
}

/**
 * Mentions of the two tables and the journal's append routine, in any case,
 * quoted or not, in any statement or none; one per match. Every mention is
 * pinned by site, so a table name handed to a generic helper as an argument
 * is caught where it is written, whatever the helper does with it.
 */
export function tableNameMentions(text: string): number {
  return matches(/\b(?:build_room_events|command_journal_events|command_journal_append)\b/gi, text);
}

/**
 * Calls of the journal's append routine, its name quoted or not and followed
 * by an opening parenthesis; one per match. The one exclusion is the routine
 * as the object of DDL, named right after FUNCTION, ROUTINE or PROCEDURE.
 */
export function routineCalls(sql: string): number {
  return matches(
    /(?<!\b(?:FUNCTION|ROUTINE|PROCEDURE)\s+(?:(?:"public"|public)\s*\.\s*)?)(?:"command_journal_append"|\bcommand_journal_append\b)\s*\(/gi,
    sql,
  );
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

const nameText = (name: ts.Node | undefined): string =>
  name === undefined ? '(anonymous)' : ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) ? name.text : name.getText();

/**
 * The top-level declaration that lexically contains `node`: a function, a
 * variable (an arrow function assigned to a const included), an interface or
 * type, or a class member as `Class.member`. A function nested inside another
 * belongs to the outer one. Anything else at the top level is `<module>`.
 */
export function siteOf(node: ts.Node): string {
  let top: ts.Node = node;
  let member: ts.ClassElement | undefined;
  let variable: ts.VariableDeclaration | undefined;
  while (top.parent !== undefined && !ts.isSourceFile(top.parent)) {
    if (ts.isClassLike(top.parent) && ts.isClassElement(top)) member = top;
    if (ts.isVariableDeclaration(top) && ts.isVariableDeclarationList(top.parent)) variable = top;
    top = top.parent;
  }
  if (ts.isFunctionDeclaration(top)) return nameText(top.name);
  if (ts.isClassDeclaration(top)) {
    const cls = nameText(top.name);
    if (member === undefined) return cls;
    return ts.isConstructorDeclaration(member) ? `${cls}.constructor` : `${cls}.${nameText(member.name)}`;
  }
  if (ts.isInterfaceDeclaration(top) || ts.isTypeAliasDeclaration(top) || ts.isEnumDeclaration(top)) return top.name.text;
  if (ts.isVariableStatement(top)) return variable === undefined ? '<module>' : nameText(variable.name);
  if (ts.isExportAssignment(top)) return 'export default';
  return '<module>';
}

interface FileFindings {
  /** Per writer rule, counts per site (`siteOf`). */
  readonly writers: Map<WriterRule, Map<string, Counts>>;
  readonly inventory: Set<InventoryRule>;
}

/** A rule's counts summed over a file's sites. */
export function totalOf(found: FileFindings, rule: WriterRule): Counts {
  const total: Counts = { declarations: 0, uses: 0 };
  for (const counts of found.writers.get(rule)?.values() ?? []) {
    total.declarations += counts.declarations;
    total.uses += counts.uses;
  }
  return total;
}

/** A part of a string whose value is not known statically; it matches no SQL keyword or name. */
const UNKNOWN = '\u0000';
const MAX_VARIANTS = 64;

function combine(parts: readonly (readonly string[])[]): string[] {
  let out = [''];
  for (const options of parts) {
    const next: string[] = [];
    for (const prefix of out) for (const option of options) if (next.length < MAX_VARIANTS) next.push(prefix + option);
    out = next;
  }
  return out;
}

const WRAPPERS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.AsExpression,
  ts.SyntaxKind.SatisfiesExpression,
  ts.SyntaxKind.NonNullExpression,
  ts.SyntaxKind.TypeAssertionExpression,
]);

const isPlus = (node: ts.Node): node is ts.BinaryExpression =>
  ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;

/** `[…].join(sep)` or `x.concat(…)`: string calls whose result is known when their parts are. */
function stringCall(node: ts.Node): { readonly method: 'join' | 'concat'; readonly call: ts.CallExpression } | null {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  const method = node.expression.name.text;
  if (method === 'join' && ts.isArrayLiteralExpression(node.expression.expression)) return { method, call: node };
  if (method === 'concat') return { method, call: node };
  return null;
}

/**
 * The values `expr` can take that are known statically: literals, template
 * literals, `+` chains, `[…].join` and `concat` of known parts, and any
 * expression the type checker gives a string or number literal type (a const,
 * imported or not, an `as const` property, a union of literals), else the
 * initializer of the const it names. A part that cannot be known is UNKNOWN.
 */
export function staticTexts(expr: ts.Expression, checker: ts.TypeChecker, depth = 0): string[] {
  if (depth > 16) return [UNKNOWN];
  const next = (e: ts.Expression): string[] => staticTexts(e, checker, depth + 1);
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) || ts.isNumericLiteral(expr)) return [expr.text];
  if (WRAPPERS.has(expr.kind)) return next((expr as ts.ParenthesizedExpression).expression);
  if (ts.isTemplateExpression(expr)) {
    return combine([[expr.head.text], ...expr.templateSpans.flatMap((span) => [next(span.expression), [span.literal.text]])]);
  }
  if (ts.isTaggedTemplateExpression(expr)) return next(expr.template);
  if (isPlus(expr)) return combine([next(expr.left), next(expr.right)]);
  const call = stringCall(expr);
  if (call !== null) {
    const access = call.call.expression as ts.PropertyAccessExpression;
    if (call.method === 'join') {
      const elements = (access.expression as ts.ArrayLiteralExpression).elements.map((e) => next(e));
      const separator = call.call.arguments[0] === undefined ? [','] : next(call.call.arguments[0]);
      const parts: string[][] = [];
      elements.forEach((element, index) => {
        if (index > 0) parts.push(separator);
        parts.push(element);
      });
      return combine(parts);
    }
    return combine([next(access.expression), ...call.call.arguments.map((a) => next(a))]);
  }
  const type = checker.getTypeAtLocation(expr);
  const members = type.isUnion() ? type.types : [type];
  if (members.length > 0 && members.every((t) => t.isStringLiteral() || t.isNumberLiteral())) {
    return members.map((t) => String((t as ts.LiteralType).value));
  }
  const initializer = declaredInitializer(expr, checker);
  return initializer === undefined ? [UNKNOWN] : next(initializer);
}

/**
 * The initializer `expr` names, wherever it is declared: a variable (const,
 * let or var), a property of an object literal (shorthand included), a class
 * field, an enum member, a parameter's default, a destructured binding's
 * default; reached by name, by property access or by element access with a
 * literal key, through imports. For anything that can be reassigned this is
 * one value it can take, not every one; text assigned later is read where it
 * is written.
 */
function declaredInitializer(expr: ts.Expression, checker: ts.TypeChecker): ts.Expression | undefined {
  const at = ts.isPropertyAccessExpression(expr) ? expr.name : ts.isElementAccessExpression(expr) ? expr.argumentExpression : expr;
  let symbol = checker.getSymbolAtLocation(at);
  if (symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  let declaration = symbol?.valueDeclaration;
  if (declaration !== undefined && ts.isShorthandPropertyAssignment(declaration)) {
    declaration = checker.getShorthandAssignmentValueSymbol(declaration)?.valueDeclaration;
  }
  if (declaration === undefined) return undefined;
  if (
    ts.isVariableDeclaration(declaration)
    || ts.isParameter(declaration)
    || ts.isPropertyDeclaration(declaration)
    || ts.isPropertyAssignment(declaration)
    || ts.isEnumMember(declaration)
    || ts.isBindingElement(declaration)
  ) {
    return declaration.initializer;
  }
  return undefined;
}

/** The node a value expression is folded into, past wrappers, if it is part of a larger string expression. */
function foldedInto(node: ts.Node): boolean {
  let parent = node.parent;
  while (parent !== undefined && WRAPPERS.has(parent.kind)) parent = parent.parent;
  if (parent === undefined) return false;
  if (ts.isTemplateSpan(parent) || isPlus(parent) || ts.isTaggedTemplateExpression(parent)) return true;
  if (ts.isArrayLiteralExpression(parent) && parent.parent !== undefined && ts.isPropertyAccessExpression(parent.parent)) {
    return stringCall(parent.parent.parent ?? parent) !== null;
  }
  if (ts.isPropertyAccessExpression(parent) && parent.name.text === 'concat') return true;
  if (ts.isCallExpression(parent) && stringCall(parent)?.method === 'concat') return true;
  return false;
}

/** A string expression to read whole: a literal, a template, tagged or not, a `+` chain or a join/concat call, not itself part of a larger one. */
function isWholeString(node: ts.Node): node is ts.Expression {
  const stringish = ts.isStringLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node)
    || ts.isTemplateExpression(node)
    || ts.isTaggedTemplateExpression(node)
    || isPlus(node)
    || stringCall(node) !== null;
  return stringish && !foldedInto(node);
}

/**
 * What one source file holds: counts for each writer rule at each site, and
 * the inventory rules it touches. Names are read as identifiers and as
 * string literals; SQL is read from each whole string expression, its
 * statically known parts resolved through `checker`.
 */
export function findingsIn(source: ts.SourceFile, checker: ts.TypeChecker): FileFindings {
  const writers = new Map<WriterRule, Map<string, Counts>>();
  const inventory = new Set<InventoryRule>();
  const visit = (node: ts.Node): void => {
    const count = (rule: WriterRule, declaration: boolean, times = 1): void => {
      if (times === 0) return;
      const sites = writers.get(rule) ?? new Map<string, Counts>();
      const site = siteOf(node);
      const current = sites.get(site) ?? { declarations: 0, uses: 0 };
      if (declaration) current.declarations += times;
      else current.uses += times;
      sites.set(site, current);
      writers.set(rule, sites);
    };
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
    }
    if (isWholeString(node)) {
      const plain = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
      let lifecycle = 0;
      let journal = 0;
      let mentions = 0;
      for (const value of staticTexts(node, checker)) {
        // A composed value that spells a writer's name, or an inventoried one, counts as the literal would.
        if (!plain) {
          if (WRITER_NAMES.has(value)) count(value as WriterRule, false);
          if (value === 'builder.invoke') inventory.add('builderKind');
          if (value === 'runtime_room.bound') inventory.add('boundEvent');
        }
        mentions = Math.max(mentions, tableNameMentions(value));
        const sql = withoutSqlComments(value);
        lifecycle = Math.max(lifecycle, tableWrites(sql, 'build_room_events'));
        journal = Math.max(journal, tableWrites(sql, 'command_journal_events') + routineCalls(sql));
      }
      count('lifecycleSql', false, lifecycle);
      count('journalSql', false, journal);
      count('tableNames', false, mentions);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { writers, inventory };
}

let cachedScanOptions: ts.CompilerOptions | undefined;

/** The repository's compiler options, without the standard library or ambient types: literal types need neither. */
function scanOptions(): ts.CompilerOptions {
  cachedScanOptions ??= { ...repositoryOptions(), noLib: true, types: [], noEmit: true };
  return cachedScanOptions;
}

/** A program over in-memory sources (absolute path to text), reading any other file it needs from disk. */
export function programOver(sources: ReadonlyMap<string, string>, options: ts.CompilerOptions): ts.Program {
  const host = ts.createCompilerHost(options, true);
  const fromDisk = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = sources.get(resolve(fileName));
    return text !== undefined ? ts.createSourceFile(fileName, text, languageVersion, true) : fromDisk(fileName, languageVersion, onError, shouldCreate);
  };
  const exists = host.fileExists.bind(host);
  host.fileExists = (fileName) => sources.has(resolve(fileName)) || exists(fileName);
  // Module resolution walks directories: an in-memory file's directory exists.
  const directoryExists = host.directoryExists?.bind(host) ?? ts.sys.directoryExists;
  host.directoryExists = (dir) => [...sources.keys()].some((path) => path.startsWith(resolve(dir) + sep)) || directoryExists(dir);
  const read = host.readFile.bind(host);
  host.readFile = (fileName) => sources.get(resolve(fileName)) ?? read(fileName);
  return ts.createProgram({ rootNames: [...sources.keys()], options, host });
}

/** The findings of one text on its own, as a fixture file. */
export function findingsInText(text: string, file = 'fixture.ts'): FileFindings {
  const path = join(REPO_ROOT, '__binding_one_writer_fixture__', file);
  const program = programOver(new Map([[path, text]]), scanOptions());
  return findingsIn(program.getSourceFile(path)!, program.getTypeChecker());
}

const TS_SOURCE = /\.(?:ts|mts|cts)$/;
const DECLARATION_FILE = /\.d\.(?:ts|mts|cts)$/;

/** Every .ts, .mts and .cts file under each `src` directory below `packagesDir`, declaration files excluded. */
export function rootSources(packagesDir: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (TS_SOURCE.test(name) && !DECLARATION_FILE.test(name)) files.push(path);
    }
  };
  for (const name of readdirSync(packagesDir)) {
    const src = join(packagesDir, name, 'src');
    try {
      if (statSync(src).isDirectory()) walk(src);
    } catch {
      // A package with no src directory has no production code to check.
    }
  }
  return files.sort();
}

/**
 * The files a program built from `roots` compiles: the roots and everything
 * they import, transitively, as the compiler resolves it, relative to `base`;
 * declaration files and node_modules excluded.
 */
export function compiledFiles(roots: readonly string[], options: ts.CompilerOptions, base: string): string[] {
  const program = ts.createProgram({ rootNames: [...roots], options: { ...options, noEmit: true } });
  return program
    .getSourceFiles()
    .map((file) => file.fileName)
    .filter((name) => !name.split('/').includes('node_modules') && !DECLARATION_FILE.test(name))
    .map((name) => relative(base, name).split(sep).join('/'))
    .sort();
}

function repositoryOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(join(REPO_ROOT, 'tsconfig.json'), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    },
  });
  if (parsed === undefined) throw new Error('tsconfig.json did not parse');
  return parsed.options;
}

/** The production build's file set: every package source root and everything it imports. */
function sourceFiles(): string[] {
  return compiledFiles(rootSources(join(REPO_ROOT, 'packages')), repositoryOptions(), REPO_ROOT);
}

const readSource = (file: string): string => readFileSync(join(REPO_ROOT, file), 'utf8');

/** Every writer rule's counts at each "file :: declaration" site, and every inventory rule's files, over the given sources (repository-relative path to text). */
function scan(sources: ReadonlyMap<string, string>): { writers: Tallies; inventory: Record<InventoryRule, string[]> } {
  const writers: Tallies = {};
  const inventory: Record<InventoryRule, string[]> = { builderKind: [], boundEvent: [] };
  const program = programOver(new Map([...sources].map(([file, text]) => [join(REPO_ROOT, file), text])), scanOptions());
  const checker = program.getTypeChecker();
  for (const [file] of [...sources].sort(([a], [b]) => a.localeCompare(b))) {
    const found = findingsIn(program.getSourceFile(join(REPO_ROOT, file))!, checker);
    for (const [rule, sites] of found.writers) {
      for (const [site, { declarations, uses }] of [...sites].sort(([a], [b]) => a.localeCompare(b))) {
        (writers[rule] ??= {})[`${file} :: ${site}`] = `${declarations}/${uses}`;
      }
    }
    for (const rule of found.inventory) inventory[rule].push(file);
  }
  return { writers, inventory };
}

const productionSources = (): Map<string, string> => new Map(sourceFiles().map((file) => [file, readSource(file)]));

const at = (file: string, site: string): string => `${file} :: ${site}`;

/**
 * Each writer rule, as "declarations/uses" at each site: the top-level
 * declaration that contains the occurrence (`siteOf`). The three writes are
 * pinned to the two governed functions, bindFirstBuilderCommand and
 * journalLaterBuilderCommand; every other use is a store's own plumbing,
 * pinned to the store method that makes it.
 */
const EXPECTED: Tallies = {
  appendRecorded: {
    // The governed path's call, and the Pick key of its deps' type.
    [at(GOVERNED_PATH, 'bindFirstBuilderCommand')]: '0/1',
    [at(GOVERNED_PATH, 'RuntimeRoomBindingDeps')]: '0/1',
    [at(LIFECYCLE_STORE, 'PostgresLedgerStore.appendRecorded')]: '1/0',
  },
  appendBinding: {
    [at(GOVERNED_PATH, 'bindFirstBuilderCommand')]: '0/1',
    // The joined append, and its interface member.
    [at(JOURNAL_STORE, 'JournalStore.inTransaction')]: '1/0',
    [at(JOURNAL_STORE, 'JournalTransaction')]: '1/0',
  },
  appendBuilderJournaled: {
    [at(GOVERNED_PATH, 'bindFirstBuilderCommand')]: '0/1',
    [at(GOVERNED_PATH, 'journalLaterBuilderCommand')]: '0/1',
    [at(JOURNAL_STORE, 'JournalStore.inTransaction')]: '1/0',
    [at(JOURNAL_STORE, 'JournalTransaction')]: '1/0',
  },
  // The private helpers: declared once each, used only by their own store's methods.
  appendCommandRow: {
    [at(JOURNAL_STORE, 'JournalStore.appendCommandEvent')]: '0/1',
    [at(JOURNAL_STORE, 'JournalStore.appendCommandRow')]: '1/0',
    [at(JOURNAL_STORE, 'JournalStore.appendJournaled')]: '0/1',
    // The joined appendJournaled, appendBuilderJournaled and appendCommandEvent.
    [at(JOURNAL_STORE, 'JournalStore.inTransaction')]: '0/3',
  },
  appendBindingRow: {
    [at(JOURNAL_STORE, 'JournalStore.appendBindingRow')]: '1/0',
    [at(JOURNAL_STORE, 'JournalStore.inTransaction')]: '0/1',
  },
  appendWithin: {
    [at(JOURNAL_STORE, 'JournalStore.appendBindingRow')]: '0/1',
    [at(JOURNAL_STORE, 'JournalStore.appendCommandRow')]: '0/1',
    [at(JOURNAL_STORE, 'JournalStore.appendDecisionRow')]: '0/1',
    [at(JOURNAL_STORE, 'JournalStore.appendWithin')]: '1/0',
  },
  insertEvent: {
    [at(LIFECYCLE_STORE, 'PostgresLedgerStore.appendRecorded')]: '0/1',
    [at(LIFECYCLE_STORE, 'PostgresLedgerStore.decideAndRecord')]: '0/2',
    [at(LIFECYCLE_STORE, 'insertEvent')]: '1/0',
  },
  lifecycleSql: { [at(LIFECYCLE_STORE, 'insertEvent')]: '0/1' },
  // Every mention of the two tables and the routine: the two writes above,
  // reads (SELECT … FROM), the journal's error message naming the routine,
  // and the migrations' DDL and routine body. A new mention is reviewed as a
  // possible write, a table name handed to a generic helper included.
  tableNames: {
    [at(GATEWAY_ROOM_STATE, 'isBoundRuntimeRoom')]: '0/1',
    [at(GATEWAY_ROOM_STATE, 'roomOpenForMint')]: '0/2',
    [at(JOURNAL_STORE, 'APPEND_SQL')]: '0/1',
    [at(JOURNAL_STORE, 'BINDINGS_SQL')]: '0/1',
    [at(JOURNAL_STORE, 'BOUND_SQL')]: '0/1',
    [at(JOURNAL_STORE, 'JOURNALED_SQL')]: '0/1',
    [at(JOURNAL_STORE, 'JournalStore.appendWithin')]: '0/1',
    [at(JOURNAL_STORE, 'LIFECYCLE_SQL')]: '0/1',
    [at(JOURNAL_STORE, 'PAGE_SQL')]: '0/1',
    [at(MIGRATIONS, 'MIGRATIONS')]: '0/44',
    [at(PLAN_STORE, 'LIFECYCLE_SQL')]: '0/1',
    [at(PLANNER_LOOP, 'T1_FACTS_SQL')]: '0/1',
    [at(PLANNER_LOOP, 'T4_PAYLOAD_SQL')]: '0/1',
    [at(LIFECYCLE_STORE, 'PostgresLedgerStore.exportRoom')]: '0/1',
    [at(LIFECYCLE_STORE, 'insertEvent')]: '0/1',
    [at(LIFECYCLE_STORE, 'replay')]: '0/1',
  },
  // The journal store's routine call, and the routine's own body in migration 0006.
  journalSql: { [at(JOURNAL_STORE, 'APPEND_SQL')]: '0/1', [at(MIGRATIONS, 'MIGRATIONS')]: '0/1' },
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

  it('scans the production build\'s whole file set: every source root, and nothing else the build needs is left out', () => {
    for (const file of [GOVERNED_PATH, LIFECYCLE_STORE, JOURNAL_STORE, MIGRATIONS]) assert.ok(sources.has(file), file);
    const roots = rootSources(join(REPO_ROOT, 'packages')).map((path) => relative(REPO_ROOT, path).split(sep).join('/'));
    for (const root of roots) assert.ok(sources.has(root), `root ${root} not scanned`);
    assert.ok(sources.size >= roots.length && roots.length > 50, `${sources.size} files scanned, ${roots.length} roots`);
  });

  it('counts every writer\'s declarations and uses exactly, declaration by declaration', () => {
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
    assert.notDeepEqual(writers[rule], EXPECTED[rule], `${rule} unchanged after adding to ${file}`);
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

  it('a write moved out of a governed function into a shared helper that other code calls, the file\'s totals unchanged', () => {
    // The refactor of the 913e4b2 review: journalLaterBuilderCommand's call
    // moves into an exported helper in the same file, and server.ts calls the
    // helper. Per-file counts stay the same; the per-declaration table does not.
    const original = sources.get(GOVERNED_PATH)!;
    const call = `return deps.journal
        .inTransaction(client)
        .appendBuilderJournaled(command, { roomId, lifecycleEventRef: { roomId, eventId: current.binding.eventId } });`;
    assert.ok(original.includes(call), 'the governed later-command call is where this fixture expects it');
    const moved = `${original.replace(
      call,
      'return appendLaterBuilderRow(deps.journal.inTransaction(client), command, { roomId, lifecycleEventRef: { roomId, eventId: current.binding.eventId } });',
    )}
export function appendLaterBuilderRow(tx: JournalTransaction, command: BuilderCommandRequest, binding: JournaledBinding): Promise<JournaledAppendResult> {
  return tx.appendBuilderJournaled(command, binding);
}
`;
    const server = 'packages/control-plane/src/server.ts';
    const tampered = new Map(sources);
    tampered.set(GOVERNED_PATH, moved);
    tampered.set(server, `${sources.get(server)!}\nexport const viaHelper = appendLaterBuilderRow;\n`);
    assert.deepEqual(
      totalOf(findingsInText(moved), 'appendBuilderJournaled'),
      totalOf(findingsInText(original), 'appendBuilderJournaled'),
      'the file\'s totals are unchanged, so a per-file check passes it',
    );
    const writers = scan(tampered).writers;
    assert.notDeepEqual(writers.appendBuilderJournaled, EXPECTED.appendBuilderJournaled);
    assert.equal(writers.appendBuilderJournaled?.[at(GOVERNED_PATH, 'appendLaterBuilderRow')], '0/1');
    assert.equal(writers.appendBuilderJournaled?.[at(GOVERNED_PATH, 'journalLaterBuilderCommand')], undefined);
  });

  it('a write in a new arrow-function helper, a class method, or top-level code, in the governed file', () => {
    caught(GOVERNED_PATH, 'export const helper = (tx: JournalTransaction) => tx.appendBuilderJournaled({} as never, {});', 'appendBuilderJournaled');
    caught(GOVERNED_PATH, 'export class Writer { write(tx: JournalTransaction) { return tx.appendBinding({} as never); } }', 'appendBinding');
    caught(GOVERNED_PATH, 'await (null as unknown as PostgresLedgerStore).appendRecorded("r", {} as never);', 'appendRecorded');
  });

  it('SQL built from a table-name constant, in a production file', () => {
    caught(PLANNER_LOOP, 'const EVENTS = "build_room_events";\nexport const sql = `INSERT INTO ${EVENTS} (room_id) VALUES ($1)`;', 'lifecycleSql');
  });

  it('a table name handed to a generic helper, in a production file', () => {
    caught(
      PLANNER_LOOP,
      'export function insertInto(table: string) { return `INSERT INTO ${table} (room_id) VALUES ($1)`; }\nexport const viaHelper = insertInto("build_room_events");',
      'tableNames',
    );
  });

  it('a first caller anywhere else', () => {
    caught(PLANNER_LOOP, 'export const w = (s: { appendRecorded: unknown }) => s.appendRecorded;', 'appendRecorded');
  });
});

describe('binding-one-writer · every ordinary form is counted', () => {
  const usesOf = (rule: WriterRule, text: string): number => totalOf(findingsInText(text), rule).uses;
  const declarationsOf = (rule: WriterRule, text: string): number => totalOf(findingsInText(text), rule).declarations;
  const inventoried = (rule: InventoryRule, text: string): boolean => findingsInText(text).inventory.has(rule);

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

  it('attributes each occurrence to the top-level declaration that contains it', () => {
    const sites = (text: string): string[] => [...(findingsInText(text).writers.get('appendBinding')?.keys() ?? [])].sort();
    assert.deepEqual(sites('export async function governed(tx: T) { const inner = () => tx.appendBinding(); return inner(); }'), ['governed'], 'a nested function belongs to the outer one');
    assert.deepEqual(sites('export const helper = async (tx: T) => tx.appendBinding();'), ['helper']);
    assert.deepEqual(sites('const a = 1, helper = (tx: T) => tx.appendBinding();'), ['helper']);
    assert.deepEqual(sites('class Store { constructor(tx: T) { tx.appendBinding(); } write(tx: T) { return tx.appendBinding(); } }'), ['Store.constructor', 'Store.write']);
    assert.deepEqual(sites('interface Tx { appendBinding(): void }'), ['Tx']);
    assert.deepEqual(sites('tx.appendBinding();'), ['<module>']);
    assert.deepEqual(sites('export default function (tx: T) { return tx.appendBinding(); }'), ['(anonymous)']);
  });

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

  it('the routine: a call is counted whatever else the string holds; only the routine named as the object of DDL is not', () => {
    const cases: ReadonlyArray<readonly [string, number]> = [
      ['SELECT * FROM public.command_journal_append($1, $2, $3, $4, $5) AS "comment"', 1],
      ['SELECT command_journal_append($1, $2, $3, $4, $5) AS grant_ok, 1 AS "create"', 1],
      ['GRANT USAGE ON SCHEMA public TO r; SELECT * FROM command_journal_append($1, $2, $3, $4, $5)', 1],
      ['SELECT command_journal_append($1, $2, $3, $4, $5); SELECT "command_journal_append"($1, $2, $3, $4, $5)', 2],
      ['CREATE FUNCTION wrapper(a text) RETURNS void LANGUAGE sql AS $$ SELECT public.command_journal_append(a, a, a, 1, NULL) $$', 1],
      ['DO $$ BEGIN PERFORM command_journal_append($1, $2, $3, $4, $5); END $$', 1],
      ['CREATE FUNCTION public.command_journal_append(p text) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$', 0],
      ['ALTER FUNCTION public.command_journal_append(text) OWNER TO w', 0],
      ['REVOKE ALL ON FUNCTION public.command_journal_append(text) FROM PUBLIC', 0],
      ['GRANT EXECUTE ON ROUTINE "public"."command_journal_append"(text) TO r', 0],
      ['COMMENT ON FUNCTION command_journal_append(text) IS $$x$$', 0],
    ];
    for (const [sql, expected] of cases) {
      assert.equal(routineCalls(withoutSqlComments(sql)), expected, sql);
      assert.equal(usesOf('journalSql', `const sql = ${JSON.stringify(sql)};`), expected, `in code: ${sql}`);
    }
  });

  it('SQL whose table name or keywords come from statically known constants: local, imported, as const, through + chains, join and concat', () => {
    const write = (sql: string): number => usesOf('lifecycleSql', sql);
    assert.equal(write('const TABLE = "build_room_events"; export const sql = `INSERT INTO ${TABLE} (room_id) VALUES ($1)`;'), 1, 'the ninth Tier-2 review\'s probe (ec9d494)');
    assert.equal(write('const TABLE: string = "build_room_events"; export const sql = `INSERT INTO ${TABLE} (room_id) VALUES ($1)`;'), 1, 'a const typed wide');
    assert.equal(write('const T = { events: "build_room_events" } as const; export const sql = `INSERT INTO ${T.events} VALUES ($1)`;'), 1, 'an as-const property');
    assert.equal(write('const VERB = "INSERT INTO"; const TABLE = "build_room_events"; export const sql = VERB + " " + TABLE + " VALUES ($1)";'), 1, 'a + chain');
    assert.equal(write('const TABLE = "build_room_events"; export const sql = ["INSERT", "INTO", TABLE, "VALUES ($1)"].join(" ");'), 1, 'join');
    assert.equal(write('const TABLE = "build_room_events"; export const sql = "INSERT INTO ".concat(TABLE, " VALUES ($1)");'), 1, 'concat');
    assert.equal(write('const SCHEMA = "public"; const TABLE = "build_room_events"; export const sql = `INSERT /* x */ INTO ${SCHEMA}.${TABLE} VALUES ($1)`;'), 1, 'schema and table both constants');
    assert.equal(write('function pick(k: "a" | "b") { return k; } declare const which: "build_room_events" | "other_table"; export const sql = `INSERT INTO ${which} VALUES ($1)`;'), 1, 'a union of literals');
    assert.equal(usesOf('journalSql', 'const FN = "command_journal_append"; export const sql = `SELECT * FROM public.${FN}($1, $2, $3, $4, $5)`;'), 1, 'the routine through a constant');
    assert.equal(usesOf('appendRecorded', 'declare const store: Record<string, () => void>; store["append" + "Recorded"]();'), 1, 'a writer name assembled from literals');
    // Not known statically: a parameter, or a value read at run time. The test says so.
    assert.equal(write('export function insertInto(table: string) { return `INSERT INTO ${table} VALUES ($1)`; }'), 0, 'a parameter is not known');
  });

  it('a tagged template is read whole, its constants resolved', () => {
    const tag = 'declare const sql: any; ';
    assert.equal(usesOf('lifecycleSql', `${tag}export const q = sql\`INSERT INTO build_room_events VALUES (1)\`;`), 1);
    assert.equal(usesOf('lifecycleSql', `${tag}const T = "build_room_events"; export const q = sql\`INSERT INTO \${T} VALUES (1)\`;`), 1);
    assert.equal(usesOf('tableNames', `${tag}export const q = sql\`SELECT * FROM build_room_events\`;`), 1);
  });

  it('a table name declared any other way: let, var, an object property, shorthand, element access, a class field, an enum member, a parameter default, a destructured default', () => {
    const write = (code: string): number => usesOf('lifecycleSql', code);
    const sql = (part: string): string => `\`INSERT INTO \${${part}} VALUES ($1)\``;
    assert.equal(write(`let T = "build_room_events"; export const q = ${sql('T')};`), 1, 'let');
    assert.equal(write(`var T = "build_room_events"; export const q = ${sql('T')};`), 1, 'var');
    assert.equal(write(`const TABLES = { events: "build_room_events" }; export const q = ${sql('TABLES.events')};`), 1, 'an object property');
    assert.equal(write(`const TABLES = { events: "build_room_events" }; export const q = ${sql('TABLES["events"]')};`), 1, 'element access');
    assert.equal(write(`const events = "build_room_events"; const TABLES = { events }; export const q = ${sql('TABLES.events')};`), 1, 'shorthand');
    assert.equal(write(`class S { static table = "build_room_events"; q() { return ${sql('S.table')}; } }`), 1, 'a static field');
    assert.equal(write(`class S { private table = "build_room_events"; q() { return ${sql('this.table')}; } }`), 1, 'an instance field');
    assert.equal(write(`enum T { Events = "build_room_events" } export const q = ${sql('T.Events')};`), 1, 'an enum member');
    assert.equal(write(`export function q(table = "build_room_events") { return ${sql('table')}; }`), 1, 'a parameter default');
    assert.equal(write(`export function q({ table = "build_room_events" }: { table?: string }) { return ${sql('table')}; }`), 1, 'a destructured default');
    assert.equal(write(`import * as tables from "./nowhere.js"; export const q = ${sql('tables.events')};`), 0, 'not known: nothing declares it');
  });

  it('mentions every spelling of the two tables and the routine, and nothing that only resembles them', () => {
    assert.equal(tableNameMentions('SELECT * FROM "BUILD_ROOM_EVENTS" JOIN public.command_journal_events USING (x)'), 2);
    assert.equal(tableNameMentions('SELECT public.Command_Journal_Append($1)'), 1);
    assert.equal(tableNameMentions('build_room_events_archive xbuild_room_events command_journal_events2'), 0);
    const helper = 'export function insertInto(table: string) { return `INSERT INTO ${table} VALUES ($1)`; }\nexport const q = insertInto("build_room_events");';
    assert.equal(usesOf('lifecycleSql', helper), 0, 'what the helper writes is not known statically');
    assert.equal(usesOf('tableNames', helper), 1, 'the name handed to it is pinned where it is written');
  });

  it('a constant imported from another module resolves, as the type checker sees it', () => {
    const dir = join(REPO_ROOT, '__binding_one_writer_fixture__');
    const tables = join(dir, 'tables.ts');
    const writer = join(dir, 'writer.ts');
    const program = programOver(
      new Map([
        [tables, 'export const EVENTS_TABLE = "build_room_events";\nexport const JOURNAL_FN = "command_journal_append";\n'],
        [writer, 'import { EVENTS_TABLE, JOURNAL_FN as FN } from "./tables.js";\nexport const a = `INSERT INTO ${EVENTS_TABLE} (room_id) VALUES ($1)`;\nexport const b = `SELECT * FROM ${FN}($1, $2, $3, $4, $5)`;\n'],
      ]),
      scanOptions(),
    );
    const found = findingsIn(program.getSourceFile(writer)!, program.getTypeChecker());
    assert.equal(totalOf(found, 'lifecycleSql').uses, 1);
    assert.equal(totalOf(found, 'journalSql').uses, 1);
  });

  it('each write in one string counts, so a second one added to an existing string is caught', () => {
    assert.equal(tableWrites('INSERT INTO build_room_events VALUES (1); INSERT INTO "build_room_events" VALUES (2)', 'build_room_events'), 2);
    assert.equal(usesOf('lifecycleSql', `const sql = 'INSERT INTO build_room_events VALUES (1); INSERT INTO build_room_events VALUES (2)';`), 2);
  });

  it('a module reached only through an import is scanned: an .mjs import resolving to an .mts module, and a .cts root', () => {
    const dir = mkdtempSync(join(tmpdir(), 'binding-one-writer-'));
    try {
      const packages = join(dir, 'packages');
      mkdirSync(join(packages, 'p', 'src', 'deep'), { recursive: true });
      mkdirSync(join(dir, 'outside'), { recursive: true });
      writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
      writeFileSync(join(packages, 'p', 'src', 'entry.ts'), "export { write } from '../../../outside/second.mjs';\n");
      writeFileSync(
        join(dir, 'outside', 'second.mts'),
        'export async function write(s: { appendRecorded(r: string): Promise<void> }): Promise<void> {\n  await s.appendRecorded("r");\n}\n',
      );
      writeFileSync(join(packages, 'p', 'src', 'deep', 'legacy.cts'), "export const sql = 'COPY build_room_events FROM STDIN';\n");
      const roots = rootSources(packages);
      assert.deepEqual(roots.map((path) => relative(dir, path).split(sep).join('/')), ['packages/p/src/deep/legacy.cts', 'packages/p/src/entry.ts']);
      const files = compiledFiles(roots, { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, types: [] }, dir);
      assert.ok(files.includes('outside/second.mts'), `the imported .mts module was not compiled in: ${files.join(', ')}`);
      const found = new Map(files.map((file) => [file, findingsInText(readFileSync(join(dir, file), 'utf8'), file.replace(/\//g, '_'))]));
      assert.equal(totalOf(found.get('outside/second.mts')!, 'appendRecorded').uses, 1);
      assert.equal(totalOf(found.get('packages/p/src/deep/legacy.cts')!, 'lifecycleSql').uses, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

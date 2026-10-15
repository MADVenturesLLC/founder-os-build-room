/**
 * `docs/phase4-stop-gate-test-map.md` held to the tests it cites (plan r1
 * slice 9).
 *
 * The map is evidence the Founder may read at the Phase 4 stop gate, so a
 * row that names a test which was renamed, moved or deleted would be a false
 * citation, and would stay false silently. This suite fails instead. It
 * checks that each citation exists, not that the test proves what the row
 * says: that is the builder's reading, made by reading each test.
 *
 * What is held:
 *   - every row's title opens an `it(` call in the cited file, verbatim;
 *   - the row's S/D mark is the file's: S exactly for a storage suite;
 *   - every label has at least one row, and no row has an unknown label;
 *   - the contract's §10 table still has the 15 rows the map was built
 *     against, so a row added there fails here until the map follows;
 *   - every case of the integrated lifecycle suite is cited.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAP_PATH = join(REPO_ROOT, 'docs', 'phase4-stop-gate-test-map.md');
const CONTRACT_PATH = join(REPO_ROOT, 'docs', 'command-journal-contract.md');
const LIFECYCLE_SUITE = 'test/phase4-lifecycle.storage.test.ts';

const LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '§12-a', '§12-b', '§12-c', '§12-d', '§2-a', '§2-b', '§5.3'];
const CONTRACT_SECTION_10_ROWS = 15;

interface MapRow {
  readonly label: string;
  readonly suite: string;
  readonly file: string;
  readonly title: string;
}

/** The table rows under `## <heading>`, up to the next `## `, as trimmed cells. */
function tableUnder(markdown: string, heading: string): string[][] {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `no "## ${heading}" section`);
  const rest = markdown.slice(start + heading.length + 5);
  const end = rest.indexOf('\n## ');
  const section = end === -1 ? rest : rest.slice(0, end);
  return section
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .slice(2) // header and separator
    .map((line) => line.slice(1, -1).split(' | ').map((cell) => cell.trim()));
}

function mapRows(): MapRow[] {
  return tableUnder(readFileSync(MAP_PATH, 'utf8'), 'Map').map((cells) => {
    assert.equal(cells.length, 5, `a map row has five cells: ${cells.join(' | ')}`);
    const [label, suite, file, title] = cells as [string, string, string, string];
    return { label, suite, file, title };
  });
}

/** Does `title` open an `it(` call in `source`, quoted as the source quotes it? */
function opensIt(source: string, title: string): boolean {
  return [`it('${title}'`, `it("${title}"`, `it(\`${title}\``].some((call) => source.includes(call));
}

describe('phase 4 stop-gate map · its citations exist', () => {
  const rows = mapRows();

  it('has a row for every label, and no row for an unknown one', () => {
    assert.deepEqual([...new Set(rows.map((r) => r.label))].sort(), [...LABELS].sort());
  });

  it('cites each test by a title that opens an it( call in the cited file, verbatim', () => {
    const missing: string[] = [];
    for (const row of rows) {
      const path = join(REPO_ROOT, row.file);
      if (!existsSync(path)) {
        missing.push(`${row.label}: ${row.file} does not exist`);
        continue;
      }
      if (!opensIt(readFileSync(path, 'utf8'), row.title)) missing.push(`${row.label}: ${row.file}: "${row.title}"`);
    }
    assert.deepEqual(missing, []);
  });

  it('marks a row S exactly when its file is a storage suite', () => {
    for (const row of rows) {
      assert.ok(row.suite === 'S' || row.suite === 'D', `${row.label}: suite is S or D`);
      assert.equal(row.suite === 'S', row.file.endsWith('.storage.test.ts'), `${row.label}: ${row.file} marked ${row.suite}`);
    }
  });

  it('was built against the contract §10 table as it stands: 15 rows', () => {
    const contract = readFileSync(CONTRACT_PATH, 'utf8');
    assert.equal(tableUnder(contract, '10. Test map to the Phase 4 stop gate').length, CONTRACT_SECTION_10_ROWS);
  });

  it('cites every case of the integrated lifecycle suite', () => {
    const source = readFileSync(join(REPO_ROOT, LIFECYCLE_SUITE), 'utf8');
    const titles = [...source.matchAll(/^\s+it\('([^']+)'/gm)].map((m) => m[1]!);
    assert.ok(titles.length > 0, 'the lifecycle suite has cases');
    const cited = new Set(rows.filter((r) => r.file === LIFECYCLE_SUITE).map((r) => r.title));
    assert.deepEqual(titles.filter((t) => !cited.has(t)), []);
  });
});

/**
 * Contract §3 [RULED]: the sole writer of the command journal is the Build
 * Room control plane "through a single journal module".
 *
 * This is a SOURCE-level check, in the spirit of the §7.2 source-honesty
 * test: a grant proves that only `br_app_runtime` can EXECUTE the append
 * routine, but nothing at the database can prove that only one module in
 * this repository calls it. Reading the tree can. The routine's name may
 * appear in exactly two non-test files under `packages/`: the module that
 * defines it (`migrations.ts`) and the module that is the single caller
 * (`journal-store.ts`). A third mention is a second writer path, whatever
 * it calls itself, and fails here before it can be reviewed as anything
 * else.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');
const ROUTINE = 'command_journal_append';

/** The only two files under `packages/` allowed to name the routine. */
const SOLE_WRITER_FILES = [
  'packages/control-plane/src/journal-store.ts',
  'packages/control-plane/src/migrations.ts',
] as const;

/** Build outputs and installed dependencies are not this repository's source. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', 'dist']);
const SKIPPED_FILE = /\.tsbuildinfo$/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry)) out.push(...walk(path));
      continue;
    }
    if (!SKIPPED_FILE.test(entry)) out.push(path);
  }
  return out;
}

describe('contract §3 — a single journal module is the only caller of command_journal_append', () => {
  it('names the routine in exactly journal-store.ts and migrations.ts under packages/, and nowhere else', () => {
    const mentions = walk(PACKAGES_ROOT)
      .filter((path) => readFileSync(path, 'utf8').includes(ROUTINE))
      .map((path) => relative(REPO_ROOT, path))
      .sort();
    assert.deepEqual(
      mentions,
      [...SOLE_WRITER_FILES].sort(),
      `every file under packages/ that names ${ROUTINE} must be one of the two sole-writer files`,
    );
  });

  it('the single caller actually calls the routine — the allowlist is not an empty promise', () => {
    const source = readFileSync(join(REPO_ROOT, SOLE_WRITER_FILES[0]), 'utf8');
    assert.match(source, /public\.command_journal_append\(/, 'journal-store.ts must invoke the schema-qualified routine');
  });
});

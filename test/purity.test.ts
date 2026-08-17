/**
 * AC#5 — Zero I/O.
 *
 * A test asserts the package imports no fs, net, http, child_process, dns, or
 * database driver module. The check is STATIC: it parses every module specifier
 * out of `packages/*​/src/**​/*.ts` and matches it against the forbidden set.
 *
 * The test itself reads the filesystem — that is what lets it inspect the
 * packages. The assertion is about the SHIPPED SOURCE, which lives under
 * `packages/*​/src`; these test files are not part of either package.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/**
 * The packages that must stay pure, named explicitly rather than globbed.
 *
 * Explicit is the point: `packages/control-plane` arrived in Phase 2 and is
 * impure by design — it holds the pool, the HTTP surface and the boot
 * sequence. A glob over `packages/*​/src` would either fail on it or force an
 * exclusion list, and neither states which packages carry the guarantee.
 * `packages/cost-meter` is on this list because it is pure by design: it takes
 * time, usage and rates as arguments and reads no clock and no table.
 */
const PACKAGE_SOURCES = [
  join(REPO_ROOT, 'packages', 'contracts', 'src'),
  join(REPO_ROOT, 'packages', 'ledger', 'src'),
  join(REPO_ROOT, 'packages', 'cost-meter', 'src'),
];

/** Named explicitly by AC#5, plus the sibling forms of the same capabilities. */
const FORBIDDEN_NODE_MODULES = [
  'fs', 'fs/promises',
  'net', 'tls',
  'http', 'https', 'http2',
  'child_process',
  'dns', 'dns/promises',
  'dgram', 'cluster', 'worker_threads', 'inspector', 'repl', 'readline', 'v8', 'vm',
];

/** Database drivers and the ORMs that wrap them. */
const FORBIDDEN_DB_MODULES = [
  'pg', 'pg-native', 'postgres', 'mysql', 'mysql2', 'sqlite3', 'better-sqlite3',
  'mongodb', 'mongoose', 'redis', 'ioredis', 'cassandra-driver', 'oracledb', 'tedious',
  '@neondatabase/serverless', '@vercel/postgres', 'drizzle-orm', 'prisma', '@prisma/client',
  'knex', 'typeorm', 'sequelize', 'kysely',
];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Every module specifier: static import/export-from, dynamic import, require. */
function moduleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s[^'"]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s[^'"]*?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const captured = match[1];
      if (captured !== undefined) specifiers.push(captured);
    }
  }
  return specifiers;
}

/** Strip a `node:` prefix and reduce a deep import to its package root. */
function normalize(specifier: string): string {
  const withoutProtocol = specifier.replace(/^node:/, '');
  if (withoutProtocol.startsWith('@')) {
    return withoutProtocol.split('/').slice(0, 2).join('/');
  }
  return withoutProtocol.split('/')[0] ?? withoutProtocol;
}

describe('AC#5 — zero I/O', () => {
  const files = PACKAGE_SOURCES.flatMap(tsFiles);

  it('finds the package sources to inspect', () => {
    assert.ok(files.length > 0, 'no package sources found — the purity check would vacuously pass');
  });

  it('imports no fs, net, http, child_process, dns, or database driver module', () => {
    const violations: string[] = [];
    const forbidden = new Set([
      ...FORBIDDEN_NODE_MODULES.map(normalize),
      ...FORBIDDEN_DB_MODULES,
    ]);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of moduleSpecifiers(source)) {
        const root = normalize(specifier);
        if (forbidden.has(root) || FORBIDDEN_NODE_MODULES.includes(specifier.replace(/^node:/, ''))) {
          violations.push(`${relative(REPO_ROOT, file)}: imports '${specifier}'`);
        }
      }
    }

    assert.deepEqual(violations, [], 'package source performs I/O');
  });

  it('imports nothing outside the workspace at all — every specifier is relative', () => {
    // Stronger than the named list: the pure core has no third-party surface,
    // so a driver added under an unanticipated name still fails here.
    const external: string[] = [];
    for (const file of files) {
      for (const specifier of moduleSpecifiers(readFileSync(file, 'utf8'))) {
        if (!specifier.startsWith('.')) {
          external.push(`${relative(REPO_ROOT, file)}: imports '${specifier}'`);
        }
      }
    }
    assert.deepEqual(external, [], 'package source imports a non-relative module');
  });

  it('declares no runtime dependency other than the sibling workspace package', () => {
    const contracts = JSON.parse(
      readFileSync(join(REPO_ROOT, 'packages', 'contracts', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const ledger = JSON.parse(
      readFileSync(join(REPO_ROOT, 'packages', 'ledger', 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    assert.deepEqual(Object.keys(contracts.dependencies ?? {}), []);
    assert.deepEqual(Object.keys(ledger.dependencies ?? {}), ['@build-room/contracts']);
  });

  it('reads no clock and no randomness — replay must be deterministic', () => {
    const impure: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of [/\bDate\.now\s*\(/, /\bnew\s+Date\s*\(/, /\bMath\.random\s*\(/, /\bprocess\.\w/]) {
        if (pattern.test(source)) {
          impure.push(`${relative(REPO_ROOT, file)}: matches ${pattern}`);
        }
      }
    }
    assert.deepEqual(impure, [], 'package source reads ambient state');
  });
});

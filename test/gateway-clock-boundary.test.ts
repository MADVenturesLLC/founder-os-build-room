/**
 * §4 — the authoritative clock boundary is exclusive.
 *
 * The contract's claim is not "we inject a clock in most places". It is that no
 * module outside the adapters names `Date.now` or `performance.now` directly,
 * because a single module that reaches for the ambient clock makes the fail-
 * closed behaviour untestable exactly where it matters — and a suite that
 * cannot script a backward jump cannot prove the system refuses one.
 *
 * The check is static, like `purity.test.ts`, and it is scoped to the gateway
 * surface this contract builds. The pre-existing Phase 2 modules are not in
 * scope and are not touched: their uses are process uptime, probe latency, and
 * boot log stamps, none of which is gateway time consumption.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every gateway source tree this contract creates or extends. */
const GATEWAY_SOURCES = [
  join(REPO_ROOT, 'packages', 'gateway-protocol', 'src'),
  join(REPO_ROOT, 'packages', 'gateway-registry', 'src'),
  join(REPO_ROOT, 'packages', 'gateway-daemon', 'src'),
  join(REPO_ROOT, 'packages', 'gateway-cli', 'src'),
  join(REPO_ROOT, 'packages', 'control-plane', 'src', 'gateway'),
];

/**
 * The adapters, named one by one rather than pattern-matched.
 *
 * A pattern would let a new `something-clock.ts` exempt itself. Naming them
 * means a new adapter is a deliberate edit to this list, which is a place a
 * reviewer will look.
 */
const ADAPTER_FILES = [
  join(REPO_ROOT, 'packages', 'control-plane', 'src', 'gateway', 'clock.ts'),
  join(REPO_ROOT, 'packages', 'gateway-daemon', 'src', 'clock.ts'),
  join(REPO_ROOT, 'packages', 'gateway-cli', 'src', 'clock.ts'),
];

const AMBIENT_CLOCK = [/\bDate\.now\s*\(/, /\bperformance\.now\s*\(/];

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('§4 — only the clock adapters read the ambient clock', () => {
  const files = GATEWAY_SOURCES.flatMap(tsFiles);

  it('finds gateway sources to inspect', () => {
    assert.ok(files.length > 0, 'no gateway sources found — the check would vacuously pass');
  });

  it('names Date.now and performance.now nowhere but the adapters', () => {
    const violations: string[] = [];
    for (const file of files) {
      if (ADAPTER_FILES.includes(file)) continue;
      const source = readFileSync(file, 'utf8');
      for (const pattern of AMBIENT_CLOCK) {
        if (pattern.test(source)) {
          violations.push(`${relative(REPO_ROOT, file)}: matches ${pattern}`);
        }
      }
    }
    assert.deepEqual(violations, [], 'a gateway module reads the ambient clock directly');
  });

  it('keeps the pure packages free of the ambient clock entirely, adapters included', () => {
    const pure = [
      join(REPO_ROOT, 'packages', 'gateway-protocol', 'src'),
      join(REPO_ROOT, 'packages', 'gateway-registry', 'src'),
    ].flatMap(tsFiles);

    const violations: string[] = [];
    for (const file of pure) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of AMBIENT_CLOCK) {
        if (pattern.test(source)) violations.push(`${relative(REPO_ROOT, file)}`);
      }
    }
    assert.deepEqual(violations, [], 'a pure package reads a clock');
  });
});

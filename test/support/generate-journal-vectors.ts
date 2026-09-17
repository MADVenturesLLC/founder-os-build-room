/**
 * Generate packages/journal/vectors/*.json from the implementation.
 * Usage (after build): node dist/test/support/generate-journal-vectors.js
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildChainVectors } from './journal-vector-source.js';

const here = dirname(fileURLToPath(import.meta.url));
/** Prefer the source tree that contains packages/journal/src (never dist/). */
function resolveRepoRoot(): string {
  const candidates = [
    join(here, '..', '..'), // test/support -> repo
    join(here, '..', '..', '..'), // dist/test/support -> repo
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'packages', 'journal', 'src', 'index.ts'))) {
      return candidate;
    }
  }
  throw new Error('could not locate packages/journal/src/index.ts from ' + here);
}

const root = resolveRepoRoot();
const outDir = join(root, 'packages', 'journal', 'vectors');
mkdirSync(outDir, { recursive: true });

const vectors = buildChainVectors();
writeFileSync(join(outDir, 'envelope.json'), JSON.stringify({
  spec: vectors.spec.envelope,
  digest: vectors.envelope.digest,
  canonicalHex: vectors.envelope.canonicalHex,
  value: vectors.envelope.value,
}, null, 2) + '\n');

writeFileSync(join(outDir, 'chain.json'), JSON.stringify({
  spec: vectors.spec,
  genesis: vectors.spec.genesis,
  headChainHash: vectors.headChainHash,
  entries: vectors.chain,
}, null, 2) + '\n');

console.log('wrote', join(outDir, 'envelope.json'));
console.log('wrote', join(outDir, 'chain.json'));
console.log('head', vectors.headChainHash);

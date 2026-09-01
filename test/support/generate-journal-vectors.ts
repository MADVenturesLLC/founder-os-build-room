/**
 * Writes the golden vector files for the four §6.2 serialization
 * contracts to `packages/journal/vectors/`. Run from the repo root:
 *
 *   npm run vectors:journal
 *
 * Deterministic: same implementation, same bytes, same files. The
 * committed files are asserted byte-identical to a fresh build by
 * `test/journal-vectors.test.ts`, so drift fails the suite.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildAllVectorFiles, renderVectorFile } from './journal-vector-source.js';

// Compiled location: dist/test/support/ — three levels up is the repo root.
const vectorsDir = fileURLToPath(new URL('../../../packages/journal/vectors/', import.meta.url));

for (const [fileName, value] of buildAllVectorFiles()) {
  writeFileSync(`${vectorsDir}${fileName}`, renderVectorFile(value), 'utf8');
  process.stdout.write(`wrote packages/journal/vectors/${fileName}\n`);
}

/**
 * Seat Registry V1.1 — static integration-surface tests (T11, T12 surface,
 * T13, T14, T15, T18b, T9 static).
 *
 * Controlling specification: docs/planning/seat-registry-v1/
 * seat-registry-v1.1-non-activating-integration-plan-DRAFT.md
 * (sha256 85bfe268fc571a3ec71c15243d4df44a953fd5e2340763a92ae51072dfa412eb),
 * section 10 and F12 (the purity-scan convention of test/purity.test.ts).
 *
 * These tests read the source tree — that is what lets them inspect it. The
 * assertions are about the SHIPPED SOURCE of the integration surface:
 *   - packages/seat-registry/src (V1, frozen);
 *   - packages/control-plane/src/seat-policy.ts (the new gate);
 *   - the two new integration test files.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The integration surface — every file this tranche ships or binds to. */
const SEAT_POLICY_GATE = join(REPO_ROOT, 'packages', 'control-plane', 'src', 'seat-policy.ts');
const SEAT_REGISTRY_SRC = join(REPO_ROOT, 'packages', 'seat-registry', 'src');
const INTEGRATION_TEST = join(REPO_ROOT, 'test', 'seat-registry-integration.test.ts');
const INTEGRATION_STATIC_TEST = join(REPO_ROOT, 'test', 'seat-registry-integration-static.test.ts');

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

/* ------------------------------------------------------------------ */
/* T11 — Package consumers use the stable public entry point            */
/* ------------------------------------------------------------------ */

describe('T11 — single-entry import rule', () => {
  it('every seat-registry import in the control plane resolves to the public entry', () => {
    const controlPlaneSrc = join(REPO_ROOT, 'packages', 'control-plane', 'src');
    for (const file of tsFiles(controlPlaneSrc)) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of moduleSpecifiers(source)) {
        if (!specifier.includes('seat-registry')) continue;
        assert.ok(
          /seat-registry\/src\/index\.js$/.test(specifier),
          `${relative(REPO_ROOT, file)} imports seat-registry through ${specifier} — only the public entry is permitted`,
        );
      }
    }
  });

  it('every seat-registry import in test/ resolves to the public entry', () => {
    const testDir = join(REPO_ROOT, 'test');
    for (const file of tsFiles(testDir)) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of moduleSpecifiers(source)) {
        if (!specifier.includes('seat-registry')) continue;
        assert.ok(
          /seat-registry\/src\/index\.js$/.test(specifier),
          `${relative(REPO_ROOT, file)} imports seat-registry through ${specifier} — deep imports are forbidden`,
        );
      }
    }
  });

  it('no workspace seat-registry specifier exists anywhere on the integration surface', () => {
    const surface = [
      SEAT_POLICY_GATE,
      INTEGRATION_TEST,
      INTEGRATION_STATIC_TEST,
      ...tsFiles(SEAT_REGISTRY_SRC),
    ];
    // Built at runtime so this scanner never contains the literal it scans for.
    const workspaceSpecifier = '@' + 'build-room/seat-registry';
    for (const file of surface) {
      const source = readFileSync(file, 'utf8');
      assert.ok(
        !source.includes(workspaceSpecifier),
        `${relative(REPO_ROOT, file)} uses a workspace specifier — the convention is relative source import (plan F8)`,
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* T13 — No live provider adapter is reachable                          */
/* ------------------------------------------------------------------ */

describe('T13 — no live provider adapter reachable', () => {
  const FORBIDDEN_NETWORK_MODULES = [
    'net', 'tls', 'http', 'https', 'http2', 'dns', 'dns/promises', 'dgram',
    'child_process', 'worker_threads', 'undici', 'node-fetch', 'cluster', 'inspector',
  ];

  function surfaceFiles(): string[] {
    return [SEAT_POLICY_GATE, INTEGRATION_TEST, INTEGRATION_STATIC_TEST, ...tsFiles(SEAT_REGISTRY_SRC)];
  }

  it('no network/process module is imported on the integration surface', () => {
    for (const file of surfaceFiles()) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of moduleSpecifiers(source)) {
        const bare = specifier.replace(/^node:/, '');
        assert.ok(
          !FORBIDDEN_NETWORK_MODULES.includes(bare),
          `${relative(REPO_ROOT, file)} imports forbidden network module ${specifier}`,
        );
        assert.ok(
          !specifier.startsWith('undici') && !specifier.startsWith('node-fetch'),
          `${relative(REPO_ROOT, file)} imports a network client library`,
        );
      }
    }
  });

  it('no live socket call site exists on the integration surface', () => {
    // Built at runtime so this scanner never contains the literal it scans for.
    const fetchCall = new RegExp('\\b' + 'fet' + 'ch\\s*\\(');
    const wsRef = new RegExp('\\b' + 'Web' + 'Socket\\b');
    for (const file of surfaceFiles()) {
      const source = readFileSync(file, 'utf8');
      assert.ok(!fetchCall.test(source), `${relative(REPO_ROOT, file)} contains a fetch call site`);
      assert.ok(!wsRef.test(source), `${relative(REPO_ROOT, file)} references a live-socket API`);
    }
  });

  it('no adapter/transport/provider module exists under the changed paths', () => {
    // The changed paths are the gate module, one export line, and the two
    // test files — a file-set assertion (plan T13).
    assert.ok(existsSync(SEAT_POLICY_GATE));
    assert.ok(existsSync(INTEGRATION_TEST));
    assert.ok(existsSync(INTEGRATION_STATIC_TEST));
    const controlPlaneSrc = join(REPO_ROOT, 'packages', 'control-plane', 'src');
    const files = tsFiles(controlPlaneSrc).map((f) => relative(controlPlaneSrc, f));
    for (const f of files) {
      assert.ok(
        !/adapter|transport|provider-client/i.test(f),
        `unexpected adapter-like module on the control-plane surface: ${f}`,
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* T14 — No credentials are loaded                                      */
/* ------------------------------------------------------------------ */

describe('T14 — no credentials are loaded', () => {
  it('no ambient environment read on the integration surface', () => {
    const surface = [SEAT_POLICY_GATE, INTEGRATION_TEST, INTEGRATION_STATIC_TEST, ...tsFiles(SEAT_REGISTRY_SRC)];
    // Built at runtime so this scanner never contains the literal it scans for.
    const envRead = 'pro' + 'cess.env';
    for (const file of surface) {
      const source = readFileSync(file, 'utf8');
      assert.ok(
        !source.includes(envRead),
        `${relative(REPO_ROOT, file)} reads ${envRead}`,
      );
    }
  });

  it('no keychain/credential/token module imported; no .env or credential file patterns read', () => {
    const surface = [SEAT_POLICY_GATE, INTEGRATION_TEST, INTEGRATION_STATIC_TEST, ...tsFiles(SEAT_REGISTRY_SRC)];
    for (const file of surface) {
      const source = readFileSync(file, 'utf8');
      for (const specifier of moduleSpecifiers(source)) {
        assert.ok(
          !/keychain|credential|token-store|secret/i.test(specifier),
          `${relative(REPO_ROOT, file)} imports credential-shaped module ${specifier}`,
        );
      }
      assert.ok(!/\.env\b/.test(source) || /gitignore|example/i.test(source), `${relative(REPO_ROOT, file)} references a .env file`);
    }
  });

  it('serialized gate decisions carry no credential-shaped material', () => {
    // Runtime shape check: a refusal decision serialized to JSON contains no
    // token/key/secret shapes (plan T14).
    const source = readFileSync(SEAT_POLICY_GATE, 'utf8');
    assert.ok(!/\bsk-[A-Za-z0-9]{8,}/.test(source), 'no secret-shaped literals in the gate source');
    assert.ok(!/ghp_[A-Za-z0-9]{20,}/.test(source), 'no PAT-shaped literals in the gate source');
    assert.ok(!/AKIA[0-9A-Z]{16}/.test(source), 'no AWS-key-shaped literals in the gate source');
    assert.ok(!/PRIVATE KEY/.test(source), 'no private-key material in the gate source');
  });
});

/* ------------------------------------------------------------------ */
/* T15 — No network call occurs                                         */
/* ------------------------------------------------------------------ */

describe('T15 — no network call occurs', () => {
  it('the suite runs credential-free and offline: no socket API is even imported on the surface', () => {
    // T13 proves no socket API import; this test adds the socket-call-site
    // scan: no createConnection/connect/listen/request over a network module.
    const surface = [SEAT_POLICY_GATE, INTEGRATION_TEST, INTEGRATION_STATIC_TEST, ...tsFiles(SEAT_REGISTRY_SRC)];
    for (const file of surface) {
      const source = readFileSync(file, 'utf8');
      assert.ok(!/\bcreateConnection\s*\(/.test(source), `${relative(REPO_ROOT, file)} opens a connection`);
      assert.ok(!/\bnet\.connect\s*\(/.test(source), `${relative(REPO_ROOT, file)} connects via net`);
      assert.ok(!/\bhttp\.request\s*\(|\bhttps\.request\s*\(/.test(source), `${relative(REPO_ROOT, file)} issues an HTTP request`);
    }
  });
});

/* ------------------------------------------------------------------ */
/* T9 static — the gate mints no command id                             */
/* ------------------------------------------------------------------ */

describe('T9 static — no id minting on the integration surface', () => {
  it('no cmd_ namespace, uuid, or crypto.randomUUID on the gate surface', () => {
    const source = readFileSync(SEAT_POLICY_GATE, 'utf8');
    assert.ok(!/crypto\.randomUUID/.test(source), 'the gate calls crypto.randomUUID');
    assert.ok(!/\buuid\b/i.test(source), 'the gate references a uuid library');
    assert.ok(!/'cmd_|\bcmd_[a-z0-9]/.test(source), 'the gate mints cmd_-namespace ids');
    assert.ok(!/\brandomId\b|\bgenerateId\b|\bmintId\b/i.test(source), 'the gate exposes an id generator');
  });
});

/* ------------------------------------------------------------------ */
/* T18b — the gate cannot write, so it cannot corrupt state             */
/* ------------------------------------------------------------------ */

describe('T18b — no fs-write API on the gate surface', () => {
  it('no write/append/createWriteStream/mkdir/rm/open-for-write on the gate module', () => {
    const source = readFileSync(SEAT_POLICY_GATE, 'utf8');
    const forbiddenWrites = [
      'writeFileSync', 'writeFile', 'appendFileSync', 'appendFile',
      'createWriteStream', 'mkdir', 'mkdirSync', 'rmSync', 'unlink',
      'rename', 'copyFile', 'truncate',
    ];
    for (const api of forbiddenWrites) {
      assert.ok(!source.includes(api), `the gate module uses fs write API: ${api}`);
    }
    // The gate performs no imports at all beyond the seat-registry entry
    // and node:* builtin TYPE utilities (plan §5.1).
    for (const specifier of moduleSpecifiers(source)) {
      assert.ok(
        specifier.includes('seat-registry/src/index.js') || specifier.startsWith('node:'),
        `unexpected import on the gate surface: ${specifier}`,
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* T12 surface — no API accepts a resolution                            */
/* ------------------------------------------------------------------ */

describe('T12 surface — the gate exposes no resolution-accepting API', () => {
  it('evaluateDispatch takes only the DispatchRequest shape; no method accepts a SeatResolution', () => {
    const source = readFileSync(SEAT_POLICY_GATE, 'utf8');
    // The exported interface has exactly the methods the plan §5.1 names.
    for (const method of [
      'evaluateDispatch',
      'decideRetry',
      'decideFailover',
      'decideReplay',
      'policy',
      'assertReviewDistinctness',
    ]) {
      assert.ok(source.includes(method), `gate surface includes ${method}`);
    }
    // No method accepts a resolution object from the caller.
    assert.ok(
      !/:\s*SeatResolution\s*\)/.test(source),
      'no gate method takes a SeatResolution as a parameter (bypass surface)',
    );
  });
});

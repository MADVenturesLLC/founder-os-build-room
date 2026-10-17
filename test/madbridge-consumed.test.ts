/**
 * The consumed MadBridge capabilities (`packages/madbridge-consumed`), held
 * to the contract `DEC-20260827-01` §5 pins at `7d37a61`: the consumed
 * exports and their behavioural invariants, row by row, plus the provenance
 * record (`PROVENANCE.json`) that names every file of the pinned closure
 * with its blob id (Founder ruling, 2026-10-15).
 *
 * With `MADBRIDGE_CHECKOUT` pointing at a madventures-tui clone, the
 * provenance suite also re-resolves every blob at the pin and checks that
 * each `consumed` file is its source with only import specifiers changed:
 * the drift procedure of `DEC-20260827-01` §7, mechanized. Without it,
 * those two cases are skipped and say so.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  InvalidTransitionError,
  assertCurrentWriter,
  transitionOwnership,
  type OwnershipState,
} from '../packages/madbridge-consumed/src/broker/ownership-machine.js';
import { assertWithinAllowedPath, isPathAllowed } from '../packages/madbridge-consumed/src/policy/path-policy.js';
import { ArtifactStore, createManifest } from '../packages/madbridge-consumed/src/artifact-store/index.js';
import { GENESIS_HASH, Ledger, computeEventHash, rebuildBrokerState, rebuildState } from '../packages/madbridge-consumed/src/ledger/index.js';
import { ADAPTER_REGISTRY, lookupRegistration, parseSurfaceId, sha256Hex, type BridgeEventV1, type RepositoryFingerprint } from '../packages/madbridge-consumed/src/protocol/index.js';
import { interruptSession, reconcileRepository, resumeSession, type ReconcileResult } from '../packages/madbridge-consumed/src/broker/reconciliation.js';
import type { AdapterV1 } from '../packages/madbridge-consumed/src/adapter/adapter-v1.js';

const PIN = '7d37a61dcaeaef77c55013c7620deb8445726788';
const PKG = fileURLToPath(new URL('../../packages/madbridge-consumed/', import.meta.url));

interface ProvenanceEntry {
  readonly source: string;
  readonly blob: string;
  readonly pinned: boolean;
  readonly status: 'consumed' | 'adapted' | 'excluded' | 'deferred';
  readonly file?: string;
  readonly reason?: string;
  readonly change?: string;
}
const provenance = JSON.parse(readFileSync(join(PKG, 'PROVENANCE.json'), 'utf8')) as {
  readonly commit: string;
  readonly files: readonly ProvenanceEntry[];
};

/** The same specifier rewrite the port applied, so a consumed file can be compared with its source. */
function rewriteSpecifiers(source: string, sourcePath: string): string {
  const pkg = sourcePath.split('/')[1] as string;
  const map: Record<string, string> = { '@madventures/protocol': 'protocol/index.js', '@madventures/ledger': 'ledger/index.js' };
  return source.replace(/(from\s+["'])([^"']+)(["'])/g, (_whole, open: string, spec: string, close: string) => {
    let next = spec;
    const mapped = map[spec];
    if (mapped !== undefined) {
      next = relative(pkg, mapped);
      if (!next.startsWith('.')) next = `./${next}`;
    } else if (spec.startsWith('./') || spec.startsWith('../')) {
      next = spec.endsWith('.js') ? spec : `${spec}.js`;
    }
    return `${open}${next}${close}`;
  });
}

const CHECKOUT = process.env['MADBRIDGE_CHECKOUT'];
const NO_CHECKOUT = CHECKOUT === undefined || CHECKOUT === '' ? 'MADBRIDGE_CHECKOUT is not set — pinned blobs not re-resolved here' : false;

describe('consumed MadBridge — the provenance record (Founder ruling 2026-10-15)', () => {
  it('names the pinned commit and all thirteen §5 files, each with a blob id', () => {
    assert.equal(provenance.commit, PIN);
    assert.equal(provenance.files.filter((e) => e.pinned).length, 13);
    for (const entry of provenance.files) assert.match(entry.blob, /^[0-9a-f]{40}$/, entry.source);
  });

  it('gives every file that is not consumed a reason, and every consumed file a header naming its source and blob', () => {
    for (const entry of provenance.files) {
      if (entry.status === 'excluded' || entry.status === 'deferred') {
        assert.ok((entry.reason ?? '').length > 0, entry.source);
        continue;
      }
      assert.ok(entry.file !== undefined, entry.source);
      const text = readFileSync(join(PKG, entry.file), 'utf8');
      assert.ok(text.includes(entry.source), `${entry.file} names ${entry.source}`);
      assert.ok(text.includes(entry.blob), `${entry.file} names blob ${entry.blob}`);
      assert.ok(text.includes(PIN), `${entry.file} names the pin`);
    }
  });

  it('accounts for every source file in the package', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, name.name);
        if (name.isDirectory()) walk(path);
        else if (name.name.endsWith('.ts')) files.push(relative(PKG, path));
      }
    };
    walk(join(PKG, 'src'));
    const recorded = new Set(provenance.files.flatMap((e) => (e.file === undefined ? [] : [e.file])));
    assert.deepEqual(files.filter((f) => !recorded.has(f)), [], 'no unrecorded file');
  });

  it('every recorded blob is the file at the pin in a MadBridge checkout', { skip: NO_CHECKOUT }, () => {
    for (const entry of provenance.files) {
      const actual = execFileSync('git', ['-C', CHECKOUT as string, 'rev-parse', `${PIN}:${entry.source}`], { encoding: 'utf8' }).trim();
      assert.equal(actual, entry.blob, entry.source);
    }
  });

  it('every file marked consumed is its source with only the import specifiers changed', { skip: NO_CHECKOUT }, () => {
    for (const entry of provenance.files.filter((e) => e.status === 'consumed')) {
      const source = execFileSync('git', ['-C', CHECKOUT as string, 'show', `${PIN}:${entry.source}`], { encoding: 'utf8' });
      const ported = readFileSync(join(PKG, entry.file as string), 'utf8');
      const body = ported.slice(ported.indexOf('*/\n') + 3);
      assert.equal(body, rewriteSpecifiers(source, entry.source), entry.source);
    }
  });
});

/* ---------------- §3.1 worktree ownership and path policy ---------------- */

const FP: RepositoryFingerprint = { kind: 'commit', sha256: 'a'.repeat(64), git_sha: 'b'.repeat(40) };
const OTHER_FP: RepositoryFingerprint = { kind: 'commit', sha256: 'c'.repeat(64), git_sha: 'b'.repeat(40) };

describe('consumed §3.1 — ownership with fencing tokens', () => {
  const owned = (): OwnershipState => transitionOwnership({ kind: 'free' }, { type: 'acquire', executionId: 'e1', worktreeId: 'w1', repositoryFingerprint: FP });

  it('every acquisition increments the fencing token: first acquire is 1, a completed transfer is +1', () => {
    const first = owned();
    assert.equal(first.kind === 'owned' && first.fencingToken, 1);
    const requested = transitionOwnership(first, { type: 'request_transfer', executionId: 'e1', fencingToken: 1, to: 'e2' });
    const released = transitionOwnership(requested, { type: 'sender_release', executionId: 'e1', fencingToken: 1 });
    const accepted = transitionOwnership(released, { type: 'receiver_accept', executionId: 'e2', worktreeId: 'w1', repositoryFingerprint: FP });
    assert.deepEqual(accepted, { kind: 'owned', executionId: 'e2', worktreeId: 'w1', fencingToken: 2, repositoryFingerprint: FP });
  });

  it('a stale token throws stale_token; a different execution throws writer_not_owned', () => {
    assert.throws(() => transitionOwnership(owned(), { type: 'release', executionId: 'e1', fencingToken: 7 }), /^Error: stale_token$/);
    assert.throws(() => transitionOwnership(owned(), { type: 'release', executionId: 'e9', fencingToken: 1 }), /^Error: writer_not_owned$/);
    assert.throws(() => transitionOwnership(owned(), { type: 'request_transfer', executionId: 'e9', fencingToken: 1, to: 'e2' }), /writer_not_owned/);
  });

  it('the receiver accept binds to the intended receiver, the same worktree and a matching fingerprint', () => {
    const released = transitionOwnership(
      transitionOwnership(owned(), { type: 'request_transfer', executionId: 'e1', fencingToken: 1, to: 'e2' }),
      { type: 'sender_release', executionId: 'e1', fencingToken: 1 },
    );
    assert.throws(() => transitionOwnership(released, { type: 'receiver_accept', executionId: 'e3', worktreeId: 'w1', repositoryFingerprint: FP }), /receiver_not_intended/);
    assert.throws(() => transitionOwnership(released, { type: 'receiver_accept', executionId: 'e2', worktreeId: 'w2', repositoryFingerprint: FP }), /worktree_mismatch/);
    assert.throws(() => transitionOwnership(released, { type: 'receiver_accept', executionId: 'e2', worktreeId: 'w1', repositoryFingerprint: OTHER_FP }), /fingerprint_mismatch/);
  });

  it('an unlisted transition throws InvalidTransitionError; assertCurrentWriter checks all four facts', () => {
    assert.throws(() => transitionOwnership({ kind: 'free' }, { type: 'release', executionId: 'e1', fencingToken: 1 }), InvalidTransitionError);
    const state = owned();
    assert.doesNotThrow(() => assertCurrentWriter(state, 'e1', 'w1', 1));
    assert.throws(() => assertCurrentWriter({ kind: 'free' }, 'e1', 'w1', 1), /writer_not_owned/);
    assert.throws(() => assertCurrentWriter(state, 'e1', 'w1', 2), /stale_token/);
    assert.throws(() => assertCurrentWriter(state, 'e2', 'w1', 1), /writer_not_owned/);
    assert.throws(() => assertCurrentWriter(state, 'e1', 'w2', 1), /worktree_mismatch/);
  });
});

describe('consumed §3.1 — path policy against a caller-supplied root', () => {
  const root = mkdtempSync(join(tmpdir(), 'mb-path-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'a.ts'), 'x');
  const outside = mkdtempSync(join(tmpdir(), 'mb-out-'));
  writeFileSync(join(outside, 'secret.ts'), 'x');
  symlinkSync(outside, join(root, 'src', 'link'));

  it('allows a contained path that matches a glob, and only then', () => {
    assert.equal(isPathAllowed('src/a.ts', ['src/*.ts'], root), true);
    assert.equal(isPathAllowed('src/a.ts', ['test/**'], root), false);
    assert.equal(isPathAllowed('src/deep/b.ts', ['src/**'], root), true, '** crosses directories');
    assert.equal(isPathAllowed('src/deep/b.ts', ['src/*'], root), false, '* does not');
  });

  it('denies traversal, absolute escapes, sibling-prefix escapes, symlink components and a relative root', () => {
    for (const [path, base] of [
      ['../x', root],
      ['src/../../x', root],
      [join(outside, 'secret.ts'), root],
      [`${root}-secrets/a.ts`, root],
      ['src/link/secret.ts', root],
      ['', root],
      ['src/a.ts', 'relative/root'],
    ] as const) {
      assert.throws(() => assertWithinAllowedPath(path, ['**'], base), /^Error: path_denied$/, path);
    }
  });

  it('cleans up', () => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
});

/* ---------------- §3.3 evidence recorder ---------------- */

let eventCounter = 0;
function event(type: BridgeEventV1['event_type'], overrides: Partial<BridgeEventV1> = {}): BridgeEventV1 {
  eventCounter += 1;
  return {
    protocol_version: 'madbridge-protocol/v1',
    event_id: `evt-${eventCounter}`,
    session_id: 'session-1',
    parent_event_id: null,
    sender_execution_id: 'e1',
    receiver_execution_id: 'e2',
    sender_role: 'planner',
    sender_surface: 'claude-code',
    sender_model: 'example-model',
    sender_provider: 'example-provider',
    task_envelope_hash: 'd'.repeat(64),
    repository_fingerprint: FP,
    event_type: type,
    payload_hash: '',
    payload: {},
    created_at: '2026-10-15T12:00:00.000Z',
    previous_event_hash: GENESIS_HASH,
    ...overrides,
  };
}

describe('consumed §3.3 — content-addressed artifacts and manifest finalization', () => {
  const base = mkdtempSync(join(tmpdir(), 'mb-art-'));
  const store = new ArtifactStore(base);
  const bytes = new TextEncoder().encode('plan evidence');
  const hash = sha256Hex(bytes);

  it('writes to sha256/<first two>/<hash> and returns the content hash', () => {
    const meta = store.publish(bytes, { task_id: 't1', type: 'plandoc', repo_fingerprint: FP.sha256 });
    assert.equal(meta.sha256, hash);
    assert.equal(meta.size_bytes, bytes.length);
    assert.ok(existsSync(join(base, 'sha256', hash.slice(0, 2), hash)));
    assert.equal(store.inspect(hash)?.sha256, hash);
    assert.equal(store.inspect('0'.repeat(64)), null);
  });

  it('deduplicates identical content and refuses a declared hash that is not the content’s', () => {
    assert.equal(store.publish(bytes, { task_id: 't2', type: 'plandoc', repo_fingerprint: '' }).sha256, hash);
    assert.throws(() => store.publish(bytes, { task_id: 't1', type: 'plandoc', repo_fingerprint: '', declared_hash: 'e'.repeat(64) }), /hash mismatch/);
  });

  it('finalizes a manifest that binds the artifacts to the ledger head and the repository', () => {
    const meta = store.publish(bytes, { task_id: 't1', type: 'plandoc', repo_fingerprint: FP.sha256 });
    const manifest = createManifest([meta], 'f'.repeat(64), FP.sha256);
    assert.equal(manifest.version, 'madbridge-protocol/v1');
    assert.equal(manifest.artifact_count, 1);
    assert.deepEqual(manifest.artifacts, [{ sha256: hash, size_bytes: bytes.length, type: 'plandoc', task_id: 't1' }]);
    assert.equal(manifest.ledger_head_hash, 'f'.repeat(64));
    rmSync(base, { recursive: true, force: true });
  });
});

describe('consumed §3.3 — the hash-chained append-only ledger', () => {
  it('chains each event on the previous hash from genesis and verifies', () => {
    const ledger = new Ledger();
    const first = ledger.append(event('message'));
    const second = ledger.append(event('message'));
    assert.equal(first.sequence, 1);
    assert.equal(first.previous_hash, GENESIS_HASH);
    assert.equal(second.previous_hash, first.event_hash);
    assert.equal(second.event_hash, computeEventHash(first.event_hash, second.event_json));
    assert.deepEqual(ledger.verify(), { valid: true, count: 2, head: second.event_hash });
    assert.deepEqual(ledger.readAfter(1).map((r) => r.sequence), [2]);
  });

  it('verify() reports the first tampered sequence', () => {
    const ledger = new Ledger();
    for (let i = 0; i < 3; i += 1) ledger.append(event('message'));
    ledger.unsafeTestOnlyMutatePayload(2, '{"tampered":true}');
    const result = ledger.verify();
    assert.equal(result.valid, false);
    assert.equal(result.brokenSequence, 2);
  });

  it('refuses a duplicate event_id and writes nothing; a closed ledger refuses everything', () => {
    const ledger = new Ledger();
    const once = event('message');
    ledger.append(once);
    assert.throws(() => ledger.append(once), /UNIQUE constraint failed: events.event_id/);
    assert.equal(ledger.verify().count, 1);
    ledger.close();
    assert.throws(() => ledger.append(event('message')), /closed/);
    assert.throws(() => ledger.verify(), /closed/);
  });

  it('a returned row cannot rewrite the stored one', () => {
    const ledger = new Ledger();
    const row = ledger.append(event('message'));
    row.event_json = '{}';
    assert.equal(ledger.verify().valid, true);
  });
});

/* ---------------- §3.4 adapter lifecycle ---------------- */

describe('consumed §3.4 — the closed adapter registry and the AdapterV1 contract', () => {
  it('is closed: exactly the two registered surfaces, typed, and nothing else resolves', () => {
    assert.deepEqual([...ADAPTER_REGISTRY.keys()], ['claude-code', 'antigravity']);
    assert.equal(lookupRegistration(parseSurfaceId('claude-code'))?.provider, 'anthropic');
    assert.equal(lookupRegistration(parseSurfaceId('antigravity'))?.provider, 'google');
    assert.equal(lookupRegistration(parseSurfaceId('openai-codex')), undefined);
  });

  it('is deep-frozen behind a frozen facade that never hands out the backing Map', () => {
    assert.ok(Object.isFrozen(ADAPTER_REGISTRY));
    const entry = lookupRegistration(parseSurfaceId('claude-code'));
    assert.ok(entry !== undefined && Object.isFrozen(entry) && Object.isFrozen(entry.supported_versions) && Object.isFrozen(entry.identity_probe));
    assert.equal((ADAPTER_REGISTRY as unknown as { set?: unknown }).set, undefined, 'no mutator');
    ADAPTER_REGISTRY.forEach((_value, _key, map) => assert.equal(map, ADAPTER_REGISTRY, 'forEach passes the facade, not the Map'));
  });

  it('AdapterV1 is the six-method lifecycle a stub can implement without a provider', async () => {
    const calls: string[] = [];
    const stub: AdapterV1 = {
      attest: async () => ({ executionId: 'e1', role: 'planner', surface: 'claude-code', model: 'stub', provider: 'stub', effort: 'low' }),
      prepareConfigPreview: async () => ({ targetPath: '/dev/null', beforeSha256: null, proposedSha256: 'a'.repeat(64), renderedDiff: '', backupPath: '/dev/null' }),
      launch: async (input) => ({ executionId: input.executionId, pid: 0, executablePath: 'stub', startedAt: '2026-10-15T12:00:00.000Z' }),
      notifyInbox: async (id) => void calls.push(`inbox:${id}`),
      pause: async (reason) => void calls.push(`pause:${reason}`),
      terminate: async (signal) => void calls.push(`terminate:${signal}`),
    };
    assert.equal((await stub.attest()).surface, 'claude-code');
    await stub.notifyInbox('evt-1');
    await stub.terminate('SIGTERM');
    assert.deepEqual(calls, ['inbox:evt-1', 'terminate:SIGTERM']);
  });
});

/* ---------------- §3.5 persistence, rebuild, reconciliation ---------------- */

function rows(types: readonly BridgeEventV1['event_type'][]) {
  const ledger = new Ledger();
  for (const type of types) ledger.append(event(type));
  return ledger.readAfter(0);
}

describe('consumed §3.5 — rebuild from the ledger rows alone', () => {
  it('an empty ledger rebuilds to starting with no usable token', () => {
    assert.deepEqual(rebuildState([]), { count: 0, lastEventHash: GENESIS_HASH, events: [] });
    const empty = rebuildBrokerState([]);
    assert.equal(empty.sessionState, 'starting');
    assert.equal(empty.tokenUsable, false);
  });

  it('activity activates; an incident interrupts and makes the token unusable', () => {
    const state = rebuildBrokerState(rows(['message', 'incident']));
    assert.equal(state.sessionState, 'interrupted');
    assert.equal(state.hasIncident, true);
    assert.equal(state.tokenUsable, false);
    assert.deepEqual(state.lastFingerprint, FP);
  });

  it('a resume after an incident goes through reconciling and issues a new token', () => {
    const state = rebuildBrokerState(rows(['message', 'incident', 'resume']));
    assert.equal(state.sessionState, 'active');
    assert.equal(state.currentFencingToken, 1);
    assert.equal(state.tokenUsable, true);
  });

  it('an incident never reopens a closed session', () => {
    const state = rebuildBrokerState(rows(['message', 'session_close', 'incident']));
    assert.equal(state.sessionState, 'closed');
    assert.equal(state.hasIncident, true);
  });
});

describe('consumed §3.5 — reconciliation is reconciled, ambiguous or mismatch, and resume needs approval', () => {
  const att = [
    { executionId: 'e1', taskEnvelopeHash: 'd'.repeat(64), attestedAt: '2026-10-15T12:00:00Z' },
    { executionId: 'e2', taskEnvelopeHash: 'd'.repeat(64), attestedAt: '2026-10-15T12:00:00Z' },
  ];
  const snap = (commit: RepositoryFingerprint, tree: RepositoryFingerprint) => ({ worktreePath: '/w', commitFingerprint: commit, workingTreeFingerprint: tree, changedPaths: ['src/a.ts'] });
  const reconcile = (commit: RepositoryFingerprint, tree: RepositoryFingerprint, reattestations = att): ReconcileResult =>
    reconcileRepository({ ledgerRows: [], expectedFingerprint: FP, actualSnapshot: snap(commit, tree), reattestations });
  const DIFF: RepositoryFingerprint = { kind: 'working_tree', sha256: '9'.repeat(64), git_sha: 'b'.repeat(40) };

  it('maps fingerprints and re-attestation to the three outcomes', () => {
    assert.equal(reconcile(FP, FP).outcome, 'reconciled');
    assert.equal(reconcile(FP, DIFF).outcome, 'reconciled', 'commit matches, working-tree changes recorded');
    assert.deepEqual(reconcile(FP, DIFF).changedPaths, ['src/a.ts']);
    assert.equal(reconcile(DIFF, FP).outcome, 'ambiguous', 'working tree matches, commit does not');
    assert.equal(reconcile(OTHER_FP, OTHER_FP).outcome, 'mismatch');
    assert.equal(reconcile(OTHER_FP, DIFF).outcome, 'ambiguous');
    assert.equal(reconcile(FP, FP, att.slice(0, 1)).outcome, 'ambiguous', 'one re-attestation is not two');
  });

  it('resumes only on a typed resume event, a reconciled outcome and both re-attestations', () => {
    const interrupted = { kind: 'interrupted' } as const;
    assert.equal(resumeSession({ founderEvent: event('message'), reconcileResult: reconcile(FP, FP), sessionState: interrupted }).resumed, false);
    assert.equal(resumeSession({ founderEvent: event('resume'), reconcileResult: reconcile(OTHER_FP, OTHER_FP), sessionState: interrupted }).resumed, false);
    assert.equal(resumeSession({ founderEvent: event('resume'), reconcileResult: reconcile(DIFF, FP), sessionState: interrupted }).resumed, false);
    const ok = resumeSession({ founderEvent: event('resume'), reconcileResult: reconcile(FP, FP), sessionState: interrupted });
    assert.equal(ok.resumed, true);
    assert.deepEqual(ok.state, { kind: 'active' });
    assert.ok(ok.newFencingToken >= 0);
  });

  it('an interrupt never auto-resumes, and a second interrupt is recorded as a duplicate without a state change', () => {
    const first = interruptSession({ reason: 'adapter_disconnect', sessionState: { kind: 'active' }, currentWriterToken: 3, ledgerRows: rows(['message']) });
    assert.deepEqual(first.state, { kind: 'interrupted' });
    assert.equal(first.autoResumed, false);
    assert.equal(first.incidentEvent.event_type, 'incident');
    assert.equal(first.tokenInvalidated, 3);
    const again = interruptSession({ reason: 'cli_exit', sessionState: first.state, currentWriterToken: 3, ledgerRows: [] });
    assert.equal(again.duplicate, true);
    assert.deepEqual(again.state, { kind: 'interrupted' });
    assert.throws(() => interruptSession({ reason: 'cli_exit', sessionState: { kind: 'closed' }, currentWriterToken: 1, ledgerRows: [] }));
  });
});

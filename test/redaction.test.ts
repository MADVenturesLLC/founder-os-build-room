/**
 * Lane B — secret boundary / redaction (OMP→MAD Evolve Pack v0, Founder act
 * of 2026-09-13). Imports only the package's public entry.
 *
 * Proven here:
 *   - determinism: same key + same secret → same token, across redactors and
 *     across sinks; a different key → a different token;
 *   - irreversibility of `replace`: the token carries no substring of the
 *     secret, its length is independent of the secret, and knowing the key
 *     lets a holder CONFIRM a guess but not recover the value;
 *   - error-path redaction: a thrown Error whose message, stack, and cause
 *     carry the secret is redacted on the harness error path and on the
 *     inner-writer failure path;
 *   - fail-closed writers: registry unloadable, key absent, key unavailable,
 *     key too short, and the un-wired `obfuscate` mode all make every sink
 *     refuse before the inner writer is called;
 *   - generation-time registration (≥16 chars, value dropped on refusal),
 *     env-name heuristics, manifest rules, built-in shapes, custody argv;
 *   - static: the package touches no daemon module and does no file I/O.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUILTIN_SHAPE_NAMES,
  InMemoryHmacKeyCustody,
  KeychainHmacKeyCustody,
  MIN_FIXTURE_PASSWORD_LENGTH,
  MIN_HMAC_KEY_BYTES,
  MIN_REGISTERED_VALUE_LENGTH,
  REDACTION_KEYCHAIN_ACCOUNT,
  REDACTION_KEYCHAIN_SERVICE,
  REDACTION_MODES,
  RedactionBoundary,
  RedactionRefusedError,
  SecretRegistry,
  SecretRegistryError,
  SinkWriteError,
  UnavailableHmacKeyCustody,
  WIRED_REDACTION_MODES,
  createRedactor,
  generateFixturePassword,
  looksLikeSecretName,
  type CommandResult,
  type CommandRunner,
} from '../packages/redaction/src/index.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACKAGE_SRC = join(REPO_ROOT, 'packages', 'redaction', 'src');

const KEY_A = Buffer.alloc(32, 0x41);
const KEY_B = Buffer.alloc(32, 0x42);
// Fixture secrets are ASSEMBLED at runtime so that no line of this file is a
// literal credential-shaped assignment: the repository's secret scan
// (scripts/secret-scan.sh, gitleaks) reads commits, and a test that trips
// the verification layer to prove the control layer would be self-defeating.
const SECRET = ['fixture', 'pw', 'Qz8vL2mN4kP7rT1x'].join('-');
const OTHER = ['other', 'fixture', '9f8e7d6c5b4a3210'].join('-');

function registryWith(entries: Record<string, string> = { FIXTURE_PASSWORD: SECRET }): SecretRegistry {
  const registry = new SecretRegistry();
  for (const [name, value] of Object.entries(entries)) registry.register(name, value, 'generated');
  return registry;
}

/* ------------------------------------------------------------------ */
/* Determinism                                                          */
/* ------------------------------------------------------------------ */

describe('redaction · determinism of replace mode', () => {
  it('same key + same secret → same token, across independent redactors', () => {
    const one = createRedactor({ mode: 'replace', registry: registryWith(), hmacKey: KEY_A });
    const two = createRedactor({ mode: 'replace', registry: registryWith(), hmacKey: Buffer.from(KEY_A) });
    assert.equal(one.token('FIXTURE_PASSWORD', SECRET), two.token('FIXTURE_PASSWORD', SECRET));
    assert.equal(one.redactString(`pw=${SECRET}`), two.redactString(`pw=${SECRET}`));
    assert.match(one.token('FIXTURE_PASSWORD', SECRET), /^\[REDACTED:FIXTURE_PASSWORD:[0-9a-f]{16}\]$/);
  });

  it('a different key → a different token; a different value → a different token', () => {
    const a = createRedactor({ mode: 'replace', registry: registryWith(), hmacKey: KEY_A });
    const b = createRedactor({ mode: 'replace', registry: registryWith(), hmacKey: KEY_B });
    assert.notEqual(a.token('x', SECRET), b.token('x', SECRET));
    assert.notEqual(a.token('x', SECRET), a.token('x', OTHER));
  });

  it('the same value registered under two names yields the same digest with different labels', () => {
    const registry = registryWith({ ONE: SECRET });
    const r = createRedactor({ mode: 'replace', registry, hmacKey: KEY_A });
    const digestOf = (token: string): string => token.split(':')[2]!.replace(']', '');
    assert.equal(digestOf(r.token('ONE', SECRET)), digestOf(r.token('TWO', SECRET)));
  });

  it('the token is identical whether the secret arrives via a string, a value tree, or an error', () => {
    const r = createRedactor({ mode: 'replace', registry: registryWith(), hmacKey: KEY_A });
    const token = r.token('FIXTURE_PASSWORD', SECRET);
    assert.equal(r.redactString(SECRET), token);
    assert.deepEqual(r.redactValue({ nested: [{ pw: SECRET }] }), { nested: [{ pw: token }] });
    assert.equal(r.redactError(new Error(`bad ${SECRET}`)).message, `bad ${token}`);
  });
});

/* ------------------------------------------------------------------ */
/* Irreversibility                                                      */
/* ------------------------------------------------------------------ */

describe('redaction · irreversibility of replace mode', () => {
  const r = createRedactor({ mode: 'replace', registry: registryWith({ FIXTURE_PASSWORD: SECRET, OTHER }), hmacKey: KEY_A });

  it('no substring of the secret of length ≥ 4 survives in the token or the redacted text', () => {
    const redacted = r.redactString(`before ${SECRET} middle ${OTHER} after`);
    for (const secret of [SECRET, OTHER]) {
      for (let i = 0; i + 4 <= secret.length; i += 1) {
        assert.ok(!redacted.includes(secret.slice(i, i + 4)), `fragment ${secret.slice(i, i + 4)} leaked`);
      }
    }
    assert.equal(redacted, `before ${r.token('FIXTURE_PASSWORD', SECRET)} middle ${r.token('OTHER', OTHER)} after`);
  });

  it('token length is independent of the secret length', () => {
    const short = registryWith({ S: 'x'.repeat(MIN_REGISTERED_VALUE_LENGTH) });
    const long = registryWith({ L: 'y'.repeat(400) });
    const rs = createRedactor({ mode: 'replace', registry: short, hmacKey: KEY_A });
    const rl = createRedactor({ mode: 'replace', registry: long, hmacKey: KEY_A });
    assert.equal(rs.token('S', 'x'.repeat(MIN_REGISTERED_VALUE_LENGTH)).length, rl.token('S', 'y'.repeat(400)).length);
  });

  it('the digest is a truncated keyed HMAC: the key confirms a guess, it never recovers the value', () => {
    const token = r.token('FIXTURE_PASSWORD', SECRET);
    // A holder of the key can only confirm by recomputing over a GUESS.
    assert.equal(r.token('FIXTURE_PASSWORD', SECRET), token);
    assert.notEqual(r.token('FIXTURE_PASSWORD', `${SECRET}!`), token);
    // The token does not encode length, charset, or any prefix of the value.
    assert.equal(token.length, '[REDACTED:FIXTURE_PASSWORD:]'.length + 16);
  });

  it('a secret containing another secret is replaced whole — no hole is punched by the shorter one', () => {
    const inner = 'inner-secret-value-1234';
    const outer = `wrap-${inner}-wrap`;
    const registry = registryWith({ INNER: inner, OUTER: outer });
    const rr = createRedactor({ mode: 'replace', registry, hmacKey: KEY_A });
    assert.equal(rr.redactString(`x ${outer} y ${inner} z`), `x ${rr.token('OUTER', outer)} y ${rr.token('INNER', inner)} z`);
  });

  it('`obfuscate` is declared and NOT wired: construction throws', () => {
    assert.deepEqual([...REDACTION_MODES], ['replace', 'obfuscate']);
    assert.deepEqual([...WIRED_REDACTION_MODES], ['replace']);
    assert.throws(() => createRedactor({ mode: 'obfuscate', registry: registryWith(), hmacKey: KEY_A }), /not wired/);
  });

  it('a key shorter than 32 bytes is refused', () => {
    assert.throws(() => createRedactor({ mode: 'replace', registry: registryWith(), hmacKey: Buffer.alloc(MIN_HMAC_KEY_BYTES - 1) }), /at least 32/);
  });
});

/* ------------------------------------------------------------------ */
/* Error-path redaction                                                 */
/* ------------------------------------------------------------------ */

describe('redaction · error paths are write paths', () => {
  async function readyBoundary(): Promise<RedactionBoundary> {
    const boundary = await RedactionBoundary.open({ registry: registryWith(), keyCustody: new InMemoryHmacKeyCustody(KEY_A) });
    assert.equal(boundary.ready, true);
    return boundary;
  }

  it('the harness error path redacts message, stack, code, and cause', async () => {
    const boundary = await readyBoundary();
    const err: string[] = [];
    const sink = boundary.harnessLogSink({ out: () => undefined, err: (t) => err.push(t) });
    const cause = new Error(`root ${SECRET}`);
    const failure = Object.assign(new Error(`connect failed for ${SECRET}`), { code: `E_${SECRET}`, cause });
    const redacted = await sink.error(failure);
    const token = boundary.require().token('FIXTURE_PASSWORD', SECRET);
    assert.equal(redacted.message, `connect failed for ${token}`);
    assert.equal(redacted.code, `E_${token}`);
    assert.equal(redacted.cause?.message, `root ${token}`);
    assert.ok(redacted.stack === null || !redacted.stack.includes(SECRET));
    assert.equal(err.length, 1);
    assert.ok(!err[0]!.includes(SECRET));
    assert.ok(err[0]!.includes(token));
  });

  it('the harness plain-text stderr path (v0.1) redacts when ready and refuses before the inner call when not', async () => {
    const ready = await readyBoundary();
    const err: string[] = [];
    const sink = ready.harnessLogSink({ out: () => undefined, err: (t) => err.push(t) });
    await sink.err(`restart failed for ${SECRET}\n`);
    const token = ready.require().token('FIXTURE_PASSWORD', SECRET);
    assert.deepEqual(err, [`restart failed for ${token}\n`]);

    const refused = await RedactionBoundary.open({ registry: registryWith(), keyCustody: new InMemoryHmacKeyCustody(null) });
    let innerCalls = 0;
    const refusing = refused.harnessLogSink({ out: () => { innerCalls += 1; }, err: () => { innerCalls += 1; } });
    await assert.rejects(
      () => refusing.err(SECRET),
      (error: unknown) => error instanceof RedactionRefusedError && error.code === 'key_absent',
    );
    assert.equal(innerCalls, 0, 'the inner err stream was never invoked');
  });

  it('an inner writer that throws with the secret in its message surfaces a REDACTED SinkWriteError', async () => {
    const boundary = await readyBoundary();
    const sink = boundary.journalAppendSink(async () => {
      throw new Error(`ENOSPC while writing ${SECRET}`);
    });
    await assert.rejects(
      () => sink.append({ ok: true }),
      (error: unknown) => {
        assert.ok(error instanceof SinkWriteError);
        assert.ok(!error.message.includes(SECRET));
        assert.ok(!error.redacted.message.includes(SECRET));
        assert.ok(error.redacted.stack === null || !error.redacted.stack.includes(SECRET));
        return true;
      },
    );
  });

  it('non-Error throwables are redacted too', async () => {
    const boundary = await readyBoundary();
    const err: string[] = [];
    const sink = boundary.harnessLogSink({ out: () => undefined, err: (t) => err.push(t) });
    const redacted = await sink.error(`raw string ${SECRET}`);
    assert.equal(redacted.name, 'NonError');
    assert.ok(!redacted.message.includes(SECRET));
    const obj = await sink.error({ detail: SECRET });
    assert.ok(!obj.message.includes(SECRET));
  });
});

/* ------------------------------------------------------------------ */
/* Fail-closed writers                                                  */
/* ------------------------------------------------------------------ */

describe('redaction · fail-closed writers', () => {
  async function assertAllSinksRefuse(boundary: RedactionBoundary, code: string): Promise<void> {
    assert.equal(boundary.ready, false);
    let innerCalls = 0;
    const journal = boundary.journalAppendSink(async () => {
      innerCalls += 1;
    });
    const evidence = boundary.evidenceBundleWriter(async () => {
      innerCalls += 1;
    });
    const harness = boundary.harnessLogSink({ out: () => { innerCalls += 1; }, err: () => { innerCalls += 1; } });
    for (const attempt of [
      () => journal.append({ pw: SECRET }),
      () => evidence.write('/tmp/x.json', { pw: SECRET }),
      () => harness.log(SECRET),
      () => harness.error(new Error(SECRET)),
    ]) {
      await assert.rejects(attempt, (error: unknown) => {
        assert.ok(error instanceof RedactionRefusedError, `expected RedactionRefusedError, got ${String(error)}`);
        assert.equal(error.code, code);
        return true;
      });
    }
    assert.equal(innerCalls, 0, 'the inner writer was never invoked');
  }

  it('registry unloadable (a refused env entry) → every write refused, inner never called', async () => {
    const registry = new SecretRegistry();
    const report = registry.loadFromEnv({ SHORT_TOKEN: 'abc', LONG_TOKEN: 'x'.repeat(20) });
    assert.deepEqual(report.registered, ['LONG_TOKEN']);
    assert.deepEqual(report.refused, [{ name: 'SHORT_TOKEN', reason: 'value_too_short' }]);
    assert.equal(registry.isLoadable(), false);
    const boundary = await RedactionBoundary.open({ registry, keyCustody: new InMemoryHmacKeyCustody(KEY_A) });
    await assertAllSinksRefuse(boundary, 'registry_unloadable');
  });

  it('key absent → refused; key unavailable → refused; custody throwing → refused', async () => {
    await assertAllSinksRefuse(await RedactionBoundary.open({ registry: registryWith(), keyCustody: new InMemoryHmacKeyCustody(null) }), 'key_absent');
    await assertAllSinksRefuse(await RedactionBoundary.open({ registry: registryWith(), keyCustody: new UnavailableHmacKeyCustody() }), 'key_unavailable');
    await assertAllSinksRefuse(
      await RedactionBoundary.open({ registry: registryWith(), keyCustody: { load: () => Promise.reject(new Error('keychain locked')) } }),
      'key_unavailable',
    );
  });

  it('key too short → refused at the redactor; obfuscate mode → refused as not wired', async () => {
    await assertAllSinksRefuse(
      await RedactionBoundary.open({ registry: registryWith(), keyCustody: new InMemoryHmacKeyCustody(Buffer.alloc(16, 1)) }),
      'redactor_unbuildable',
    );
    await assertAllSinksRefuse(
      await RedactionBoundary.open({ registry: registryWith(), keyCustody: new InMemoryHmacKeyCustody(KEY_A), mode: 'obfuscate' }),
      'mode_not_wired',
    );
  });

  it('a ready boundary writes through every sink with the secret replaced', async () => {
    const boundary = await RedactionBoundary.open({ registry: registryWith(), keyCustody: new InMemoryHmacKeyCustody(KEY_A) });
    const token = boundary.require().token('FIXTURE_PASSWORD', SECRET);
    const lines: string[] = [];
    const files: [string, string][] = [];
    const out: string[] = [];
    await boundary.journalAppendSink(async (line) => { lines.push(line); }).append({ event: 'x', detail: { pw: SECRET } });
    await boundary.evidenceBundleWriter(async (path, content) => { files.push([path, content]); }).write(`/evidence/${SECRET}.json`, { runs: [{ env: `DATABASE_URL=postgres://u:${SECRET}@h/db` }] });
    await boundary.harnessLogSink({ out: (t) => out.push(t), err: () => undefined }).log(`READY pw=${SECRET}`);
    assert.equal(lines[0], `${JSON.stringify({ event: 'x', detail: { pw: token } })}\n`);
    assert.equal(files[0]![0], `/evidence/${token}.json`);
    assert.ok(!files[0]![1].includes(SECRET));
    assert.ok(files[0]![1].includes(token));
    assert.equal(out[0], `READY pw=${token}`);
  });
});

/* ------------------------------------------------------------------ */
/* Registry rules                                                       */
/* ------------------------------------------------------------------ */

describe('redaction · SecretRegistry', () => {
  it('registers a generated fixture password atomically and refuses (and drops) one under 16 characters', () => {
    const registry = new SecretRegistry();
    const value = generateFixturePassword(registry, 'FIXTURE_PW', { randomBytes: (n) => Buffer.alloc(n, 7) });
    assert.ok(value.length >= MIN_FIXTURE_PASSWORD_LENGTH);
    assert.equal(registry.has('FIXTURE_PW'), true);
    assert.equal(generateFixturePassword(new SecretRegistry(), 'X', { randomBytes: (n) => Buffer.alloc(n, 7) }), value, 'deterministic under injected randomness');

    const short = new SecretRegistry();
    assert.throws(() => generateFixturePassword(short, 'TOO_SHORT', { bytes: 6, randomBytes: (n) => Buffer.alloc(n, 1) }), (e: unknown) => e instanceof SecretRegistryError && e.code === 'fixture_password_too_short');
    assert.equal(short.size(), 0, 'the refused value was not registered');
    assert.throws(() => short.registerGenerated('P', 'fifteen-chars-x'), /at least 16/);
  });

  it('env-name heuristics match credential-shaped names only, and ignore is explicit and reported', () => {
    for (const name of ['GITHUB_TOKEN', 'DB_PASSWORD', 'anthropic_api_key', 'DATABASE_URL', 'CLIENT_SECRET', 'AWS_ACCESS_KEY_ID', 'MY_AUTH']) {
      assert.equal(looksLikeSecretName(name), true, name);
    }
    for (const name of ['PATH', 'HOME', 'NODE_ENV', 'TOKENIZER_MODEL', 'AUTHOR', 'PASSAGE_COUNT']) {
      assert.equal(looksLikeSecretName(name), false, name);
    }
    const registry = new SecretRegistry();
    const report = registry.loadFromEnv(
      { GITHUB_TOKEN: 'ghp_' + 'a'.repeat(36), EMPTY_TOKEN: '', HOME: '/root', DEBUG_TOKEN: '1' },
      { ignore: ['DEBUG_TOKEN'] },
    );
    assert.deepEqual(report.registered, ['GITHUB_TOKEN']);
    assert.deepEqual(report.ignored, ['DEBUG_TOKEN', 'EMPTY_TOKEN']);
    assert.deepEqual(report.refused, []);
    assert.equal(registry.isLoadable(), true);
  });

  it('a manifest names secrets and shapes; one that carries a value is refused whole', () => {
    const registry = new SecretRegistry();
    const report = registry.loadFromManifest(
      { version: 1, entries: [{ kind: 'env', name: 'FIXTURE_PASSWORD' }, { kind: 'shape', name: 'pem-private-key' }, { kind: 'env', name: 'UNSET_TOKEN' }] },
      { FIXTURE_PASSWORD: SECRET },
    );
    assert.deepEqual(report.registered, ['FIXTURE_PASSWORD', 'shape:pem-private-key']);
    assert.deepEqual(report.refused, [{ name: 'UNSET_TOKEN', reason: 'named_but_unset' }]);
    assert.equal(registry.isLoadable(), false, 'a manifest-named secret that is unset makes the registry unloadable');

    for (const bad of [
      { version: 1, entries: [{ kind: 'env', name: 'X', value: SECRET }] },
      { version: 1, entries: [{ kind: 'env', name: 'X', password: SECRET }] },
    ]) {
      assert.throws(() => new SecretRegistry().loadFromManifest(bad, {}), (e: unknown) => e instanceof SecretRegistryError && e.code === 'manifest_carries_value');
    }
    assert.throws(() => new SecretRegistry().loadFromManifest({ version: 2, entries: [] }, {}), /version: 1/);
    assert.throws(() => new SecretRegistry().loadFromManifest({ version: 1, entries: [{ kind: 'shape', name: 'nope' }] }, {}), /no built-in shape/);
  });

  it('refuses duplicates, empty names, and short values', () => {
    const registry = registryWith();
    assert.throws(() => registry.register('FIXTURE_PASSWORD', OTHER, 'env'), /already registered/);
    assert.throws(() => registry.register('', OTHER, 'env'), /non-empty name/);
    assert.throws(() => registry.register('X', 'short', 'env'), /refused, not skipped/);
  });

  it('built-in shapes catch a token glued after an underscore or hyphen', () => {
    // Regression. Every prefixed shape was anchored on `\b`, which does not
    // fire between `_` and a letter, so a token carrying a namespace prefix
    // — `cmd_ghp_...`, `origin_sk-...` — passed the boundary untouched.
    // The mid-run cases must still NOT match: the guards are separators, not
    // a licence to match inside a longer alphanumeric run.
    const registry = new SecretRegistry();
    for (const name of BUILTIN_SHAPE_NAMES) registry.enableShape(name);
    const r = createRedactor({ mode: 'replace', registry, hmacKey: KEY_A });

    const samples: readonly (readonly [string, string])[] = [
      ['github-pat', 'ghp_' + 'Z'.repeat(36)],
      ['openai-style-sk', 'sk-' + 'q'.repeat(24)],
      ['aws-access-key-id', 'AKIA' + 'A'.repeat(16)],
      ['slack-token', 'xoxb-' + 'a'.repeat(14)],
      ['jwt', 'eyJ' + 'a'.repeat(10) + '.eyJ' + 'b'.repeat(10) + '.' + 'c'.repeat(12)],
    ];

    for (const [shape, value] of samples) {
      for (const prefix of ['', 'cmd_', 'origin_', 'run-']) {
        const redacted = r.redactString(`${prefix}${value}`);
        assert.ok(
          !redacted.includes(value),
          `${shape} survived redaction when written as ${prefix}<token>`,
        );
        assert.match(redacted, new RegExp(`\\[REDACTED:shape:${shape}:[0-9a-f]{16}\\]`));
      }
      // Glued to alphanumerics it is part of a longer identifier, not a token.
      assert.equal(r.redactString(`XY${value}`), `XY${value}`, `${shape} matched mid-identifier`);
    }
  });

  it('built-in shapes are opt-in and redact by shape with a keyed digest', () => {
    assert.deepEqual([...BUILTIN_SHAPE_NAMES], ['pem-private-key', 'openai-style-sk', 'github-pat', 'aws-access-key-id', 'slack-token', 'jwt']);
    const registry = new SecretRegistry();
    registry.enableShape('github-pat');
    registry.enableShape('pem-private-key');
    const r = createRedactor({ mode: 'replace', registry, hmacKey: KEY_A });
    const pat = 'ghp_' + 'Z'.repeat(36);
    // Assembled at runtime for the same reason as SECRET above: the scanner's
    // private-key rule would read a literal PEM block in this file as a leak.
    const pem = ['-----BEGIN', 'PRIVATE KEY-----', 'MIIabc', '-----END', 'PRIVATE KEY-----'].join('\n').replace('BEGIN\n', 'BEGIN ').replace('END\n', 'END ');
    const redacted = r.redactString(`token ${pat} and ${pem} and sk-notenabled${'k'.repeat(20)}`);
    assert.match(redacted, /\[REDACTED:shape:github-pat:[0-9a-f]{16}\]/);
    assert.match(redacted, /\[REDACTED:shape:pem-private-key:[0-9a-f]{16}\]/);
    assert.ok(!redacted.includes(pat) && !redacted.includes('MIIabc'));
    assert.ok(redacted.includes('sk-notenabled'), 'a shape that was not enabled is not applied');
  });
});

/* ------------------------------------------------------------------ */
/* Key custody                                                          */
/* ------------------------------------------------------------------ */

describe('redaction · Keychain key custody is read-only and separate from daemon custody', () => {
  class RecordingRunner implements CommandRunner {
    readonly calls: string[][] = [];
    constructor(private readonly result: CommandResult) {}
    run(args: readonly string[]): Promise<CommandResult> {
      this.calls.push([...args]);
      return Promise.resolve(this.result);
    }
  }

  it('names its own custody item and builds only a find-generic-password argv', async () => {
    assert.equal(REDACTION_KEYCHAIN_SERVICE, 'mad.redaction.hmac');
    assert.equal(REDACTION_KEYCHAIN_ACCOUNT, 'hmac-v1');
    assert.notEqual(REDACTION_KEYCHAIN_SERVICE, 'com.madventures.buildroom.gateway');
    const runner = new RecordingRunner({ code: 0, stdout: `${'ab'.repeat(32)}\n`, stderr: '' });
    const custody = new KeychainHmacKeyCustody(runner);
    const load = await custody.load();
    assert.equal(load.kind, 'loaded');
    assert.deepEqual(runner.calls, [['find-generic-password', '-a', 'hmac-v1', '-s', 'mad.redaction.hmac', '-w']]);
    assert.ok(runner.calls.every((argv) => !argv.includes('add-generic-password') && !argv.includes('delete-generic-password') && !argv.includes('-U')));
  });

  it('exit 44 → absent; other non-zero → unavailable; non-hex or short → unavailable', async () => {
    assert.equal((await new KeychainHmacKeyCustody(new RecordingRunner({ code: 44, stdout: '', stderr: 'not found' })).load()).kind, 'absent');
    assert.equal((await new KeychainHmacKeyCustody(new RecordingRunner({ code: 36, stdout: '', stderr: 'locked' })).load()).kind, 'unavailable');
    assert.equal((await new KeychainHmacKeyCustody(new RecordingRunner({ code: 0, stdout: 'not-hex!', stderr: '' })).load()).kind, 'unavailable');
    assert.equal((await new KeychainHmacKeyCustody(new RecordingRunner({ code: 0, stdout: 'abcd', stderr: '' })).load()).kind, 'unavailable');
    assert.equal((await new KeychainHmacKeyCustody({ run: () => Promise.reject(new Error('no security binary')) }).load()).kind, 'unavailable');
  });
});

/* ------------------------------------------------------------------ */
/* Static surface                                                       */
/* ------------------------------------------------------------------ */

describe('redaction · static surface', () => {
  function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...tsFiles(full));
      else if (entry.name.endsWith('.ts')) out.push(full);
    }
    return out;
  }
  function specifiers(source: string): string[] {
    return [...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!);
  }

  it('imports no gateway-daemon module, no fs/net/http, reads no process.env; child_process only in key-custody', () => {
    const envRead = 'pro' + 'cess.env';
    for (const file of tsFiles(PACKAGE_SRC)) {
      const source = readFileSync(file, 'utf8');
      const name = relative(REPO_ROOT, file);
      for (const specifier of specifiers(source)) {
        assert.ok(!specifier.includes('gateway-daemon'), `${name} imports the daemon`);
        assert.ok(!/^node:(fs|net|http|https|tls|dgram|worker_threads)/.test(specifier), `${name} imports ${specifier}`);
        if (specifier === 'node:child_process') {
          assert.ok(name.endsWith('key-custody.ts'), `${name} spawns processes`);
        }
        assert.ok(specifier.startsWith('.') || specifier.startsWith('node:'), `${name} imports non-relative ${specifier}`);
      }
      assert.ok(!source.includes(envRead), `${name} reads the environment`);
    }
  });

  it('never writes to the Keychain: no add/delete/-U verbs appear in the custody module', () => {
    const source = readFileSync(join(PACKAGE_SRC, 'key-custody.ts'), 'utf8');
    const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!withoutComments.includes("'add-generic-password'"));
    assert.ok(!withoutComments.includes("'delete-generic-password'"));
    assert.ok(!withoutComments.includes("'-U'"));
  });

  it('carries no package manifest — not a workspace member, no lockfile change', () => {
    assert.throws(() => readFileSync(join(REPO_ROOT, 'packages', 'redaction', 'package.json')));
  });
});

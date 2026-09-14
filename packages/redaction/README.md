# redaction — the secret boundary (v0)

**Lane B of the OMP→MAD Evolve Pack v0** (Founder act of 2026-09-13,
"mechanism steal, not clone"). Status: controlled/fixture-honest work under
the AE-01 boundaries — NOT production, NOT live occupancy, NO provider
execution, NO Phase 2 claim. Merge is a separate Founder act.

## What it is

A control layer at the **writers**. `scripts/secret-scan.sh` (gitleaks)
stays the verification layer; neither is the sole control.

| piece | file | rule |
|---|---|---|
| `SecretRegistry` | `src/registry.ts` | knows what is secret: env-name heuristics over a caller-supplied env map, a manifest that names (never carries) secrets and enables built-in shapes, and generation-time registration |
| `generateFixturePassword` | `src/registry.ts` | mints and registers in one call; refuses and discards anything under 16 characters |
| `createRedactor` | `src/redactor.ts` | `replace` mode: `[REDACTED:<name>:<hmac16>]`, deterministic under the key, one-way. `obfuscate` is declared and **not wired** — construction throws |
| `KeychainHmacKeyCustody` | `src/key-custody.ts` | read-only custody of the HMAC key in its own item, service `mad.redaction.hmac`, account `hmac-v1` |
| `RedactionBoundary` + sinks | `src/sinks.ts` | journal append, evidence bundle, harness log + error paths — writers, not call sites; refuse every write when the boundary is not ready |

## Fail-closed, by construction

`RedactionBoundary.open()` never throws; it returns `ready` or `refused`
with a code (`registry_unloadable`, `key_absent`, `key_unavailable`,
`mode_not_wired`, `redactor_unbuildable`). Every sink built over a refused
boundary throws `RedactionRefusedError` before touching its inner writer.
A registry that refused any entry (a credential-shaped env var with a value
under 8 characters, a manifest-named secret that is unset) is not loadable
until the entry is explicitly ignored by name, which the load report shows.

Errors are write paths too: the harness error sink flattens and redacts
message, stack, code, and cause; an inner writer that throws is re-thrown as
`SinkWriteError` carrying only redacted text.

## Key custody — separate item, never self-provisioned

The key is read from Keychain with exactly
`find-generic-password -a hmac-v1 -s mad.redaction.hmac -w` (hex, ≥ 32
bytes). This package never runs `add-`, `delete-`, or `-U`, and it does not
import or modify `packages/gateway-daemon/**` custody or signing. Creating
the item is a custody act performed by the Founder or under a Founder
authorization; until it exists, the boundary refuses to write. Fixture
custody classes (`InMemoryHmacKeyCustody`, `UnavailableHmacKeyCustody`)
exist for tests and controlled fixtures only.

## Not wired (deliberate, recorded)

The sinks are the writers; they are **not** yet installed under the
run-harness evidence CLI, the (still unimplemented) journal store, or the
AE-01 fixture runner. Installing them without a provisioned key would make
those paths refuse every write — a live behaviour change outside this act.
The next step needs a Founder decision on key provisioning (Keychain on the
darwin gateway host; some non-Keychain source or a documented refusal for
the ubuntu CI and Railway runtimes). See the lane handoff.

## Known limits (v0)

- Exact-substring and enabled-shape matching only. Encoded forms (base64,
  URL-encoded, split across lines) are not caught; the verification layer
  still applies.
- Object keys are redacted as strings; a secret used as a Map key is
  stringified first.

## Evolved from OMP vs invented here

- **Evolved (mechanism named in the act):** a secret registry fed by
  env-name heuristics, a manifest, and built-in shapes; `replace` and
  `obfuscate` modes; redaction at the sinks. No OMP code was read or
  vendored; the mechanism was taken from its description in the act.
- **Invented here:** the keyed, truncated HMAC token with a stable name
  label; the loadability rule (refusals block the boundary until ignored by
  name); generation-time registration with the 16-character floor; the
  boundary/sink split with fail-closed writers and redacted error re-throw;
  the separate read-only Keychain custody item.

## Verify

```sh
npm run build && node --test dist/test/redaction.test.js
```

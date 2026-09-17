# Serialization (a) — Normalized Command Envelope v1

Spec id: `BRJ:a:1`

`envelope_digest` = SHA-256 over `encodeEnvelope()` bytes.

Fields (tagged, length-prefixed, presence-explicit):

1. `envelope_version` (required) — `'1'`
2. `command_kind` (required) — non-empty
3. `argv` (required) — ordered string array; may be empty; already redacted
4. `target_repository` (optional)
5. `scope_ref` (optional)

Credential material must never appear in argv (see `redact.ts`). Encoding
changes require a new spec version (non-retroactive).

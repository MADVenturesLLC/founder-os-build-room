# Serialization (c-min) — Minimal Command Event Row v1

Spec id: `BRJ:c-min:1`

Pin-tree foundation subset of contract §6.2(c). Sufficient for §7.1 chain
proofs without porting the full post-pin (c) schema.

Fields: `record_class`, `seq`, `command_id`, `event_type`, `actor_id`,
`role_id`, `envelope_digest`, `authorization_ref`, `recorded_at`,
optional `envelope_canonical_hex`.

`chain_hash` = SHA-256( prior_chain_hash_ascii_hex64 || row_canonical_bytes ).
Genesis prior = 64 ASCII `0` characters.

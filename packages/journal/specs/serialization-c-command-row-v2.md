# Serialization contract (c) — command-class event row, version 2

Status: implementation serialization specification under
`docs/command-journal-contract.md` v0.18 §6.2, ratified through the pull
request that carries it (FOUNDER-ACT-20261028-BR-PLANNER-JOURNAL-FIELDS,
Amendment 1 B3). Spec identifier, fixed inside the canonical bytes:
`BRJ:c:2`. This document creates no governance authority; on any
conflict the command-journal contract governs.

Implementation: `encodeCommandEventRowV2` in
`packages/journal/src/event-row.ts`, `decodeCommandEventRowV2` and the
dispatch by spec identifier in `packages/journal/src/decode.ts`, chain
framing in `packages/journal/src/chain.ts`. Golden vectors:
`packages/journal/vectors/chain-v2.json` (the cutover chain), generated
by the implementation, never hand-authored. Version 1
(`serialization-c-command-row.md`, `BRJ:c:1`) and its vectors in
`packages/journal/vectors/chain.json` are unchanged.

## Purpose

Version 2 adds the two fields Amendment 5 B1 of
FOUNDER-RULING-20261026-BR-PLANNER-EXECUTOR requires the journal to hold
for a command whose work the executor sent: the model the executor's init
event named, and the provider's conversation id from that event. Under
FOUNDER-ACT-20261028-BR-PLANNER-JOURNAL-FIELDS B1 they are carried on the
command's `dispatched` event. Nothing else in version 1 changes.

## Canonical byte sequence

`lp("BRJ:c:2")`, followed by fields `0x01` to `0x1a` exactly as version 1
defines them, in version 1's order, with version 1's byte primitives,
event-type matrix, canonical `seq` and canonical timestamp. Then these two
fields, in this order:

| Tag | Field | Kind | Presence |
| --- | --- | --- | --- |
| `0x1b` | `init_model` | string | `dispatched` only; present together with `0x1c` or absent together with it; non-empty |
| `0x1c` | `provider_conversation_id` | string | `dispatched` only; present together with `0x1b` or absent together with it; non-empty |

Both fields appear in every version 2 canonical form, present or absent,
so the grammar stays positional and total. A version 2 row that carries
neither field ends `0x1b 0x00 0x1c 0x00`. Its bytes differ from the
version 1 bytes of the same row in the spec identifier and in those four
bytes, so a row is always read back under the version that wrote it.

## Event-type matrix

Version 1's matrix, with one change: `dispatched` also allows
`init_model` and `provider_conversation_id`, both or neither. Every other
event type carries neither field. Neither field has a version 1 form: a
row that carries either one cannot be encoded under `BRJ:c:1`.

The rule of when the fields must be present is not a byte rule. Under
FOUNDER-ACT-20261028-BR-PLANNER-JOURNAL-FIELDS B2, the control plane
requires both on the `dispatched` event of a command on the agy lane
(`antigravity:google`, Gateway 1880c12d), and refuses an accepted answer
that lacks either or carries an empty or overlong one. On every other
lane the control plane journals the fields exactly when the Gateway's
answer carries them, and refuses nothing for their absence (the act's
Amendment 2 B2; its B3 ratified this correction).

## Reading a chain of both versions

Under Amendment 1 B2:

- A reader selects each row's spec by the spec identifier its bytes begin
  with (`decodeJournalRow`, `journalRowSpec`), never by which fields are
  present.
- A chain's command rows move from `BRJ:c:1` to `BRJ:c:2` once and never
  back. A `BRJ:c:1` command row after a `BRJ:c:2` command row fails
  verification (`commandSpecOrderDefect`). Decision rows (`BRJ:d:1`) are
  not counted, and may sit anywhere on the chain.
- Existing rows are never rewritten.

The framing is version 1's: `chain_hash` is SHA-256 over the prior row's
chain hash as 64 lowercase-hex ASCII bytes, followed by the row's
canonical bytes.

## Non-retroactivity

Any change to the byte grammar above requires a new spec version with a
new spec identifier; golden vectors bind to the version that generated
them.

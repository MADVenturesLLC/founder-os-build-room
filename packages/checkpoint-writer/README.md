# checkpoint-writer — early-checkpoint writer + budgeted rebuild (v0)

Lane 2 of the Founder Act **"MiMo→MAD Long-Horizon Core v0"** (2026-09-15):
unbounded logical sessions via cycles. Early structured checkpoints written
by an **independent writer seat**; rebuild injects budgeted state. Evolves
MiMo's early-checkpoint / notes.md mechanism, MAD-shaped — no MiMo or
OpenCode source was available or vendored (see the handoff under
`docs/planning/mimo-evolve-v0/` for the evolved-vs-invented statement).

**Library-only.** Not wired to any live daemon session path. The writer
seat is an injected function; this package never contacts a provider.

Package pattern: tsconfig-include source package like
`packages/seat-registry` / `packages/quarantine-advisor` — no
`package.json`, no lockfile registration. (T18 sha-pins
`package-lock.json`; registering this workspace would change the lockfile,
and the pin update is a separately-authorized change outside this lane —
recorded in the handoff, not decided here.)

## Pieces

- `checkpoint/v1` IR (`src/schema.ts`) — the act's eleven fixed fields plus
  a minimal envelope. Hand-rolled strict validation: unknown field, wrong
  type, or wrong version is a schema reject.
- Trigger policy (`src/triggers.ts`) — incremental writer fires at ~20% /
  45% / 70% of the configured context budget (configurable); rebuild arms
  near the ceiling (default 90%). Each threshold fires once per cycle.
- Notes scratch (`src/notes.ts`) — the main worker's only write channel:
  append-only JSONL. The writer promotes notes into structured fields at
  checkpoint time and clears the scratch only after the checkpoint is
  durably persisted.
- Writer seat + store (`src/writer.ts`, `src/store.ts`) — the seat has its
  own identity (`checkpoint-writer`, package-local, not a Seat Registry V1
  seat) and its own token budget. **Single-writer per checkpoint file is
  code-enforced**: exclusive lock + temp-file/atomic rename; a second
  writer fails closed with `SingleWriterError`. Every persisted checkpoint
  records a sha256 that is re-read and verified on write.
- Rebuild assembler (`src/assemble.ts`) — ordered sections (task_tree →
  latest checkpoint → verbatim directives → provenance-tagged memory →
  notes → path index → next-action reminder) under hard per-section token
  budgets. Over-budget sections truncate/omit per an explicit deterministic
  policy; total output ≤ budget is structural and asserted. Token counting
  is the documented `ceil(chars/4)` heuristic.

## Out of scope (v0, per the act)

Project MEMORY.md auto-Dream maintenance; Distill→auto skill creation;
SQLite FTS (v0 = files + hashes); live daemon session rebuild in
production occupancy.

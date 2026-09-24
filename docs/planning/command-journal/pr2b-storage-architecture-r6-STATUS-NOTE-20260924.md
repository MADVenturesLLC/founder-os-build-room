# Status note on `pr2b-storage-architecture-r6.md` (2026-09-24)

`pr2b-storage-architecture-r6.md` is hash-pinned (SHA-256
`658daa9c0194d5f56d7506fb8ade05d24d413cd08b106a067ff9100ce5815954`) by the
custody records and plan addenda in this directory, so its bytes are not
edited. This sibling note records what its header no longer describes.

The r6 header reads: "Status: PROPOSED — design phase closed, awaiting one
independent architecture review bound to this artifact's SHA-256. No
implementation authority exists." That was the state when r6 was filed.
Since then, on `main`:

- **Tranche A** — the staged schema preflight that replaced boot-time
  migration — merged as PR #27 (`f21693e`, 2026-09-13).
- **Tranche B** — the journal database authority split: migration
  `0006_command_journal_authority_split`, the admin migration runner
  (`packages/control-plane/src/migrate-cli.ts`) and its proofs — merged as
  PR #54 (`ddbcbb3`, 2026-09-15). The Founder authorization and its custody
  receipts for Gate 3 Tranche B are filed under `custody/`.

So r6's design is implemented through Tranche B. What r6 still does not do,
and this note does not change: it authorizes nothing by itself, the runtime
login and the one-shot admin job it describes are provisioning and
deployment acts that need their own Founder authorization where not already
given, and no HTTP journal route exists in `packages/control-plane` at the
time of writing.

Every path named above exists at the base of the commit that wrote this note.

# Status note on `AE-01-A2-FINAL-IMPLEMENTATION-PLAN.md` (2026-09-24)

The plan's bytes are left unchanged as provenance. This note records how the
merged implementation differs from the plan's own constraints, because a
reader of the plan alone would take its constraints as the record of what
landed.

**What the plan says.** §5: "The implementation MUST NOT edit
`packages/gateway-daemon/**` or `packages/gateway-protocol/**`." §13 lists the
expected changed files as exactly three: `package.json`,
`test/support/phase1-acceptance-gateway.ts` and
`test/room-runtime-phase1-acceptance-gateway.test.ts`.

**What merged.** PR #30 (`736b12b`, 2026-09-13, "enable controlled Phase 1
acceptance with live IPC delivery") changed five files: the three above plus
`packages/gateway-daemon/src/ipc.ts` (+585 / −) and
`packages/gateway-daemon/src/room-runtime.ts`. PR #42 (`9e5d799`, 2026-09-15)
followed with a fix gating fixture output on attached viewers.

**Why, per the PR's own record.** The PR body distinguishes a "frozen
original candidate" (`a721b7a`, which honored the plan's constraints) from a
"corrected candidate" (`2b1e5b6`) that also corrected two inherited Phase 1
gateway behaviors "independently proven to block acceptance": passive
post-attachment live IPC delivery, and connected-viewer shutdown. The body
records an independent review verdict of `PASS` at a named SHA-256 and states
that merge required a separate Founder act; GitHub records the merge by the
repository owner account.

**What this note does not claim.** It does not rule whether the deviation was
authorized in a FounderOS record; that record is outside this repository. It
records only that the plan and the merge differ, where the difference is, and
where the PR explains it. Two other stale sentences about this work were
corrected the same day: `AGENTS.md` and `packages/spend-broker/README.md` no
longer describe the daemon as the frozen candidate.

Every path named above exists at the base of the commit that wrote this note.

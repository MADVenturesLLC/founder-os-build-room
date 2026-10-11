# CUSTODY RECEIPT — two enrolled Gateways: the harness and grant act (2026-10-10)

**This receipt records the landing of one instrument, the Founder's act of
2026-10-10 that rules how the two-Gateways implementation pull request is
tested and what it may grant, in the same pull request as that implementation.
It records how the act was issued and what the pull request does under it. It
authorizes nothing: no merge, no migration apply, no run of DB Admin Migration,
no deploy, redeploy or rollback, no enrollment, revocation or pairing-code
mint, no change to any Railway variable, Neon role, password or secret, and no
change to the CI workflow, the branch ruleset or the required checks.** The
act's own text governs.

The implementation itself is authorized by `FOUNDER-ACT-20261010-TWO-GATEWAYS`
B6, filed in FounderOS as an amendment to `DEC-20260818-01` (FounderOS PR #370,
merge commit `dc8b01c264799e2f9821637d4f2f1d8a636f59d8`), with its
clarification of the same day.

## The instrument

The file is the Founder's comment on Build Room PR #108, byte for byte, with
its CRLF line endings normalized to LF and one final LF added; it is
byte-identical to the sign-ready text the builder delivered.

| Field | Value |
|---|---|
| Path | `docs/planning/command-journal/custody/FOUNDER-AUTHORIZATION-two-gateways-harness-20261010.txt` |
| Git blob id | `362066230bbbd00fafea6278eaf60e38b441a93f` |
| SHA-256 | `7cb53ec852661eb32de61be255ff49849f69cffdb6e39ce577d5c7cd9122a6a8` |
| Bytes | 3765 |
| Lines | 46 (`wc -l`) |
| Trailing newline | present (single LF); no CR bytes |
| What it is | `FOUNDER-ACT-20261010-TWO-GATEWAYS-HARNESS`: the gateway storage harness's default mode moves to owned instances migrated through the full canonical sequence, replacing for those suites the Gate III selection through `0005`; the new migration may grant `br_app_runtime` UPDATE on the slot column only, ruled not a change to a Neon role; the pull request may come from `claude/two-gateways-6twx8h` |

## How the act was issued

| Time (UTC, 2026-10-10) | Event | Source |
|---|---|---|
| before 23:32Z | the builder reports that the two-Gateways change cannot pass `storage-integration`: fourteen suites run on the shared server migrated only through `0005`, and the slot column arrives in `0009` | session |
| 23:32:03Z | the Founder, verbatim: `yes, draft the act` | session |
| 23:33:07Z | the builder delivers the sign-ready text | session |
| 23:34:20Z | the Founder posts the act in full as comment 6103360359 on Build Room PR #108, from `decivantiq` | GitHub API |

The act was posted on PR #108 because that pull request was open on the
builder's designated branch; it governs this pull request, as its B4 and C1
say.

## What the pull request does under it

- **B1, the harness.** `test/gateway-storage-helpers.ts` no longer touches the
  shared server: each test process starts one owned PostgreSQL instance,
  migrates one template database through the full canonical sequence as the
  superuser, and gives each suite a clone. The default mode hands the suite the
  superuser pool for both fixtures and application; the runtime-role mode is
  unchanged and still hands the application a `br_app_runtime` pool. The
  `HELPER_MIGRATION_THROUGH` constant is gone; the migrator's `through`
  selection stays. `gateway-registry-immutability`'s re-run check now re-runs
  the full sequence it was migrated with.
- **B2, what stays the same.** `.github/workflows/ci.yml` is unchanged: the
  `storage-integration` job already resolves the PostgreSQL 16 server binaries
  before the storage steps and still runs the storage suites twice. The five
  fixtures that revoke by direct SQL also clear `enrollment_slot`; the three
  that insert an enrolled row give it a slot. No test is skipped, disabled or
  deleted.
- **B3, the grant.** Migration `0009_two_enrolled_gateways` ends with
  `GRANT UPDATE (enrollment_slot) ON public.gateway_current_state TO br_app_runtime`
  and grants nothing else. `runtime-role-boot.storage.test.ts`'s independent
  list of the runtime's column grants adds `enrollment_slot`, and the catalog
  agrees with it.
- **B4, the branch.** The pull request is opened from `claude/two-gateways-6twx8h`.

## What the builder verified and what it did not

- Run locally against PostgreSQL 16, on owned instances: every storage suite,
  twice, 346 of 346 each time; the runtime-role tier, 15 suites as
  `br_app_runtime`, 257 of 257; the default suite as root, 1,523 passing, with
  `migrate-cli.test.js` the only file not run (its owned instance refuses
  `initdb` as root), and `migrate-cli` as a non-root user, 12 of 12. None
  skipped.
- Not done by the builder: any merge, migration apply, deploy, enrollment,
  revocation or production write. Merging this pull request starts a
  deployment that refuses to boot until `0009` is applied through DB Admin
  Migration, while the previous revision keeps serving; each of those is a
  separate Founder act (`FOUNDER-ACT-20261010-TWO-GATEWAYS` B7).

## Provenance and transport

| Step | Identity |
|---|---|
| Act drafted | the `builder` seat, in session |
| Act posted | the Founder, on Build Room PR #108, comment 6103360359, at 23:34:20Z |
| Code change and tests | the builder session, in this pull request |
| Transport | the posted comment, fetched through the GitHub API, CRLF normalized to LF, one final LF; compared byte for byte with the delivered draft; pins above computed by the builder over the landed file |
| Founder-side hash | none supplied |

## Attribution

Committed by the `builder` seat, Actor-Id
`session:claude-code/session_01Cshrrc2z6NzhDeFE1XffzA`, Execution-Surface
`claude-code`, at Founder direction: `FOUNDER-ACT-20261010-TWO-GATEWAYS` B6
and `FOUNDER-ACT-20261010-TWO-GATEWAYS-HARNESS` C1 (posted
2026-10-10T23:34:20Z). Merge is a separate exact-SHA Founder act under
DEC-20260718-04; this receipt asserts none.

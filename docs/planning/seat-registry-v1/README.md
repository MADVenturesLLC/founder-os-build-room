# Seat Registry V1 — planning record

Status of this directory (updated 2026-09-24; it previously read "r3 is filed
as reviewed. The Founder ruling of 2026-09-01 governs r4. Nothing in this
directory authorizes implementation.", which predates the merges below):

- The r7 plan (`seat-registry-v1-implementation-plan-r7-DRAFT.md`) was
  ratified under `DEC-20260902-02` and implemented as `packages/seat-registry`,
  merged to `main` in PR #20 (`407f025`, 2026-09-03). The build report is
  `seat-registry-v1-build-report.md`.
- The V1.1 non-activating control-plane policy gate
  (`packages/control-plane/src/seat-policy.ts`, pure and unwired) was merged
  in PR #23 (`6d6110d`, 2026-09-04). Its authority and closure matrix is
  `seat-registry-v1.1-authority-and-closure-matrix.md`; the integration plan
  `seat-registry-v1.1-non-activating-integration-plan-DRAFT.md` remains a draft.
- Earlier revisions (r3, r4, r5) are retained as immutable provenance and are
  not amended.

Nothing in this directory activates a seat, a provider, a model, a lane, a
credential, live execution or spend. `resolveSeat` refuses every request in
V1 by design, and activation is a separate Founder act. The merges above are
the implementation of a data-plus-refusals registry, not an activation.

Every path named above exists at the base of the commit that wrote this note.

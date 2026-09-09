# PR 2b r5 — Addendum 02 (Founder Identity Confirmation)

Status: **RECORDED — docs-only. Founder ruling registered.** No implementation
authority exists. This artifact creates no code, role, credential, token,
permission, GitHub environment, GitHub secret, repository setting, Railway
service, Railway variable, Neon object, migration, branch, commit, or PR.

Work ID: `BR-PR2B-JOURNAL-STORE-R5-A02`
Extends (does not supersede): `BR-PR2B-JOURNAL-STORE-R5-A01`, `BR-PR2B-JOURNAL-STORE-R5`
Seat: `br-architect` (Plan Authority; no approval, build, operate, or
risk-acceptance authority)
Next role: **Founder ratification of the administrative plane (custody
domain), then implementation authorization.**

Addendum 01 is unmodified. Its bytes and hash are unchanged. This correction
lands forward as a separate artifact rather than amending reported evidence.

---

## 0. Controlling inputs and hashes

| Input | Path / identity | SHA-256 |
|---|---|---|
| Founder ruling (controlling) | "BINDING FOUNDER IDENTITY CONFIRMATION", this session | not a file artifact; operative clauses quoted verbatim at §1 |
| Addendum 01 | `docs/planning/command-journal/pr2b-storage-architecture-r5-addendum-01.md` | `d1ce29ca7aa5d113aea0dddc99f74407d274a5a140da107b6ab4d2500d51a340` — **re-hashed at write time, MATCHES** (32,965 bytes, 511 lines) |
| Revision r5 | `docs/planning/command-journal/pr2b-storage-architecture-r5.md` | `20137feec1204fcee763e1900c248fa351a37c83748ca42da062daa68962017a` — **re-hashed at write time, MATCHES** (38,307 bytes, 662 lines) |

Repository HEAD at binding: `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`, branch
`builder/prereq-c-c2-broker-ledger-worker`. No drift from r5 §0 or A01 §0.

---

## 1. Ruling recorded

Quoted verbatim from the controlling header:

> For the PR 2b administrative-plane architecture:
>
> `daley40-lab`
>
> is confirmed by the Founder to be an **exclusively Founder-controlled GitHub
> identity**.
>
> It is not:
>
> - a separate employee;
> - an agent-controlled identity;
> - a shared account;
> - an independent reviewer;
> - an autonomous deployment actor.
>
> Its GitHub admin/bypass authority is classified as:
>
> `RESIDUAL FOUNDER PLATFORM AUTHORITY`
>
> For the future protected administrative-migration environment, the
> architecture may use `decivantiq` and `daley40-lab` as two Founder-controlled
> GitHub identities to satisfy platform `prevent_self_review` mechanics:
>
> - the identity initiating a privileged migration may not approve its own
>   environment deployment;
> - the other Founder-controlled identity may perform the required environment
>   approval.
>
> This is **separation of execution identities**, not independent-human review.
>
> Do not describe `daley40-lab` as an independent reviewer.
>
> No credential, token, permission, environment, or repository setting is
> authorized to be created or changed by this confirmation.

---

## 2. What this resolves

A01 §2.3 closed with an item returned to the Founder rather than assumed:

> **One item for the Founder to confirm, not assume:** this analysis treats
> `daley40-lab` as Founder-controlled. If it is not exclusively Founder-
> controlled, it is an unreviewed bypass holder on both the environment and the
> `main` ruleset, and that must be resolved before Option A is ratified.

**RESOLVED.** `daley40-lab` is confirmed exclusively Founder-controlled. It is
not an unreviewed bypass holder. Its admin and bypass authority on the
environment and on the `main` ruleset is classified as `RESIDUAL FOUNDER
PLATFORM AUTHORITY`, which is authority held by the Founder through a second
account, not authority escaping the Founder.

The pre-ratification blocker named at the end of A01 §2.3 is cleared. No other
A01 finding is disturbed.

---

## 3. The ratified approval pattern

### 3.1 Mechanics

`prevent_self_review` is documented as: "Whether or not a user who created the
job is prevented from approving their own job." Required reviewers accept "up
to 6 people or teams", and "Only one of the required reviewers needs to approve
the job for it to proceed."

The ratified pattern therefore instantiates, when and if the environment is
authorized, as: both Founder-controlled identities listed as required
reviewers, `prevent_self_review` enabled, and one approval sufficient.
Whichever identity initiates a privileged migration is barred by the platform
from releasing it, and the other identity performs the approval. The pattern is
symmetric, so it does not depend on which identity initiates.

**Not authorized here.** No reviewer list, environment, or setting is created
or changed by this artifact. The above describes the configuration that
ratification would authorize, not a configuration that exists.

### 3.2 What the pattern does and does not provide

Stated precisely, because the difference is the whole point of the ruling.

**Provides.** A privileged migration cannot be both initiated and released by a
single authenticated session. Initiation and approval are recorded against two
distinct GitHub identities, producing a two-identity audit trail on each
privileged tranche, and a mis-dispatch cannot self-release through the same
credential that made it.

**Does not provide.** Independent human review. Both identities are the
Founder. There is no second judgment in the loop, no adversarial check, and no
constraint on the Founder. The Founder additionally holds admin bypass on the
environment and `OrganizationAdmin` bypass on the `main` ruleset (A01 §2.3),
which is `RESIDUAL FOUNDER PLATFORM AUTHORITY` and is correctly placed under
this governance model.

### 3.3 Binding vocabulary rule

**Never describe `daley40-lab`, or this pattern, as any of the following** in a
PR body, status line, evidence pack, commit message, test name, or review
comment:

- "independent reviewer" / "independent review"
- "second reviewer" or "peer review" in a sense implying a second person
- "two-person control", "four-eyes", "dual control", or any phrasing implying
  separated humans
- "external approval" or "third-party approval"

**Approved phrasing:** "separation of execution identities", "Founder-controlled
approver identity", "the non-initiating Founder-controlled identity".

Independent review, where the architecture requires it, means a reviewer that
is not the Founder and not spawned by the executing session. Nothing in this
ruling supplies that, and this pattern must never be offered in its place.

---

## 4. Corrections to Addendum 01

A01 is unmodified. The following statements in it are superseded by this
artifact and must be read as corrected.

| A01 location | A01 text | Corrected reading |
|---|---|---|
| §2.1 item 5, "Limit" clause | "both eligible identities are Founder-controlled, so the control enforces *account separation*, not reviewer independence" | Accurate and preserved, restated in ratified vocabulary: the control enforces **separation of execution identities**, not independent-human review. `prevent_self_review` is a ratified component of the design, not a caveat against it |
| §2.3 closing item | "One item for the Founder to confirm, not assume... must be resolved before Option A is ratified" | **RESOLVED** by §1 and §2. `daley40-lab` is exclusively Founder-controlled; its bypass authority is `RESIDUAL FOUNDER PLATFORM AUTHORITY`; no pre-ratification blocker remains on this point |
| §5.1 Option A, "Self-review prevention" row | "YES, with a limit... it cannot manufacture reviewer independence when both accounts are the Founder's" | **YES, ratified.** The two-identity pattern is the Founder-ratified mechanism for satisfying `prevent_self_review`. The limit is retained as a truthfulness constraint on how it is described (§3.3), not as a deficiency in the option |
| §6, "Founder-held residual, restated" | "Repository admins and organization admins can bypass the gate... The gate routes authority to the Founder; it does not constrain the Founder" | Preserved verbatim in substance, with the classification now named: that residual is `RESIDUAL FOUNDER PLATFORM AUTHORITY` |
| §6, "What ratification would authorize" | "setting required reviewers on it with `prevent_self_review` enabled" | Unchanged, now specified: required reviewers are the two Founder-controlled identities, `decivantiq` and `daley40-lab`, with `prevent_self_review` enabled |

Nothing in r5, and nothing in A01 §§1, 3, 4, 5.1 (Options B, C, D), 5.2 or 7,
is changed by this ruling. Conditions C1 (exact-SHA assertion) and C2
(concurrency group) remain mandatory for Option A.

---

## 5. Status

**Option A verdict is unchanged: it satisfies every required property**,
subject to conditions C1 and C2 and to `RESIDUAL FOUNDER PLATFORM AUTHORITY`,
which is now classified rather than open.

`RECOMMEND OPTION A FOR FOUNDER RATIFICATION` (carried from A01 §6, unchanged).

**Remaining Founder decision, now the only one.** Ratifying Option A moves
custody of `neondb_owner` from Railway's secret store to GitHub Actions
environment secrets, making GitHub a second custody domain for a database
credential. Under `DEC-20260815-02`, custody posture is a Founder act. The
identity question that previously sat alongside it is closed.

**Preserved unchanged:** every r4 and r5 database security invariant, including
r5 §8.7 (the split narrows who holds owner authority and does not eliminate
owner bypass; no artifact may claim journal history is immutable or
tamper-proof), stop conditions S1 to S12 with S9 and S10 still TRIGGERED, and
S13 from A01 §1.2 (custody may not be declared remediated while `neondb_owner`
is unrotated).

**No implementation authority exists.** No code, role, credential, token,
permission, GitHub environment, GitHub secret, repository setting, Railway
service, Railway variable, Neon object, migration, branch, commit, or PR was
created or modified by this artifact.

---

## Appendix A — provenance

**Re-hashed at write time (local `shasum -a 256`, `wc`):** r5 at
`20137feec1…62017a` (38,307 bytes, 662 lines) and A01 at `d1ce29ca7a…51a340`
(32,965 bytes, 511 lines). Both match the values previously reported to the
Founder. `git rev-parse HEAD` returns `75b52a23c1fe4bec02bdcb7257ac6273f4b4c242`.

**No new platform reads were required.** This artifact records a Founder ruling
and corrects an interpretation. The GitHub and Railway evidence underlying A01
is unchanged and is not re-asserted here; it stands as recorded in A01
Appendix A with its observation timestamps.

**Attribution.** Authored by the `br-architect` seat as a docs-only advisory
artifact. No commit was produced, so no attribution trailer is attached. If
this file is later committed, the committing act carries its own trailers and
its own authorization.

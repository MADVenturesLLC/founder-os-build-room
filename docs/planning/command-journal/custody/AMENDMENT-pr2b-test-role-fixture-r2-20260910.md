# AMENDMENT — PR 2b Test-Role Fixture (r1 §4.1 Exception Revision)

**Status: PROPOSED AMENDMENT — READ-ONLY / NO IMPLEMENTATION AUTHORITY**

## 1. Exact Base Binding & Plan Stack

**Bound Base:**
- `main` SHA: `ef7a47920b8a2a022f9e6bf26ce22119fe466217`
- `tree`: `31b132deedcb180036edee2b267f1d824078b4f6`

**Signature-Time Requirement:** If `origin/main` differs from `ef7a47920b8a2a022f9e6bf26ce22119fe466217`, stop with `REVIEW TARGET DRIFT` and prepare a rebind; do not sign.

**Active Plan Stack:**
This amendment strictly binds to and modifies the current effective Gate-I baseline:
- `pr2b-storage-architecture-r6.md` (SHA-256: `658daa9c0194d5f56d7506fb8ade05d24d413cd08b106a067ff9100ce5815954`)
- `pr2b-implementation-plan-r1.md` (SHA-256: `08f3ea7418db7052ffd7fb4cf6df4672f169c95933a7c07c71ef637ae775b3ce`)
- `pr2b-implementation-plan-r1-addendum-01.md` (SHA-256: `91c0133448dc632ee269313fc56092dad95b3fedc7d41d65baf29297dfd1dc87`)
- `AMENDMENT-pr2b-preflight-sequencing-r3-rebind-20260910.md` (SHA-256: `aab512085a56fb343c8b746200f3963112950986b3856704152480116f175424`)
- `FOUNDER-AUTHORIZATION-pr2b-gate1-ISSUANCE-RECEIPT-20260910.md` (SHA-256: `277f85e3f98acbe91d84cb82a174a64c096997edab4828a806fb2225239883d1`)

## 2. Founder Ruling Provenance

This amendment responds to Decision Brief SHA-256: `d8ed64b9a536f573cb21e29320c86439a510cc8befc5b5ffcf9426937180601e`.
**RULING EVIDENCE REQUIRED:** No durable, signed Founder ruling record selecting Option A exists at this time. This artifact cannot be incorporated into a Gate-II authorization until a separate, signed Founder receipt ratifying this exact text is provided.

## 3. Exact Amendment Anchors & Rule Wording

This amendment alters ONLY the role-creation prohibition within **r1 §4.1 (Tranche A FORBIDDEN list)**.

**Before Wording (r1 `08f3ea7418db7052ffd7fb4cf6df4672f169c95933a7c07c71ef637ae775b3ce`, §4.1, exact text):**

```markdown
**FORBIDDEN in A:** every path under `.github/workflows/`; `railway.toml`; any
SQL that creates roles; `packages/control-plane/src/migrations.ts`'s
`MIGRATIONS` array contents (A must not add, remove, or edit a migration).
```

**After Wording (Amended r1 §4.1):**
`**FORBIDDEN in A:** every path under .github/workflows/; railway.toml; any SQL that creates roles (except that A-R3 testing is permitted the creation and same-run dropping of the minimum ephemeral NON-LOGIN test role(s) inside the disposable local TEST_DATABASE_URL instance. Any use of this fixture role must occur only through SET ROLE from the existing disposable local test session. This exception does not permit LOGIN capability, passwords, connection credentials, membership grants or revokes, ALTER ROLE, privilege grants or revokes, attribute changes, or any persistent/shared/governed/Neon/production effect. Teardown proof is required: before test completion, assert every fixture role is absent from pg_roles and report the assertion result; fixture setup or teardown failure fails the test. If A-R3 cannot be proved within those limits, stop with SCOPE DECISION REQUIRED and do not broaden the exception); packages/control-plane/src/migrations.ts's MIGRATIONS array contents (A must not add, remove, or edit a migration).`

**Every other r6/r1/addendum-01/r3 provision remains unchanged.** All unrelated text, structural prohibitions, manifest boundaries, and gates are fully preserved and identically enforced.

## 4. Governance and Next Actions

- **Non-Authorities:** This amendment contains no repository changes and grants no implementation authority. No database acts against Neon, deployments, or persistent credentials are authorized.
- **REQUIRED:** Independent review of this specific narrow exception is required before any Gate-II authorization can incorporate it.

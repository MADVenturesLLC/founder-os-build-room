# AGENTS.md — founder-os-build-room

MAD Ventures OS Build Room agent orchestration runtime. Standalone product repository created under `DEC-20260815-01`.

The `builder` role implements; the `founder` authorizes and reviews. This repository is the implementation home for the Build Room product, not a governance/doctrine repo.

## Context load order

FounderOS is a sibling checkout, not a subdirectory of this repository — a
path like `../FounderOS/...` only resolves if the two repositories happen to
share a parent directory in a given checkout, and `/05-workflows/` (absolute)
never resolves inside this repository at all. Load by stable identifier, not
by a path this repository does not control:

1. The WF-04 (PRD to Build) workflow step that authorized the current
   session, and WF-17 (Repository Onboarding) — both in FounderOS
   `05-workflows/`, wherever that checkout lives locally.
2. Relevant decisions in FounderOS `07-decisions/` — the Build Room's 18
   WF-04 Step 2 decisions (`DEC-20260815-01` through `-18`) and any later
   ones, notably `DEC-20260815-17` (phase sequencing and stop gates, current
   phase authority) and `DEC-20260827-01` (the command-journal ruling).
3. The architecture at FounderOS `03-products/mad-ventures-os/technical-architecture.md`.
4. This repository's own `README.md` — descriptive, not authoritative; see
   its own authority statement.

## What you may write

- Implementation code, tests, configuration, and CI/CD
- Repository-level documentation (README, AGENTS.md, architecture decisions)
- Infrastructure-as-code within authorized boundaries

## What you must NOT do

- Authorize new spend, infrastructure, or provider access (Founder act)
- Create or modify governance doctrine (lives in FounderOS)
- Self-provision credentials or secrets
- Deploy without separate Founder authorization

## Approval gates

- Provisioning infrastructure (Railway, Neon, Cloudflare)
- Adding provider API access
- Deploying to production
- Changing the repository's security posture
- Merging to main without required CI checks

## Attribution

All commits carrying role-accountable work carry Attribution trailers per `DEC-20260718-05`:

```
Role-Id: builder
Actor-Id: <session-scoped>
Execution-Surface: <surface_id>
```

## Git rules

- Clear, descriptive commit messages; logical commits per unit of work
- Never commit secrets, credentials, or API keys
- CI must pass before merge to main

## Stack

- **Control plane:** Node 22 / TypeScript / Express on Railway
- **Gateway:** macOS-local daemon (Node >= 22 / TypeScript)
- **Web:** DEFERRED. `DEC-20260815-08` clause 5 binds only Railway (control
  plane) and Postgres/Neon for the current phases; Cloudflare Workers and the
  web tier are explicitly not authorized (`DEC-20260815-08`, `DEC-20260815-17`
  Phase 2 authorization). "Bun + TanStack Start on Cloudflare Workers" is the
  pre-ruling planning proposal, not the bound stack — no web package exists
  and no agent should scaffold one without a separate Founder ruling binding
  it.
- **Data:** Postgres (Neon) for operational data; evidence store per `DEC-20260815-02`

## Spend broker v0 — blast radius (GLM-20260913-SPEND-BROKER-V0)

OFF-ROADMAP Build Room side bet (Open-Inspect S3 evolved). Claim language:
`SPEND_BROKER_V0` / `COST_CEILING_ENFORCEMENT` only.

- **Touches exactly:** `packages/spend-broker/**` (new), `test/spend-broker.test.ts`
  (new), one `include` line in `tsconfig.json`, one `spend-broker:demo` script
  in the root `package.json`, and this section.
- **Does NOT touch:** `packages/gateway-daemon/**` — this work did not
  modify, integrate, or call it. (When this section was written, the
  original AE-01 A2 candidate `a721b7a` was frozen under `CHANGES_REQUESTED`;
  the corrected candidate merged the same day as PR #30 at `736b12b`, with a
  follow-up fix in PR #42 at `9e5d799`. The daemon has since changed again
  under separately named acts, in PRs #36, #53, #63 and #70. The
  "frozen" wording here was accurate on 2026-09-13 and is stale now;
  corrected 2026-09-24.) No Room Runtime / Occupancy / Execution / freeze-stack files. No
  Phase 0 proofs under `test/phase0/**`. No live credential stores, no
  Keychain writes, no network in tests.
- **Fixture-first:** the gateway is a fixture (`fix_…` tokens); the only live
  integration is a read-only adapter to `@build-room/cost-meter`'s public
  API. The meter's boundary semantics — including the `perRoomTokenLimb`
  `FOUNDER_DECISION_REQUIRED` question — are used as-is, not re-decided; see
  `packages/spend-broker/README.md`.
- **Credential classes (Founder ruling 2026-09-13, verbatim: "Only API
  ceiling is $85. OAuth should be unlimited."):** `MintRequest.credentialKind`
  routes `'api'` (default, fail-closed) through the ceiling gate and
  `'oauth'` around it — no meter call, no reservation, no spend-ground
  interrupt; gateway refusals still deny. Broker routing only: the meter, the
  monthly ledger, and the ratified USD 85 total-spend ceiling are untouched.
- **Status:** merged to `main` as PR #69 (`f031cdf`, 2026-09-20) under a
  Founder act naming the head SHA. (This line previously read "left
  UNCOMMITTED on branch `build/spend-broker-v0` pending Founder
  authorization", which was true when written and stale after the merge;
  corrected 2026-09-24.) Tests passing here are fixture-level evidence only
  and are NOT evidence of Phase 0, occupancy proof, gateway honesty, Room
  Runtime, an AE-01 fix, or any production activation.

## GitHub credentials and identity (agent sessions)

Agent sessions run GitHub operations on two separate credential legs. Both are intentional — do not "align" them or substitute one for the other.

- **`gh` (API, PRs, comments) acts as the agent PAT `daley40-lab`,** exported as `GH_TOKEN` by the session launcher from `~/.secrets/mad-agent-env.sh`. That PAT is the intended `gh` identity for agent work. Never unset `GH_TOKEN`, never bypass it with the human keyring login (`decivantiq`), and never print, echo, or commit the token value.
- **Git transport is separate.** SSH remotes (`git@github.com:…`) push with the SSH key as `decivantiq`; HTTPS remotes resolve through the `gh` credential helper. A session pushing over SSH as `decivantiq` while `gh pr create` acts as `daley40-lab` is normal, not a misconfiguration.
- **On any `gh` 401: run `gh auth status`, stop, and report** — no keyring fallback, no `env -u GH_TOKEN`, no improvised retry. The token file is prefixed (`GITHUB_TOKEN=…`); extract it exactly as the loader does, and test any copy by API probe, never by printing it.
- **A session relaunched after a stop must have a valid `GH_TOKEN` before it runs** — check `gh auth status` first; if the token is invalid, stop and report rather than pushing with the wrong identity.

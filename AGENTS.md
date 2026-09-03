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

# AGENTS.md — founder-os-build-room

MAD Ventures OS Build Room agent orchestration runtime. Standalone product repository created under `DEC-20260815-01`.

The `builder` role implements; the `founder` authorizes and reviews. This repository is the implementation home for the Build Room product, not a governance/doctrine repo.

## Context load order

1. The workflow step in `/05-workflows/` that authorized the current session
2. Relevant decisions in `../FounderOS/07-decisions/` — the Build Room's 18 WF-04 Step 2 decisions (DEC-20260815-01 through -18) and any later ones
3. The architecture at `../FounderOS/03-products/mad-ventures-os/technical-architecture.md`
4. This repository's own `README.md`

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
- **Web:** Bun + TanStack Start on Cloudflare Workers
- **Data:** Postgres (Neon) for operational data; evidence store per `DEC-20260815-02`

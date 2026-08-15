founder-os-build-room — Architecture & Implementation Planning Package v1.0

Prepared by:
 FABLE-5 (Principal Systems Architect / Planning Lead — planning authority only)

Date:
 2026-08-09 ·
Status:
 Complete planning package; zero implementation performed

Evidence pins:
 FounderOS
main@558a64f2
 · founder-os-telegram
main@e96414da
 · founder-os-console
main@c32a5557
 · galactic
main@01442e57
 · Orca
stablyai/orca
 (local v1.4.164) · all provider docs retrieved 2026-08-09

1. Controlled verdict and executive recommendation

Verdict: build
founder-os-build-room
 as a new standalone product repository
 under
MADVenturesLLC/
, structured as a three-part system: a
cloud control plane
 owning an event-sourced governed build ledger (Railway, Node 22 / TypeScript / npm — the ratified runtime-tier stack), a
local Agent Gateway
 daemon that holds all provider credentials and executes worktrees/commands/agents on the founder's machine, and a
web application
 for the founder's multi-device command view (TanStack Start on Cloudflare Workers — the ratified UI-tier stack). Neither existing surface can host this: FounderOS core constitutionally prohibits runtime code (
00-system/runtime-boundary.md
 [Observed]), and founder-os-console is constitutionally read-only with write-impossibility tests (
CLAUDE.md
: "no execution authority" [Observed]).

The single hard blocker is governance, not architecture.
 The "MADVentures_OS Build Room" already exists by name in ratified doctrine and is
explicitly paused
: DEC-20260807-01 states "The MADVentures_OS Build Room remains paused until the Founder separately resumes it," and lists "the central governance gateway; the MADVentures_OS Build Room; general multi-agent runtime orchestration" as not authorized [Observed]. Planning is complete and unblocked;
implementation cannot begin until the founder ratifies a resuming decision
 (FD-1, §6). The same decision selected "layered native enforcement with
gateway-ready contracts
" — meaning this product's gateway/adapter contract is not just permitted by doctrine, it is the anticipated next step (clause 1.4: adapters "MUST implement a common versioned contract so they can later point to a central governance gateway" [Observed]).

Existing doctrine already ratifies most of this prompt's invariants: SHA-named founder authorization with push-voiding (DEC-20260801-02), author/reviewer separation (WF-18, DEC-20260719-02), founder-voice merge authorization (DEC-20260718-04), GitHub App short-lived tokens over PATs (DEC-20260710-01), and six registered coding surfaces including
claude-code
,
codex
,
grok-build
,
cursor
,
hermes-local-code
 (DEC-20260807-01) [all Observed]. The product operationalizes ratified doctrine rather than inventing policy.

Provider verdict [Observed, §15]:
 all six targets are callable headlessly under a local-gateway custody model in which no provider credential ever leaves the founder's machine: Claude (
claude -p
, subscription auth documented first-party), Codex (
codex exec
 on local ChatGPT login; API key recommended), Gemini (API key/ADC; OAuth first login founder-attended), Grok (official Apache-2.0
grok-build
 CLI with
XAI_API_KEY
; subscription OAuth is allowlist-gated — do not build on it), Cursor (official headless
cursor-agent -p
 +
CURSOR_API_KEY
), Hermes (OpenAI-compatible API; MIT Hermes Agent).
No provider permits a third party to hold subscription credentials
 — Anthropic prohibits third-party claude.ai login absent prior approval; OpenAI's "Sign in with ChatGPT" is identity-only. The MVP custody model is therefore forced, not chosen: credentials live only on the gateway host.

External products:
 Galactic (AGPL-3.0, dormant since 2026-05-30, solo-author, an observer not an orchestrator) is a pattern quarry only — its AGPL license bars code reuse in a proprietary product. Orca (
stablyai/orca
, MIT, very actively maintained) is the strongest structural reference — relay/daemon split, PTY credit streaming, worker fencing, decision gates — but is governance-void by design (any process can drive any terminal and resolve any gate). Neither becomes the foundation; the orchestration core is built new (§7).

MVP in one sentence:
 one founder, one org, one gateway, one build at a time; Planner→founder plan approval→Builder in a sandboxed worktree→gateway-observed evidence→draft PR→independent exact-SHA Reviewer with no write path→remediation loop→SHA-bound step-up founder authorization→founder-executed merge with webhook confirmation; three provider adapters live (claude-code, codex, one API-based adapter proving neutrality), all six classified.

2. Product definition, intended users, and measurable success criteria

Definition.

founder-os-build-room
 is a governed, provider-neutral multi-agent software delivery system: a cloud-accessible Build Room where AI agents in founder-assigned roles (Planner, Builder, Reviewer) collaborate over one shared, truthful operational record, connected to the founder's repositories and provider CLIs through a local Agent Gateway, delivering changes to GitHub under exclusively human authority.

Intended users.

Primary: the MAD Ventures founder (initially the sole authorized user; the console's founder-allowlist pattern generalizes to additional org members later).

Secondary: small software teams with the same shape — multiple AI coding agents, one accountable human authority (post-MVP).

Measurable success criteria.

#

Criterion

Measure

S1

End-to-end governed delivery

A real change to an allowlisted repo goes goal→plan→approval→build→review→remediation→authorization→merge entirely inside the product, with zero copy-paste between agent surfaces

S2

Review independence is structural

Security-negative test suite proves the Reviewer workspace has no write bit, no credential, no push path (tests fail the build if any appears)

S3

SHA integrity

100% of review/authorization records carry an exact SHA; any push voids stale state within one reconciliation cycle (target < 60 s)

S4

Truthful state

Zero fabricated states in UI: every claim labeled observed/inferred/unavailable/failed/skipped/not-yet-verified; gateway-offline shown as offline, cost-unavailable shown as unavailable

S5

Provider neutrality

Adding a new provider = one adapter package implementing the versioned contract; zero changes to orchestrator state machine (verified by adding adapter #3 in MVP)

S6

Multi-device

Founder can approve a plan, answer a blocking question, and grant authorization from a phone browser while the gateway runs on the desk machine

S7

Cost honesty

Every cost figure traceable to provider-reported usage or a named
price_table_version
; spend ceiling halts dispatch before overrun

S8

Fail closed

Fault-injection suite (gateway kill, webhook drop, provider expiry, forged event) always lands in a founder-visible blocked/reconciling state, never silent success

3. Evidence inventory

All repository evidence gathered this run (2026-08-09) via authenticated
gh
 CLI and shallow read-only clones; all provider evidence via live official documentation fetches. Nothing was pushed, committed, commented, or modified anywhere.

3.1 Repositories inspected

Repo

Head SHA (main)

Method

Key files inspected

MADVenturesLLC/FounderOS (private)

558a64f2501308cdf06b6d1ffafbd3de608050fc
 (pushed 2026-08-09)

gh api
, shallow clone; local tests executed

README.md
,
CLAUDE.md
,
00-system/{system-index,runtime-boundary,repository-security-standard,data-boundary-policy,naming-conventions}.md
,
01-constitution/agent-rules.md
,
04-agents/roles/*
,
05-workflows/wf-18-multi-agent-structural-build.md
,
07-decisions/DEC-20260807-01
,
DEC-20260801-02
,
DEC-20260718-04/05
,
DEC-20260719-02
,
DEC-20260710-01
,
DEC-20260717-03
,
DEC-20260711-01
,
DEC-20260716-01
,
sentinel/*
,
00-system/reconciler/*
,
.github/workflows/*

MADVenturesLLC/founder-os-telegram (private)

e96414da466123ab45615e9565b7908c5344d57a

gh api
, shallow clone

CLAUDE.md
,
package.json
,
webhook.ts
,
bots.ts
,
console-api.ts
,
core/{store,approvals,risk,role-policy,execution-records,github-app-auth,postgres-durable-port,evidence-refs,binding-activation}.ts
,
capability-registry.ts
,
db/migrations/*
,
.env.example
,
.github/workflows/*
,
hermes-worker/

MADVenturesLLC/founder-os-console (private)

c32a55570fbeaf1904c7a60cec046209a9b584dc

gh api
, shallow clone

CLAUDE.md
,
wrangler.jsonc
,
app/routes/_authed/*
,
lib/{auth-actions,authz,founder-allowlist,approvals,pricing/*,csrf}.ts
,
app/server/{github,github-attention,ledger,ledger-read,executions,sync}/*
,
supabase/migrations/*
,
tests/negative/*

idolaman/galactic (public, AGPL-3.0)

01442e5716dd7ec99fed272ec6a1c80ce228c198
 (pushed 2026-05-30)

clone + source inspection

LICENSE
,
package.json
,
electron/{ipc,workspace-console,workspace-isolation,project-sync,mcp-server.ts,utils}/*
,
scripts/build-mcp-server.sh
, tests

stablyai/orca (public, MIT)

inspected via GitHub API + local install v1.4.164 (
/Applications/Orca.app
,
orca --help
)

contents API, docs fetch, CLI inspection

LICENSE
 (MIT, Lovecast Inc.),
src/relay/*
 listing, README, onorca.dev/docs + /docs/mobile

Open PRs at inspection: FounderOS
0
; founder-os-telegram
1
 (#123, CodeRabbit generated tests); founder-os-console
0
 [Observed].

3.2 Provider documentation (all retrieved 2026-08-09)

Provider

Primary official sources

Anthropic / Claude

code.claude.com/docs/en/{authentication, headless, agent-sdk/overview}; support.claude.com/en/articles/15036540; anthropic.com/legal/consumer-terms

OpenAI / Codex

learn.chatgpt.com/docs/{auth, non-interactive-mode} (301/308 from developers.openai.com/codex/*); developers.openai.com/codex/mcp; help.openai.com/en/articles/20001410 (via search; direct fetch 403)

Google / Gemini

geminicli.com/docs/{get-started/authentication, cli/headless}; ai.google.dev/gemini-api/docs/{api-key, rate-limits}; developers.google.com/gemini-code-assist/docs/overview

xAI / Grok

docs.x.ai/developers/{quickstart, rate-limits}; docs.x.ai/build/overview; github.com/xai-org/grok-build (Apache-2.0)

Cursor

cursor.com/docs/cli/{overview, headless, reference/authentication}; cursor.com/docs/background-agent/api/overview; cursor.com/docs/api

Nous / Hermes

hermes-agent.nousresearch.com/docs/ (+integrations pages); portal.nousresearch.com/api-docs (bot-blocked — rate limits [Unknown])

GitHub

docs.github.com: GitHub App permissions ("Contents" permission governs HTTP git access), REST pulls (draft PR
draft
 param), about-protected-branches (restrict push/merge, required reviews, rulesets/bypass)

Evidence-label caveats carried into this package:
 OpenAI ToS exact wording verified only through search extracts of official pages (fetch 403) — re-verify before contractual reliance [Unknown-partial]. Nous official rate limits unverified (bot-blocked) [Unknown]. Anthropic programmatic-subscription billing policy changed 3× since Jan 2026 — volatile; re-verify at integration time [Observed, flagged].

4. Observed FounderOS capabilities, constraints, and missing capabilities

4.1 Capabilities that already exist (and this product must reuse, not reinvent)

Ratified authority doctrine
 [Observed]: founder final authority (
README.md
, DEC-20260718-04 founder-voice merge authorization); SHA-named authorization blocks where "any push after authorization voids it" (CLAUDE.md §Handoff, DEC-20260801-02); approval gates before automation.

Role system
 [Observed]: 17 stable roles; models/surfaces/tools are never roles (agent-rules §1.1–1.4);
builder
 and
independent-reviewer
 role contracts exist; two-tier reviewer doctrine (DEC-20260719-02: Tier 1 CodeRabbit, Tier 2 closed model roster); WF-18 multi-agent structural build (draft v0.2) requires distinct named builder and reviewer surfaces.

Coding-surface governance
 [Observed]: DEC-20260807-01 registers six coding surfaces (
claude-code
,
grok-build
,
codex
,
cursor
,
antigravity
,
hermes-local-code
), requires Coding Governance Execution Records (task ID, authorization ref, role, surface ID, exact model + effort, work-size class), and mandates gateway-ready versioned adapter contracts.

Security/custody standards
 [Observed]: GitHub App short-lived installation tokens, never founder PATs (DEC-20260710-01); secrets only in deployment-platform encrypted stores (repository-security-standard.md); P1 provider data-boundary routing, fail-closed (DEC-20260716-01); attribution trailers +
attribution-shape
 required CI check in every repo.

Runtime substrate in siblings
 [Observed]: telegram runtime has working approval lifecycle (pending→claimed→executing→executed/denied/expired/failed with atomic claim), risk-gate regex matrix, provider adapters for 8 vendors, ExecutionRecord with provider-reported usage +
priceTableVersion
, Neon evidence tables with closed CHECK enums/RLS/append-only triggers, HMAC pseudonymous evidence refs. Console has founder Supabase auth + allowlist, evidence-mandatory approval queue (jsonb evidence must be non-empty array), GitHub App read client carrying per-PR
headSha
, honest-unavailability contract, negative write-impossibility suites.

4.2 Constraints that bind this product [Observed]

Build Room and central gateway are
paused/not authorized
 until a founder decision resumes them (DEC-20260807-01 §10.1, closing note; system-index line ~508). → FD-1.

FounderOS repo may not host runtime state or code (
runtime-boundary.md
 prohibitions).

Console may not gain execution authority (CLAUDE.md;
tests/negative/*
 are constitutional artifacts; DEC-20260725-03 forbids reintroducing descoped surfaces).

Neon durable evidence store is ruled "owned exclusively by founder-os-telegram" (DEC-20260717-03) → the new product's evidence store needs its own decision (FD-2).

New repos onboard via WF-17 against repository-security-standard.md; naming conventions apply (
founder-os
 legacy slug valid for repo names); every architectural change traces to a
DEC-*
.

New execution surfaces/models require registry entries + decisions (agent-rules §1.3) → the gateway itself and the Build Room web surface need registration (FD-8).

LangGraph is registered but
deferred
 (DEC-20260715-05); general multi-agent runtime orchestration unauthorized pending FD-1.

4.3 Missing capabilities (greenfield in this product)

[Observed as absent — grep across all three repos]: any Build Room design/spec/code ("build room" appears only in deferral references); any local gateway daemon; any provider-CLI execution harness; any worktree/sandbox manager; any exact-SHA multi-round review workflow implementation; any SHA-bound step-up authorization service; any real-time multi-device room feed; any typed agent-to-agent handoff protocol. WF-18 and DEC-20260801-02 define the
doctrine
; no code implements it anywhere.

5. Clarified functional and nonfunctional requirements

Functional (FR)

FR-1 Founder authenticates (MFA-capable IdP), selects org and allowlisted repository/branch; base SHA captured immutably at scope time.

FR-2 Gateway enrolls via founder-approved pairing; supports revocation and re-enrollment; signed heartbeats; offline is a first-class displayed state that pauses dispatch.

FR-3 Provider connections are created by the founder running each provider's own login/key flow
on the gateway host
; adapters probe auth state and declare capabilities; cloud mirrors metadata + health only.

FR-4 Shared Build Room: one ledger-projected feed of approved messages, typed events, artifacts, decisions, agent states, evidence, cost, and GitHub readiness — identical for every participant, on every device; no private chain-of-thought is stored or displayed.

FR-5 Founder assigns Planner/Builder/Reviewer to provider connections; reviewer independence (different provider account + session than builder) enforced at assignment and at review-open.

FR-6 Planner produces a typed PlanDoc (steps, scope paths, risk, criteria draft) from a read-only checkout at base SHA; founder approves/edits/requests revision; approval binds
plan_hash
,
approved_scope_paths
,
risk_classification
, ratified criteria.

FR-7 Builder works only in an isolated worktree on
buildroom/<room>/<build>
; file writes confined to approved scope paths; consequential commands require founder approval bound to a single
command_id
.

FR-8 Blocking questions become typed decision requests answerable from any device; build pauses truthfully.

FR-9 Evidence (test/verification commands) is gateway-observed and gateway-signed — never agent-claimed — and bound to the head SHA; failed runs are recorded as failed.

FR-10 Push goes only to the builder branch via short-lived App installation token; a draft PR is created/refreshed; PR stays draft until authorization.

FR-11 Review rounds bind to the exact remote head SHA in a read-only, credential-free workspace; findings are typed and SHA-bound; every new push voids stale rounds and authorizations and triggers a fresh round.

FR-12 Founder authorization is single-use, SHA+plan_hash-bound, granted only via step-up auth; merge is executed by the founder's own GitHub identity; merge confirmed by HMAC-verified webhook corroborated by poll.

FR-13 Cost events are recorded per task with provenance labels; spend ceiling pauses dispatch; ceiling changes are founder events.

FR-14 Cancellation, timeout, retry, resume, reconciliation, and terminal closure are typed, bounded, and founder-visible; closure requires verified evidence delivery or explicit founder waiver.

Nonfunctional (NFR)

NFR-1 Fail closed on any unverifiable identity, SHA, scope, capability, evidence, or authorization (INV-12).

NFR-2 Conversation text can never transition authoritative state (INV-6); all state changes are authenticated typed events with idempotency keys.

NFR-3 P95 event propagation ledger→UI < 2 s online; reconnect with gap-free resume via per-room sequence numbers.

NFR-4 Every gateway↔cloud message signed (gateway Ed25519 key) over TLS; webhook HMAC + delivery-GUID dedup; command execution at-most-once via journaled
command_id
.

NFR-5 Evidence records are append-only (WORM), content-addressed, hash-chained per room; authorization and cost records retained ≥ 7 years; build artifacts default 2 years (FD-9 to change).

NFR-6 Stack conformance: control plane + gateway on runtime-tier conventions (TS strict, Node ≥ 22, npm, Express, Jest, Railway); web app on UI-tier conventions (TanStack Start, React, Tailwind, zod, Vitest, Cloudflare Workers, Bun) [Observed conventions §3.1]; attribution-shape CI gate; WF-17 onboarding.

NFR-7 Provider adapters are versioned plugins; orchestration core contains zero provider-specific logic (S5).

NFR-8 Data-boundary policy compliance: provider routing honors DEC-20260716-01 P1 classes, fail-closed.

6. Material assumptions and unresolved founder decisions

Material assumptions (labeled)

A-1 [Inferred] The founder intends this product for MAD Ventures governance first, external users later; MVP therefore optimizes for one org/one founder and conforms to FounderOS doctrine rather than abstracting it.

A-2 [Observed→Inferred] Subscription-credential custody must be gateway-local for Claude/Codex; API keys are the sanctioned path for Gemini/Grok/Cursor/Hermes headless use. Assumed acceptable: providers are invoked as first-party CLIs/SDKs under the founder's own accounts on the founder's machine.

A-3 [Inferred] macOS is the first gateway platform (founder's machines; telegram's hermes-worker already runs on the founder's iMac [Observed]); Linux support follows.

A-4 [Inferred] The MVP runs one active build per room and one gateway per org; concurrency is a later phase.

A-5 [Unknown→assumed] GitHub org plan supports rulesets restricting merge actors on private repos (Team/Enterprise needed for some protections on private repos [Observed docs]); if not, fallback is CODEOWNERS+required-review + App-side refusal to merge (structural absence of merge call) — weaker but acceptable for MVP since merge is founder-manual anyway.

Unresolved founder decisions [Founder decision required]

ID

Decision

Why it blocks / shapes

FD-1

Ratify a DEC resuming the MADVentures_OS Build Room and authorizing repo
MADVenturesLLC/founder-os-build-room
 (WF-17 onboarding, registry entries)

Blocks all implementation
 — DEC-20260807-01 pauses Build Room work

FD-2

Evidence-store custody: new product-owned Neon project (recommended) vs extending telegram-owned store

DEC-20260717-03 rules Neon store exclusively telegram-owned; either path amends doctrine

FD-3

Per-provider credential custody beyond gateway-local (any cloud-held API key, e.g. for a future cloud-executed planner)

MVP assumes none; any cloud custody is an explicit opt-in per provider

FD-4

UI placement: new web app in product repo (recommended) vs new console surface

Console surface requires amending DEC-20260725-03 descope rulings

FD-5

Cost commitment: Railway service + Neon project + Cloudflare Workers app + provider API spend for adapter #3 + review/test provider usage

Monthly infra estimated low tens of $; provider usage dominated by builds themselves

FD-6

Code-reuse posture: clean-room patterns only (recommended for MVP) vs vendoring MIT-licensed Orca components

AGPL Galactic code is excluded either way

FD-7

Reviewer eligibility roster: which provider connections may hold the Reviewer role (extends DEC-20260719-02 Tier-2 closed roster to Build Room reviews)

Shapes role_assign validation

FD-8

Register new execution surfaces:
build-room-gateway
,
build-room-web
 in
04-agents
 registries per agent-rules §1.3

Governance registration required for attribution

FD-9

Retention defaults: evidence 7y (authorization/cost) / 2y (build artifacts)

Legal/records posture is founder's

Contradiction resolved:
 the prompt names the product
founder-os-build-room
 while doctrine's machine identifier is
mad-ventures-os
; naming-conventions.md explicitly keeps "legacy
founder-os
 valid in repo slugs/package names/env vars" [Observed] — so the repo slug is compliant; in-doc references should use "MADVentures_OS Build Room."

7. Architecture options and recommended selection

Option A — New standalone product repo; cloud control plane + local gateway + web app (RECOMMENDED)

Monorepo
founder-os-build-room
:
packages/contracts
 (shared typed schemas),
packages/ledger
 (event-sourced state machine),
apps/control-plane
 (Express on Railway; Postgres/Neon; WebSocket+SSE),
apps/gateway
 (npm-distributed CLI daemon; provider adapters; worktree/sandbox/evidence manager),
apps/web
 (TanStack Start on Cloudflare Workers; Supabase founder auth per console pattern).

Pro:
 clean trust boundaries matching doctrine (runtime out of FounderOS, execution out of console); both ratified stacks reused; blast-radius isolation from the CoS runtime; contracts package is the "gateway-ready contract" DEC-20260807-01 anticipates; siblings later consume Build Room state via token-gated read APIs exactly like console↔telegram today [Observed pattern].

Con:
 third repo to operate (CI, secrets, deploys); some duplication of founder-auth and GitHub-App plumbing already existing in siblings (mitigated by copying proven patterns, not abstracting prematurely).

Option B — Extend founder-os-telegram (engine) + founder-os-console (UI)

Pro:
 reuses live approval lifecycle, evidence tables, founder auth, GitHub Apps; no new deploys.

Con:
 telegram runtime is constitutionally the
Telegram interface + CoS execution
 owner — a Build Room engine (worktrees, PTYs, provider CLIs) cannot run on Railway anyway (needs the founder's machine), so Option B still requires building the entire gateway, while coupling room orchestration into a 1,800-line CoS codebase with different concerns; console would need its write-impossibility constitution amended (deleting negative tests its own doctrine says never to delete) [Observed]. Rejected: highest coupling, weakest boundaries, still builds ~80% of Option A.

Option C — Adopt/fork Orca (MIT) as the foundation

Pro:
 mature relay/PTY/worktree machinery, active team, MIT license permits proprietary reuse.

Con [Observed]:
 Orca's trust posture is the inverse of this product — any CLI caller can send text to any terminal, resolve any decision gate, drive browser/OS; no identity-bound approvals, no roles, no SHA-bound review, no evidence chain; desktop-first with an account-coupled relay for mobile viewing, not a durable cloud authority; 3,431 open issues and near-daily releases = heavy fork-tracking burden. Retrofitting governance into a capability-maximizing codebase is more work and more risk than building a small governed core and borrowing Orca's
patterns
 (credit-based PTY streaming, worker fencing, hook-based agent observation). Rejected as foundation; retained as reference (FD-6 governs any component-level reuse).

Selection: Option A.
 It is the only option that satisfies the doctrine boundaries as ratified, keeps the orchestration core small enough to verify, and yields the versioned adapter contract governance already requires.

8. Selected architecture, component boundaries, ownership, and execution loci

Component

Locus

Owner (code)

Responsibility

Explicitly NOT responsible for

Control plane
 (
apps/control-plane
)

Cloud (Railway)

product repo

Authoritative build ledger (event-sourced state machine), room/decision/authorization services, GitHub App service (installation tokens, webhooks, checks), cost ledger, reconciler, projection/read models, gateway registry & presence

Executing anything on the founder's machine; holding provider secrets; merging PRs

Agent Gateway
 (
apps/gateway
)

Gateway (founder's machine)

product repo

Enrollment/heartbeat; provider adapters (spawn/stream provider CLIs & APIs headless); worktree & branch lifecycle; sandbox & path confinement; command classification/execution journal; evidence capture & signing; scoped git push; local mirrors

Deciding state transitions (proposes events; control plane validates/commits); storing anything durable beyond journal + credentials

Web app
 (
apps/web
)

Browser (Cloudflare Workers SSR)

product repo

Founder auth (Supabase + allowlist, console pattern); room feed; decision queue; plan approval; command approvals; authorization step-up UI; health/cost/evidence/readiness views

Any authority: it renders ledger projections and submits founder-signed intents; server functions hold no provider or GitHub write credentials beyond calling control-plane APIs

Contracts
 (
packages/contracts
)

shared library

product repo

Event envelope, all payload schemas (zod + generated JSON Schema), state machine table, adapter interface types — the versioned "gateway-ready contract"

Runtime behavior

Ledger
 (
packages/ledger
)

shared library (runs in control plane)

product repo

validateAndAppend guards, transition table enforcement, idempotency, SHA-binding checks, projection helpers

Storage engine specifics (adapter interface; Postgres impl in control plane)

Provider CLIs/APIs

Provider (invoked on gateway host)

vendors

Model execution under founder's own accounts

Any authority; adapters normalize their I/O

GitHub

GitHub

GitHub

Repo hosting, draft PRs, checks, rulesets, webhooks; merge executed by founder identity

—

FounderOS repo

founderos

governance

Doctrine, decisions, registries the product conforms to

Runtime anything

9. Trust-boundary and data-ownership model

Trust zones (descending trust):

Founder principal
 — the only source of: plan approval, consequential command approval, decision answers, ceiling changes, SHA-bound authorization, merge. Authenticated: Supabase session + allowlist (console pattern) with WebAuthn/TOTP step-up for authorization.

Control plane
 — trusted to enforce guards and never to originate founder events; holds: GitHub App private key (KMS/env-encrypted per repository-security-standard), webhook secret, DB creds. Never holds provider secrets.

Gateway
 — trusted with: local repo mirrors, worktrees, provider credentials (custody boundary), short-lived installation tokens fetched per-operation. Authenticates every message with its enrolled Ed25519 key. A compromised gateway ≡ compromised laptop: it can never emit founder events (rejected by actor validation) and its GitHub reach is capped by token scoping to allowlisted repos' builder branches.

Agents (provider processes)
 — untrusted executors. All effects mediated: file writes by sandbox+scope, commands by class policy, pushes by gateway, state by typed-event validation. Agent output text is data, never instruction to the orchestrator.

GitHub webhooks
 — verified data source (HMAC + delivery GUID), corroborated by polling; never an authorization source.

Data ownership:
 operational state + evidence + cost → product-owned Postgres (Neon, FD-2) with append-only evidence tables (telegram's CHECK-enum/trigger/RLS pattern reused [Observed]); artifacts → content-addressed store (Railway volume MVP; R2 later) keyed by sha256; provider secrets → gateway host only (OS keychain / provider-native stores like
~/.claude
 Keychain entry,
~/.codex/auth.json
,
~/.hermes/auth.json
 [Observed]); founder identity → Supabase (per-product project, per DEC-20260710-01 item 2 [Observed]); price table → versioned file in product repo.

10. Human-readable workflow and component blueprint

A build's life: the founder opens the web app, creates a Build Room against an allowlisted repo (base SHA captured), and assigns roles to healthy provider connections (reviewer must differ from builder by account+session). The Planner runs on the gateway against a read-only checkout of base SHA and submits a typed PlanDoc; the founder approves it (binding plan hash, scope paths, risk, criteria) or sends it back. On approval the gateway creates
buildroom/<room>/<build>
 from base SHA in an isolated, hook-disabled, dependency-hydrated worktree under a sandbox profile confining writes to approved scope paths. The Builder implements; questions pause the build into the founder's decision queue; consequential commands queue for single-use founder approval. The gateway — not the agent — runs and signs test evidence bound to the head SHA, then pushes (token scoped to the builder branch) and opens a draft PR. A review round opens binding the exact remote head SHA; the Reviewer gets a fresh read-only, credential-free worktree and returns typed findings. Blockers route to Builder remediation; every new push voids stale review/authorization state and forces a fresh round. When a round passes at the current head and required checks are green and evidence is verified, the founder sees a readiness summary and grants a single-use, SHA+plan-hash-bound authorization via step-up auth. The founder merges under their own GitHub identity; the control plane confirms via webhook + poll, closes the room, prunes worktrees, and freezes the evidence and cost record. At every moment, all participants see the same ledger-projected truth — including offline gateways, failed commands, unavailable costs, and reconciliation states — and nobody sees chain-of-thought.

11. Mermaid diagrams

11.1 System / component architecture with trust boundaries

flowchart LR
 subgraph BROWSER["Browser (founder devices)"]
 WEB["apps/web — room feed, decision queue,<br/>plan approval, step-up authorization"]
 end
 subgraph CLOUD["Cloud control plane (Railway) — no provider secrets"]
 LEDGER["packages/ledger — event ledger<br/>+ state machine guards"]
 ROOM["room / decision / authorization services"]
 GHS["github-app-service<br/>(installation tokens, webhooks, checks)"]
 COST["cost_meter"]
 RECON["reconciler"]
 FEED["room_feed projections"]
 DB[("Neon Postgres<br/>operational + evidence (append-only)")]
 BLOB[("artifact store<br/>content-addressed")]
 end
 subgraph GATEWAY["Local Agent Gateway (founder's machine) — credential custody boundary"]
 GWD["gateway daemon (Ed25519-signed channel)"]
 ADPT["provider adapters<br/>claude-code | codex | gemini | grok-build | cursor-agent | hermes"]
 WT["worktree + sandbox manager<br/>(scope confinement, hooks disabled)"]
 EV["evidence recorder (signs observed runs)"]
 CRED[("provider credentials<br/>OS keychain / provider stores — NEVER uploaded")]
 end
 subgraph PROVIDERS["Provider services (founder's own accounts)"]
 P1["Anthropic"] & P2["OpenAI"] & P3["Google"] & P4["xAI"] & P5["Cursor"] & P6["Nous"]
 end
 subgraph GH["GitHub"]
 REPO["allowlisted repos<br/>builder branches, draft PRs, checks"]
 RULES["ruleset: merge restricted to founder"]
 end
 subgraph FOS["FounderOS governance (doctrine only)"]
 DEC["DEC-* decisions, role registries, WF-17/18"]
 end
 WEB -->|"founder intents (authn + step-up)"| ROOM
 ROOM --> LEDGER --> DB
 FEED -->|"SSE/WebSocket projections"| WEB
 GWD <-->|"signed events / commands<br/>WebSocket + heartbeat"| ROOM
 ADPT --> P1 & P2 & P3 & P4 & P5 & P6
 GWD --> ADPT
 GWD --> WT --> EV
 EV -->|"signed evidence artifacts"| BLOB
 GWD -->|"push builder branch only<br/>(short-lived App token from GHS)"| REPO
 GHS <-->|"API + HMAC webhooks"| REPO
 RULES -.->|"merge = founder identity only"| REPO
 DEC -.->|"conformance (attribution, roles, custody)"| CLOUD

11.2 Governed build lifecycle / state machine

stateDiagram-v2
 [*] --> ROOM_CREATED : founder creates room (goal, ceiling)
 ROOM_CREATED --> SCOPED : repo + base_sha captured (founder)
 SCOPED --> PLANNING : roles assigned; gateway online
 PLANNING --> PLAN_REVIEW : plan.submitted (planner)
 PLAN_REVIEW --> PLANNING : plan.revision_requested (founder)
 PLAN_REVIEW --> BUILDING : plan.approved binds plan_hash+scope (founder)
 BUILDING --> BLOCKED_ON_FOUNDER : decision_request | command approval | ceiling.exceeded
 BLOCKED_ON_FOUNDER --> BUILDING : founder answers/approves
 BUILDING --> EVIDENCE_CAPTURE : implementation complete
 EVIDENCE_CAPTURE --> PUSHED : evidence bound to head; push + draft PR
 PUSHED --> IN_REVIEW : review.opened binds reviewed_sha (ro workspace)
 IN_REVIEW --> REMEDIATION : review.blocked (findings)
 REMEDIATION --> EVIDENCE_CAPTURE : new commits (new SHA voids stale rounds)
 IN_REVIEW --> CHECKS_VERIFIED : review.passed(sha) + required checks green
 CHECKS_VERIFIED --> AWAITING_FOUNDER_AUTH : readiness summary
 AWAITING_FOUNDER_AUTH --> AUTHORIZED : founder.authorization.granted (step-up, SHA-bound, single-use)
 AUTHORIZED --> MERGE_CONFIRMED : founder merges; webhook + poll corroborate
 MERGE_CONFIRMED --> CLOSED_DELIVERED : evidence verified; worktrees pruned
 PUSHED --> IN_REVIEW : any push → fresh round (stale review VOIDED)
 AUTHORIZED --> IN_REVIEW : push after authorization → AUTH_VOIDED
 state RECONCILING {
 [*] --> probing : gateway restart | webhook loss | ambiguous git | provider expiry
 probing --> [*] : resolved (recon.resumed)
 probing --> manual_required : bounded retries exhausted (fail closed)
 }
 BUILDING --> RECONCILING
 PUSHED --> RECONCILING
 AUTHORIZED --> RECONCILING
 RECONCILING --> BUILDING : recon.resumed
 ROOM_CREATED --> CLOSED_ABANDONED : founder.cancel
 BUILDING --> CLOSED_ABANDONED : founder.cancel
 AWAITING_FOUNDER_AUTH --> CLOSED_ABANDONED : founder.cancel
 CLOSED_DELIVERED --> [*]
 CLOSED_ABANDONED --> [*]

11.3 Sequence — one plan/build/review/remediate/authorize/merge cycle

sequenceDiagram
 autonumber
 actor F as Founder (web app)
 participant CP as Control plane (ledger)
 participant GW as Gateway
 participant PL as Planner agent
 participant BD as Builder agent
 participant RV as Reviewer agent
 participant GH as GitHub
 F->>CP: create room, goal, ceiling; select repo+branch
 CP->>GH: resolve base_sha (App token, contents:read)
 F->>CP: assign roles (reviewer ≠ builder connection)
 CP->>GW: dispatch planner task (signed command)
 GW->>PL: run headless on ro checkout @ base_sha
 PL-->>CP: plan.submitted (PlanDoc, plan_hash)
 F->>CP: plan.approved (binds plan_hash, scope, risk, criteria)
 CP->>GW: provision worktree + builder_branch @ base_sha
 GW->>BD: builder task (sandboxed, scope-confined)
 BD-->>F: decision_request (typed) — build pauses
 F-->>BD: decision.answered (via CP ledger)
 GW->>GW: run acceptance commands — signed evidence @ head
 GW->>GH: push builder_branch (scoped token); create DRAFT PR
 CP->>GW: open review round (reviewed_sha = remote head)
 GW->>RV: reviewer task in ro, credential-free worktree @ reviewed_sha
 RV-->>CP: review.findings (SHA-bound, typed)
 CP->>GW: dispatch remediation (blockers → builder)
 BD->>GW: fix commits → new head
 GW->>GH: push (new SHA) — stale round VOIDED automatically
 CP->>GW: fresh review round @ new head
 RV-->>CP: review.passed(new head)
 CP->>GH: verify required checks green @ head
 CP-->>F: readiness summary (checks, review, evidence, scope-diff)
 F->>CP: founder.authorization.granted (step-up; SHA+plan_hash bound; single-use)
 F->>GH: mark ready + MERGE under founder's own GitHub identity
 GH-->>CP: webhook merged (HMAC verified) + poll corroboration
 CP-->>F: MERGE_CONFIRMED → CLOSED_DELIVERED (evidence + cost frozen)

12. Machine-readable JSON graph manifest

The complete manifest (35 variables, 26 nodes, 37 edges, 12 invariants) validated by
validate-manifest.mjs
 this run — all six validation arrays empty.

{
 "graph_version": "1.0",
 "product": "founder-os-build-room",
 "variables": [
 {"id": "founder_identity", "type": "FounderPrincipal{user_id:UUID, auth_provider:string, mfa_level:enum[password,mfa,step_up]}", "source_of_truth": "control-plane identity service session store", "producer": "node.founder_auth", "authorized_consumers": ["control-plane", "audit-ledger", "web-app"], "required": true, "sensitivity": "confidential", "persistence": "operational", "validation": "authenticated session token verified by control-plane authn middleware on every request"},
 {"id": "organization_id", "type": "UUID", "source_of_truth": "control-plane organizations table", "producer": "node.founder_auth", "authorized_consumers": ["control-plane", "web-app", "gateway"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "FK exists AND founder_identity is member with role=founder"},
 {"id": "build_room_id", "type": "UUID", "source_of_truth": "control-plane build_rooms table", "producer": "node.room_create", "authorized_consumers": ["all room participants", "gateway", "event-ledger"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "FK exists AND belongs to organization_id"},
 {"id": "founder_goal", "type": "markdown string, max 32768 bytes", "source_of_truth": "room event ledger event goal.set", "producer": "founder via node.room_create", "authorized_consumers": ["planner-agent", "builder-agent", "reviewer-agent", "web-app"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "actor.principal_type=founder; size limit; schema goal.set@1"},
 {"id": "acceptance_criteria", "type": "list<Criterion{id:string, text:string, verify_method:enum[test_command,manual_check,ci_check]}>", "source_of_truth": "room event ledger event criteria.ratified", "producer": "planner drafts via node.plan_generate; founder ratifies via node.plan_approval", "authorized_consumers": ["builder-agent", "reviewer-agent", "verifier", "web-app"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "ratifying actor must be founder; each criterion has verify_method"},
 {"id": "constraints", "type": "list<Constraint{id:string, kind:enum[technical,legal,budget,style], text:string}>", "source_of_truth": "room event ledger event constraints.set", "producer": "founder via node.room_create or node.plan_approval", "authorized_consumers": ["planner-agent", "builder-agent", "reviewer-agent"], "required": false, "sensitivity": "internal", "persistence": "evidence", "validation": "actor=founder"},
 {"id": "repository_identity", "type": "RepoRef{owner:string, name:string, github_repo_id:int64}", "source_of_truth": "GitHub API verified through App installation", "producer": "founder selection via node.repo_scope_capture", "authorized_consumers": ["control-plane", "gateway", "github-app-service"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "member of repository_allowlist AND App installation covers repo"},
 {"id": "repository_allowlist", "type": "list<RepoRef>", "source_of_truth": "control-plane org policy table", "producer": "founder via org settings (external to build graph)", "authorized_consumers": ["control-plane", "gateway"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "write requires founder org-admin; gateway refuses repos outside list"},
 {"id": "base_branch", "type": "git ref name (refs/heads/*)", "source_of_truth": "GitHub API", "producer": "founder selection via node.repo_scope_capture", "authorized_consumers": ["gateway", "control-plane", "github-app-service"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "ref exists on remote at capture"},
 {"id": "base_sha", "type": "hex40", "source_of_truth": "GitHub API at capture instant", "producer": "node.repo_scope_capture", "authorized_consumers": ["planner-agent", "builder-agent", "reviewer-agent", "control-plane"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "equals remote head of base_branch at capture; immutable thereafter"},
 {"id": "approved_scope_paths", "type": "list<repo-relative glob, canonicalized, no '..'>", "source_of_truth": "plan.approved event payload", "producer": "planner proposes via node.plan_generate; founder approves via node.plan_approval", "authorized_consumers": ["gateway-sandbox", "command-authorizer", "builder-agent"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "canonical globs; symlink-escape check at enforcement time in gateway"},
 {"id": "risk_classification", "type": "enum[low,standard,elevated,critical]", "source_of_truth": "plan.approved event payload", "producer": "planner proposes; founder ratifies via node.plan_approval", "authorized_consumers": ["command-authorizer", "web-app"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "ratifying actor=founder; drives command-class policy strictness"},
 {"id": "spend_ceiling", "type": "Money{currency:ISO4217, amount:decimal, per:'build'}", "source_of_truth": "room event ledger event ceiling.set", "producer": "founder via node.room_create", "authorized_consumers": ["cost-meter", "orchestrator", "web-app"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "actor=founder; amount > 0"},
 {"id": "price_table_version", "type": "SemVer + {source_url:URL, effective_date:date}", "source_of_truth": "versioned pricing registry file in product repo", "producer": "product release process (external)", "authorized_consumers": ["cost-meter"], "required": true, "sensitivity": "public", "persistence": "evidence", "validation": "version exists in registry; cost computations must name it"},
 {"id": "role_assignments", "type": "map<Role[planner,builder,reviewer] -> provider_connection_id>", "source_of_truth": "room event ledger event roles.assigned", "producer": "founder via node.role_assign", "authorized_consumers": ["orchestrator", "gateway", "web-app"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "actor=founder; reviewer connection differs from builder connection in provider account AND session; all connections healthy"},
 {"id": "provider_connections", "type": "list<ProviderConnection{id:UUID, provider:enum[claude,codex,gemini,grok,hermes,cursor], auth_mode:enum, custody:enum[local_only,cloud_api_key], capabilities:CapabilitySet, health:HealthState}>", "source_of_truth": "gateway connection registry (secret material) + cloud metadata mirror (no secrets)", "producer": "node.provider_connect", "authorized_consumers": ["orchestrator (metadata only)", "gateway (full)", "web-app (metadata only)"], "required": true, "sensitivity": "secret", "persistence": "operational", "validation": "capability set matches adapter-declared schema; custody=cloud_api_key requires recorded founder decision event"},
 {"id": "provider_auth_method", "type": "enum[local_cli_login, api_key_local, api_key_cloud, oauth_device] per connection", "source_of_truth": "provider_connections registry", "producer": "node.provider_connect", "authorized_consumers": ["orchestrator", "web-app"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "member of adapter-declared auth_modes for that provider"},
 {"id": "gateway_identity", "type": "GatewayIdentity{gateway_id:UUID, ed25519_pubkey, host_fingerprint, enrolled_at}", "source_of_truth": "control-plane gateway registry", "producer": "node.gateway_enroll", "authorized_consumers": ["control-plane", "web-app"], "required": true, "sensitivity": "confidential", "persistence": "operational", "validation": "founder approves enrollment; every gateway message signature-verified against pubkey"},
 {"id": "gateway_health", "type": "HealthState{status:enum[online,offline,degraded], last_heartbeat:ts, agent_versions:map}", "source_of_truth": "control-plane derived from signed heartbeats", "producer": "node.gateway_health_monitor", "authorized_consumers": ["web-app", "orchestrator"], "required": true, "sensitivity": "internal", "persistence": "ephemeral", "validation": "heartbeat staleness > 30s => offline; offline pauses dispatch, never fakes online"},
 {"id": "local_workspace_root", "type": "absolute path on gateway host", "source_of_truth": "gateway local config file", "producer": "founder at gateway setup (external)", "authorized_consumers": ["gateway ONLY"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "canonical path owned by gateway user; never transmitted to cloud (cloud sees opaque worktree ids)"},
 {"id": "plan_artifact", "type": "Artifact{kind:'plan', content: PlanDoc{steps, scope_paths, risk, criteria_draft}, content_hash:sha256}", "source_of_truth": "artifact store (content-addressed)", "producer": "node.plan_generate", "authorized_consumers": ["founder", "builder-agent", "reviewer-agent", "web-app"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "PlanDoc schema plan@1; content_hash matches stored bytes"},
 {"id": "plan_hash", "type": "sha256 hex", "source_of_truth": "artifact store metadata", "producer": "control-plane on plan submission", "authorized_consumers": ["node.plan_approval", "node.founder_authorization_gate"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "recomputed and matched at approval; approval binds this hash"},
 {"id": "command_approval_subject", "type": "CommandSpec{command_id:ULID, argv:list<string>, cwd:worktree-relative path, class:enum[read,build,test,package,network,consequential], requested_by:principal}", "source_of_truth": "command authorization queue (control-plane) + gateway journal", "producer": "builder-agent tool-call via node.build_execute", "authorized_consumers": ["founder (approve/deny)", "gateway-executor", "audit-ledger"], "required": false, "sensitivity": "internal", "persistence": "evidence", "validation": "class derived by gateway policy, not agent claim; consequential class requires founder approval event bound to command_id"},
 {"id": "builder_branch", "type": "git ref matching pattern buildroom/{room_short}/{build_short}", "source_of_truth": "GitHub + gateway git", "producer": "node.worktree_provision", "authorized_consumers": ["builder-agent (rw)", "reviewer-agent (ro)", "github-app-service"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "pattern match; never equals base_branch; push credential scoped to this ref"},
 {"id": "worktree_identity", "type": "WorktreeRef{worktree_id:UUID, role:enum[builder,reviewer,planner], branch:ref, mode:enum[rw,ro]}", "source_of_truth": "gateway worktree registry", "producer": "node.worktree_provision / node.review_provision", "authorized_consumers": ["gateway", "orchestrator (id+mode only)"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "path under local_workspace_root; mode matches role profile; reviewer worktrees have mode=ro enforced by filesystem permissions"},
 {"id": "current_head_sha", "type": "hex40", "source_of_truth": "GitHub remote head of builder_branch (gateway local state is a cache)", "producer": "builder pushes via node.push_and_draft_pr / node.remediation", "authorized_consumers": ["orchestrator", "node.review_provision", "node.checks_verify", "node.founder_authorization_gate"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "re-fetched from GitHub API at every gate; ledger snapshots are evidence"},
 {"id": "test_artifacts", "type": "list<Artifact{kind:'test_report', command:CommandSpec, exit_code:int, output_ref:blob, sha_binding:hex40, started/ended:ts, gateway_signature}>", "source_of_truth": "artifact store", "producer": "node.evidence_capture (gateway-observed execution, never agent-claimed)", "authorized_consumers": ["founder", "reviewer-agent", "web-app", "closure gate"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "gateway signature valid; sha_binding equals head at execution"},
 {"id": "pull_request_identity", "type": "PrRef{number:int, node_id:string, url:URL, head_sha:hex40, draft:bool}", "source_of_truth": "GitHub API", "producer": "node.push_and_draft_pr", "authorized_consumers": ["orchestrator", "web-app", "node.checks_verify", "node.merge_confirm"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "created draft=true; base=base_branch; head=builder_branch"},
 {"id": "review_round_identity", "type": "ReviewRound{round_n:int, reviewed_sha:hex40, reviewer_connection_id:UUID, opened_at:ts}", "source_of_truth": "room event ledger event review.opened", "producer": "node.review_provision", "authorized_consumers": ["reviewer-agent", "founder", "node.founder_authorization_gate"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "reviewer_connection_id != builder connection; reviewed_sha == remote head at open"},
 {"id": "reviewed_sha", "type": "hex40", "source_of_truth": "review.opened event payload", "producer": "node.review_provision", "authorized_consumers": ["node.review_execute", "node.checks_verify", "node.founder_authorization_gate"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "any push of builder_branch after opened_at voids rounds bound to older sha"},
 {"id": "review_findings", "type": "list<Finding{id:string, severity:enum[blocker,major,minor,note], file:path, line:int?, claim:string, evidence_ref:artifact_id, disposition:enum[open,remediated,waived_by_founder,rejected_with_reason]}>", "source_of_truth": "artifact store + review.findings event", "producer": "node.review_execute", "authorized_consumers": ["builder-agent", "founder", "web-app"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "schema findings@1; bound to reviewed_sha; disposition transitions are typed events with authorized actors"},
 {"id": "founder_authorization", "type": "Authorization{auth_id:UUID, build_id:UUID, authorized_sha:hex40, plan_hash:sha256, granted_by:founder principal, step_up_method:enum[webauthn,totp], granted_at:ts, voided_at:ts?}", "source_of_truth": "control-plane authorization table + ledger event founder.authorization.granted", "producer": "node.founder_authorization_gate (FOUNDER ONLY)", "authorized_consumers": ["merge gate UI", "audit"], "required": true, "sensitivity": "confidential", "persistence": "evidence", "validation": "actor=founder with fresh step-up; authorized_sha == remote head == reviewed_sha of passing round; required checks green; single-use; voided by any subsequent push"},
 {"id": "evidence_delivery_state", "type": "map<artifact_id -> enum[pending,written,verified,failed]>", "source_of_truth": "evidence pipeline table", "producer": "node.evidence_capture writer", "authorized_consumers": ["web-app", "node.closure"], "required": true, "sensitivity": "internal", "persistence": "operational", "validation": "closure requires all verified OR explicit founder.waiver event naming artifact_ids; failed shown as failed, never as absence"},
 {"id": "usage_and_cost_events", "type": "list<CostEvent{event_id:ULID, connection_id:UUID, task_id:UUID, tokens_in:int?, tokens_out:int?, provider_reported_cost:Money?, computed_cost:{amount:Money, price_table_version:SemVer}?, source:enum[provider_reported,computed,unavailable]}>", "source_of_truth": "cost ledger", "producer": "provider adapters via node.cost_meter", "authorized_consumers": ["founder", "web-app", "orchestrator ceiling check"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "source labeling mandatory; computed requires price_table_version; unavailable displayed as unavailable, never zero"},
 {"id": "failure_or_reconciliation_state", "type": "ReconState{mode:enum[none,reconciling,manual_required], cause:enum[gateway_restart,webhook_loss,ambiguous_git,provider_expiry,interrupted_command,evidence_write_failure,timeout], detected_at:ts, resolution_event_id:ULID?}", "source_of_truth": "room event ledger", "producer": "node.reconciler", "authorized_consumers": ["orchestrator", "web-app", "founder"], "required": true, "sensitivity": "internal", "persistence": "evidence", "validation": "bounded retries per cause; exhaustion => manual_required (fail closed), founder-visible"}
 ],
 "nodes": [
 {"id": "founder_auth", "label": "Founder authentication & org selection", "owner": "control-plane identity service", "execution_locus": "cloud", "responsibility": "Authenticate founder (MFA), establish session, select organization", "inputs": [], "outputs": [{"variable_id": "founder_identity", "type": "FounderPrincipal"}, {"variable_id": "organization_id", "type": "UUID"}], "permissions": {"read": ["identity store"], "write": ["sessions"], "prohibited": ["provider secrets", "gateway filesystem"]}, "failure_states": ["auth_failed", "mfa_unavailable", "org_membership_missing"]},
 {"id": "room_create", "label": "Create Build Room & set goal/ceiling", "owner": "control-plane room service", "execution_locus": "cloud", "responsibility": "Create room, record founder_goal, constraints, spend_ceiling as ledger events", "inputs": [{"variable_id": "founder_identity", "type": "FounderPrincipal", "required": true}, {"variable_id": "organization_id", "type": "UUID", "required": true}], "outputs": [{"variable_id": "build_room_id", "type": "UUID"}, {"variable_id": "founder_goal", "type": "markdown"}, {"variable_id": "constraints", "type": "list<Constraint>"}, {"variable_id": "spend_ceiling", "type": "Money"}], "permissions": {"read": ["org policy"], "write": ["build_rooms", "event ledger"], "prohibited": ["git operations", "provider calls"]}, "failure_states": ["policy_violation", "ledger_write_failed"]},
 {"id": "gateway_enroll", "label": "Gateway enrollment / revocation / recovery", "owner": "gateway daemon + control-plane gateway registry", "execution_locus": "gateway", "responsibility": "Enroll gateway with keypair via founder-approved pairing code; support revoke and re-enroll", "inputs": [{"variable_id": "founder_identity", "type": "FounderPrincipal", "required": true}, {"variable_id": "organization_id", "type": "UUID", "required": true}], "outputs": [{"variable_id": "gateway_identity", "type": "GatewayIdentity"}], "permissions": {"read": ["pairing codes"], "write": ["gateway registry", "local key store"], "prohibited": ["founder session tokens", "other orgs"]}, "failure_states": ["pairing_expired", "founder_denied", "key_generation_failed"]},
 {"id": "gateway_health_monitor", "label": "Gateway heartbeat & health", "owner": "control-plane presence service", "execution_locus": "cloud", "responsibility": "Track signed heartbeats; mark offline on staleness; pause dispatch when offline", "inputs": [{"variable_id": "gateway_identity", "type": "GatewayIdentity", "required": true}], "outputs": [{"variable_id": "gateway_health", "type": "HealthState"}], "permissions": {"read": ["heartbeats"], "write": ["gateway_health"], "prohibited": ["fabricating online status"]}, "failure_states": ["heartbeat_stale", "signature_invalid"]},
 {"id": "provider_connect", "label": "Provider connection & capability negotiation", "owner": "gateway provider-adapter host", "execution_locus": "gateway", "responsibility": "Founder logs into provider CLIs locally; adapters probe auth state and declare capabilities; cloud mirrors metadata only", "inputs": [{"variable_id": "gateway_identity", "type": "GatewayIdentity", "required": true}], "outputs": [{"variable_id": "provider_connections", "type": "list<ProviderConnection>"}, {"variable_id": "provider_auth_method", "type": "enum"}], "permissions": {"read": ["local credential stores (per provider, via provider's own tooling)"], "write": ["gateway connection registry", "cloud metadata mirror (no secrets)"], "prohibited": ["transmitting provider secrets to cloud", "storing secrets outside OS keychain/provider-native store"]}, "failure_states": ["auth_expired", "capability_probe_failed", "unsupported_provider_version"]},
 {"id": "repo_scope_capture", "label": "Repository & base-SHA capture", "owner": "control-plane github-app-service", "execution_locus": "cloud", "responsibility": "Founder selects allowlisted repo+branch; capture immutable base_sha from GitHub", "inputs": [{"variable_id": "founder_identity", "type": "FounderPrincipal", "required": true}, {"variable_id": "repository_allowlist", "type": "list<RepoRef>", "required": true}, {"variable_id": "build_room_id", "type": "UUID", "required": true}], "outputs": [{"variable_id": "repository_identity", "type": "RepoRef"}, {"variable_id": "base_branch", "type": "ref"}, {"variable_id": "base_sha", "type": "hex40"}], "permissions": {"read": ["GitHub API via App installation token (contents:read)"], "write": ["event ledger"], "prohibited": ["push", "merge", "repos outside allowlist"]}, "failure_states": ["repo_not_allowlisted", "installation_missing", "branch_not_found", "github_unreachable"]},
 {"id": "role_assign", "label": "Role assignment & independence check", "owner": "control-plane room service", "execution_locus": "cloud", "responsibility": "Founder maps planner/builder/reviewer to provider connections; enforce reviewer independence", "inputs": [{"variable_id": "founder_identity", "type": "FounderPrincipal", "required": true}, {"variable_id": "provider_connections", "type": "list<ProviderConnection>", "required": true}, {"variable_id": "build_room_id", "type": "UUID", "required": true}], "outputs": [{"variable_id": "role_assignments", "type": "map<Role,UUID>"}], "permissions": {"read": ["connection metadata"], "write": ["event ledger"], "prohibited": ["assigning reviewer == builder connection", "agent-initiated assignment"]}, "failure_states": ["independence_violation", "connection_unhealthy"]},
 {"id": "plan_generate", "label": "Planner produces reviewable plan", "owner": "orchestrator task runner (planner role)", "execution_locus": "provider", "responsibility": "Planner agent (read-only checkout at base_sha) converts goal into PlanDoc: steps, scope_paths, risk, criteria draft", "inputs": [{"variable_id": "founder_goal", "type": "markdown", "required": true}, {"variable_id": "constraints", "type": "list<Constraint>", "required": false}, {"variable_id": "base_sha", "type": "hex40", "required": true}, {"variable_id": "role_assignments", "type": "map<Role,UUID>", "required": true}], "outputs": [{"variable_id": "plan_artifact", "type": "Artifact<plan>"}, {"variable_id": "plan_hash", "type": "sha256"}, {"variable_id": "acceptance_criteria", "type": "list<Criterion> (draft)"}], "permissions": {"read": ["read-only worktree at base_sha", "room-approved context"], "write": ["plan artifact"], "prohibited": ["file mutation", "git write", "network beyond provider", "state transitions"]}, "failure_states": ["provider_timeout", "plan_schema_invalid", "spend_ceiling_hit"]},
 {"id": "plan_approval", "label": "Founder plan approval (binds plan_hash)", "owner": "web-app decision queue + control-plane", "execution_locus": "browser", "responsibility": "Founder approves, edits scope, or requests revision; approval event binds plan_hash, scope paths, risk, criteria", "inputs": [{"variable_id": "plan_artifact", "type": "Artifact<plan>", "required": true}, {"variable_id": "plan_hash", "type": "sha256", "required": true}, {"variable_id": "founder_identity", "type": "FounderPrincipal", "required": true}], "outputs": [{"variable_id": "approved_scope_paths", "type": "list<glob>"}, {"variable_id": "risk_classification", "type": "enum"}, {"variable_id": "acceptance_criteria", "type": "list<Criterion> (ratified)"}], "permissions": {"read": ["plan artifact"], "write": ["event ledger (plan.approved | plan.revision_requested)"], "prohibited": ["approval by any non-founder principal", "approval of mismatched plan_hash"]}, "failure_states": ["revision_requested", "plan_hash_mismatch", "founder_timeout"]},
 {"id": "worktree_provision", "label": "Builder worktree & branch provisioning", "owner": "gateway workspace manager", "execution_locus": "gateway", "responsibility": "Create builder_branch from base_sha, isolated worktree, hydrate dependencies, apply sandbox profile with scope-path confinement, disable git hooks", "inputs": [{"variable_id": "repository_identity", "type": "RepoRef", "required": true}, {"variable_id": "base_sha", "type": "hex40", "required": true}, {"variable_id": "approved_scope_paths", "type": "list<glob>", "required": true}, {"variable_id": "local_workspace_root", "type": "path", "required": true}], "outputs": [{"variable_id": "builder_branch", "type": "ref"}, {"variable_id": "worktree_identity", "type": "WorktreeRef(mode=rw)"}], "permissions": {"read": ["repo mirror"], "write": ["worktree under workspace root", "builder_branch ref (local)"], "prohibited": ["base_branch mutation", "paths outside workspace root", "enabling repo-provided git hooks"]}, "failure_states": ["clone_failed", "dependency_hydration_failed", "disk_exhausted", "sandbox_profile_failed"]},
 {"id": "build_execute", "label": "Builder implements approved scope", "owner": "orchestrator task runner (builder role)", "execution_locus": "provider", "responsibility": "Builder agent edits only within worktree+scope; commands mediated by gateway policy; emits progress and commits", "inputs": [{"variable_id": "plan_artifact", "type": "Artifact<plan>", "required": true}, {"variable_id": "worktree_identity", "type": "WorktreeRef(rw)", "required": true}, {"variable_id": "approved_scope_paths", "type": "list<glob>", "required": true}, {"variable_id": "acceptance_criteria", "type": "list<Criterion>", "required": true}, {"variable_id": "spend_ceiling", "type": "Money", "required": true}], "outputs": [{"variable_id": "command_approval_subject", "type": "CommandSpec (when consequential)"}, {"variable_id": "current_head_sha", "type": "hex40 (local commits)"}], "permissions": {"read": ["worktree", "room-approved context"], "write": ["files within scope paths in own worktree", "local commits on builder_branch"], "prohibited": ["push without gateway mediation", "paths outside scope", "review of own work", "state transitions", "founder-voice messages"]}, "failure_states": ["provider_timeout", "provider_auth_expired", "blocked_on_clarification", "scope_violation_detected", "ceiling_exceeded"]},
 {"id": "clarification_gate", "label": "Blocking clarification & founder decisions", "owner": "control-plane decision queue", "execution_locus": "cloud", "responsibility": "Agent questions become typed decision requests; build pauses; founder answers from any device; answer recorded as ledger event", "inputs": [{"variable_id": "build_room_id", "type": "UUID", "required": true}, {"variable_id": "founder_identity", "type": "FounderPrincipal", "required": true}], "outputs": [], "permissions": {"read": ["decision queue"], "write": ["event ledger (decision.answered)"], "prohibited": ["auto-answering on founder's behalf", "agent answering founder decisions"]}, "failure_states": ["decision_timeout", "founder_unreachable"]},
 {"id": "command_authorize", "label": "Scoped command authorization", "owner": "control-plane policy engine + gateway executor", "execution_locus": "cloud", "responsibility": "Classify requested commands (gateway-derived class); auto-allow safe classes per policy; queue consequential classes for founder approval bound to command_id", "inputs": [{"variable_id": "command_approval_subject", "type": "CommandSpec", "required": true}, {"variable_id": "risk_classification", "type": "enum", "required": true}, {"variable_id": "founder_identity", "type": "FounderPrincipal", "required": true}], "outputs": [], "permissions": {"read": ["command policy"], "write": ["event ledger (command.approved | command.denied)", "gateway execution grant (single command_id)"], "prohibited": ["approval derived from message text", "blanket grants", "agent self-approval"]}, "failure_states": ["denied", "approval_timeout", "policy_engine_unavailable"]},
 {"id": "evidence_capture", "label": "Test & verification evidence capture", "owner": "gateway evidence recorder", "execution_locus": "gateway", "responsibility": "Execute/observe test and verification commands; record exit codes, outputs, timing as gateway-signed artifacts bound to head SHA; upload with delivery tracking", "inputs": [{"variable_id": "worktree_identity", "type": "WorktreeRef", "required": true}, {"variable_id": "current_head_sha", "type": "hex40", "required": true}, {"variable_id": "acceptance_criteria", "type": "list<Criterion>", "required": true}], "outputs": [{"variable_id": "test_artifacts", "type": "list<Artifact<test_report>>"}, {"variable_id": "evidence_delivery_state", "type": "map"}], "permissions": {"read": ["worktree", "command outputs"], "write": ["artifact store", "evidence pipeline table"], "prohibited": ["accepting agent-claimed results without observed execution", "mutating outputs"]}, "failure_states": ["command_failed (recorded, not hidden)", "artifact_upload_failed", "signature_failure"]},
 {"id": "push_and_draft_pr", "label": "Branch push & draft PR creation", "owner": "gateway git service + github-app-service", "execution_locus": "gateway", "responsibility": "Push builder_branch using short-lived App installation token scoped to repo; create/refresh draft PR (draft=true) against base_branch", "inputs": [{"variable_id": "builder_branch", "type": "ref", "required": true}, {"variable_id": "current_head_sha", "type": "hex40", "required": true}, {"variable_id": "test_artifacts", "type": "list<Artifact>", "required": true}, {"variable_id": "repository_identity", "type": "RepoRef", "required": true}], "outputs": [{"variable_id": "pull_request_identity", "type": "PrRef"}, {"variable_id": "current_head_sha", "type": "hex40 (remote-confirmed)"}], "permissions": {"read": ["worktree git objects"], "write": ["push to builder_branch ONLY (token-scoped)", "create draft PR"], "prohibited": ["push to base_branch", "marking PR ready-for-review", "merge", "force-push after review opened without voiding"]}, "failure_states": ["push_rejected", "token_expired", "pr_creation_failed", "evidence_missing_blocks_push"]},
 {"id": "review_provision", "label": "Reviewer read-only workspace at exact SHA", "owner": "gateway workspace manager", "execution_locus": "gateway", "responsibility": "Create detached read-only worktree at current remote head; strip credentials (no credential helper, read-only or local-mirror remote); open review round binding reviewed_sha", "inputs": [{"variable_id": "pull_request_identity", "type": "PrRef", "required": true}, {"variable_id": "current_head_sha", "type": "hex40", "required": true}, {"variable_id": "role_assignments", "type": "map<Role,UUID>", "required": true}, {"variable_id": "local_workspace_root", "type": "path", "required": true}], "outputs": [{"variable_id": "review_round_identity", "type": "ReviewRound"}, {"variable_id": "reviewed_sha", "type": "hex40"}, {"variable_id": "worktree_identity", "type": "WorktreeRef(mode=ro)"}], "permissions": {"read": ["repo mirror at reviewed_sha"], "write": ["review round ledger event"], "prohibited": ["write bits on reviewer worktree", "git credentials in reviewer environment", "reviewer connection == builder connection"]}, "failure_states": ["sha_moved_before_open (reopen at new head)", "independence_violation", "workspace_creation_failed"]},
 {"id": "review_execute", "label": "Independent exact-SHA review", "owner": "orchestrator task runner (reviewer role)", "execution_locus": "provider", "responsibility": "Reviewer agent examines diff base_sha..reviewed_sha and evidence; runs read-only analysis from allowlist; emits typed findings bound to reviewed_sha", "inputs": [{"variable_id": "reviewed_sha", "type": "hex40", "required": true}, {"variable_id": "worktree_identity", "type": "WorktreeRef(ro)", "required": true}, {"variable_id": "plan_artifact", "type": "Artifact<plan>", "required": true}, {"variable_id": "test_artifacts", "type": "list<Artifact>", "required": true}, {"variable_id": "acceptance_criteria", "type": "list<Criterion>", "required": true}], "outputs": [{"variable_id": "review_findings", "type": "list<Finding>"}], "permissions": {"read": ["read-only worktree", "evidence artifacts", "room-approved context"], "write": ["findings artifact ONLY"], "prohibited": ["file mutation", "git write/push/commit", "credential access", "approving own provider's build", "state transitions", "merge"]}, "failure_states": ["provider_timeout", "sha_voided_mid_review", "findings_schema_invalid"]},
 {"id": "findings_gate", "label": "Findings disposition & re-review routing", "owner": "control-plane review service", "execution_locus": "cloud", "responsibility": "Validate findings event (actor, sha); route: blockers => remediation; none/all-resolved => review.passed(sha); founder may waive findings explicitly", "inputs": [{"variable_id": "review_findings", "type": "list<Finding>", "required": true}, {"variable_id": "reviewed_sha", "type": "hex40", "required": true}, {"variable_id": "review_round_identity", "type": "ReviewRound", "required": true}], "outputs": [], "permissions": {"read": ["findings", "round state"], "write": ["event ledger (review.passed | review.blocked)"], "prohibited": ["passing review with open blockers absent founder waiver", "review.passed for sha != current remote head"]}, "failure_states": ["stale_sha_detected", "disposition_conflict"]},
 {"id": "remediation", "label": "Builder remediation of findings", "owner": "orchestrator task runner (builder role)", "execution_locus": "provider", "responsibility": "Builder addresses findings in same worktree; new commits pushed via push_and_draft_pr; every new SHA voids prior review and triggers fresh round", "inputs": [{"variable_id": "review_findings", "type": "list<Finding>", "required": true}, {"variable_id": "worktree_identity", "type": "WorktreeRef(rw)", "required": true}, {"variable_id": "approved_scope_paths", "type": "list<glob>", "required": true}], "outputs": [{"variable_id": "current_head_sha", "type": "hex40 (new)"}], "permissions": {"read": ["findings", "worktree"], "write": ["files within scope", "local commits"], "prohibited": ["disputing findings by editing them", "push outside gateway mediation", "scope expansion without founder approval"]}, "failure_states": ["provider_timeout", "cannot_remediate (escalate to founder)", "ceiling_exceeded"]},
 {"id": "checks_verify", "label": "Required-check & governance verification", "owner": "control-plane github-app-service", "execution_locus": "cloud", "responsibility": "Verify at current head: required CI checks green, review.passed(sha) exists, evidence verified, scope-diff conformance; assemble readiness summary", "inputs": [{"variable_id": "pull_request_identity", "type": "PrRef", "required": true}, {"variable_id": "current_head_sha", "type": "hex40", "required": true}, {"variable_id": "reviewed_sha", "type": "hex40", "required": true}, {"variable_id": "evidence_delivery_state", "type": "map", "required": true}], "outputs": [], "permissions": {"read": ["GitHub checks API", "ledger", "evidence states"], "write": ["event ledger (checks.verified | checks.failed)"], "prohibited": ["marking verified when any input is unknown (fail closed)", "merge"]}, "failure_states": ["checks_failed", "sha_mismatch", "evidence_unverified", "github_unreachable"]},
 {"id": "founder_authorization_gate", "label": "SHA-bound founder authorization (step-up)", "owner": "control-plane authorization service + web-app", "execution_locus": "browser", "responsibility": "Founder reviews readiness summary and grants single-use authorization bound to exact SHA + plan_hash via step-up auth (WebAuthn/TOTP)", "inputs": [{"variable_id": "founder_identity", "type": "FounderPrincipal", "required": true}, {"variable_id": "current_head_sha", "type": "hex40", "required": true}, {"variable_id": "reviewed_sha", "type": "hex40", "required": true}, {"variable_id": "plan_hash", "type": "sha256", "required": true}, {"variable_id": "pull_request_identity", "type": "PrRef", "required": true}], "outputs": [{"variable_id": "founder_authorization", "type": "Authorization"}], "permissions": {"read": ["readiness summary"], "write": ["authorization table", "event ledger (founder.authorization.granted)"], "prohibited": ["issuance by agent/gateway/orchestrator/GitHub event", "authorization when reviewed_sha != head", "reuse of a voided or consumed authorization"]}, "failure_states": ["step_up_failed", "sha_moved (void & re-verify)", "founder_declined"]},
 {"id": "merge_confirm", "label": "Founder-controlled merge & webhook confirmation", "owner": "founder (GitHub identity) + control-plane webhook service", "execution_locus": "github", "responsibility": "Founder marks PR ready and merges under their own GitHub identity (ruleset restricts merge to founder); control plane confirms via HMAC-verified webhook + reconciliation poll", "inputs": [{"variable_id": "founder_authorization", "type": "Authorization", "required": true}, {"variable_id": "pull_request_identity", "type": "PrRef", "required": true}], "outputs": [], "permissions": {"read": ["webhook deliveries", "GitHub PR state"], "write": ["event ledger (merge.confirmed)"], "prohibited": ["merge by App token or agent principal", "confirming merge without webhook or poll evidence"]}, "failure_states": ["webhook_lost (reconciler poll)", "merge_blocked_by_ruleset", "head_changed_before_merge (authorization voided)"]},
 {"id": "cost_meter", "label": "Usage & cost recording and ceiling enforcement", "owner": "control-plane cost service", "execution_locus": "cloud", "responsibility": "Ingest adapter usage reports; label source (provider_reported | computed@price_table_version | unavailable); enforce spend_ceiling by pausing dispatch", "inputs": [{"variable_id": "usage_and_cost_events", "type": "list<CostEvent>", "required": true}, {"variable_id": "spend_ceiling", "type": "Money", "required": true}, {"variable_id": "price_table_version", "type": "SemVer", "required": true}], "outputs": [], "permissions": {"read": ["cost ledger"], "write": ["cost ledger", "event ledger (ceiling.warning | ceiling.exceeded)"], "prohibited": ["displaying unavailable as zero", "unlabeled cost claims"]}, "failure_states": ["provider_usage_unavailable (labeled)", "ceiling_exceeded (pause + founder decision)"]},
 {"id": "reconciler", "label": "Failure, timeout, resume & reconciliation", "owner": "control-plane reconciliation service + gateway journal replay", "execution_locus": "cloud", "responsibility": "Detect gateway restart, webhook loss, interrupted commands, ambiguous git, provider expiry; compare GitHub/gateway/ledger state; bounded retries then manual_required", "inputs": [{"variable_id": "gateway_health", "type": "HealthState", "required": true}, {"variable_id": "failure_or_reconciliation_state", "type": "ReconState", "required": true}, {"variable_id": "current_head_sha", "type": "hex40", "required": true}], "outputs": [{"variable_id": "failure_or_reconciliation_state", "type": "ReconState"}], "permissions": {"read": ["ledger", "GitHub API", "gateway journal"], "write": ["event ledger (recon.* events)"], "prohibited": ["synthesizing success states", "unbounded retry loops"]}, "failure_states": ["manual_required (fail closed, founder-visible)"]},
 {"id": "room_feed", "label": "Shared room feed & truthful status projection", "owner": "control-plane projection service + web-app", "execution_locus": "cloud", "responsibility": "Project ledger into shared conversation, decision queue, agent states, gateway/provider health, cost, evidence, GitHub readiness; identical truth for all participants; no chain-of-thought", "inputs": [{"variable_id": "build_room_id", "type": "UUID", "required": true}, {"variable_id": "gateway_health", "type": "HealthState", "required": true}, {"variable_id": "evidence_delivery_state", "type": "map", "required": true}, {"variable_id": "failure_or_reconciliation_state", "type": "ReconState", "required": true}], "outputs": [], "permissions": {"read": ["event ledger", "artifact metadata"], "write": ["read models only"], "prohibited": ["state mutation", "storing or displaying private chain-of-thought", "masking negative states"]}, "failure_states": ["projection_lag (displayed as stale, with timestamp)"]},
 {"id": "closure", "label": "Terminal closure (delivered/cancelled/abandoned)", "owner": "control-plane room service", "execution_locus": "cloud", "responsibility": "Close build after merge confirmation (or cancellation); verify evidence delivery complete; prune worktrees; final cost report", "inputs": [{"variable_id": "evidence_delivery_state", "type": "map", "required": true}, {"variable_id": "usage_and_cost_events", "type": "list<CostEvent>", "required": true}, {"variable_id": "build_room_id", "type": "UUID", "required": true}], "outputs": [], "permissions": {"read": ["ledger", "evidence states"], "write": ["event ledger (build.closed)", "gateway prune command"], "prohibited": ["closing with unverified evidence absent founder waiver", "deleting evidence"]}, "failure_states": ["evidence_incomplete (blocks closure)", "prune_failed (recorded)"]}
 ],
 "edges": [
 {"id": "e01", "from": "founder_auth", "to": "room_create", "trigger": "founder submits new-build form", "condition": "authenticated founder session; org membership role=founder", "input_bindings": [{"source_variable": "founder_identity", "destination_input": "founder_identity", "type": "FounderPrincipal"}, {"source_variable": "organization_id", "destination_input": "organization_id", "type": "UUID"}], "authorized_actor": "founder", "idempotency_key": "client_request_id", "retry_policy": "user-retry", "on_failure": "surface error; no room created"},
 {"id": "e02", "from": "room_create", "to": "gateway_enroll", "trigger": "room requires gateway; none enrolled/online for org", "condition": "no healthy enrolled gateway", "input_bindings": [{"source_variable": "founder_identity", "destination_input": "founder_identity", "type": "FounderPrincipal"}, {"source_variable": "organization_id", "destination_input": "organization_id", "type": "UUID"}], "authorized_actor": "founder", "idempotency_key": "pairing_code_id", "retry_policy": "new pairing code on expiry", "on_failure": "room remains GATEWAY_UNBOUND; visible blocker"},
 {"id": "e03", "from": "gateway_enroll", "to": "gateway_health_monitor", "trigger": "first signed heartbeat", "condition": "signature verifies against enrolled pubkey", "input_bindings": [{"source_variable": "gateway_identity", "destination_input": "gateway_identity", "type": "GatewayIdentity"}], "authorized_actor": "gateway", "idempotency_key": "heartbeat seq", "retry_policy": "continuous heartbeat cadence 10s", "on_failure": "status=offline after 30s staleness"},
 {"id": "e04", "from": "gateway_enroll", "to": "provider_connect", "trigger": "gateway online; founder opens provider setup", "condition": "gateway_health.status=online", "input_bindings": [{"source_variable": "gateway_identity", "destination_input": "gateway_identity", "type": "GatewayIdentity"}], "authorized_actor": "founder (initiates) + gateway (executes)", "idempotency_key": "connection probe id", "retry_policy": "manual re-probe", "on_failure": "connection recorded unhealthy with reason"},
 {"id": "e05", "from": "room_create", "to": "repo_scope_capture", "trigger": "founder selects repository and base branch", "condition": "repo in repository_allowlist AND App installed on repo", "input_bindings": [{"source_variable": "build_room_id", "destination_input": "build_room_id", "type": "UUID"}, {"source_variable": "repository_allowlist", "destination_input": "repository_allowlist", "type": "list<RepoRef>"}, {"source_variable": "founder_identity", "destination_input": "founder_identity", "type": "FounderPrincipal"}], "authorized_actor": "founder", "idempotency_key": "room_id + repo_id", "retry_policy": "user-retry; GitHub 5xx exponential backoff x3", "on_failure": "scope not captured; room blocked visibly"},
 {"id": "e06", "from": "provider_connect", "to": "role_assign", "trigger": "founder assigns roles", "condition": ">=2 healthy connections with exec_mode=headless; reviewer connection != builder connection", "input_bindings": [{"source_variable": "provider_connections", "destination_input": "provider_connections", "type": "list<ProviderConnection>"}, {"source_variable": "build_room_id", "destination_input": "build_room_id", "type": "UUID"}, {"source_variable": "founder_identity", "destination_input": "founder_identity", "type": "FounderPrincipal"}], "authorized_actor": "founder", "idempotency_key": "roles.assigned event id", "retry_policy": "user-retry", "on_failure": "independence_violation surfaced; assignment rejected"},
 {"id": "e07", "from": "repo_scope_capture", "to": "plan_generate", "trigger": "roles assigned AND scope captured (join)", "condition": "role_assignments.planner healthy; base_sha captured; gateway online", "input_bindings": [{"source_variable": "founder_goal", "destination_input": "founder_goal", "type": "markdown"}, {"source_variable": "base_sha", "destination_input": "base_sha", "type": "hex40"}, {"source_variable": "role_assignments", "destination_input": "role_assignments", "type": "map<Role,UUID>"}, {"source_variable": "constraints", "destination_input": "constraints", "type": "list<Constraint>"}], "authorized_actor": "orchestrator (dispatch); planner-agent (execution)", "idempotency_key": "task_id(planner, build_id, attempt_n)", "retry_policy": "1 auto-retry on provider_timeout; then founder-visible failure", "on_failure": "PLANNING failed state; founder may retry or reassign planner"},
 {"id": "e08", "from": "plan_generate", "to": "plan_approval", "trigger": "plan.submitted event with valid PlanDoc", "condition": "plan schema valid; plan_hash computed", "input_bindings": [{"source_variable": "plan_artifact", "destination_input": "plan_artifact", "type": "Artifact<plan>"}, {"source_variable": "plan_hash", "destination_input": "plan_hash", "type": "sha256"}, {"source_variable": "founder_identity", "destination_input": "founder_identity", "type": "FounderPrincipal"}], "authorized_actor": "planner-agent (submit); founder (decide)", "idempotency_key": "plan_hash", "retry_policy": "n/a (decision)", "on_failure": "plan.revision_requested loops to plan_generate with founder feedback"},
 {"id": "e09", "from": "plan_approval", "to": "plan_generate", "trigger": "plan.revision_requested", "condition": "founder requested changes with feedback text", "input_bindings": [{"source_variable": "founder_goal", "destination_input": "founder_goal", "type": "markdown"}, {"source_variable": "base_sha", "destination_input": "base_sha", "type": "hex40"}, {"source_variable": "role_assignments", "destination_input": "role_assignments", "type": "map<Role,UUID>"}], "authorized_actor": "founder", "idempotency_key": "revision event id", "retry_policy": "unbounded founder-driven loop (each iteration founder-initiated)", "on_failure": "n/a"},
 {"id": "e10", "from": "plan_approval", "to": "worktree_provision", "trigger": "plan.approved event", "condition": "actor=founder; plan_hash matches submitted plan; scope paths canonical", "input_bindings": [{"source_variable": "repository_identity", "destination_input": "repository_identity", "type": "RepoRef"}, {"source_variable": "base_sha", "destination_input": "base_sha", "type": "hex40"}, {"source_variable": "approved_scope_paths", "destination_input": "approved_scope_paths", "type": "list<glob>"}, {"source_variable": "local_workspace_root", "destination_input": "local_workspace_root", "type": "path"}], "authorized_actor": "founder (trigger); gateway (execution)", "idempotency_key": "build_id + 'provision'", "retry_policy": "auto-retry x2 on transient clone/hydration failure", "on_failure": "provisioning failure surfaced; build blocked"},
 {"id": "e11", "from": "worktree_provision", "to": "build_execute", "trigger": "worktree ready event", "condition": "sandbox profile applied; hooks disabled; dependency hydration completed or explicitly skipped (recorded)", "input_bindings": [{"source_variable": "plan_artifact", "destination_input": "plan_artifact", "type": "Artifact<plan>"}, {"source_variable": "worktree_identity", "destination_input": "worktree_identity", "type": "WorktreeRef(rw)"}, {"source_variable": "approved_scope_paths", "destination_input": "approved_scope_paths", "type": "list<glob>"}, {"source_variable": "acceptance_criteria", "destination_input": "acceptance_criteria", "type": "list<Criterion>"}, {"source_variable": "spend_ceiling", "destination_input": "spend_ceiling", "type": "Money"}], "authorized_actor": "orchestrator (dispatch); builder-agent (execution)", "idempotency_key": "task_id(builder, build_id, attempt_n)", "retry_policy": "resume from journal on gateway restart; provider retry x1", "on_failure": "BUILDING failed; reconciler engaged"},
 {"id": "e12", "from": "build_execute", "to": "clarification_gate", "trigger": "agent emits typed decision_request", "condition": "question schema valid; build pauses (BLOCKED_ON_FOUNDER)", "input_bindings": [{"source_variable": "build_room_id", "destination_input": "build_room_id", "type": "UUID"}, {"source_variable": "founder_identity", "destination_input": "founder_identity", "type": "FounderPrincipal"}], "authorized_actor": "builder-agent (ask); founder (answer)", "idempotency_key": "decision_request_id", "retry_policy": "reminder notifications; timeout configurable", "on_failure": "decision_timeout => build stays blocked, founder-visible"},
 {"id": "e13", "from": "clarification_gate", "to": "build_execute", "trigger": "decision.answered event", "condition": "actor=founder; answer bound to decision_request_id", "input_bindings": [{"source_variable": "worktree_identity", "destination_input": "worktree_identity", "type": "WorktreeRef(rw)"}, {"source_variable": "plan_artifact", "destination_input": "plan_artifact", "type": "Artifact<plan>"}, {"source_variable": "approved_scope_paths", "destination_input": "approved_scope_paths", "type": "list<glob>"}, {"source_variable": "acceptance_criteria", "destination_input": "acceptance_criteria", "type": "list<Criterion>"}, {"source_variable": "spend_ceiling", "destination_input": "spend_ceiling", "type": "Money"}], "authorized_actor": "founder", "idempotency_key": "decision_request_id", "retry_policy": "n/a", "on_failure": "n/a"},
 {"id": "e14", "from": "build_execute", "to": "command_authorize", "trigger": "gateway classifies requested command as consequential", "condition": "class in {network(non-registry), package(publish), consequential} OR risk_classification in {elevated,critical} per policy", "input_bindings": [{"source_variable": "command_approval_subject", "destination_input": "command_approval_subject", "type": "CommandSpec"}, {"source_variable": "risk_classification", "destination_input": "risk_classification", "type": "enum"}, {"source_variable": "founder_identity", "destination_input": "founder_identity", "type": "FounderPrincipal"}], "authorized_actor": "gateway (classify); founder (approve)", "idempotency_key": "command_id", "retry_policy": "none (single decision per command_id)", "on_failure": "command.denied => builder receives typed denial; build continues or blocks"},
 {"id": "e15", "from": "command_authorize", "to": "build_execute", "trigger": "command.approved | command.denied event", "condition": "decision bound to exact command_id; grant single-use", "input_bindings": [{"source_variable": "worktree_identity", "destination_input": "worktree_identity", "type": "WorktreeRef(rw)"}, {"source_variable": "plan_artifact", "destination_input": "plan_artifact", "type": "Artifact<plan>"}, {"source_variable": "approved_scope_paths", "destination_input": "approved_scope_paths", "type": "list<glob>"}, {"source_variable": "acceptance_criteria", "destination_input": "acceptance_criteria", "type": "list<Criterion>"}, {"source_variable": "spend_ceiling", "destination_input": "spend_ceiling", "type": "Money"}], "authorized_actor": "founder (decision); gateway (execution at-most-once)", "idempotency_key": "command_id", "retry_policy": "gateway journal ensures at-most-once execution", "on_failure": "execution failure recorded as evidence; not retried without new command_id"},
 {"id": "e16", "from": "build_execute", "to": "evidence_capture", "trigger": "builder signals implementation-complete OR acceptance test run requested", "condition": "local commits exist on builder_branch", "input_bindings": [{"source_variable": "worktree_identity", "destination_input": "worktree_identity", "type": "WorktreeRef(rw)"}, {"source_variable": "current_head_sha", "destination_input": "current_head_sha", "type": "hex40"}, {"source_variable": "acceptance_criteria", "destination_input": "acceptance_criteria", "type": "list<Criterion>"}], "authorized_actor": "orchestrator (dispatch); gateway (observed execution)", "idempotency_key": "evidence_run_id(build_id, head_sha)", "retry_policy": "failed commands recorded as failed evidence (visible); founder may order rerun", "on_failure": "evidence recorded with failure states; push blocked until evidence exists for head"},
 {"id": "e17", "from": "evidence_capture", "to": "push_and_draft_pr", "trigger": "evidence bundle written for current head", "condition": "evidence_delivery_state for head-bound artifacts != failed (failed requires founder decision to proceed)", "input_bindings": [{"source_variable": "builder_branch", "destination_input": "builder_branch", "type": "ref"}, {"source_variable": "current_head_sha", "destination_input": "current_head_sha", "type": "hex40"}, {"source_variable": "test_artifacts", "destination_input": "test_artifacts", "type": "list<Artifact>"}, {"source_variable": "repository_identity", "destination_input": "repository_identity", "type": "RepoRef"}], "authorized_actor": "gateway (push with scoped token)", "idempotency_key": "push(build_id, head_sha)", "retry_policy": "token refresh + retry x2 on transient; push_rejected is terminal for this attempt", "on_failure": "push failure surfaced; reconciler checks partial push state"},
 {"id": "e18", "from": "push_and_draft_pr", "to": "review_provision", "trigger": "pr.draft_created or pr.head_updated event (remote-confirmed)", "condition": "remote head == pushed sha; reviewer connection healthy", "input_bindings": [{"source_variable": "pull_request_identity", "destination_input": "pull_request_identity", "type": "PrRef"}, {"source_variable": "current_head_sha", "destination_input": "current_head_sha", "type": "hex40"}, {"source_variable": "role_assignments", "destination_input": "role_assignments", "type": "map<Role,UUID>"}, {"source_variable": "local_workspace_root", "destination_input": "local_workspace_root", "type": "path"}], "authorized_actor": "orchestrator (dispatch); gateway (workspace)", "idempotency_key": "review_round(build_id, head_sha)", "retry_policy": "if head moves before open, reopen at new head (old round never opened)", "on_failure": "review provisioning failure surfaced; retry founder-initiated"},
 {"id": "e19", "from": "review_provision", "to": "review_execute", "trigger": "review.opened event", "condition": "reviewer worktree mode=ro verified; no credential helper present (gateway asserts + signs)", "input_bindings": [{"source_variable": "reviewed_sha", "destination_input": "reviewed_sha", "type": "hex40"}, {"source_variable": "worktree_identity", "destination_input": "worktree_identity", "type": "WorktreeRef(ro)"}, {"source_variable": "plan_artifact", "destination_input": "plan_artifact", "type": "Artifact<plan>"}, {"source_variable": "test_artifacts", "destination_input": "test_artifacts", "type": "list<Artifact>"}, {"source_variable": "acceptance_criteria", "destination_input": "acceptance_criteria", "type": "list<Criterion>"}], "authorized_actor": "orchestrator (dispatch); reviewer-agent (execution)", "idempotency_key": "task_id(reviewer, round_id)", "retry_policy": "provider retry x1; sha_voided aborts round cleanly", "on_failure": "round failed; new round opened at current head"},
 {"id": "e20", "from": "review_execute", "to": "findings_gate", "trigger": "review.findings event", "condition": "actor=reviewer of this round; findings bound to reviewed_sha; schema valid", "input_bindings": [{"source_variable": "review_findings", "destination_input": "review_findings", "type": "list<Finding>"}, {"source_variable": "reviewed_sha", "destination_input": "reviewed_sha", "type": "hex40"}, {"source_variable": "review_round_identity", "destination_input": "review_round_identity", "type": "ReviewRound"}], "authorized_actor": "reviewer-agent", "idempotency_key": "findings(round_id)", "retry_policy": "n/a", "on_failure": "schema-invalid findings rejected as event.rejected (visible); round marked failed"},
 {"id": "e21", "from": "findings_gate", "to": "remediation", "trigger": "review.blocked event (open blocker/major findings)", "condition": "reviewed_sha still == remote head (else route to new round instead)", "input_bindings": [{"source_variable": "review_findings", "destination_input": "review_findings", "type": "list<Finding>"}, {"source_variable": "worktree_identity", "destination_input": "worktree_identity", "type": "WorktreeRef(rw)"}, {"source_variable": "approved_scope_paths", "destination_input": "approved_scope_paths", "type": "list<glob>"}], "authorized_actor": "orchestrator (dispatch); builder-agent (execution)", "idempotency_key": "remediation(round_id)", "retry_policy": "cannot_remediate escalates to founder decision", "on_failure": "escalation to clarification_gate"},
 {"id": "e22", "from": "remediation", "to": "evidence_capture", "trigger": "remediation commits complete", "condition": "new local head != previous head", "input_bindings": [{"source_variable": "worktree_identity", "destination_input": "worktree_identity", "type": "WorktreeRef(rw)"}, {"source_variable": "current_head_sha", "destination_input": "current_head_sha", "type": "hex40"}, {"source_variable": "acceptance_criteria", "destination_input": "acceptance_criteria", "type": "list<Criterion>"}], "authorized_actor": "orchestrator; gateway", "idempotency_key": "evidence_run_id(build_id, new_head_sha)", "retry_policy": "as e16", "on_failure": "as e16"},
 {"id": "e23", "from": "findings_gate", "to": "checks_verify", "trigger": "review.passed(sha) event", "condition": "zero open blockers (or founder waiver events for each); reviewed_sha == remote head", "input_bindings": [{"source_variable": "pull_request_identity", "destination_input": "pull_request_identity", "type": "PrRef"}, {"source_variable": "current_head_sha", "destination_input": "current_head_sha", "type": "hex40"}, {"source_variable": "reviewed_sha", "destination_input": "reviewed_sha", "type": "hex40"}, {"source_variable": "evidence_delivery_state", "destination_input": "evidence_delivery_state", "type": "map"}], "authorized_actor": "control-plane review service", "idempotency_key": "checks_verify(build_id, head_sha)", "retry_policy": "poll checks with backoff until terminal or timeout", "on_failure": "checks_failed => remediation or founder decision; sha_mismatch => new review round"},
 {"id": "e24", "from": "checks_verify", "to": "founder_authorization_gate", "trigger": "checks.verified(sha) event", "condition": "all required checks green at sha; review.passed(sha); evidence verified; scope-diff conformant", "input_bindings": [{"source_variable": "founder_identity", "destination_input": "founder_identity", "type": "FounderPrincipal"}, {"source_variable": "current_head_sha", "destination_input": "current_head_sha", "type": "hex40"}, {"source_variable": "reviewed_sha", "destination_input": "reviewed_sha", "type": "hex40"}, {"source_variable": "plan_hash", "destination_input": "plan_hash", "type": "sha256"}, {"source_variable": "pull_request_identity", "destination_input": "pull_request_identity", "type": "PrRef"}], "authorized_actor": "founder ONLY", "idempotency_key": "auth_request(build_id, head_sha)", "retry_policy": "n/a (human decision)", "on_failure": "founder_declined => build stays AWAITING or returns to remediation with founder feedback"},
 {"id": "e25", "from": "founder_authorization_gate", "to": "merge_confirm", "trigger": "founder.authorization.granted event", "condition": "step-up verified; authorized_sha == remote head at grant instant; single-use token minted", "input_bindings": [{"source_variable": "founder_authorization", "destination_input": "founder_authorization", "type": "Authorization"}, {"source_variable": "pull_request_identity", "destination_input": "pull_request_identity", "type": "PrRef"}], "authorized_actor": "founder", "idempotency_key": "auth_id", "retry_policy": "n/a", "on_failure": "head_changed => authorization auto-voided; back to review_provision path"},
 {"id": "e26", "from": "merge_confirm", "to": "closure", "trigger": "merge.confirmed event (webhook HMAC-verified, delivery GUID deduped, corroborated by poll)", "condition": "merged PR head == authorized_sha", "input_bindings": [{"source_variable": "evidence_delivery_state", "destination_input": "evidence_delivery_state", "type": "map"}, {"source_variable": "usage_and_cost_events", "destination_input": "usage_and_cost_events", "type": "list<CostEvent>"}, {"source_variable": "build_room_id", "destination_input": "build_room_id", "type": "UUID"}], "authorized_actor": "github (webhook) + control-plane reconciler (corroboration)", "idempotency_key": "webhook delivery GUID", "retry_policy": "webhook loss covered by reconciler poll every 60s until terminal", "on_failure": "merged-with-different-sha => incident state manual_required"},
 {"id": "e27", "from": "gateway_health_monitor", "to": "reconciler", "trigger": "gateway offline > threshold OR restart detected (journal epoch change)", "condition": "active build in non-terminal state", "input_bindings": [{"source_variable": "gateway_health", "destination_input": "gateway_health", "type": "HealthState"}, {"source_variable": "failure_or_reconciliation_state", "destination_input": "failure_or_reconciliation_state", "type": "ReconState"}, {"source_variable": "current_head_sha", "destination_input": "current_head_sha", "type": "hex40"}], "authorized_actor": "control-plane", "idempotency_key": "recon(build_id, cause, detected_at)", "retry_policy": "bounded per cause (e.g. 5 attempts webhook poll, 3 git re-verify)", "on_failure": "manual_required, founder-visible"},
 {"id": "e28", "from": "reconciler", "to": "build_execute", "trigger": "recon.resumed event", "condition": "gateway journal replay complete; worktree state verified consistent; no ambiguous git state", "input_bindings": [{"source_variable": "worktree_identity", "destination_input": "worktree_identity", "type": "WorktreeRef(rw)"}, {"source_variable": "plan_artifact", "destination_input": "plan_artifact", "type": "Artifact<plan>"}, {"source_variable": "approved_scope_paths", "destination_input": "approved_scope_paths", "type": "list<glob>"}, {"source_variable": "acceptance_criteria", "destination_input": "acceptance_criteria", "type": "list<Criterion>"}, {"source_variable": "spend_ceiling", "destination_input": "spend_ceiling", "type": "Money"}], "authorized_actor": "control-plane reconciler", "idempotency_key": "recon resolution event id", "retry_policy": "n/a", "on_failure": "manual_required"},
 {"id": "e29", "from": "cost_meter", "to": "clarification_gate", "trigger": "ceiling.exceeded event", "condition": "cumulative labeled cost >= spend_ceiling", "input_bindings": [{"source_variable": "build_room_id", "destination_input": "build_room_id", "type": "UUID"}, {"source_variable": "founder_identity", "destination_input": "founder_identity", "type": "FounderPrincipal"}], "authorized_actor": "control-plane cost service (pause); founder (decision to raise ceiling or cancel)", "idempotency_key": "ceiling event id", "retry_policy": "n/a", "on_failure": "build remains paused (fail closed)"},
 {"id": "e30", "from": "merge_confirm", "to": "reconciler", "trigger": "webhook not received within 120s of founder-reported merge OR authorization consumed without webhook", "condition": "build in AUTHORIZED state", "input_bindings": [{"source_variable": "gateway_health", "destination_input": "gateway_health", "type": "HealthState"}, {"source_variable": "failure_or_reconciliation_state", "destination_input": "failure_or_reconciliation_state", "type": "ReconState"}, {"source_variable": "current_head_sha", "destination_input": "current_head_sha", "type": "hex40"}], "authorized_actor": "control-plane", "idempotency_key": "recon(build_id, webhook_loss)", "retry_policy": "poll GitHub PR state x5 with backoff", "on_failure": "manual_required"},
 {"id": "e31", "from": "push_and_draft_pr", "to": "findings_gate", "trigger": "git.pushed event while any review round open or passed at older sha", "condition": "new remote head != reviewed_sha of open/passed round", "input_bindings": [{"source_variable": "review_findings", "destination_input": "review_findings", "type": "list<Finding>"}, {"source_variable": "reviewed_sha", "destination_input": "reviewed_sha", "type": "hex40"}, {"source_variable": "review_round_identity", "destination_input": "review_round_identity", "type": "ReviewRound"}], "authorized_actor": "control-plane (automatic voiding)", "idempotency_key": "void(round_id, new_sha)", "retry_policy": "n/a", "on_failure": "n/a — voiding is unconditional; stale review.passed and founder_authorization records marked VOIDED (retained as evidence)"},
 {"id": "e33", "from": "role_assign", "to": "plan_generate", "trigger": "roles.assigned event (join with e07: dispatch fires when both scope and roles exist)", "condition": "role_assignments complete; planner connection healthy; gateway online", "input_bindings": [{"source_variable": "role_assignments", "destination_input": "role_assignments", "type": "map<Role,UUID>"}, {"source_variable": "founder_goal", "destination_input": "founder_goal", "type": "markdown"}, {"source_variable": "base_sha", "destination_input": "base_sha", "type": "hex40"}], "authorized_actor": "orchestrator (dispatch on founder-created preconditions)", "idempotency_key": "task_id(planner, build_id, attempt_n)", "retry_policy": "same as e07 (single dispatch; e07/e33 share idempotency key)", "on_failure": "PLANNING blocked visibly until preconditions met"},
 {"id": "e34", "from": "build_execute", "to": "cost_meter", "trigger": "adapter emits usage report (streaming or terminal)", "condition": "usage event schema valid; source labeled", "input_bindings": [{"source_variable": "usage_and_cost_events", "destination_input": "usage_and_cost_events", "type": "list<CostEvent>"}, {"source_variable": "spend_ceiling", "destination_input": "spend_ceiling", "type": "Money"}, {"source_variable": "price_table_version", "destination_input": "price_table_version", "type": "SemVer"}], "authorized_actor": "provider adapter (via gateway signature)", "idempotency_key": "cost event_id", "retry_policy": "buffered on gateway, replayed after reconnect", "on_failure": "usage recorded as unavailable (labeled), never zero"},
 {"id": "e35", "from": "room_create", "to": "room_feed", "trigger": "room.created event begins ledger projection", "condition": "room exists", "input_bindings": [{"source_variable": "build_room_id", "destination_input": "build_room_id", "type": "UUID"}, {"source_variable": "gateway_health", "destination_input": "gateway_health", "type": "HealthState"}, {"source_variable": "evidence_delivery_state", "destination_input": "evidence_delivery_state", "type": "map"}, {"source_variable": "failure_or_reconciliation_state", "destination_input": "failure_or_reconciliation_state", "type": "ReconState"}], "authorized_actor": "control-plane projection service", "idempotency_key": "projection checkpoint seq", "retry_policy": "projection resumes from last checkpoint", "on_failure": "feed marked stale with last-updated timestamp (truthful staleness)"},
 {"id": "e32", "from": "room_create", "to": "closure", "trigger": "founder.cancel event (any non-terminal state)", "condition": "actor=founder; running tasks cancelled; worktrees preserved until closure confirms", "input_bindings": [{"source_variable": "evidence_delivery_state", "destination_input": "evidence_delivery_state", "type": "map"}, {"source_variable": "usage_and_cost_events", "destination_input": "usage_and_cost_events", "type": "list<CostEvent>"}, {"source_variable": "build_room_id", "destination_input": "build_room_id", "type": "UUID"}], "authorized_actor": "founder", "idempotency_key": "cancel event id", "retry_policy": "cancellation of running provider tasks retried x3 then recorded as unconfirmed_cancel", "on_failure": "closure blocked until task states resolved or founder forces CLOSED_ABANDONED (recorded)"},
 {"id": "e36", "from": "build_execute", "to": "closure", "trigger": "founder.cancel event during active build (representative of T22 from any building/review state)", "condition": "actor=founder; running builder/reviewer tasks cancelled via adapter cancel() or fenced as unconfirmed_cancel", "input_bindings": [{"source_variable": "evidence_delivery_state", "destination_input": "evidence_delivery_state", "type": "map"}, {"source_variable": "usage_and_cost_events", "destination_input": "usage_and_cost_events", "type": "list<CostEvent>"}, {"source_variable": "build_room_id", "destination_input": "build_room_id", "type": "UUID"}], "authorized_actor": "founder", "idempotency_key": "cancel event id", "retry_policy": "task cancellation retried x3 then fenced", "on_failure": "closure blocked until task states resolved or founder forces CLOSED_ABANDONED (recorded)"},
 {"id": "e37", "from": "founder_authorization_gate", "to": "closure", "trigger": "founder.cancel or founder.declined at authorization stage (representative of T22 from awaiting/authorized states)", "condition": "actor=founder; any granted-but-unconsumed authorization voided before closure", "input_bindings": [{"source_variable": "evidence_delivery_state", "destination_input": "evidence_delivery_state", "type": "map"}, {"source_variable": "usage_and_cost_events", "destination_input": "usage_and_cost_events", "type": "list<CostEvent>"}, {"source_variable": "build_room_id", "destination_input": "build_room_id", "type": "UUID"}], "authorized_actor": "founder", "idempotency_key": "cancel event id", "retry_policy": "n/a", "on_failure": "closure blocked until authorization state resolved (voided) — fail closed"}
 ],
 "invariants": [
 "INV-1 Founder final authority: founder.authorization.granted and plan.approved events are accepted only from an authenticated founder principal with fresh step-up (authorization) — never from agent, gateway, orchestrator, or GitHub actors.",
 "INV-2 Role separation: reviewer connection (provider account + session) differs from builder connection for the same build; reviewer never authored any commit on builder_branch.",
 "INV-3 Reviewer read-only by construction: reviewer worktree mounted/permissioned read-only, no credential helper, no push-capable remote; verified and signed by gateway before review.opened.",
 "INV-4 SHA binding: plan/review/authorization events carry sha_binding (or plan_hash); any push of builder_branch voids review and authorization state bound to older SHAs.",
 "INV-5 Builder isolation: builder writes only inside its worktree within approved_scope_paths on builder_branch; enforced by gateway sandbox, not by prompt.",
 "INV-6 Typed events only: conversation text cannot transition state or authorize tools; only schema-validated, actor-authenticated events commit to the ledger.",
 "INV-7 No chain-of-thought: shared context contains approved messages, decisions, artifacts, repo facts, and operational events only.",
 "INV-8 Credential custody: provider subscription credentials remain on the gateway host in provider-native stores; cloud stores connection metadata and health only; cloud API-key custody requires a recorded founder decision per provider.",
 "INV-9 No agent merge authority: GitHub ruleset on base_branch restricts merge to the founder; the App installation token used by the gateway is never used to merge; merge executes under the founder's own GitHub identity.",
 "INV-10 Evidence truthfulness: every operational claim carries state observed|inferred|unavailable|failed|skipped|not_yet_verified; failures and unavailability are displayed as such, never as success or zero.",
 "INV-11 Cost provenance: every cost figure is provider_reported or computed@price_table_version, else displayed unavailable.",
 "INV-12 Fail closed: unverifiable identity, SHA, scope, evidence, capability, or authorization blocks the transition and surfaces a founder-visible blocker."
 ],
 "validation": {
 "type_errors": [],
 "unbound_required_inputs": [],
 "unauthorized_edges": [],
 "unreachable_required_nodes": [],
 "nonterminating_failure_paths": [],
 "representation_mismatches": []
 }
}

13. Graph verification report

Mechanical validation (script
validate-manifest.mjs
, run 2026-08-09, output: "ALL CHECKS PASSED — validation arrays empty · counts: 35 variables, 26 nodes, 37 edges, 12 invariants"):

Gate check

Result

Method

Every destination capability → reachable node

PASS

mapping below; reachability sweep from
founder_auth
 covers all 26 nodes

Every required node input has a producer or founder/external source

PASS

script: incoming-edge binding check; externally-sourced set = {founder_identity, organization_id, repository_allowlist, local_workspace_root, price_table_version} (founder/setup/release inputs)

Edge type compatibility

PASS

script: every binding's source variable exists and destination node declares the input; types carried on both ends match declared variable types

Every transition names authorized actor + condition

PASS

script: all 37 edges carry
authorized_actor
,
condition
,
on_failure

No edge manufactures founder authorization

PASS

only
e24 → founder_authorization_gate
 (actor "founder ONLY"); node prohibits issuance by agent/gateway/orchestrator/GitHub event; ledger guard rejects non-founder actors on
founder.authorization.granted

Reviewer path write/push/merge/credential-free

PASS

review_execute.permissions.write = [findings artifact ONLY]
; prohibited list includes mutation, git write/push, credential access, merge;
review_provision
 strips credential helper and sets mode=ro (script-asserted)

Review/remediation/authorization edges carry exact SHA

PASS

script asserts SHA reference on e18–e21, e23–e26, e31; voiding edge e31 is unconditional

Provider secrets within custody boundary

PASS

provider_connect.permissions.prohibited
 includes transmitting secrets to cloud; variable
provider_connections
 sensitivity=secret with gateway-only full access

Failure/cancel/timeout/retry/resume/reconciliation bounded & deterministic

PASS

every edge has retry_policy + on_failure; reconciler edges (e27, e28, e30) bounded then
manual_required
; cancel edges e32/e36/e37 reach terminal closure from creation, build, and authorization stages (T22 generalizes to all non-terminal states in the ledger guard)

Idempotency & replay defined

PASS

every edge carries idempotency_key; commands journaled at-most-once (command_id); events ULID+seq dedup; webhooks delivery-GUID dedup; evidence content-addressed

Negative states founder-visible

PASS

INV-10/INV-12;
room_feed
 prohibits masking;
evidence_delivery_state
/cost
unavailable
 are displayed states

Validation arrays empty

PASS

all six arrays empty

Cross-representation name agreement

PASS

Mermaid state names = state machine §18; sequence participants = node owners; manifest node ids referenced verbatim in §13/§18; deliberate simplifications, noted: diagram 11.2 folds draft-PR creation into
PUSHED
; draws SHA-voiding arrows only from
PUSHED
 and
AUTHORIZED
 while T18 covers every state in
PUSHED..AUTHORIZED
; and shows founder cancellation from three representative states while T22 and ledger guards apply it to every non-terminal state (manifest edges e32/e36/e37)

Capability → node coverage:
 founder auth/selection →
founder_auth
,
repo_scope_capture
; gateway enrollment/health/revocation/recovery →
gateway_enroll
,
gateway_health_monitor
,
reconciler
; provider discovery/negotiation →
provider_connect
; shared room/artifacts →
room_feed
 (+ artifact refs on all producing nodes); role assignment/enforcement →
role_assign
 (+ per-node permission profiles); repo/base-SHA capture →
repo_scope_capture
; planning/revision →
plan_generate
 (+e09 loop); plan approval →
plan_approval
; isolated builder execution →
worktree_provision
,
build_execute
; blocking clarification →
clarification_gate
; scoped command authorization →
command_authorize
; evidence capture →
evidence_capture
; push/draft PR →
push_and_draft_pr
; exact-SHA review →
review_provision
,
review_execute
; findings/remediation/re-review →
findings_gate
,
remediation
, e31 voiding; checks/governance verification →
checks_verify
; SHA-bound authorization →
founder_authorization_gate
; merge & webhook confirmation →
merge_confirm
; evidence/usage/cost recording →
evidence_capture
,
cost_meter
; cancellation/timeout/retry/resume/reconciliation/terminal closure →
reconciler
,
closure
, e32; truthful status →
room_feed
,
gateway_health_monitor
.

14. Role, actor, authority, and permission matrix

Roles are FounderOS roles held by provider
connections
 per build (agent-rules §1.1: models/surfaces are never roles [Observed]). Principals:
founder
,
agent(role=planner|builder|reviewer)
,
gateway
,
github
,
system
 (control plane).

Capability

Founder

Planner

Builder

Reviewer

Gateway

Control plane

GitHub events

Create room, set goal/ceiling/constraints

✅

—

—

—

—

validates

—

Approve/revise plan (binds plan_hash)

✅ only

proposes

—

—

—

validates

—

Assign roles

✅ only

—

—

—

—

enforces independence

—

Write files

—

—

✅ scope-confined worktree only

❌ structurally

executes

—

—

Run commands

—

❌ (ro analysis only)

via class policy

ro allowlist only

classifies+executes

policy engine

—

Approve consequential command

✅ only (per command_id)

—

❌ (self-approval prohibited)

—

—

queues

—

Produce evidence

—

—

requests

—

✅ observes+signs

verifies+stores

checks API

Push builder branch

—

—

—

❌

✅ scoped token only

mints token

—

Create draft PR

—

—

—

—

✅

via App

—

Submit findings

—

—

—

✅ only (SHA-bound)

—

validates

—

Pass/block review round

—

—

—

findings drive it

—

✅ findings_gate rules

—

Void stale review/auth on push

—

—

—

—

—

✅ automatic

push webhook triggers

Grant SHA-bound authorization

✅ only, step-up, single-use

❌

❌

❌

❌

validates+records

❌

Merge PR

✅ own GitHub identity only

❌

❌

❌

❌ (no merge call exists)

❌

ruleset enforces

Cancel build

✅

—

—

—

—

executes

—

Answer decision requests

✅ only

asks

asks

asks

—

queues

—

Emit founder-voice text

✅ only

❌

❌

❌

❌

❌

❌

15. Provider connection, authentication, capability, and failure matrix

All rows [Observed] from official docs retrieved 2026-08-09 unless labeled; full citations §3.2.

Provider

Headless surface

Auth for MVP (gateway-local)

Subscription 3P-delegation

Token storage/refresh

Revocation

Streaming/MCP

MVP class

Key failure modes

Claude
 (Anthropic)

claude -p
 (json/stream-json); Agent SDK

/login
 subscription OAuth (Pro/Max) or
ANTHROPIC_API_KEY
;
CLAUDE_CODE_OAUTH_TOKEN
 (1y) for services

❌ prohibited "unless previously approved" (Agent SDK overview)

macOS Keychain; login expiry warned at 3 days; exact TTL [Unknown]

/logout
; server-side UI [Unknown]

stream-json; MCP client

Callable-headless

login expiry mid-build;
--bare
 default change forthcoming (breaks subscription headless if adopted blindly); billing policy volatile (3 changes since Jan 2026)

Codex
 (OpenAI)

codex exec
 (
--json
, resume, sandbox)

Local ChatGPT login (
~/.codex/auth.json
) or
CODEX_API_KEY
 (recommended for automation; loses cloud features)

❌ "Sign in with ChatGPT" is identity-only

auth.json
 or OS keyring; auto-refresh; TTL [Unknown]

codex logout
 [Inferred]; UI [Unknown]

JSONL events; MCP client

Callable-headless

ToS wording verified via search only (fetch 403) — re-verify; docs domain migration link rot

Gemini
 (Google)

Gemini CLI headless (
-p
, NDJSON) or Gemini API

GEMINI_API_KEY
 (AI Studio) or cached Google OAuth (founder-attended first login) or Vertex ADC

[Unknown] — no official statement

OAuth "cached locally" (path undocumented); key revocation via AI Studio/Console

key disable/delete

streaming; MCP-capable CLI

Callable-headless

Sept 2026: GCP-standard keys rejected — use AI-Studio keys; headless exits with error if no env creds

Grok
 (xAI)

official
grok-build
 CLI (
-p
, streaming-json, ACP) or api.x.ai

XAI_API_KEY
 (console.x.ai)

Subscription OAuth exists but backend allowlist-gated (403s observed by Nous) — do not build on it

Grok Build token path [Unknown]; keys via console

console.x.ai

streaming; MCP via
grok inspect

Callable-headless (API key)

July 2026 incident: Grok Build uploaded full repos to GCS [Observed-3P] → sandbox its network egress; treat CLI conservatively

Cursor

cursor-agent -p
 (json/stream-json,
--force
); Cloud Agents API v1

CURSOR_API_KEY
 (dashboard) or browser
agent login

Keys are the sanctioned delegation; no OAuth program

login "securely stored locally" (path [Unknown]);
agent logout
 clears

dashboard [Inferred]

SSE (cloud API); MCP inline defs

Callable-headless

cloud-agent surface moves code to Cursor infra — MVP uses local CLI only; general rate limits [Unknown]

Hermes
 (Nous)

OpenAI-compatible
inference-api.nousresearch.com/v1
; Hermes Agent (MIT)

Portal API key; or Portal OAuth (founder-attended once; auto-refresh JWTs at
~/.hermes/auth.json
)

Portal is itself a delegated gateway; non-Nous 3P use [Unknown] — use API keys

short-lived JWTs minted per call from refresh token; quarantine on invalidation

portal

OpenAI-style streaming; MCP in Agent

Callable-headless

official rate limits [Unknown] (docs bot-blocked); open-weights self-host is the custody-maximal fallback

Adapter contract consequence:
 capability negotiation must express —
exec_modes
,
auth_modes
,
custody
,
session_resume
,
cost_reporting
 (Claude/Codex/Gemini report usage in stream events; Cursor/Grok/Hermes vary) — so the orchestrator never branches on provider identity, only on declared capabilities (§17, NFR-7).

16. Surface responsibilities

Control plane (Railway):
 single writer to the ledger; validates every event (schema→actor→guards→SHA)→commits→projects; hosts GitHub App service (private key in Railway encrypted vars per repository-security-standard [Observed]); webhook receiver; reconciliation loops; REST + WebSocket/SSE APIs; no PTYs, no git worktrees, no provider calls.

Web app (Cloudflare Workers):
 founder-only (Supabase auth +
FOUNDER_ALLOWLIST_EMAILS
 pattern, CSRF, server-only boundary — all console-proven [Observed]); renders projections; submits founder intents; WebAuthn/TOTP step-up for authorization; honest-unavailability rendering contract.

Gateway (npm CLI daemon, macOS first):

fosbr-gateway enroll|start|status|revoke
; outbound-only signed WebSocket (no inbound ports); adapter host; worktree/sandbox manager; command journal; evidence signer; git operations with per-operation installation tokens fetched from control plane (token never persisted).

Desktop option:
 deferred (Phase 3+). The web app + gateway daemon covers MVP; an Electron wrapper adds notification/tray value later — Orca/Galactic patterns noted, no present requirement.

CLI:
 the gateway binary doubles as the founder's local CLI for enrollment/health/diagnostics (
fosbr-gateway doctor
); a room-control CLI is post-MVP.

Offline behavior:
 gateway offline ⇒ dispatch pauses, room shows
gateway: offline since T
, founder decisions still recordable (queue drains on reconnect); cloud outage ⇒ gateway halts new work (fail closed), journals in-flight command results for replay; browser offline ⇒ read-only cached view marked stale.

17. Shared conversation, context, artifact, event-envelope, and handoff contracts

Event envelope (authoritative; full schema in
packages/contracts
):

BuildRoomEvent {
 event_id: ULID, room_id: UUID, seq: int64 (per-room, assigned at commit),
 ts: RFC3339, actor: {principal_type: founder|agent|gateway|github|system,
 principal_id, role?, auth: {method, key_id}},
 type: string (registry, versioned e.g. plan.approved@1),
 sha_binding?: {repo, branch, sha} — REQUIRED for plan/review/auth/merge families,
 payload: typed per event type, payload_hash: sha256,
 idempotency_key, causation_id?, correlation_id: build_id }

Append-only; control plane validates schema→actor authority→guards→sha before commit; rejections recorded as
event.rejected
 (visible). Conversation messages are
message.posted
 events — they render in the feed and are
never
 consulted by guards (INV-6).

Artifact:

{artifact_id, kind: plan|diff|test_report|log_excerpt|review_findings|evidence_bundle|cost_report, content_hash: sha256, storage_ref, media_type, produced_by, sha_binding?, sensitivity, retention_class}
 — content-addressed blobs, metadata rows, evidence kinds WORM.

Structured handoff:

{handoff_id, room_id, from_role, to_role, intent: plan|build_result|review_request|findings|remediation_result|question|decision_request, sha_binding, artifact_refs[], summary_md (approved-for-room text), acceptance: {required_actor, decision_event_type}}
 — mirrors FounderOS
HO-*
 records [Observed]; chain-of-thought never included.

Provider adapter contract (versioned,
packages/contracts/adapter.ts
):

interface ProviderAdapter {
 id(): ProviderId; version(): SemVer
 capabilities(): {exec_modes:[headless|interactive|monitor_only], auth_modes:[...],
 custody: local_only|cloud_ok, streaming, mcp, session_resume,
 cost_reporting: provider_reported|token_counts|none}
 healthcheck(): {status, auth_state: valid|expired|revoked|unknown, detail}
 startTask(spec: TaskSpec): TaskHandle // role, prompt_bundle, workspace, permission_profile, ceilings
 stream(h): AsyncIterator<AgentOutputEvent> // normalized: text | tool_call_request | usage | question | terminal
 cancel(h); usage(h): UsageReport { tokens?, cost?, source }
}

Provider quirks (login flows, CLI flags, JSON dialects) live only in adapters — the DEC-20260807-01 "gateway-ready contract" made concrete.

18. State machine, transition table, idempotency, invariants, prohibited transitions

States:
ROOM_CREATED, SCOPED, PLANNING, PLAN_REVIEW, BUILDING, BLOCKED_ON_FOUNDER, EVIDENCE_CAPTURE, PUSHED, IN_REVIEW, REMEDIATION, CHECKS_VERIFIED, AWAITING_FOUNDER_AUTH, AUTHORIZED, MERGE_CONFIRMED, RECONCILING, CLOSED_DELIVERED, CLOSED_ABANDONED
 (+ overlay flags:
gateway_offline
,
ceiling_exceeded
,
auth_voided
 history marker).

#

From → To

Trigger event

Authorized actor

Guard (beyond schema/actor)

T1

ROOM_CREATED→SCOPED

scope.captured

founder

repo ∈ allowlist; base_sha = live remote head

T2

SCOPED→PLANNING

task.dispatched(planner)

system

roles assigned; reviewer≠builder; gateway online

T3

PLANNING→PLAN_REVIEW

plan.submitted

agent(planner)

PlanDoc schema; plan_hash computed

T4

PLAN_REVIEW→PLANNING

plan.revision_requested

founder

feedback attached

T5

PLAN_REVIEW→BUILDING

plan.approved

founder

plan_hash match; scope paths canonical

T6

BUILDING→BLOCKED_ON_FOUNDER

decision.requested / command.queued / ceiling.exceeded

agent(builder)/gateway/system

typed subject bound

T7

BLOCKED_ON_FOUNDER→BUILDING

decision.answered, command.approved, command.denied, ceiling.raised

founder

bound to request id

T8

BUILDING→EVIDENCE_CAPTURE

build.ready_for_evidence

agent(builder)

local commits exist

T9

EVIDENCE_CAPTURE→PUSHED

git.pushed + pr.draft_created

gateway

evidence exists for head; push confirmed remote

T10

PUSHED→IN_REVIEW

review.opened

system

reviewed_sha == remote head; reviewer independent; ro workspace attested

T11

IN_REVIEW→REMEDIATION

review.blocked

system (findings_gate)

open blockers; sha unchanged

T12

REMEDIATION→EVIDENCE_CAPTURE

remediation.complete

agent(builder)

new head ≠ old head

T13

IN_REVIEW→CHECKS_VERIFIED

review.passed + checks.verified

system

zero open blockers (or founder waivers); checks green at sha; evidence verified

T14

CHECKS_VERIFIED→AWAITING_FOUNDER_AUTH

readiness.presented

system

summary assembled

T15

AWAITING_FOUNDER_AUTH→AUTHORIZED

founder.authorization.granted

founder only

step-up fresh; authorized_sha == head == reviewed_sha; single-use

T16

AUTHORIZED→MERGE_CONFIRMED

merge.confirmed

github+system

webhook HMAC + GUID dedup + poll corroboration; merged head == authorized_sha

T17

MERGE_CONFIRMED→CLOSED_DELIVERED

build.closed

system

evidence all verified or founder waiver

T18

{PUSHED..AUTHORIZED}→IN_REVIEW(new round)

git.pushed (new sha)

system (automatic)

unconditional voiding of stale review/auth (VOIDED records retained)

T19

any non-terminal→RECONCILING

recon.opened

system

typed cause

T20

RECONCILING→(prior state)

recon.resumed

system

state verified consistent

T21

RECONCILING→manual_required overlay

recon.exhausted

system

bounded retries spent — fail closed

T22

any non-terminal→CLOSED_ABANDONED

founder.cancel

founder

running tasks cancelled or recorded unconfirmed_cancel

Guard IDs:
 each transition Tn’s guard is implemented as guard id
G<n>
 (G1–G22) in
packages/ledger/src/guards.ts
;
state-machine.ts
 rows reference guards by these ids, so no naming is left to the implementer.

Idempotency:
 commands
command_id
 ULID journaled at-most-once on gateway disk (Orca-style fencing on restart: uncertain workers are
fenced
, never assumed stopped [pattern Observed]); events deduped by
event_id
 + per-room
seq
; webhooks by delivery GUID; evidence by content hash; task dispatch by
task_id(role, build_id, attempt_n)
.

Prohibited transitions (contract-tested):
 any→AUTHORIZED by non-founder or without fresh step-up; review.opened where reviewer connection == builder connection; review.passed with sha ≠ remote head; PUSHED without head-bound evidence; any transition triggered by
message.posted
 content; MERGE_CONFIRMED without webhook+poll corroboration; CLOSED_DELIVERED with unverified evidence and no waiver; re-use of a consumed/voided authorization.

19. Operational data model, evidence model, secret custody, retention, redaction

Postgres (product-owned Neon project, FD-2):

Operational:
organizations, founders, build_rooms, builds, gateway_registry, provider_connection_meta (no secrets), role_assignments, decision_queue, command_queue, review_rounds, pull_requests, projections_*
.

Evidence (append-only, telegram-pattern CHECK enums + insert-only triggers + RLS writer roles [Observed pattern]):
room_events (the ledger), evidence_artifacts, authorizations, cost_events, recon_incidents
. Ledger rows hash-chained per room (
prev_event_hash
) for tamper evidence.

Blob store: content-addressed artifacts (Railway volume MVP → R2 later; export runbook pattern exists in telegram
db/
 [Observed]).

Secret custody:
 gateway host — provider credentials in provider-native stores (Claude→Keychain, Codex→auth.json/keyring, Hermes→~/.hermes, API keys→gateway keychain entries); gateway Ed25519 private key→Keychain. Cloud — GitHub App private key + webhook secret + DB URL in Railway encrypted vars; Supabase keys in CF Workers secrets. Browser — nothing privileged (console rule: "No privileged secret is ever delivered to browser code" DEC-20260711-01 [Observed]). No secret ever in the repo (repository-security-standard [Observed]).

Retention:
 authorizations + cost events ≥ 7 years; room ledger + evidence artifacts 2 years default (FD-9); heartbeat/health logs 90 days; ephemeral projections rebuildable.
Redaction:
 command outputs pass a secret-pattern scrubber (provider key formats,
gho_*
, JWT shapes) before artifact write — original never stored; agent prompts stored as prompt-bundle hashes + room-visible text only; founder personal data limited to identity records (HMAC pseudonymous refs pattern available from telegram
evidence-refs.ts
 [Observed] if cross-system sharing arises).

20. API, event, streaming, polling, reconnect, and offline behavior

Founder/browser API:
 REST (
POST /rooms
,
POST /rooms/:id/events
 for intents,
GET /rooms/:id/feed?after_seq=
) + WebSocket (SSE fallback) pushing projection deltas keyed by
seq
. Reconnect = resume from last seq (gap-free; server retains full ledger).

Gateway API:
 single outbound WebSocket with signed envelopes; heartbeat 10 s; command channel (cloud→gateway dispatch with
command_id
) and event channel (gateway→cloud proposals); on reconnect, gateway replays journal deltas, cloud replays undelivered commands (both idempotent).

GitHub:
 webhooks (push, pull_request, check_suite, pull_request_review) HMAC-verified; reconciliation poll every 60 s for rooms in PUSHED..AUTHORIZED as webhook-loss backstop [pattern: console's sanctioned polling read-through [Observed]].

Offline:
 §16. All staleness is displayed with timestamps, never masked.

21. Local repository, worktree, process, command, and sandbox design

Mirror + worktrees:
 per repo, one bare mirror under
<workspace_root>/mirrors/<owner>/<repo>.git
 (fetched via short-lived token); worktrees
<workspace_root>/rooms/<room>/<role>-<build>
 created
git worktree add --detach
 (reviewer) or on
buildroom/<room>/<build>
 (builder).
core.hooksPath=/dev/null
,
submodule.recurse=false
 (submodule URLs allowlist-checked before any init) in all managed worktrees.

Builder sandbox (macOS MVP):

sandbox-exec
 profile per task: FS write allowlist = worktree ∩ approved_scope_paths (canonicalized; symlinks resolving outside the worktree are refused at enforcement time) + tmp dir; read = worktree + toolchains; network = provider endpoints + package registries per policy (elevated risk ⇒ deny registries too); Linux later via bubblewrap. Provider CLIs additionally run with their own sandbox flags where available (
codex --sandbox
, Claude Code permission modes [Observed]).

Reviewer workspace:
 detached at reviewed_sha;
chmod -R a-w
 + sandbox deny-write; no credential helper (
GIT_CONFIG_NOSYSTEM=1
, scrubbed env, remote URL rewritten to local mirror path); gateway attests these properties in the
review.opened
 event (signed) — S2's negative tests verify.

Command execution:
 every agent tool-call requesting shell goes through the gateway policy engine: parse → classify (
read|build|test|package|network|consequential
) by deterministic rules (telegram's regex risk-matrix pattern [Observed]) → auto-allow safe classes → queue consequential with full argv+cwd shown to founder → journal → execute in sandbox → outputs become evidence. Dependency hydration (
npm ci
 etc.) is a
build
-class command recorded like any other.

Concurrency:
 MVP one active build per room, one builder task at a time; planner/reviewer tasks may overlap builds in different rooms; worktrees are per-build so no cross-contamination; port isolation deferred until multi-service dev servers matter (Galactic's hostname-proxy pattern noted for later [Observed]).

22. GitHub workflow design

GitHub App (
founder-os-build-room
 App):
 permissions —
contents: read/write
 (push builder branches),
pull_requests: read/write
 (draft PRs, findings summaries),
checks: read
,
metadata: read
.
No
 administration, no workflow-file write. Installation restricted to allowlisted repos. Short-lived installation tokens minted per operation server-side and passed to gateway scoped+expiring (DEC-20260710-01 conformant [Observed]).

Branch protection/ruleset on base branches (founder-configured once):
 require PR, require required checks, restrict merges/pushes to the founder (bypass list = founder only). The App can therefore push
buildroom/*
 but structurally cannot merge to base even if compromised (A-5 fallback: if plan tier lacks rulesets on private repos, the App simply has no merge code path and PR stays draft until founder acts — enforcement then rests on the absence of the call + founder-only repo perms).

Flow:
 push → draft PR (
draft: true
 [Observed API]) → PR description carries plan link, evidence summary, attribution trailers (Role-Id/Actor-Id/Execution-Surface per DEC-20260718-05 [Observed]) → review rounds recorded in-product (optionally mirrored as PR comments for audit symmetry) → founder authorization in-product (SHA-bound) → founder marks ready + merges in GitHub UI under their own identity → webhook confirms → room closes. Any push between authorization and merge voids the authorization before the founder can merge (UI blocks the "ready" affordance and shows AUTH_VOIDED).

23. Security and threat model

#

Threat

Mitigation (structural)

Residual

1

Prompt injection → Builder exceeds scope

sandbox FS allowlist ∩ scope paths; command classes; founder approval for consequential; push limited to builder branch; scope-diff check at checks_verify

in-scope malicious edits — caught by review + founder diff

2

Prompt injection → Reviewer "approves"

reviewer output = findings artifact only;
review.passed
 computed by findings_gate rules, not reviewer text; founder authorization still required

subtle finding-suppression — mitigated by founder-visible diff + criteria

3

Agent impersonates founder

actor authentication on every event; founder events require web session (+step-up for authorization); agents cannot mint founder principals

founder device compromise (out of scope, noted)

4

Credential leakage

secrets never leave gateway; cloud stores metadata only; per-op expiring GitHub tokens; reviewer env credential-free; secret-scrubber on evidence

gateway-host malware ≡ laptop compromise today

5

Replay/forged events

Ed25519-signed gateway envelopes; ULID+seq dedup; webhook HMAC+GUID; single-use authorization

—

6

Confused deputy (agent asks gateway off-role work)

permission profile bound to TaskHandle at dispatch, not per-request claims

—

7

Stale SHA

sha_binding mandatory; gates re-verify remote head; e31 unconditional voiding

TOCTOU between check & merge — closed by merged-sha verification in merge_confirm (mismatch ⇒ manual_required incident)

8

Symlink/path escape, hostile repo

canonicalization + cross-boundary symlink refusal; hooks disabled; submodule allowlist; sandbox

kernel/sandbox escapes (accepted, documented)

9

Malicious test code

tests inside same sandbox; network egress policy; elevated-risk gates test commands behind founder approval

package-registry supply chain (mitigate: lockfile-only installs)

10

Grok Build-style CLI exfiltration [Observed-3P incident]

per-adapter network egress allowlists in sandbox profile; conservative default for new CLIs

provider-endpoint exfiltration within granted scope

11

Cloud compromise

no provider secrets held; App can't merge; evidence hash-chained; founder step-up unforgeable server-side (WebAuthn)

DB tampering pre-chain-verification — mitigated by chain audit job

12

Webhook loss/partial failure

reconciler polling backstop; bounded retries → manual_required

—

13

Cost runaway

ceiling halts dispatch; adapter-level caps where supported; unavailable-usage labeled and counted pessimistically against ceiling as [Unknown] band

provider under-reporting

24. Cost, usage, observability, alerts, reconciliation, recovery

Cost events per task from adapter
usage()
 with mandatory
source
 label; computed costs name
price_table_version
 (versioned file, console pricing-module pattern [Observed]); "Estimated — not billed" disclosure carried over; unavailable ≠ zero. Ceiling: warning at 80%, hard pause at 100% (BLOCKED_ON_FOUNDER). Observability: structured logs with event/correlation ids; per-room timeline view is the primary debug surface; gateway
doctor
 command; alerting via existing Telegram founder bot post-MVP (FD scope). Recovery: gateway restart → journal replay + worker fencing; provider expiry → connection health degraded + task paused (auth_expired failure state, founder re-login prompt); ambiguous git (interrupted push) → reconciler compares remote/local/ledger, bounded retries, manual_required; evidence-write failure → delivery_state=failed blocks closure.

25. Application information architecture and founder UX

Screens (web app):
Rooms list
 (state chips, next-required-action);
Build Room
 — center: shared feed (messages, typed events, artifacts, evidence cards with observed/failed/unavailable badges); right rail: current state, next required action, agent panels (role, provider, task status, live activity summary — no CoT), gateway/provider health, cost meter vs ceiling with provenance badges, GitHub readiness (checks, review round, SHA match, draft status);
Decision Queue
 (global): plan approvals, blocking questions, consequential commands (full argv+cwd), authorization requests — each a typed card with full context, one-tap answer, step-up where required;
Room settings
: roles, ceiling, scope view;
Gateway page
: enrollment QR/pairing code, health, revoke. Design language follows console conventions (IBM Plex ruling DEC-20260805-01 [Observed]) without living in the console (FD-4).

26. Testing and evaluation strategy

Unit:
 contracts round-trip (zod parse/serialize, JSON Schema generation); guard functions; command classifier; path canonicalization/symlink refusal.

Contract:
 ledger transition table — exhaustive valid-transition acceptance + prohibited-transition rejection (every §18 prohibition is a named test); adapter contract conformance suite run against each adapter (capabilities honesty, stream normalization, usage labeling).

Integration:
 gateway↔control-plane over real WebSocket with signed envelopes (enroll, heartbeat, dispatch, journal replay); GitHub App flows against a sacrificial test repo (push scoping, draft PR, webhook HMAC, checks read).

End-to-end:
 scripted build against a fixture repo with a stub adapter (deterministic "agent") covering the full T1→T17 path incl. remediation loop; then a live-provider smoke (claude-code adapter) gated behind founder-run.

Security-negative (constitutional, console pattern [Observed]):
 reviewer workspace has no write bit/credential/push path (attempts must fail); non-founder authorization events rejected; message-text cannot transition; App token cannot merge; forged gateway signature rejected; replayed webhook no-ops; symlink escape blocked.

Fault-injection/replay/recovery:
 kill gateway mid-command (journal at-most-once verified); drop webhooks (reconciler converges); expire provider auth mid-task (degraded, resumable); duplicate events (seq dedup); evidence-write failure blocks closure.

Graph-validation:

validate-manifest.mjs
 runs in CI; state names/event types in code are generated from
packages/contracts
 so representation drift fails the build.

27. Phased implementation roadmap

Phase

Deliverable

Depends on

Acceptance / stop gate

0

FD-1 DEC ratified; repo created via WF-17; registries updated (FD-8); CI skeleton (typecheck/lint/test + attribution-shape)

founder

Stop: no code before DEC

1

Slice 1 (§29):

packages/contracts
 +
packages/ledger
 with full guard/negative test suite

Phase 0

all §18 prohibitions have failing-by-construction tests;
npm run verify
 green

2

Control plane: Postgres ledger impl, room/decision APIs, projections, SSE/WebSocket; web app auth + rooms + decision queue (no gateway yet — stub events)

1, FD-2

E2E: create room→plan approval flow against stub planner; founder approves from phone

3

Gateway: enrollment, heartbeat, worktree/sandbox manager, command journal, evidence recorder; stub adapter E2E full lifecycle on fixture repo

2

fault-injection suite green; security-negative suite green

4

GitHub App service: push scoping, draft PR, webhooks+poll, checks_verify; exact-SHA review rounds + voiding

3

live test-repo cycle T1→T17 with stub agents; founder merge confirmed

5

Real adapters: claude-code, codex, + one API adapter (hermes or gemini) with capability negotiation + cost labeling; authorization step-up (WebAuthn)

4, FD-7

S1 achieved on a real repo; S5 verified (adapter #3 added with zero core changes)

6

Hardening: redaction scrubber, retention jobs, cost ceiling live, reconciler completeness,
doctor

5

S3/S4/S7/S8 measured;
founder approval gate: MVP acceptance

7+

Post-MVP: Grok/Cursor adapters, multi-build concurrency, Telegram notifications, desktop wrapper, additional org members, Linux gateway

6

per-feature DECs as doctrine requires

28. MVP definition and explicit exclusions

MVP =
 Phases 0–6: one org, one founder, one gateway (macOS), one active build per room; three live adapters (claude-code, codex, one of hermes/gemini) + all six classified in the connection UI (Grok/Cursor shown as "supported, not yet enabled"); full governed lifecycle with exact-SHA review, remediation, SHA-bound step-up authorization, founder merge + webhook confirmation; truthful multi-device web UI; evidence + cost with provenance; fail-closed recovery.

Excluded from MVP (explicitly):
 agent-executed merge (never in initial scope); cloud-held provider secrets (FD-3 opt-in later); Cursor Cloud Agents surface; desktop app; Linux/Windows gateway; multi-gateway/multi-org; concurrent builds per room; port-isolation networking; Telegram surface; public multi-tenant offering; LangGraph or any orchestration framework (deferred per DEC-20260715-05 [Observed]); any Galactic (AGPL) code; Orca code vendoring (patterns only unless FD-6 decides otherwise).

29. First authorized implementation slice (ready for Claude Code after FD-1)

Slice 1:
packages/contracts
 +
packages/ledger
 — the governed core, pure TypeScript, zero infrastructure.

Repository
MADVenturesLLC/founder-os-build-room
, npm workspaces, Node ≥ 22, TS strict, Jest, ESLint flat config (runtime-tier conventions [Observed]).

Exact paths:

package.json # workspaces: ["packages/*"]; scripts: verify = typecheck+lint+test
tsconfig.base.json
.github/workflows/ci.yml # npm ci → npm run verify (WF-17 conformant)
.github/workflows/attribution-shape.yml # copied gate (both siblings carry it [Observed])
packages/contracts/src/ids.ts # ULID, UUID, hex40, sha256 branded types + zod
packages/contracts/src/principals.ts # FounderPrincipal, AgentPrincipal(role), GatewayPrincipal, SystemPrincipal
packages/contracts/src/envelope.ts # BuildRoomEvent envelope (§17) + sha_binding rules per event family
packages/contracts/src/events/ # one module per family: room.ts, plan.ts, build.ts, command.ts,
 # evidence.ts, review.ts, authorization.ts, github.ts, recon.ts, cost.ts
packages/contracts/src/plan-doc.ts # PlanDoc: steps[], scope_paths[], risk, criteria_draft[] (+canonical hash fn)
packages/contracts/src/findings.ts # Finding + disposition transitions
packages/contracts/src/command-spec.ts # CommandSpec + class enum
packages/contracts/src/state-machine.ts # states, transition table T1–T22 as data (trigger, actor, guard id)
packages/contracts/src/adapter.ts # ProviderAdapter interface + CapabilitySet (types only in this slice)
packages/contracts/src/json-schema.ts # zod→JSON Schema export for every event type (build artifact)
packages/ledger/src/guards.ts # guard implementations keyed by guard id (pure functions over LedgerView)
packages/ledger/src/append.ts # validateAndAppend(view, event) → {committed}|{rejected(reason)}
packages/ledger/src/view.ts # LedgerView: fold(events) → room state (current state, head sha, rounds, auth)
packages/ledger/src/store.ts # EventStore interface + InMemoryEventStore (Postgres impl is Phase 2)
packages/ledger/test/transitions.valid.test.ts
packages/ledger/test/transitions.prohibited.test.ts # every §18 prohibition, named
packages/ledger/test/sha-voiding.test.ts # push voids review + authorization (T18/e31)
packages/ledger/test/authorization.negative.test.ts # non-founder / no-step-up / stale-sha / reuse all rejected
packages/ledger/test/idempotency.test.ts # event_id dedup, seq assignment, command_id at-most-once semantics
packages/contracts/test/roundtrip.test.ts # parse/serialize/schema-gen for every event type
packages/contracts/test/plan-hash.test.ts # canonical hash stability
docs/graph/manifest.json # this package's §12 manifest, verbatim
docs/graph/validate-manifest.mjs # the validator, wired into CI

Interfaces/schemas:
 exactly the §17 envelope, §18 table, and manifest variable types — no invention needed; the manifest is the oracle.

Test oracles:
 §18 prohibited list (each = one rejecting test); §13 gate checks; manifest validator green in CI.

Commands:

npm ci && npm run verify
 (must pass);
node docs/graph/validate-manifest.mjs
 (must print ALL CHECKS PASSED).

Completion evidence:
 CI green on the PR; coverage report showing every transition id T1–T22 exercised; PR body carries attribution trailers; founder-voice merge authorization per DEC-20260718-04.

Explicitly out of slice:
 any I/O, network, git, DB, provider, or UI code.

30. Final readiness assessment

Claude Code can begin immediately after FD-1
 (and only FD-1) with Slice 1: every file, interface, schema, test oracle, and acceptance criterion is named above; the manifest + transition table are the specification; no guessing required. Phases 2+ additionally need FD-2 (evidence-store custody) before the Postgres implementation, FD-4 before web-app UI work proceeds (recommended default: in-repo web app), FD-5 before infra provisioning, and FD-7/FD-8 before live-provider role assignment.

Blocked, and why:
 all implementation — blocked by FD-1 (DEC-20260807-01 pauses the Build Room; ratified doctrine outranks this plan). Provider-contract items flagged [Unknown] (OpenAI ToS wording via search only; Nous rate limits; Gemini OAuth cache path; Cursor login storage path) do not block Slice 1–4 and must be re-verified before Phase 5 adapter work. No repository, infrastructure, governance, GitHub state, provider account, or local configuration was mutated during this planning run — verification: every repo interaction this run was read-only (
gh api
 GETs + shallow clones into scratchpad); no write commands were issued.

Appendix A —
docs/graph/validate-manifest.mjs
 (verbatim source, as run this planning cycle)

import { readFileSync } from 'node:fs';
const m = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url)));
const errs = { type_errors: [], unbound_required_inputs: [], unauthorized_edges: [], unreachable_required_nodes: [], nonterminating_failure_paths: [], representation_mismatches: [] };

const varIds = new Set(m.variables.map(v => v.id));
const nodeIds = new Set(m.nodes.map(n => n.id));
const nodesById = Object.fromEntries(m.nodes.map(n => [n.id, n]));

// 1. Every node input/output variable exists
for (const n of m.nodes) {
 for (const i of n.inputs) if (!varIds.has(i.variable_id)) errs.type_errors.push(`node ${n.id} input ${i.variable_id} not a declared variable`);
 for (const o of n.outputs) if (!varIds.has(o.variable_id)) errs.type_errors.push(`node ${n.id} output ${o.variable_id} not a declared variable`);
}
// 2. Edges reference real nodes; bindings reference real variables and destination node declares that input
for (const e of m.edges) {
 if (!nodeIds.has(e.from)) errs.type_errors.push(`edge ${e.id} from unknown node ${e.from}`);
 if (!nodeIds.has(e.to)) errs.type_errors.push(`edge ${e.id} to unknown node ${e.to}`);
 const dest = nodesById[e.to];
 for (const b of e.input_bindings) {
 if (!varIds.has(b.source_variable)) errs.type_errors.push(`edge ${e.id} binds unknown variable ${b.source_variable}`);
 if (dest && !dest.inputs.some(i => i.variable_id === b.destination_input)) errs.type_errors.push(`edge ${e.id} binds ${b.destination_input} but node ${e.to} does not declare it as input`);
 }
 if (!e.authorized_actor) errs.unauthorized_edges.push(`edge ${e.id} missing authorized_actor`);
 if (!e.on_failure) errs.nonterminating_failure_paths.push(`edge ${e.id} missing on_failure`);
}
// 3. Every required node input is bound by at least one incoming edge, or produced by the node itself, or founder/external-sourced
const externallySourced = new Set(['founder_identity','organization_id','repository_allowlist','local_workspace_root','price_table_version']);
for (const n of m.nodes) {
 const incoming = m.edges.filter(e => e.to === n.id);
 for (const i of n.inputs.filter(i => i.required)) {
 const bound = incoming.some(e => e.input_bindings.some(b => b.destination_input === i.variable_id));
 const self = n.outputs.some(o => o.variable_id === i.variable_id);
 if (!bound && !self && !externallySourced.has(i.variable_id) && incoming.length > 0)
 errs.unbound_required_inputs.push(`node ${n.id} required input ${i.variable_id} not bound by any incoming edge`);
 }
}
// 3b. Any "node.<id>" reference inside variable metadata must resolve to a declared node
for (const v of m.variables) {
 const refs = JSON.stringify(v).match(/node\.[a-z_]+/g) || [];
 for (const r of refs) { const id = r.slice(5); if (!nodeIds.has(id)) errs.type_errors.push(`variable ${v.id} references undeclared ${r}`); }
}
// 4. Reachability from founder_auth
const adj = {}; for (const e of m.edges) (adj[e.from] ||= []).push(e.to);
const seen = new Set(); const stack = ['founder_auth'];
while (stack.length) { const x = stack.pop(); if (seen.has(x)) continue; seen.add(x); for (const y of adj[x] || []) stack.push(y); }
// cost_meter and room_feed are observers fed by all nodes (fan-in projections) — they must still be reachable or declared
for (const n of m.nodes) if (!seen.has(n.id)) errs.unreachable_required_nodes.push(n.id);
// 5. Reviewer path has no write/push/merge capability
const rev = m.nodes.find(n => n.id === 'review_execute');
const revWrites = (rev.permissions.write || []).join(' ').toLowerCase();
if (/(push|merge|commit|credential)/.test(revWrites)) errs.unauthorized_edges.push('review_execute write permissions include prohibited capability');
const prohibited = (rev.permissions.prohibited || []).join(' ').toLowerCase();
for (const req of ['mutation', 'push', 'credential', 'merge']) if (!prohibited.includes(req)) errs.unauthorized_edges.push(`review_execute prohibited list missing '${req}'`);
// 6. No edge grants founder authorization to a non-founder actor
for (const e of m.edges) {
 if (e.to === 'founder_authorization_gate' || e.from === 'founder_authorization_gate') {
 if (e.id === 'e24' && !/founder/i.test(e.authorized_actor)) errs.unauthorized_edges.push(`edge ${e.id} into authorization gate not founder-authorized`);
 }
}
const authNode = nodesById['founder_authorization_gate'];
if (!/FOUNDER ONLY/.test(authNode.responsibility + JSON.stringify(authNode.permissions.prohibited)) && !authNode.permissions.prohibited.some(p => /agent|gateway|orchestrator|GitHub/.test(p))) errs.unauthorized_edges.push('authorization node lacks non-founder prohibition');
// 7. SHA binding on review/remediation/authorization edges
for (const eid of ['e18','e19','e20','e21','e23','e24','e25','e26','e31']) {
 const e = m.edges.find(x => x.id === eid);
 const txt = JSON.stringify(e);
 if (!/sha/i.test(txt)) errs.representation_mismatches.push(`edge ${eid} carries no SHA reference`);
}
// 8. Terminal reachability: closure reachable from every non-terminal node (via graph)
const radj = {}; for (const e of m.edges) (radj[e.to] ||= []).push(e.from);
const canReachClosure = new Set(); const st2 = ['closure'];
while (st2.length) { const x = st2.pop(); if (canReachClosure.has(x)) continue; canReachClosure.add(x); for (const y of radj[x] || []) st2.push(y); }
for (const n of m.nodes) if (!canReachClosure.has(n.id) && !['room_feed','cost_meter','gateway_health_monitor','reconciler','clarification_gate','command_authorize','findings_gate'].includes(n.id)) errs.nonterminating_failure_paths.push(`node ${n.id} has no path to closure`);

let total = 0; for (const [k, v] of Object.entries(errs)) { if (v.length) { total += v.length; console.log(`${k}:`); v.forEach(x => console.log(' -', x)); } }
console.log(total === 0 ? 'ALL CHECKS PASSED — validation arrays empty' : `${total} issues`);
console.log(`counts: ${m.variables.length} variables, ${m.nodes.length} nodes, ${m.edges.length} edges, ${m.invariants.length} invariants`);

— End of planning package —






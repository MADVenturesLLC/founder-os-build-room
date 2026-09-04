/**
 * Seat Registry V1 — registry data and derived lane data (§2.5, §2.7).
 *
 * Every lane mirrors the controlling registries and decisions read at the
 * doctrine pin bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda. No lane, model
 * identifier, provider class, surface, or binding status is asserted,
 * inferred from a nearby value, or carried forward from prior drafts.
 * Where the corpus establishes no lawful lane, the row is an
 * `absent_lanes` entry carrying exactly { label, reason }.
 *
 * No seat has a standing route in V1 (§2.5, §3.1, §14); `default_surface`
 * is null for all four seats (§2.6).
 */

import type { SeatRegistrationV1, SeatRoutingLane } from './schema.js';
import {
  ANTIGRAVITY_APPROVAL,
  ANTIGRAVITY_MODEL_SELECTION,
  ANTIGRAVITY_PROHIBITED,
  ARCH_RECONCILE_PRECONDITIONS,
  GLM_52_CONDITION,
  GROK_BULLET_1,
  GROK_BULLET_2,
  GROK_ITEM,
  HERMES_BULLET_1,
  HERMES_BULLET_2,
  OPUS_RECONCILE_CONSTRAINT,
  REVIEWER_CLAUSE_3,
} from './conditions.js';
import type { ProviderClass } from './vocabulary.js';

/** §2.2 precedence, executable as written (r7 test 10 asserts it). */
export function deriveProviderClass(deploymentChannel: string): ProviderClass {
  // (1) an explicit controlling Founder decision assigns the class
  if (deploymentChannel === 'azure-ai-foundry') {
    return 'P2'; // DEC-20260720-02: Azure AI Foundry (Data Zone: United States) is P2
  }
  // (2) a canonical registry classification with cited authority — for the
  // five providers' channels this never precedes (3) or (4); recorded here
  // so the step order is explicit and a future classification slots in.
  // (3) the exact token or an authorized prefix form (P1-anthropic-first-party → P1)
  const exact = /^(P[1-5])$/.exec(deploymentChannel);
  if (exact !== null) {
    return exact[1] as ProviderClass;
  }
  const prefixed = /^(P[1-5])-/.exec(deploymentChannel);
  if (prefixed !== null) {
    return prefixed[1] as ProviderClass;
  }
  // (4) NOT_RECORDED — the class is not recorded and the lane is unavailable
  // for internal work under C-4. Never derived from reputation, a
  // neighbouring entry, a registry comment, or a name resemblance.
  return 'NOT_RECORDED';
}

const ABSENT_REASON_DEEPSEEK =
  'deepseek is not among the five eligible providers (DEC-20260815-04) and no registered Build Room surface hosts it. ' +
  'The model registry additionally records the secondary binding\'s implementation as "separately unauthorized".';

const ABSENT_REASON_GROK_ADVISOR =
  '`grok-build` permits `builder` and `independent-reviewer` only; `architect` fails the §3.3 roles-permitted check';

const ABSENT_REASON_CURSOR =
  '`cursor` is not one of the five providers named eligible for the Build Room (DEC-20260815-04)';

const ABSENT_REASON_RESTRICTED_LOCAL =
  'Provides paired, non-binding findings only and cannot independently satisfy the binding Tier-2 verdict on any ' +
  'artifact, absent the Founder\'s exact one-task / one-repository / one-committed-SHA local-only exception. ' +
  'hermes-local-code additionally permits `builder` only and lists "sole binding Tier-2 verdict" among its ' +
  'prohibited_actions';

const ABSENT_REASON_SUPPLEMENTAL =
  'Not on the closed Tier-2 roster (DEC-20260719-02 v1.1, DEC-20260815-05); the registry states "This model cannot ' +
  'replace CodeRabbit Tier-1 or satisfy binding Tier-2"; a supplemental/advisory binding is never authority to issue ' +
  'the binding Tier-2 verdict';

const ABSENT_REASON_CLAUDE_CODE_TIER2 =
  'No Anthropic model is on the Tier-2 roster: opus-4.8 was removed 2026-08-15, founder-directed (DEC-20260719-02 v1.1). ' +
  'The surface permits the role; the roster supplies no eligible model for it';

/* ------------------------------------------------------------------ */
/* researcher — ABSENT routing set (§2.5.1) — a valid V1 outcome        */
/* ------------------------------------------------------------------ */

const RESEARCHER: SeatRegistrationV1 = {
  seat_id: 'researcher',
  display_name: 'Aletheia',
  role_binding_status: 'accountability-approved', // role-registry.md :307 at the pin; DEC-20260721-04 item 1
  mission:
    'Principal Research and Technical Intelligence seat in the governed delivery chain ' +
    '(Researcher → Architect → Builder → Independent Reviewer).',
  contract_ref: 'contracts/seats/researcher.md',
  contract_sha256: 'ad5cddb0ff038f8e41ad418f0f531ab8da9b88724dbd1c6b10ead369111c9ea0',
  default_surface: null,
  routing: [],
  absent_lanes: [],
  authority: {
    allowed: [
      'search and read',
      'inspect repositories read-only',
      'run non-mutating analytical commands',
      'write research artifacts to an explicitly approved output location',
    ],
    prohibited: [
      'modify product source code',
      'modify repository governance',
      'approve an architecture',
      'issue implementation authorization',
      'build the solution',
      'commit, push, merge, deploy, or operate production',
      'add or rotate credentials',
      'expose secrets',
    ],
    enforcement: 'behavioral',
  },
  handoff: {
    receives_from: null, // work originates from the Founder
    produces: 'Research Packet',
    terminal_status: 'RESEARCH_READY',
    committed_sha: '0000000000000000000000000000000000000000', // placeholder; a real handoff binds the actual SHA
    authorization_refs: ['DEC-20260902-02'],
  },
};

/* ------------------------------------------------------------------ */
/* architect — per-task / per-invocation lanes only (§2.5.2)            */
/* ------------------------------------------------------------------ */

const ARCHITECT_PRIMARY: SeatRoutingLane = {
  lane_label: 'primary',
  provider: 'google',
  surface_id: 'antigravity',
  model_id: 'gemini-3.1-pro',
  binding_status: 'approved-binding',
  binding_class: 'primary', // DEC-20260715-14
  provider_class: 'P1', // deployment_channel: P1 (model-registry, at the pin)
  data_eligibility: ['public', 'internal'],
  conditions: [ANTIGRAVITY_MODEL_SELECTION, ANTIGRAVITY_APPROVAL, ANTIGRAVITY_PROHIBITED],
  derivation: ['DEC-20260815-04 Naming Act', 'DEC-20260807-01 §3.3', 'DEC-20260715-14', 'model-registry.md gemini-3.1-pro'],
};

const ARCHITECT_BOUNDED_RECONCILIATION: SeatRoutingLane = {
  lane_label: 'bounded reconciliation',
  provider: 'anthropic',
  surface_id: 'claude-code',
  model_id: 'opus-4.7',
  binding_status: 'approved-binding',
  binding_class: 'post-review-reconciliation-read-only', // DEC-20260807-01
  provider_class: 'P1', // deployment_channel: P1-anthropic-first-party (model-registry)
  data_eligibility: ['public', 'internal'],
  conditions: [ARCH_RECONCILE_PRECONDITIONS, OPUS_RECONCILE_CONSTRAINT],
  derivation: ['DEC-20260807-01', 'model-registry.md opus-4.7 entry constraint'],
};

const ARCHITECT: SeatRegistrationV1 = {
  seat_id: 'architect',
  display_name: 'Daedalus',
  role_binding_status: 'approved', // role-registry §2 at the pin
  mission:
    'Principal Systems Architect and Plan Authority Advisor seat; converts verified research and current ' +
    'repository reality into an executable implementation plan another agent can follow without guessing.',
  contract_ref: 'contracts/seats/architect.md',
  contract_sha256: '63787471913a266c05bad9499904a20e14d39cec05a3bd55803d9e378dee8e32',
  default_surface: null,
  routing: [ARCHITECT_PRIMARY, ARCHITECT_BOUNDED_RECONCILIATION],
  absent_lanes: [
    { label: 'deepseek-secondary', reason: ABSENT_REASON_DEEPSEEK },
    { label: 'deepseek-fallback', reason: ABSENT_REASON_DEEPSEEK },
    { label: 'grok-4.5-advisor', reason: ABSENT_REASON_GROK_ADVISOR },
  ],
  authority: {
    allowed: [
      'inspect source and configuration read-only',
      'write architecture and plan artifacts',
      'recommend an approach',
      'identify Founder decisions',
    ],
    prohibited: [
      'write product implementation code',
      'modify tests as implementation',
      'approve a plan',
      'authorize the Builder',
      'commit, push, merge, deploy, or operate production',
      'add or rotate credentials',
      'expose secrets',
    ],
    enforcement: 'behavioral',
  },
  handoff: {
    receives_from: 'researcher',
    produces: 'Implementation Plan',
    terminal_status: 'PLAN_READY_FOR_FOUNDER_APPROVAL',
    committed_sha: '0000000000000000000000000000000000000000', // placeholder
    authorization_refs: ['DEC-20260902-02'],
  },
};

/* ------------------------------------------------------------------ */
/* builder — seven task-scoped lanes, cursor rows absent (§2.5.3)       */
/* ------------------------------------------------------------------ */

const BUILDER_LARGE: SeatRoutingLane = {
  lane_label: 'large',
  provider: 'xai',
  surface_id: 'grok-build',
  model_id: 'grok-4.5',
  binding_status: 'approved-binding',
  binding_class: 'large-implementation-primary-task-scoped', // DEC-20260807-01
  provider_class: 'NOT_RECORDED', // deployment_channel: unverified
  data_eligibility: ['public'], // public-class only by default (DEC-20260815-04 conditions)
  conditions: [GROK_BULLET_1, GROK_BULLET_2, GROK_ITEM],
  derivation: ['DEC-20260807-01', 'DEC-20260815-04', 'DEC-20260716-02 amendment grok-build item', 'model-registry.md grok-4.5'],
};

const BUILDER_LARGE_FALLBACK: SeatRoutingLane = {
  lane_label: 'large fallback',
  provider: 'anthropic',
  surface_id: 'claude-code',
  model_id: 'sonnet-5',
  binding_status: 'approved-binding',
  binding_class: 'large-implementation-fallback-task-scoped', // DEC-20260807-01; data-boundary condition is initial eligibility, not a failover trigger (§4)
  provider_class: 'P1', // deployment_channel: P1 (model-registry)
  data_eligibility: ['public', 'internal'],
  conditions: [],
  derivation: ['DEC-20260807-01', 'model-registry.md sonnet-5'],
};

const BUILDER_MEDIUM: SeatRoutingLane = {
  lane_label: 'medium',
  provider: 'anthropic',
  surface_id: 'claude-code',
  model_id: 'opus-4.7',
  binding_status: 'approved-binding',
  binding_class: 'medium-work-primary', // DEC-20260807-01
  provider_class: 'P1', // deployment_channel: P1-anthropic-first-party
  data_eligibility: ['public', 'internal'],
  conditions: [],
  derivation: ['DEC-20260807-01', 'model-registry.md opus-4.7'],
};

const BUILDER_LIGHT: SeatRoutingLane = {
  lane_label: 'light',
  provider: 'anthropic',
  surface_id: 'claude-code',
  model_id: 'claude-haiku-4-5',
  binding_status: 'approved-binding',
  binding_class: 'light-implementation-task-scoped', // DEC-20260807-01
  provider_class: 'NOT_RECORDED', // deployment_channel: verification-pending
  data_eligibility: ['public'],
  conditions: [],
  derivation: ['DEC-20260807-01', 'model-registry.md claude-haiku-4-5'],
};

const BUILDER_CODEX_COMPLEX: SeatRoutingLane = {
  lane_label: 'Codex complex / high-risk',
  provider: 'openai',
  surface_id: 'codex',
  model_id: 'gpt-5.6-sol',
  binding_status: 'approved-binding',
  binding_class: 'codex-complex-analysis-planning-and-surgical-fixes', // DEC-20260807-01; max mode requires exact Founder authorization
  provider_class: 'NOT_RECORDED', // deployment_channel: codex-founder-operated, a surface descriptor (§2.2)
  data_eligibility: ['public'],
  conditions: ['active data-boundary policy and exact task scope'],
  derivation: ['DEC-20260807-01', 'model-registry.md gpt-5.6-sol'],
};

const BUILDER_CODEX_ROUTINE: SeatRoutingLane = {
  lane_label: 'Codex routine / bounded',
  provider: 'openai',
  surface_id: 'codex',
  model_id: 'gpt-5.6-terra',
  binding_status: 'approved-binding',
  binding_class: 'routine-verification-and-bounded-fixes', // DEC-20260807-01
  provider_class: 'NOT_RECORDED', // deployment_channel: codex-founder-operated
  data_eligibility: ['public'],
  conditions: ['active data-boundary policy and exact task scope'],
  derivation: ['DEC-20260807-01', 'model-registry.md gpt-5.6-terra'],
};

const BUILDER_HERMES_LOCAL: SeatRoutingLane = {
  lane_label: 'Hermes local',
  provider: 'Hermes (local)', // the Naming Act provider name (DEC-20260815-04); model registry records provider: deepseek
  surface_id: 'hermes-local-code',
  model_id: 'deepseek-v4-flash',
  binding_status: 'approved-binding',
  binding_class: 'hermes-local-code-current-model', // DEC-20260807-01
  provider_class: 'P5', // deployment_channel: P5-founder-operated-local
  data_eligibility: ['local-only'], // external transmission denied unless exactly Founder-authorized
  conditions: [HERMES_BULLET_1, HERMES_BULLET_2],
  derivation: ['DEC-20260815-04', 'DEC-20260807-01 §3.3', 'model-registry.md deepseek-v4-flash'],
};

const BUILDER: SeatRegistrationV1 = {
  seat_id: 'builder',
  display_name: 'Hephaestus',
  role_binding_status: 'unassigned', // role-registry §5 at the pin; DEC-20260716-02 item 12
  mission:
    'Principal Implementation and Test Engineering seat; converts an explicitly approved implementation ' +
    'plan into tested software. Disciplined execution, not architectural improvisation.',
  contract_ref: 'contracts/seats/builder.md',
  contract_sha256: '5a0c3eecd002684433d1dbe47c9229187bcdcacda4300ebcd2584f2f5069b6ae',
  default_surface: null,
  routing: [
    BUILDER_LARGE,
    BUILDER_LARGE_FALLBACK,
    BUILDER_MEDIUM,
    BUILDER_LIGHT,
    BUILDER_CODEX_COMPLEX,
    BUILDER_CODEX_ROUTINE,
    BUILDER_HERMES_LOCAL,
  ],
  absent_lanes: [
    { label: 'cursor-primary', reason: ABSENT_REASON_CURSOR },
    { label: 'cursor-alternative', reason: ABSENT_REASON_CURSOR },
    { label: 'cursor-secondary', reason: GLM_52_CONDITION }, // the glm-5.2 carry (§2.4.2) is compared on this reason by test 10
  ],
  authority: {
    allowed: [
      'modify only the authorized worktree and scope',
      'create implementation and test changes',
      'run development and verification commands',
      'prepare a commit or pull-request package when authorized',
    ],
    prohibited: [
      'approve own changes',
      'act as independent reviewer',
      'change the approved architecture without authorization',
      'push, open a pull request, post a review, merge, release, or deploy unless separately authorized',
      'touch production',
      'add or rotate credentials',
      'expose secrets',
      'claim completion solely because code was written',
    ],
    enforcement: 'behavioral',
  },
  handoff: {
    receives_from: 'architect',
    produces: 'Build Report',
    terminal_status: 'BUILD_READY_FOR_INDEPENDENT_VERIFICATION',
    committed_sha: '0000000000000000000000000000000000000000', // placeholder
    authorization_refs: ['DEC-20260902-02'],
  },
};

/* ------------------------------------------------------------------ */
/* independent-reviewer — Tier-2 lanes + absent rows (§2.5.4)           */
/* ------------------------------------------------------------------ */

const TIER2_GEMINI: SeatRoutingLane = {
  lane_label: 'tier-2',
  provider: 'google',
  surface_id: 'antigravity',
  model_id: 'gemini-3.1-pro',
  binding_status: 'approved-binding',
  binding_class: 'tier-2', // DEC-20260719-02
  mode: 'invoked',
  tier2_attestation_id: 'gemini-3.1-pro', // matches model_id; no variance
  provider_class: 'P1', // deployment_channel: P1
  data_eligibility: ['public', 'internal'],
  conditions: [ANTIGRAVITY_MODEL_SELECTION, ANTIGRAVITY_APPROVAL, ANTIGRAVITY_PROHIBITED, REVIEWER_CLAUSE_3],
  derivation: ['DEC-20260815-05', 'DEC-20260719-02 v1.1', 'DEC-20260807-01 §3.3', 'model-registry.md gemini-3.1-pro'],
};

const TIER2_SOL: SeatRoutingLane = {
  lane_label: 'tier-2',
  provider: 'openai',
  surface_id: 'codex',
  model_id: 'gpt-5.6-sol',
  binding_status: 'approved-binding',
  binding_class: 'tier-2-full-roster', // DEC-20260719-02 v1.1
  mode: 'xhigh',
  tier2_attestation_id: 'chatgpt-5.6-sol', // attestation-id variance (§2.5.4 hazard 1) — persisted, never derived
  provider_class: 'NOT_RECORDED', // deployment_channel: codex-founder-operated
  data_eligibility: ['public'],
  conditions: [],
  derivation: ['DEC-20260719-02 v1.1', 'model-registry.md gpt-5.6-sol'],
};

const TIER2_TERRA: SeatRoutingLane = {
  lane_label: 'tier-2',
  provider: 'openai',
  surface_id: 'codex',
  model_id: 'gpt-5.6-terra',
  binding_status: 'approved-binding',
  binding_class: 'tier-2-full-roster', // DEC-20260719-02 v1.1 (supersedes the DEC-20260807-01 not-Tier-2 line, §2.5.4 hazard 2)
  mode: 'high',
  tier2_attestation_id: 'chatgpt-5.6-terra',
  provider_class: 'NOT_RECORDED',
  data_eligibility: ['public'],
  conditions: [],
  derivation: ['DEC-20260719-02 v1.1', 'model-registry.md gpt-5.6-terra'],
};

const TIER2_LUNA: SeatRoutingLane = {
  lane_label: 'tier-2',
  provider: 'openai',
  surface_id: 'codex',
  model_id: 'gpt-5.6-luna',
  binding_status: 'approved-binding',
  binding_class: 'tier-2-full-roster', // DEC-20260719-02 v1.1
  mode: 'invoked',
  tier2_attestation_id: 'chatgpt-5.6-luna',
  provider_class: 'NOT_RECORDED', // deployment_channel: verification-pending — a governance sentinel, not a P1–P5 class (§2.2)
  data_eligibility: ['public'], // public-class only; internal-class review material requires explicit per-invocation Founder authorization
  conditions: [],
  derivation: ['DEC-20260719-02 v1.1', 'model-registry.md gpt-5.6-luna'],
};

const TIER2_GROK: SeatRoutingLane = {
  lane_label: 'tier-2',
  provider: 'xai',
  surface_id: 'grok-build',
  model_id: 'grok-4.5',
  binding_status: 'approved-binding',
  binding_class: 'tier-2', // DEC-20260719-02 v1.1
  mode: 'invoked',
  tier2_attestation_id: 'grok-4.5', // matches model_id; no variance
  provider_class: 'NOT_RECORDED', // deployment_channel: unverified
  data_eligibility: ['public'], // public-class only by default (§2.4.2)
  conditions: [GROK_BULLET_1, GROK_BULLET_2],
  derivation: ['DEC-20260815-05', 'DEC-20260719-02 v1.1', 'DEC-20260815-04', 'model-registry.md grok-4.5'],
};

const INDEPENDENT_REVIEWER: SeatRegistrationV1 = {
  seat_id: 'independent-reviewer',
  display_name: 'Argus',
  role_binding_status: 'active', // two-tier, DEC-20260719-02 v1.1 (role-registry §6 at the pin)
  mission:
    'Independent verification and auditing seat; adversarial verifier, not a second Builder. Determines whether ' +
    'an exact implementation follows the approved plan and is ready for Founder consideration.',
  contract_ref: 'contracts/seats/independent-reviewer.md',
  contract_sha256: '10992c6feb5d047d6d922b1bf8d73c15d70c639758dd5fd6e3c9aa6fede32996',
  default_surface: null,
  routing: [TIER2_GEMINI, TIER2_SOL, TIER2_TERRA, TIER2_LUNA, TIER2_GROK],
  absent_lanes: [
    { label: 'claude-code-tier2', reason: ABSENT_REASON_CLAUDE_CODE_TIER2 },
    { label: 'restricted-local-hermes-4-14b', reason: ABSENT_REASON_RESTRICTED_LOCAL },
    { label: 'restricted-local-tencent-hy3', reason: ABSENT_REASON_RESTRICTED_LOCAL },
    { label: 'supplemental-gemini-3.6-flash', reason: ABSENT_REASON_SUPPLEMENTAL },
    { label: 'supplemental-gemini-3.5-flash', reason: ABSENT_REASON_SUPPLEMENTAL },
  ],
  authority: {
    allowed: [
      'inspect code and history read-only',
      'run non-mutating tests and audit commands',
      'write an audit or verification artifact to an approved evidence location',
      'issue an evidence-backed verdict',
    ],
    prohibited: [
      'modify product code',
      'fix own findings',
      'commit, amend, or push',
      'post a GitHub review or comment without separate authorization',
      'approve or merge in GitHub',
      'waive findings',
      'deploy or change production',
      'claim Founder authority',
      'add or rotate credentials',
      'expose secrets',
    ],
    enforcement: 'behavioral',
  },
  handoff: {
    receives_from: 'builder',
    produces: 'Verification Report',
    terminal_status: 'SEAT_VERIFIED',
    committed_sha: '0000000000000000000000000000000000000000', // placeholder
    authorization_refs: ['DEC-20260902-02'],
  },
};

/** Deep-frozen registrations — a mutation attempt is a runtime and test-time failure (r7 test 1). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const k of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[k]);
    }
  }
  return value;
}

export const RATIFIED_SEATS: readonly SeatRegistrationV1[] = deepFreeze([
  RESEARCHER,
  ARCHITECT,
  BUILDER,
  INDEPENDENT_REVIEWER,
]);

/**
 * §2.5.1 — the researcher absence reason, stated once, used by resolveSeat's
 * routing_set_empty refusal and by the seat's own AC3 transcript.
 */
export const RESEARCHER_ABSENT_REASON =
  'No registered Build Room execution surface permits `researcher` (DEC-20260807-01 §3.3 roles-permitted table; ' +
  'DEC-20260815-04 role-coverage table omits `researcher` entirely); the only registered Hermes surface permits ' +
  '`builder` only and excludes `researcher` deliberately (execution-surface-registry `hermes-local-code`).';

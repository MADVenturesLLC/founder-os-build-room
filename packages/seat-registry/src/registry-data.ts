/**
 * Seat Registry V1 — registry data and derived lane data (§2.5, §2.7).
 *
 * Every lane mirrors the controlling registries and decisions read at the
 * doctrine pin 846190fdb4da0604672bef8d7b1c8852407c4934. No lane, model
 * identifier, provider class, surface, or binding status is asserted,
 * inferred from a nearby value, or carried forward from prior drafts.
 * Where the corpus establishes no lawful lane, the row is an
 * `absent_lanes` entry carrying exactly { label, reason }.
 *
 * No seat has a standing route in V1 (§2.5, §3.1, §14); `default_surface`
 * is null for all four seats (§2.6).
 */

import type { ModelExactLane, NotApprovedLane, SeatRegistrationV1, SurfaceProviderLane } from './schema.js';
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

// The claude-code-tier2 absent lane is retired: BR-PHASE4-SURFACE-KEYED-SEATS-R1
// (issued 2026-10-17) is the derivation act that entry anticipated, and the
// claude-code reviewer lane now lives in the routing set above.

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
  not_approved_lanes: [],
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

const ARCHITECT_PRIMARY: ModelExactLane = {
  lane_label: 'primary',
  provider: 'google',
  surface_id: 'antigravity',
  model_id: 'gemini-4-argon',
  binding_status: 'approved-binding',
  binding_class: 'primary', // DEC-20260715-14
  provider_class: 'NOT_RECORDED', // model-registry: deployment_channel `unverified`; nothing there classifies it P1
  data_eligibility: ['public'], // model-registry data_class_boundary: "public-class only; internal-or-higher prohibited"
  conditions: [ANTIGRAVITY_MODEL_SELECTION, ANTIGRAVITY_APPROVAL, ANTIGRAVITY_PROHIBITED],
  derivation: ['DEC-20260815-04 Naming Act', 'DEC-20260807-01 §3.3', 'DEC-20260715-14', 'model-registry.md gemini-4-argon', 'model-registry.md gemini-4-argon data_class_boundary', 'DEC-20261019-01 Clause A'],
};

const ARCHITECT_BOUNDED_RECONCILIATION: ModelExactLane = {
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
  not_approved_lanes: [], // the architect's lanes are outside DEC-20261020-01's scope and stay model-exact (clause 1)
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
/* builder — two surface:provider lanes (DEC-20261020-01 clause 2),    */
/* five earlier lanes kept as not-approved records, cursor rows absent  */
/* ------------------------------------------------------------------ */

/*
 * The five records below are the builder lanes as DEC-20260807-01 bound them
 * before DEC-20261020-01. They are kept exactly as they were bound, in
 * `not_approved_lanes`, never in `routing` (the Founder's answer of
 * 2026-10-25: keep each record, mark it not approved, cite clause 2).
 */

const BUILDER_LARGE_RECORD: ModelExactLane = {
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

const BUILDER_LARGE_FALLBACK_RECORD: ModelExactLane = {
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

const BUILDER_MEDIUM_RECORD: ModelExactLane = {
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

const BUILDER_LIGHT_RECORD: ModelExactLane = {
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

const BUILDER_HERMES_LOCAL_RECORD: ModelExactLane = {
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

const NOT_APPROVED_BUILDER_LANE =
  'DEC-20261020-01 clause 2: the clause 2 table is the whole set of Build Room builder seat lanes, and "a lane in ' +
  'scope or a model not in it is not approved for that lane". The table carries two builder lanes, ' +
  '`claude-code:anthropic` (claude-opus-5.5, claude-fable-5.1) and `codex:openai` (gpt-6.1-sol, gpt-6-astra). ';

function notApprovedBuilderLane(record: ModelExactLane, why: string): NotApprovedLane {
  return { record, reason: NOT_APPROVED_BUILDER_LANE + why + ' Adding it back is a Founder act recorded in model-registry.md.' };
}

const BUILDER_NOT_APPROVED: readonly NotApprovedLane[] = [
  notApprovedBuilderLane(BUILDER_LARGE_RECORD, '`grok-build:xai` is in the table as a Tier-2 lane only, so `grok-build` carries no builder lane.'),
  notApprovedBuilderLane(BUILDER_LARGE_FALLBACK_RECORD, '`sonnet-5` is not on the `claude-code:anthropic` allowlist.'),
  notApprovedBuilderLane(BUILDER_MEDIUM_RECORD, '`opus-4.7` is not on the `claude-code:anthropic` allowlist.'),
  notApprovedBuilderLane(BUILDER_LIGHT_RECORD, '`claude-haiku-4-5` is not on the `claude-code:anthropic` allowlist.'),
  notApprovedBuilderLane(BUILDER_HERMES_LOCAL_RECORD, '`hermes-local-code` has no lane in the table.'),
];

/*
 * The two approved builder lanes, copied from the model registry's Lanes
 * table at the pin. An allowlist holds only models whose own entry is in the
 * registry at the pin: `claude-fable-5.5` joins `claude-code:anthropic` on
 * registration and has no entry yet, so it is not listed.
 */
const BUILDER_CLAUDE_CODE: SurfaceProviderLane = {
  lane_label: 'claude-code:anthropic',
  lane: 'claude-code:anthropic',
  provider: 'anthropic',
  surface_id: 'claude-code',
  allowlist: ['claude-opus-5.5', 'claude-fable-5.1'],
  binding_status: 'approved-binding', // portfolio_classification of every allowlist model at the pin
  binding_class: 'builder-lane', // DEC-20261020-01 clause 2 table
  provider_class: 'P1', // deployment_channel: P1 for claude-opus-5.5 and claude-fable-5.1
  data_eligibility: ['public', 'internal'],
  conditions: [],
  derivation: [
    'DEC-20261020-01 clauses 1 and 2',
    'model-registry.md Lanes',
    'DEC-20261019-01 Clause D (claude-opus-5.5)',
    "the Founder's answer of 2026-10-21 (claude-fable-5.1)",
    'model-registry.md claude-opus-5.5',
    'model-registry.md claude-fable-5.1',
  ],
};

const BUILDER_CODEX: SurfaceProviderLane = {
  lane_label: 'codex:openai',
  lane: 'codex:openai',
  provider: 'openai',
  surface_id: 'codex',
  allowlist: ['gpt-6.1-sol', 'gpt-6-astra'],
  binding_status: 'approved-binding', // portfolio_classification of every allowlist model at the pin
  binding_class: 'builder-lane', // DEC-20261020-01 clause 2 table
  provider_class: 'NOT_RECORDED', // gpt-6.1-sol: openai-first-party-api; gpt-6-astra: verification-pending; neither is a P1–P5 token (§2.2)
  data_eligibility: ['public'],
  conditions: ['active data-boundary policy and exact task scope'],
  derivation: [
    'DEC-20261020-01 clauses 1 and 2',
    'model-registry.md Lanes',
    'DEC-20261019-01 Clause B',
    'model-registry.md gpt-6.1-sol',
    'model-registry.md gpt-6-astra',
  ],
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
  routing: [BUILDER_CLAUDE_CODE, BUILDER_CODEX],
  absent_lanes: [
    { label: 'cursor-primary', reason: ABSENT_REASON_CURSOR },
    { label: 'cursor-alternative', reason: ABSENT_REASON_CURSOR },
    { label: 'cursor-secondary', reason: GLM_52_CONDITION }, // the glm-5.2 carry (§2.4.2) is compared on this reason by test 10
  ],
  not_approved_lanes: BUILDER_NOT_APPROVED,
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

/*
 * The four Tier-2 lanes, copied from the model registry's Lanes table at the
 * pin. The attestation token is the surface (DEC-20261020-01 clause 6), so
 * no lane carries `tier2_attestation_id`; the model that served a review is
 * recorded in its `Tier2-Reviewer-Model:` line, and on Build Room clause 4
 * refuses one that is not on its lane's allowlist. Effort is per model (each
 * entry's `modes:`) and is recorded per review, not pinned on the lane.
 */
const TIER2_ANTIGRAVITY_GOOGLE: SurfaceProviderLane = {
  lane_label: 'tier-2',
  lane: 'antigravity:google',
  provider: 'google',
  surface_id: 'antigravity',
  allowlist: ['gemini-4-argon'],
  binding_status: 'approved-binding',
  binding_class: 'tier-2', // DEC-20260719-02; DEC-20261020-01 clause 2 table
  provider_class: 'NOT_RECORDED', // model-registry: deployment_channel `unverified`; nothing there classifies it P1
  data_eligibility: ['public'], // model-registry data_class_boundary: "public-class only; internal-or-higher prohibited"
  conditions: [ANTIGRAVITY_MODEL_SELECTION, ANTIGRAVITY_APPROVAL, ANTIGRAVITY_PROHIBITED, REVIEWER_CLAUSE_3],
  derivation: ['DEC-20261020-01 clauses 1, 2 and 6', 'model-registry.md Lanes', 'DEC-20261019-01 Clause A', 'DEC-20260815-05', 'DEC-20260807-01 §3.3', 'model-registry.md gemini-4-argon', 'model-registry.md gemini-4-argon data_class_boundary'],
};

/*
 * `antigravity:anthropic` carries Claude as a Tier-2 lane only (DEC-20261020-01
 * clause 9). Its models' entries are P1 for Anthropic's own channel; this lane
 * reaches them through Antigravity, which nothing at the pin classifies, and
 * clause 8 holds it to public class. The execution-surface registry's
 * `underlying_model_selection` line for `antigravity` still names Gemini
 * models only at the pin, so this lane does not carry it; the Founder's
 * answer of 2026-10-25 keeps the lane, as the clause 2 table has it, and
 * leaves amending that registry entry to a separate FounderOS change.
 */
const TIER2_ANTIGRAVITY_ANTHROPIC: SurfaceProviderLane = {
  lane_label: 'tier-2',
  lane: 'antigravity:anthropic',
  provider: 'anthropic',
  surface_id: 'antigravity',
  allowlist: ['claude-opus-5.5', 'claude-sonnet-5.5'],
  binding_status: 'approved-binding',
  binding_class: 'tier-2', // DEC-20261020-01 clause 2 table
  provider_class: 'NOT_RECORDED',
  data_eligibility: ['public'], // DEC-20261020-01 clause 8: public-class only
  conditions: [ANTIGRAVITY_APPROVAL, ANTIGRAVITY_PROHIBITED, REVIEWER_CLAUSE_3],
  derivation: ['DEC-20261020-01 clauses 1, 2, 6, 7, 8 and 9', 'model-registry.md Lanes', 'DEC-20261019-01 Clause D', "the Founder's answer of 2026-10-21 (public class only)", 'model-registry.md claude-opus-5.5', 'model-registry.md claude-sonnet-5.5'],
};

const TIER2_CODEX: SurfaceProviderLane = {
  lane_label: 'tier-2',
  lane: 'codex:openai',
  provider: 'openai',
  surface_id: 'codex',
  allowlist: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'],
  binding_status: 'approved-binding',
  binding_class: 'tier-2-full-roster', // DEC-20260719-02 v1.1; DEC-20261020-01 clause 2 table
  provider_class: 'NOT_RECORDED', // openai-first-party-api / verification-pending: no P1–P5 token (§2.2)
  data_eligibility: ['public'], // internal-class review material requires explicit per-invocation Founder authorization
  conditions: [],
  derivation: ['DEC-20261020-01 clauses 1, 2 and 6', 'model-registry.md Lanes', 'DEC-20261019-01 Clause B', 'DEC-20260719-02 v1.1', 'model-registry.md gpt-6.1-sol', 'model-registry.md gpt-6-astra', 'model-registry.md gpt-6-luna'],
};

/*
 * grok-4.6, grok-4.7 and grok-4.7-build-fast join this allowlist on
 * registration (DEC-20261020-01 clause 2 table); their entries merged on
 * 2026-10-25 and are in the registry at the pin.
 */
const TIER2_GROK: SurfaceProviderLane = {
  lane_label: 'tier-2',
  lane: 'grok-build:xai',
  provider: 'xai',
  surface_id: 'grok-build',
  allowlist: ['grok-4.5', 'grok-4.6', 'grok-4.7', 'grok-4.7-build-fast'],
  binding_status: 'approved-binding',
  binding_class: 'tier-2', // DEC-20260719-02 v1.1; DEC-20261020-01 clause 2 table
  provider_class: 'NOT_RECORDED', // deployment_channel: unverified, for all four
  data_eligibility: ['public'], // public-class only by default (§2.4.2); each entry's data_class_boundary
  conditions: [GROK_BULLET_1, GROK_BULLET_2],
  derivation: ['DEC-20261020-01 clauses 1, 2 and 6', 'model-registry.md Lanes', 'DEC-20260719-02 v1.1', 'DEC-20260815-05', 'DEC-20260815-04', "the Founder's answer of 2026-10-21 (grok-4.6, grok-4.7, grok-4.7-build-fast)", 'model-registry.md grok-4.5', 'model-registry.md grok-4.6', 'model-registry.md grok-4.7', 'model-registry.md grok-4.7-build-fast'],
};

/**
 * The claude-code reviewer lane `BR-PHASE4-SURFACE-KEYED-SEATS-R1` (issued
 * 2026-10-17) added, kept as bound in `not_approved_lanes`: DEC-20261020-01's
 * clause 2 table gives `claude-code` no Tier-2 lane. As bound, it was the
 * derivation act the retired absent-lane entry anticipated. Identity is the surface (DEC-20261001-01 roster token
 * `claude-code`); the model_id is dispatch pinning only — the registry's
 * own claude-code review association (`model-registry.md` sonnet-5: "Sonnet
 * for routine review"; anthropic, P1, ZDR-eligible) — and the act's checks
 * never read it.
 */
const TIER2_CLAUDE_CODE_RECORD: ModelExactLane = {
  lane_label: 'tier-2',
  provider: 'anthropic',
  surface_id: 'claude-code',
  model_id: 'sonnet-5',
  binding_status: 'approved-binding',
  binding_class: 'tier-2',
  mode: 'invoked',
  tier2_attestation_id: 'claude-code', // NOT on the FOUNDER-ACT-20261011 B2 binding surface roster (antigravity|codex|chatgpt|grok-build); retained for the surface-keyed seat act, with the binding Claude lane moving to antigravity under DEC-20261019-01 Clause D in Slice 2
  provider_class: 'P1', // deployment_channel: P1 (model-registry, sonnet-5)
  data_eligibility: ['public', 'internal'], // sonnet-5 is ZDR-eligible (model-registry); no data-boundary condition recorded
  conditions: [],
  derivation: [
    'BR-PHASE4-SURFACE-KEYED-SEATS-R1 (2026-10-17) claude-code admitted as an independent-reviewer surface',
    'DEC-20261001-01 (roster re-based to surface attestation tokens; claude-code re-admitted at surface level)',
    'DEC-20260815-05',
    'model-registry.md sonnet-5 (dispatch pin; anthropic; P1; ZDR-eligible)',
  ],
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
  routing: [TIER2_ANTIGRAVITY_GOOGLE, TIER2_ANTIGRAVITY_ANTHROPIC, TIER2_CODEX, TIER2_GROK],
  absent_lanes: [
    { label: 'restricted-local-hermes-4-14b', reason: ABSENT_REASON_RESTRICTED_LOCAL },
    { label: 'restricted-local-tencent-hy3', reason: ABSENT_REASON_RESTRICTED_LOCAL },
    { label: 'supplemental-gemini-3.6-flash', reason: ABSENT_REASON_SUPPLEMENTAL },
    { label: 'supplemental-gemini-3.5-flash', reason: ABSENT_REASON_SUPPLEMENTAL },
  ],
  not_approved_lanes: [
    {
      record: TIER2_CLAUDE_CODE_RECORD,
      reason:
        'DEC-20261020-01 clause 2: the clause 2 table is the whole set of `independent-reviewer` Tier-2 lanes, and ' +
        '"`claude-code` carries no Tier-2 lane" (the Founder\'s answer of 2026-10-21). Claude reviews only on ' +
        '`antigravity:anthropic`, public class only. Adding it back is a Founder act recorded in model-registry.md.',
    },
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

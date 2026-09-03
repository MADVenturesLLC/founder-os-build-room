/**
 * Seat Registry V1 — verbatim condition strings, byte-captured from the
 * pinned fixtures (r7 test 10 compares each lane's conditions against these).
 *
 * Source windows (doctrine pin bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda):
 *   - GROK_BULLET_1/2, HERMES_BULLET_1/2: DEC-20260815-04, "Conditions carried
 *     by two of the five" (lines 59–62, 63–67, 76–77, 78–80).
 *   - GROK_ITEM: DEC-20260716-02 amendment, grok-build item (lines 152–160).
 *   - GLM_52_CONDITION: DEC-20260716-02 amendment, cursor item (lines 141–144).
 *   - ANTIGRAVITY_*: execution-surface-registry.md lines 312, 314, 316.
 *   - REVIEWER_CLAUSE_3: DEC-20260815-05 clause 3 (lines 69–71).
 *   - ARCH_RECONCILE_PRECONDITIONS: DEC-20260807-01 lines 446–452.
 *   - OPUS_RECONCILE_CONSTRAINT: model-registry.md opus-4.7 entry paragraph.
 *
 * Each string is complete — not truncated or composited. Regenerate by
 * re-extracting from the pinned fixtures (see the build report).
 */

export const GROK_BULLET_1 =
  '- **Public-class only by default.** The `grok-4.5` roster entry carries a\n' +
  '  data-boundary condition: while its `deployment_channel` is unverified,\n' +
  '  internal-class content requires explicit auditable Founder authorization per\n' +
  '  `DEC-20260716-01` clause 6.';

export const GROK_BULLET_2 =
  '- **xAI first-party API terms are not verified** in\n' +
  '  `/04-agents/subscription-vs-api-inventory.md`, which states that a decision\n' +
  '  relying on them must independently verify via `docs.x.ai` at that time. The\n' +
  '  path in active use is the `grok-build` CLI/agent session, not a verified\n' +
  '  first-party API channel.';

export const GROK_ITEM =
  '  where and when the route may actually execute. Every execution, public or\n' +
  '  internal, requires an exact task-scoped Founder authorization naming\n' +
  '  repository, data class, scope, and expiration/completion boundary — no\n' +
  '  standing routing authority exists until MP-1 activation. That authorization\n' +
  '  may permit public-class data immediately; internal or private-repository\n' +
  '  data requires the same authorization plus explicit disclosure until channel\n' +
  '  verification is recorded. Secrets, credentials, production data, personal\n' +
  '  data, and confidential-or-higher material remain excluded unless separately\n' +
  '  and exactly Founder-authorized.';

export const HERMES_BULLET_1 =
  '- **`builder` only.** The registry permits no other role, and excludes\n' +
  '  `researcher` deliberately.';

export const HERMES_BULLET_2 =
  '- **May not issue a sole binding Tier-2 verdict**, and may not self-review,\n' +
  '  merge, deploy, or operate in production — `prohibited_actions`, ratified\n' +
  '  2026-08-07. External transmission is denied by default.';

export const ANTIGRAVITY_MODEL_SELECTION =
  'underlying_model_selection: founder-manual-selection-required; must be a registered, provider-verified Gemini model ID carrying a model-registry entry; exact model and effort recorded';

export const ANTIGRAVITY_APPROVAL =
  'approval_requirements: no Auto or silent switching; no self-review; exact task and code-state binding';

export const ANTIGRAVITY_PROHIBITED =
  'prohibited_actions: merge, deployment, production operation, authority expansion';

export const REVIEWER_CLAUSE_3 =
  '3. **The reviewer workspace** is read-only, credential-free, and\n' +
  '   push-incapable by construction (architecture §3.11), attested by the\n' +
  '   Gateway before review opens.';

export const ARCH_RECONCILE_PRECONDITIONS =
  '- After the binding Tier-2 verdict, an `opus-4.7` execution assigned the\n' +
  '  `architect` or `strategist` stable role may reconcile findings before\n' +
  '  Founder merge authority is requested. This reconciliation is not the\n' +
  '  binding Tier-2 verdict and does not replace Founder authority.\n' +
  '- Tier-2 independence requires a different execution and model/provider from\n' +
  '  the Builder. If `opus-4.7` authored the work, it cannot perform the\n' +
  '  post-review reconciliation for that code state.';

export const GLM_52_CONDITION =
  '  `glm-5.2` is limited to public and ordinary-internal data through the\n' +
  '  existing P3/Z.ai approval; governance/doctrine, confidential-or-higher,\n' +
  '  secrets, credentials, personal data, and production data are prohibited.\n' +
  '  This does not replace or broaden its Deputy runtime binding.';

export const OPUS_RECONCILE_CONSTRAINT =
  'Post-review reconciliation is read-only on the reviewed SHA. Any code edit is\n' +
  'a new `builder` execution, produces a new SHA, and requires fresh verification\n' +
  'and review. An execution that authored the code state cannot reconcile it as\n' +
  'an independent post-review execution.';

// Seat contract SHA-256 pins (test 3 recomputes them live from the files).
export const RESEARCHER_CONTRACT_SHA256 = 'ad5cddb0ff038f8e41ad418f0f531ab8da9b88724dbd1c6b10ead369111c9ea0';
export const ARCHITECT_CONTRACT_SHA256 = '63787471913a266c05bad9499904a20e14d39cec05a3bd55803d9e378dee8e32';
export const BUILDER_CONTRACT_SHA256 = '5a0c3eecd002684433d1dbe47c9229187bcdcacda4300ebcd2584f2f5069b6ae';
export const INDEPENDENT_REVIEWER_CONTRACT_SHA256 = '10992c6feb5d047d6d922b1bf8d73c15d70c639758dd5fd6e3c9aa6fede32996';


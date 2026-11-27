/**
 * Seat Registry V1 — vendored doctrine fixtures (test 14).
 *
 * Each fixture is byte-captured from FounderOS at the doctrine pin
 * c788495466db52e576a58d0856345e41fdcac9cb and its SHA-256 recorded here and
 * asserted by the fixture-integrity test. No fixture is vendored without its
 * hash; the hashes are recomputed and compared at test time.
 *
 * Re-pinned from d3049d9233000ed7a0c107a365fd035ff5d2b05c (2026-11-27) to
 * the merge of FounderOS pull request 434, which records
 * FOUNDER-RULING-20261118-TIER2-SURFACE-LANES as Amendment 4 to
 * DEC-20261020-01 and gives the model registry's four Tier-2 Lanes rows no
 * allowlist. That ruling's C2 brings this registry's copy of those lanes to
 * match, in its own Build Room pull request; this pin is it. Six fixtures
 * changed between the pins (role, model and execution-surface registries,
 * DEC-20260815-05, DEC-20260807-01 and the decision log); the other four are
 * byte-identical at both. The builder rows of the Lanes table are
 * byte-identical at both pins (the ruling's B5).
 *
 * Before that, re-pinned from 846190fdb4da0604672bef8d7b1c8852407c4934 (2026-11-26) to
 * the merge of FounderOS pull request 431, which registers
 * `claude-fable-5.2` and adds it to the `claude-code:anthropic` builder lane
 * by the Founder's act of 2026-11-17. DEC-20261020-01's update of that day
 * names Build Room's served-model lanes file and seat lanes as the copies
 * still outstanding; this pin lets the seat lane carry the model, because an
 * allowlist holds only models with an entry at the pin. Five fixtures
 * changed between the pins (role, model and execution-surface registries,
 * DEC-20260807-01 and the decision log); the other five are byte-identical
 * at both.
 *
 * Before that, re-pinned from 8d09e7ed36dcb2a67df2b45daa81c8ad7d170694 under
 * DEC-20261020-01 clause 10 (the Founder's answer of 2026-10-25: re-vendor in
 * the Seat Registry lanes pull request), so the lanes can mirror the model
 * registry's Lanes table. Four fixtures changed between the pins; the other
 * six are byte-identical at both.
 */

export interface FixtureEntry {
  readonly source_path: string;
  readonly filename: string;
  readonly sha256: string;
}

export const DOCTRINE_PIN = 'c788495466db52e576a58d0856345e41fdcac9cb';

export const FIXTURES: readonly FixtureEntry[] = [
  {
    source_path: '04-agents/role-registry.md',
    filename: 'role-registry.md',
    sha256: '3335710f82768fc1171dab0190c751c6bd426ee0b60643d80c97c1b254244f23',
  },
  {
    source_path: '04-agents/model-registry.md',
    filename: 'model-registry.md',
    sha256: 'e1d9cd227102bfd2acc22d26256477bf015af2e0231b962da71ea0b992b85c32',
  },
  {
    source_path: '04-agents/execution-surface-registry.md',
    filename: 'execution-surface-registry.md',
    sha256: '6783cad4524769a1b27b2a9dfa5484913ed22b27e59627b92006efb824dae1b2',
  },
  {
    source_path: '07-decisions/DEC-20260815-05-reviewer-eligibility-roster.md',
    filename: 'DEC-20260815-05-reviewer-eligibility-roster.md',
    sha256: 'c03a1e5f0e6fb9b22903d64c4647a73bab06b5999c188b8801c96cde2aa5e4c5',
  },
  {
    source_path: '00-system/scripts/tier2-shape-check.sh',
    filename: 'tier2-shape-check.sh',
    sha256: 'fcaa4d3514903cfa2e230f7d3f44f764bdc0ca748337d95f7af7de6051b7783b',
  },
  {
    source_path: '07-decisions/DEC-20260716-02-model-portfolio-and-routing-strategy.md',
    filename: 'DEC-20260716-02-model-portfolio-and-routing-strategy.md',
    sha256: 'b7ed223d84c5b97de2f5a70d848715a46e9505c9924be1e135edfb334dd2bc17',
  },
  {
    source_path: '07-decisions/DEC-20260815-04-provider-selection-ordering.md',
    filename: 'DEC-20260815-04-provider-selection-ordering.md',
    sha256: 'dca03d37ebdbb740bb1784708f8c2f5659c13f643ac6cd79c4e3fc7bb7dd9042',
  },
  {
    source_path: '07-decisions/DEC-20260807-01-g3-slice-b-plus-coding-execution-surface-governance.md',
    filename: 'DEC-20260807-01-g3-slice-b-plus-coding-execution-surface-governance.md',
    sha256: '8b41d27d7abe98a76769b8545eab6030c13a9a149e9606ecddc4a098c68ea4ef',
  },
  {
    source_path: '07-decisions/DEC-20260720-02-architect-fallback-azure-access-channel.md',
    filename: 'DEC-20260720-02-architect-fallback-azure-access-channel.md',
    sha256: 'de67e9908cbab9cbca19fdde37a41832b9e64843dca1a71cfb1460703a9f61b4',
  },
  {
    source_path: '07-decisions/decision-log.md',
    filename: 'decision-log.md',
    sha256: '2f5c5c0b4de4bfcfafc2917de4a186ab8fd3b6e0e40825793d081faaf6a2baaf',
  },
] as const;

export function fixtureByFilename(filename: string): FixtureEntry | undefined {
  return FIXTURES.find((f) => f.filename === filename);
}

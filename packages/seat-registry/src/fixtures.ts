/**
 * Seat Registry V1 — vendored doctrine fixtures (test 14).
 *
 * Each fixture is byte-captured from FounderOS at the doctrine pin
 * d3049d9233000ed7a0c107a365fd035ff5d2b05c and its SHA-256 recorded here and
 * asserted by the fixture-integrity test. No fixture is vendored without its
 * hash; the hashes are recomputed and compared at test time.
 *
 * Re-pinned from 846190fdb4da0604672bef8d7b1c8852407c4934 (2026-11-26) to
 * the merge of FounderOS pull request 431, which registers
 * `claude-fable-5.2` and adds it to the `claude-code:anthropic` builder lane
 * by the Founder's act of 2026-11-17. DEC-20261020-01's update of that day
 * names Build Room's served-model lanes file and seat lanes as the copies
 * still outstanding; this pin lets the seat lane carry the model, because an
 * allowlist holds only models with an entry at the pin. Five fixtures
 * changed between the pins (role, model and execution-surface registries,
 * DEC-20260807-01 and the decision log); the other five are byte-identical
 * at both. The pin precedes FounderOS pull request 434, so Amendment 4's
 * Tier-2 lanes are not taken here: Build Room's seat-registry copy of those
 * follows in its own pull request (that ruling's C2).
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

export const DOCTRINE_PIN = 'd3049d9233000ed7a0c107a365fd035ff5d2b05c';

export const FIXTURES: readonly FixtureEntry[] = [
  {
    source_path: '04-agents/role-registry.md',
    filename: 'role-registry.md',
    sha256: '062941064b045e46754ebdcf91efdec93ed67d21bb6a53278932ae9dc388db64',
  },
  {
    source_path: '04-agents/model-registry.md',
    filename: 'model-registry.md',
    sha256: '4f8e6fbaf35179102bfe810d7e8b2241edb79142c4bb5846efe89e3889b06bb7',
  },
  {
    source_path: '04-agents/execution-surface-registry.md',
    filename: 'execution-surface-registry.md',
    sha256: 'b68cf1f941a2a183f65d437cebe8c3ae540933c9721216f1fe33f8c063e79c4e',
  },
  {
    source_path: '07-decisions/DEC-20260815-05-reviewer-eligibility-roster.md',
    filename: 'DEC-20260815-05-reviewer-eligibility-roster.md',
    sha256: '97f1ab0ab1f82a216e9b3adead5e35a5c9b2f8b0c9ed3b05767c3fdc66c2e4bc',
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
    sha256: '473e09538ca702f32de6318b20fd2803b53f8431c238a7ad8de0f1eb60d6b7e1',
  },
  {
    source_path: '07-decisions/DEC-20260720-02-architect-fallback-azure-access-channel.md',
    filename: 'DEC-20260720-02-architect-fallback-azure-access-channel.md',
    sha256: 'de67e9908cbab9cbca19fdde37a41832b9e64843dca1a71cfb1460703a9f61b4',
  },
  {
    source_path: '07-decisions/decision-log.md',
    filename: 'decision-log.md',
    sha256: 'fe3b259c68767b887b130a1f1b31e7fedc01597e9d346c7c56f351a8db4812de',
  },
] as const;

export function fixtureByFilename(filename: string): FixtureEntry | undefined {
  return FIXTURES.find((f) => f.filename === filename);
}

/**
 * Seat Registry V1 — vendored doctrine fixtures (test 14).
 *
 * Each fixture is byte-captured from FounderOS at the doctrine pin
 * 846190fdb4da0604672bef8d7b1c8852407c4934 and its SHA-256 recorded here and
 * asserted by the fixture-integrity test. No fixture is vendored without its
 * hash; the hashes are recomputed and compared at test time.
 *
 * Re-pinned from 8d09e7ed36dcb2a67df2b45daa81c8ad7d170694 under
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

export const DOCTRINE_PIN = '846190fdb4da0604672bef8d7b1c8852407c4934';

export const FIXTURES: readonly FixtureEntry[] = [
  {
    source_path: '04-agents/role-registry.md',
    filename: 'role-registry.md',
    sha256: 'b3f8a658bb3657a7df680ab906ea8b7a4c9ded8e2b763781354a44140d2844b4',
  },
  {
    source_path: '04-agents/model-registry.md',
    filename: 'model-registry.md',
    sha256: '8c866be4c35e3bce78b69cd6e51c8ae0d4b54859bc44b93a40fa343d047c1062',
  },
  {
    source_path: '04-agents/execution-surface-registry.md',
    filename: 'execution-surface-registry.md',
    sha256: '060a16a40abb58794cf960d33010bee006e06d4f699f32f61704d1ecd88e2055',
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
    sha256: '13aa576138c096c45711f1b39ec19b8cae7cf30672d15174aee33a8a4c242ac0',
  },
  {
    source_path: '07-decisions/DEC-20260720-02-architect-fallback-azure-access-channel.md',
    filename: 'DEC-20260720-02-architect-fallback-azure-access-channel.md',
    sha256: 'de67e9908cbab9cbca19fdde37a41832b9e64843dca1a71cfb1460703a9f61b4',
  },
  {
    source_path: '07-decisions/decision-log.md',
    filename: 'decision-log.md',
    sha256: '4f358961646eeae3e7b8a657c8aad6228e1999a64cf06b58ec86f2c7c42ae242',
  },
] as const;

export function fixtureByFilename(filename: string): FixtureEntry | undefined {
  return FIXTURES.find((f) => f.filename === filename);
}

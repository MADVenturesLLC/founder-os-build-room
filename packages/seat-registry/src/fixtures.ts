/**
 * Seat Registry V1 — vendored doctrine fixtures (test 14).
 *
 * Each fixture is byte-captured from FounderOS at the doctrine pin
 * bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda and its SHA-256 recorded here and
 * asserted by the fixture-integrity test. No fixture is vendored without its
 * hash; the hashes are recomputed and compared at test time.
 *
 * The founder retained the r7 doctrine pin for this implementation: FounderOS
 * advancing to 8198ecf… does not re-pin these fixtures.
 */

export interface FixtureEntry {
  readonly source_path: string;
  readonly filename: string;
  readonly sha256: string;
}

export const DOCTRINE_PIN = 'bd0a9acbdcbcb7e01644feff0e86927bd7dd0dda';

export const FIXTURES: readonly FixtureEntry[] = [
  {
    source_path: '04-agents/role-registry.md',
    filename: 'role-registry.md',
    sha256: '100bb73f1364a92dad072587cb5f51eb6ccb77aea6a0033fc08abc83eb5b936b',
  },
  {
    source_path: '04-agents/model-registry.md',
    filename: 'model-registry.md',
    sha256: '7e45438a5c17f6765a6842df6e17bd0d1c0898576839ae1e66c6dd14de03fe0b',
  },
  {
    source_path: '04-agents/execution-surface-registry.md',
    filename: 'execution-surface-registry.md',
    sha256: '4054e58dd0f5e053436cfacfa09ed779a668a822cfe435f4a4038cd16417b060',
  },
  {
    source_path: '07-decisions/DEC-20260815-05-reviewer-eligibility-roster.md',
    filename: 'DEC-20260815-05-reviewer-eligibility-roster.md',
    sha256: '97f1ab0ab1f82a216e9b3adead5e35a5c9b2f8b0c9ed3b05767c3fdc66c2e4bc',
  },
  {
    source_path: '00-system/scripts/tier2-shape-check.sh',
    filename: 'tier2-shape-check.sh',
    sha256: 'bf46e5a20ab0af14615146ea978ed28b0559be73fc41014b2fd6ff777a98eb94',
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
    sha256: 'd582698066d47aad816e44e94b0b80ba9695c952cff10e8857493d491cb1b72f',
  },
  {
    source_path: '07-decisions/DEC-20260720-02-architect-fallback-azure-access-channel.md',
    filename: 'DEC-20260720-02-architect-fallback-azure-access-channel.md',
    sha256: 'de67e9908cbab9cbca19fdde37a41832b9e64843dca1a71cfb1460703a9f61b4',
  },
  {
    source_path: '07-decisions/decision-log.md',
    filename: 'decision-log.md',
    sha256: 'fdb2b4f37fca5eba7351dd30c867fa1875239d27df915c181d1c058d5000a706',
  },
] as const;

export function fixtureByFilename(filename: string): FixtureEntry | undefined {
  return FIXTURES.find((f) => f.filename === filename);
}

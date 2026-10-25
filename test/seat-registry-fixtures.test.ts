/**
 * Seat Registry V1 — Fixtures and Derived Data tests (C3).
 *
 * Implements tests 5, 8, 10, and 14 per r7 §9.1.
 *
 * Ratified plan: docs/planning/seat-registry-v1/seat-registry-v1-implementation-plan-r7-DRAFT.md
 * (sha256 b1bc4159b8cdb1ce6c342d84b4be3650a340abfc467624154ea5ba2a54815b60).
 * Governing decision: DEC-20260902-02 (active, source_of_truth: true, version 0.2).
 * Doctrine pin: FounderOS 846190fdb4da0604672bef8d7b1c8852407c4934.
 *
 * Requirements:
 * - imports only the public entry point (../packages/seat-registry/src/index.js)
 * - asserts against vendored fixtures under packages/seat-registry/fixtures/
 * - no production logic in test/
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  DOCTRINE_PIN,
  FIXTURES,
  RATIFIED_SEATS,
  deriveProviderClass,
  isSurfaceProviderLane,
  laneModelIds,
  type SeatRegistrationV1,
} from '../packages/seat-registry/src/index.js';

const fixturesDir = fileURLToPath(new URL('../../packages/seat-registry/fixtures/', import.meta.url));

function sha256OfFile(filePath: string): string {
  const bytes = readFileSync(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}

function fixtureContent(filename: string): string {
  return readFileSync(`${fixturesDir}${filename}`, 'utf8');
}

function fixtureLines(filename: string): string[] {
  return fixtureContent(filename).split('\n');
}

describe('Test 14 — Fixture integrity (doctrine pin) (r7 §9.1 test 14)', () => {
  it('recorded doctrine pin is the full 40-character 846190fdb4da0604672bef8d7b1c8852407c4934', () => {
    assert.equal(DOCTRINE_PIN, '846190fdb4da0604672bef8d7b1c8852407c4934');
    assert.match(DOCTRINE_PIN, /^[0-9a-f]{40}$/);
  });

  it('vendors exactly ten fixtures, and recomputed SHA-256 for all ten matches recorded pins', () => {
    assert.equal(FIXTURES.length, 10, 'package vendors exactly ten fixtures');

    for (const fixture of FIXTURES) {
      const fullPath = `${fixturesDir}${fixture.filename}`;
      assert.ok(existsSync(fullPath), `fixture file ${fixture.filename} exists`);
      const actualHash = sha256OfFile(fullPath);
      assert.equal(
        actualHash,
        fixture.sha256,
        `recomputed SHA-256 for fixture ${fixture.filename} must match recorded pin`,
      );
    }
  });
});

describe('Test 5 — Surface resolution (r7 §9.1 test 5)', () => {
  it('every non-null default_surface and every lane surface_id is registered and permits the role', () => {
    const surfaceRegistryText = fixtureContent('execution-surface-registry.md');

    // Parse §3.3 table: "Roles permitted to execute via each coding surface"
    // | surface_id | roles permitted |
    const lines = surfaceRegistryText.split('\n');
    const tableStart = lines.findIndex((l) => l.includes('Roles permitted to execute via each coding surface'));
    assert.ok(tableStart !== -1, 'found §3.3 table');

    const surfacePermittedRoles: Record<string, string[]> = {};
    for (let i = tableStart; i < lines.length && !lines[i]?.startsWith('## G3'); i++) {
      const line = lines[i]?.trim();
      if (line?.startsWith('| `') && line.includes('|')) {
        const parts = line.split('|').map((s) => s.trim());
        const surfaceId = parts[1]?.replace(/[`]/g, '');
        const roles = parts[2]?.split(',').map((r) => r.trim().replace(/[`]/g, '')) ?? [];
        if (surfaceId) {
          surfacePermittedRoles[surfaceId] = roles;
        }
      }
    }

    assert.ok(Object.keys(surfacePermittedRoles).length >= 6, 'parsed at least 6 surfaces from §3.3');

    for (const seat of RATIFIED_SEATS) {
      // In V1, default_surface must be null for all four seats (§2.6)
      assert.equal(
        seat.default_surface,
        null,
        `default_surface for ${seat.seat_id} must be null in V1 (no standing Eligible lane)`,
      );

      for (const lane of seat.routing) {
        assert.ok(
          surfacePermittedRoles[lane.surface_id],
          `lane surface ${lane.surface_id} must be in the registered coding surfaces`,
        );
        const permitted = surfacePermittedRoles[lane.surface_id];
        assert.ok(
          permitted?.includes(seat.seat_id),
          `surface ${lane.surface_id} must permit role ${seat.seat_id} per §3.3 table`,
        );
      }
    }
  });

  it('the identifier CONSUMED_SURFACES appears nowhere in the package', () => {
    // Read packages/seat-registry/src/ and fixtures/ to ensure CONSUMED_SURFACES was not reintroduced
    const srcDir = fileURLToPath(new URL('../../packages/seat-registry/src/', import.meta.url));
    const files = ['vocabulary.ts', 'schema.ts', 'registry-data.ts', 'resolve.ts', 'dispatch-policy.ts'];
    for (const f of files) {
      const content = readFileSync(`${srcDir}${f}`, 'utf8');
      assert.ok(
        !content.includes('CONSUMED_SURFACES'),
        `file ${f} must not contain retired identifier CONSUMED_SURFACES`,
      );
    }
  });
});

describe('Test 8 — Binding status is mirrored, never assigned (r7 §9.1 test 8)', () => {
  it('every lane binding_status is one of the 9 ladder values and equals portfolio_classification in fixture', () => {
    const modelRegistryText = fixtureContent('model-registry.md');

    // Parse model registry portfolio_classification values per model_id
    const modelClassifications: Record<string, string> = {};
    const lines = modelRegistryText.split('\n');
    let currentModel: string | null = null;

    for (const line of lines) {
      const modelMatch = /^model_id:\s*([-a-z0-9.]+)/.exec(line.trim());
      if (modelMatch && modelMatch[1]) {
        currentModel = modelMatch[1];
      }
      if (currentModel) {
        const classMatch = /^portfolio_classification:\s*([-a-z0-9]+)/.exec(line.trim());
        if (classMatch && classMatch[1]) {
          modelClassifications[currentModel] = classMatch[1];
        }
      }
    }

    const validLadderValues = new Set([
      'approved-binding',
      'proposed-binding',
      'implementation-observed',
      'temporary-task-assignment',
      'evaluation-candidate',
      'watchlist',
      'rejected',
      'unverified',
      'deprecated',
    ]);

    for (const seat of RATIFIED_SEATS) {
      for (const lane of seat.routing) {
        assert.ok(
          validLadderValues.has(lane.binding_status),
          `binding_status ${lane.binding_status} must be one of the 9 DEC-20260716-02 ladder values`,
        );

        // A surface:provider lane mirrors every model on its allowlist.
        for (const modelId of laneModelIds(lane)) {
          const fixtureClassification = modelClassifications[modelId];
          assert.ok(
            fixtureClassification !== undefined,
            `model ${modelId} must carry portfolio_classification in fixture`,
          );
          assert.equal(
            lane.binding_status,
            fixtureClassification,
            `lane for ${modelId} binding_status must equal portfolio_classification in model-registry.md`,
          );
        }
      }
    }
  });
});

describe('DEC-20261020-01 — lanes mirror the model registry Lanes table', () => {
  const ROLE_SEAT: Readonly<Record<string, string>> = { builder: 'builder', 'Tier-2': 'independent-reviewer' };

  /** The Lanes table at the pin: lane token, seat, and the allowlist as the registry stands. */
  function lanesTable(): { lane: string; seat: string; allowlist: string[] }[] {
    const lines = fixtureLines('model-registry.md');
    const start = lines.findIndex((l) => l.startsWith('## Lanes (`DEC-20261020-01`'));
    assert.ok(start !== -1, 'found the Lanes section in model-registry.md');
    const registered = new Set(
      lines.map((l) => /^model_id:\s*([-a-z0-9.]+)\s*$/.exec(l)?.[1]).filter((m): m is string => m !== undefined),
    );
    const rows: { lane: string; seat: string; allowlist: string[] }[] = [];
    for (let i = start + 1; i < lines.length && !lines[i]!.startsWith('## '); i++) {
      const cells = lines[i]!.split('|').map((c) => c.trim());
      const lane = /^`([a-z0-9-]+:[a-z0-9-]+)`$/.exec(cells[1] ?? '')?.[1];
      if (lane === undefined) continue;
      const seat = ROLE_SEAT[cells[2] ?? ''];
      assert.ok(seat !== undefined, `Lanes row ${lane} names a known role, got ${JSON.stringify(cells[2])}`);
      // "a; b on registration": the first part is listed; the rest join only
      // once their own entry is in the registry (clause 2 table note).
      const allowlist: string[] = [];
      for (const part of (cells[3] ?? '').split(';')) {
        const onRegistration = part.includes('on registration');
        for (const m of part.matchAll(/`([-a-z0-9.]+)`/g)) {
          if (!onRegistration || registered.has(m[1]!)) allowlist.push(m[1]!);
        }
      }
      rows.push({ lane, seat, allowlist });
    }
    return rows;
  }

  it('the builder and independent-reviewer routing sets are exactly the table, lane for lane and model for model', () => {
    const table = lanesTable();
    assert.equal(table.length, 6, 'the Lanes table carries six rows at the pin');
    for (const seatId of ['builder', 'independent-reviewer']) {
      const seat = RATIFIED_SEATS.find((s) => s.seat_id === seatId)!;
      const expected = table
        .filter((r) => r.seat === seatId)
        .map((r) => `${r.lane}=${[...r.allowlist].sort().join(',')}`)
        .sort();
      const actual = seat.routing
        .map((lane) => {
          assert.ok(isSurfaceProviderLane(lane), `${seatId} lane ${lane.lane_label} is a surface:provider lane (clause 1)`);
          assert.equal(lane.lane, `${lane.surface_id}:${lane.provider}`, `${seatId} lane token is surface:provider`);
          return `${lane.lane}=${[...lane.allowlist].sort().join(',')}`;
        })
        .sort();
      assert.deepEqual(actual, expected, `${seatId} routing mirrors the Lanes table`);
    }
  });

  it('a model marked on registration with no entry at the pin is on no allowlist', () => {
    const lines = fixtureLines('model-registry.md');
    assert.ok(!lines.some((l) => /^model_id:\s*claude-fable-5\.5\s*$/.test(l)), 'claude-fable-5.5 has no entry at the pin');
    for (const seat of RATIFIED_SEATS) {
      for (const lane of seat.routing) {
        assert.ok(!laneModelIds(lane).includes('claude-fable-5.5'), `${seat.seat_id} ${lane.lane_label} does not list claude-fable-5.5`);
      }
    }
  });

  it('every not-approved record cites clause 2 and no routing lane can serve it', () => {
    const builder = RATIFIED_SEATS.find((s) => s.seat_id === 'builder')!;
    const reviewer = RATIFIED_SEATS.find((s) => s.seat_id === 'independent-reviewer')!;
    assert.deepEqual(
      builder.not_approved_lanes.map((n) => `${n.record.surface_id}/${n.record.model_id}`),
      ['grok-build/grok-4.5', 'claude-code/sonnet-5', 'claude-code/opus-4.7', 'claude-code/claude-haiku-4-5', 'hermes-local-code/deepseek-v4-flash'],
    );
    assert.deepEqual(reviewer.not_approved_lanes.map((n) => `${n.record.surface_id}/${n.record.model_id}`), ['claude-code/sonnet-5']);
    for (const seat of RATIFIED_SEATS) {
      for (const { record, reason } of seat.not_approved_lanes) {
        assert.match(reason, /^DEC-20261020-01 clause 2: /, `${seat.seat_id} ${record.model_id} cites clause 2`);
        const servable = seat.routing.some(
          (lane) => lane.surface_id === record.surface_id && lane.provider === record.provider && laneModelIds(lane).includes(record.model_id),
        );
        assert.ok(!servable, `${seat.seat_id} ${record.surface_id}/${record.model_id} is not reachable through routing`);
      }
    }
  });

  it('the builder lanes equal the served-model check copy in scripts/served-model-lanes.json', () => {
    const copy = JSON.parse(readFileSync(fileURLToPath(new URL('../../scripts/served-model-lanes.json', import.meta.url)), 'utf8')) as {
      builder_lanes: Record<string, { lane: string; allowlist: string[] }>;
    };
    const builder = RATIFIED_SEATS.find((s) => s.seat_id === 'builder')!;
    assert.deepEqual(
      builder.routing.map((lane) => `${lane.surface_id}|${isSurfaceProviderLane(lane) ? lane.lane : ''}|${laneModelIds(lane).join(',')}`).sort(),
      Object.entries(copy.builder_lanes).map(([surface, l]) => `${surface}|${l.lane}|${l.allowlist.join(',')}`).sort(),
    );
  });
});

describe('Test 10 — Data eligibility, carried conditions, and provider-class precedence (r7 §9.1 test 10)', () => {
  it('no lane with NOT_RECORDED is eligible for internal; no P4 lane serves internal; P3 needs standing approval', () => {
    for (const seat of RATIFIED_SEATS) {
      for (const lane of seat.routing) {
        if (lane.provider_class === 'NOT_RECORDED') {
          assert.ok(
            !lane.data_eligibility.includes('internal'),
            `lane ${lane.lane_label} (${laneModelIds(lane).join(", ")}) with NOT_RECORDED provider_class must NOT be eligible for internal work`,
          );
        }
        if (lane.provider_class === 'P4') {
          assert.ok(
            !lane.data_eligibility.includes('internal'),
            `lane ${lane.lane_label} (${laneModelIds(lane).join(", ")}) with P4 provider_class must NOT be eligible for internal work`,
          );
        }
        if (lane.provider_class === 'P3') {
          // P3 requires applicable standing Founder approval recorded in conditions
          const hasStandingApproval = lane.conditions.some((c) =>
            c.toLowerCase().includes('standing') || c.toLowerCase().includes('approval'),
          );
          assert.ok(
            hasStandingApproval,
            `P3 lane ${lane.lane_label} must carry standing approval in conditions to serve internal work`,
          );
        }
      }
    }
  });

  it('carried conditions match fixture source windows byte-for-byte', () => {
    const dec04Lines = fixtureLines('DEC-20260815-04-provider-selection-ordering.md');
    const dec02Lines = fixtureLines('DEC-20260716-02-model-portfolio-and-routing-strategy.md');
    const dec07Lines = fixtureLines('DEC-20260807-01-g3-slice-b-plus-coding-execution-surface-governance.md');
    const dec05Lines = fixtureLines('DEC-20260815-05-reviewer-eligibility-roster.md');
    const surfLines = fixtureLines('execution-surface-registry.md');

    // (a) grok-build conditions: DEC-20260815-04 lines 59-67 and DEC-20260716-02 lines 152-160
    const grokBullet1 = dec04Lines.slice(58, 62).join('\n');
    const grokBullet2 = dec04Lines.slice(62, 67).join('\n');
    const grokItem = dec02Lines.slice(151, 160).join('\n');

    // Compare on the builder large lane's record, kept as bound in
    // not_approved_lanes (DEC-20261020-01 clause 2)
    const builder = RATIFIED_SEATS.find((s) => s.seat_id === 'builder') as SeatRegistrationV1;
    const builderLarge = builder.not_approved_lanes.find((n) => n.record.lane_label === 'large')!.record;
    assert.ok(builderLarge.conditions.includes(grokBullet1), 'builder large carries grokBullet1 byte-exact');
    assert.ok(builderLarge.conditions.includes(grokBullet2), 'builder large carries grokBullet2 byte-exact');
    assert.ok(builderLarge.conditions.includes(grokItem), 'builder large carries grokItem byte-exact');

    // Compare on the independent-reviewer grok-build:xai tier-2 lane
    const reviewer = RATIFIED_SEATS.find((s) => s.seat_id === 'independent-reviewer') as SeatRegistrationV1;
    const reviewerGrok = reviewer.routing.find((l) => l.surface_id === 'grok-build')!;
    assert.ok(reviewerGrok.conditions.includes(grokBullet1), 'reviewer grok carries grokBullet1 byte-exact');
    assert.ok(reviewerGrok.conditions.includes(grokBullet2), 'reviewer grok carries grokBullet2 byte-exact');

    // (b) hermes-local-code conditions: DEC-20260815-04 lines 76-80
    const hermesBullet1 = dec04Lines.slice(75, 77).join('\n');
    const hermesBullet2 = dec04Lines.slice(77, 80).join('\n');
    const builderHermes = builder.not_approved_lanes.find((n) => n.record.lane_label === 'Hermes local')!.record;
    assert.ok(builderHermes.conditions.includes(hermesBullet1), 'builder hermes carries bullet1 byte-exact');
    assert.ok(builderHermes.conditions.includes(hermesBullet2), 'builder hermes carries bullet2 byte-exact');

    // (c) antigravity conditions: locate the block by heading, then the exact
    // yaml lines, so the assertion survives a doctrine re-vendor.
    const antiStart = surfLines.findIndex((l) => l.trim() === '### `antigravity`');
    assert.ok(antiStart !== -1, 'found the antigravity block in execution-surface-registry.md');
    const antiBlock = surfLines.slice(antiStart, antiStart + 40);
    const antiModel = antiBlock.find((l) => l.startsWith('underlying_model_selection:'))!;
    const antiApproval = antiBlock.find((l) => l.startsWith('approval_requirements:'))!;
    const antiProhibited = antiBlock.find((l) => l.startsWith('prohibited_actions:'))!;
    assert.ok(antiModel && antiApproval && antiProhibited, 'found the three antigravity condition lines');
    const reviewerClause3 = dec05Lines.slice(68, 71).join('\n');

    const architect = RATIFIED_SEATS.find((s) => s.seat_id === 'architect') as SeatRegistrationV1;
    const archPrimary = architect.routing.find((l) => l.lane_label === 'primary')!;
    assert.ok(archPrimary.conditions.includes(antiModel), 'architect primary carries antiModel byte-exact');
    assert.ok(archPrimary.conditions.includes(antiApproval), 'architect primary carries antiApproval byte-exact');
    assert.ok(archPrimary.conditions.includes(antiProhibited), 'architect primary carries antiProhibited byte-exact');

    const reviewerGemini = reviewer.routing.find((l) => l.surface_id === 'antigravity' && l.provider === 'google')!;
    assert.ok(reviewerGemini.conditions.includes(antiModel), 'reviewer gemini carries antiModel byte-exact');
    assert.ok(reviewerGemini.conditions.includes(antiApproval), 'reviewer gemini carries antiApproval byte-exact');
    assert.ok(reviewerGemini.conditions.includes(antiProhibited), 'reviewer gemini carries antiProhibited byte-exact');
    assert.ok(reviewerGemini.conditions.includes(reviewerClause3), 'reviewer gemini carries clause 3 byte-exact');

    // antigravity:anthropic carries the surface's approval and prohibition
    // lines and clause 3, but not its model-selection line, which names
    // Gemini models only at the pin.
    assert.match(antiModel, /Gemini model ID/, 'the selection line still names Gemini only');
    const reviewerClaude = reviewer.routing.find((l) => l.surface_id === 'antigravity' && l.provider === 'anthropic')!;
    assert.ok(!reviewerClaude.conditions.includes(antiModel), 'reviewer antigravity:anthropic does not carry the Gemini selection line');
    assert.ok(reviewerClaude.conditions.includes(antiApproval), 'reviewer antigravity:anthropic carries antiApproval byte-exact');
    assert.ok(reviewerClaude.conditions.includes(antiProhibited), 'reviewer antigravity:anthropic carries antiProhibited byte-exact');
    assert.ok(reviewerClaude.conditions.includes(reviewerClause3), 'reviewer antigravity:anthropic carries clause 3 byte-exact');

    // (d) architect bounded reconciliation: DEC-20260807-01, located by its
    // first line so the assertion survives a doctrine re-vendor (Amendment 1
    // moved it from line 446 to 501).
    const reconcileStart = dec07Lines.findIndex((l) => l.startsWith('- After the binding Tier-2 verdict, an `opus-4.7` execution'));
    assert.ok(reconcileStart !== -1, 'found the reconciliation preconditions in DEC-20260807-01');
    const archReconcilePreconditions = dec07Lines.slice(reconcileStart, reconcileStart + 7).join('\n');
    const archBounded = architect.routing.find((l) => l.lane_label === 'bounded reconciliation')!;
    assert.ok(
      archBounded.conditions.includes(archReconcilePreconditions),
      'architect bounded reconciliation carries preconditions byte-exact',
    );

    // glm-5.2 condition compared on builder cursor-secondary absent_lanes entry
    const glm52Condition = dec02Lines.slice(140, 144).join('\n');
    const cursorSecondary = builder.absent_lanes.find((l) => l.label === 'cursor-secondary')!;
    assert.equal(
      cursorSecondary.reason,
      glm52Condition,
      'builder cursor-secondary absent_lanes carries glm52Condition byte-exact',
    );
  });

  it('provider-class precedence derivation matches §2.2 executable rules exactly', () => {
    // Step 1: explicit decision assignment
    assert.equal(
      deriveProviderClass('azure-ai-foundry'),
      'P2',
      'azure-ai-foundry yields P2 by DEC-20260720-02 precedence step 1',
    );

    // Step 3: exact token and authorized prefix forms
    assert.equal(deriveProviderClass('P1'), 'P1');
    assert.equal(deriveProviderClass('P1-anthropic-first-party'), 'P1');
    assert.equal(deriveProviderClass('P3-zai-international'), 'P3');
    assert.equal(deriveProviderClass('P5-founder-operated-local'), 'P5');

    // Step 4: NOT_RECORDED
    assert.equal(deriveProviderClass('unverified'), 'NOT_RECORDED');
    assert.equal(deriveProviderClass('verification-pending'), 'NOT_RECORDED');
    assert.equal(deriveProviderClass('codex-founder-operated'), 'NOT_RECORDED');
    assert.equal(deriveProviderClass('antigravity-primary; google-ai-studio-api-fallback'), 'NOT_RECORDED');

    // Negative: random string or unruled channel yields NOT_RECORDED
    assert.equal(deriveProviderClass('unknown-channel'), 'NOT_RECORDED');
  });
});

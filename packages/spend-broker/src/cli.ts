/**
 * Local proof CLI for the spend broker — fixture-only, zero network, zero
 * credentials.
 *
 * Commissioned surface: `spend-broker status|mint|deny-demo`. The repository
 * has no `mad` binary to extend, so the entrypoint is this module; the
 * commissioned verb surface is preserved one-to-one. Invocation after build:
 *
 *   node dist/packages/spend-broker/src/cli.js status
 *   node dist/packages/spend-broker/src/cli.js mint --run-id r1 --tokens 300
 *   node dist/packages/spend-broker/src/cli.js deny-demo
 *
 * Two extra demo verbs exercise refusal and ruling paths: `gateway-fail`,
 * `gateway-not-authorized`, and `oauth-unlimited` (the 2026-09-13 Founder
 * ruling — an api mint denied over a breached ceiling beside an oauth mint
 * succeeding, unlimited, in the same room).
 *
 * Commands are dispatched through the table below. Every command prints one
 * JSON document and exits 0 when it RAN; a denied mint is a successful
 * demonstration of the product, not a CLI failure — the verdict is in the
 * JSON. Exit 2 is reserved for usage errors (unknown command, missing flags).
 *
 * The demo room is bound at 1,000 tokens with 600 already spent, so there is
 * a real, small budget to breach in the demo. The demo ledger is empty, so
 * the monthly dollar limb permits and the per-room token limb is the
 * operative one.
 */

import { pathToFileURL } from 'node:url';

import { SpendBroker } from './broker.js';
import { claimReport } from './claims.js';
import { MeterCeilingPort } from './cost-meter-adapter.js';
import { FailGatewayPort, FixtureGatewayPort, NotAuthorizedGatewayPort, RecordingInterruptSink } from './fixtures.js';
import { ReservationLedger } from './reservations.js';
import { accountingInstant, type PriceTable, type RoomBudget } from '../../cost-meter/src/index.js';
import type { MintResult } from './types.js';

const DEMO_ROOM = 'demo-room';
const DEMO_TOKEN_CEILING = 1_000;
const DEMO_TOKENS_SPENT = 600;
const DEMO_PER_RUN_CAP = 1_000;
const DEMO_PRICE_VERSION = '2026-08-17-provisional';

/**
 * Stub price table. Rates are fabricated for the demo and are not a rate
 * source — `DEC-20260722-01` clause 1 puts the canonical table elsewhere, and
 * this package carries none.
 */
const DEMO_PRICE_TABLE: PriceTable = {
  hasVersion: (version) => version === DEMO_PRICE_VERSION,
  rateFor: () => ({ inputMicrosPerMTok: 1_000_000, outputMicrosPerMTok: 2_000_000 }),
};

export interface DemoBindings {
  readonly broker: SpendBroker;
  readonly sink: RecordingInterruptSink;
  readonly room: RoomBudget;
}

/** The fixture broker the CLI demonstrates against. Rebuilt per invocation. */
export function buildDemoBroker(
  gatewayKind: 'fixture' | 'fail' | 'not-authorized',
  roomOverrides: Partial<RoomBudget> = {},
): DemoBindings {
  const sink = new RecordingInterruptSink();
  const ledger = new ReservationLedger();
  const gateway =
    gatewayKind === 'fail'
      ? new FailGatewayPort()
      : gatewayKind === 'not-authorized'
        ? new NotAuthorizedGatewayPort()
        : new FixtureGatewayPort();

  const room: RoomBudget = {
    roomId: DEMO_ROOM,
    tokenCeiling: DEMO_TOKEN_CEILING,
    tokensSpent: DEMO_TOKENS_SPENT,
    tokensReserved: 0,
    perRunTokenCap: DEMO_PER_RUN_CAP,
    ...roomOverrides,
  };
  const budgets = new Map<string, RoomBudget>([[room.roomId, room]]);

  const broker = new SpendBroker({
    gateway,
    meter: new MeterCeilingPort({
      snapshot: {
        asOf: accountingInstant(2026, 9, 13),
        ledger: { infrastructure: [], runs: [] },
        priceTable: DEMO_PRICE_TABLE,
        budgets,
      },
      reservedTokensForRoom: (roomId) => ledger.activeTokens(roomId, Date.now()),
    }),
    sink,
    // Injected so the meter adapter reads the same ledger the broker writes.
    reservations: ledger,
  });

  return { broker, sink, room };
}

export interface CliResult {
  readonly code: number;
  readonly report: unknown;
}

interface CommandSpec {
  readonly summary: string;
  readonly run: (flags: ReadonlyMap<string, string>) => Promise<CliResult>;
}

const USAGE_HINT =
  'usage: cli.js status | mint --run-id <id> [--room demo-room] [--provider demo-provider] ' +
  '[--tokens <n>] [--purpose <text>] [--kind api|oauth] | deny-demo | oauth-unlimited | ' +
  'gateway-fail | gateway-not-authorized';

function parseFlags(argv: readonly string[]): ReadonlyMap<string, string> {
  const flags = new Map<string, string>();
  let index = 0;
  while (index < argv.length) {
    const token = argv[index];
    if (token !== undefined && token.startsWith('--') && token.length > 2) {
      const value = argv[index + 1];
      flags.set(token.slice(2), value ?? '');
      index += 2;
    } else {
      index += 1;
    }
  }
  return flags;
}

function jsonOut(report: unknown): CliResult {
  return { code: 0, report };
}

function failUsage(message: string): CliResult {
  return { code: 2, report: { error: message, hint: USAGE_HINT } };
}

function requireFlag(flags: ReadonlyMap<string, string>, name: string): string | null {
  const value = flags.get(name);
  return value === undefined || value === '' ? null : value;
}

function parseTokens(flags: ReadonlyMap<string, string>): number | null {
  const raw = requireFlag(flags, 'tokens');
  if (raw === null) return 0;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

async function runStatus(): Promise<CliResult> {
  const { broker, room } = buildDemoBroker('fixture');
  const status = broker.status();
  return jsonOut({
    command: 'status',
    now: status.now,
    configuredRoom: room,
    activeReservations: status.activeReservations,
    claims: claimReport(),
  });
}

async function runMint(flags: ReadonlyMap<string, string>): Promise<CliResult> {
  const runId = requireFlag(flags, 'run-id');
  if (runId === null) return failUsage('mint requires --run-id');
  const tokens = parseTokens(flags);
  if (tokens === null) return failUsage('--tokens must be a non-negative safe integer');
  const kind = requireFlag(flags, 'kind') ?? 'api';
  if (kind !== 'api' && kind !== 'oauth') {
    return failUsage('--kind must be api or oauth');
  }

  const { broker } = buildDemoBroker('fixture');
  const result: MintResult = await broker.mint({
    runId,
    roomId: requireFlag(flags, 'room') ?? DEMO_ROOM,
    provider: requireFlag(flags, 'provider') ?? 'demo-provider',
    purpose: requireFlag(flags, 'purpose') ?? 'cli demo mint',
    ...(tokens === 0 ? {} : { estimatedCost: tokens }),
    credentialKind: kind,
  });
  return jsonOut({
    command: 'mint',
    result,
    activeReservations: broker.status().activeReservations,
    claims: claimReport(),
  });
}

async function runDenyDemo(): Promise<CliResult> {
  const { broker, sink } = buildDemoBroker('fixture');
  const runId = 'demo-run-1';

  // Step 1 — the turn starts with room to spare: 600 spent, 300 requested,
  // projected 900 of the 1,000-token ceiling. Mints cleanly.
  const minted = await broker.mint({
    runId,
    roomId: DEMO_ROOM,
    provider: 'demo-provider',
    purpose: 'deny-demo: turn start',
    estimatedCost: 300,
  });

  // Step 2 — mid-turn the estimate grows; a refresh replaces the prior
  // reservation and re-checks: 600 spent + 500 requested = 1,100, at or over
  // the 1,000 ceiling. Denied, and the interrupt frame is emitted.
  const refreshed = await broker.refresh({
    runId,
    roomId: DEMO_ROOM,
    provider: 'demo-provider',
    purpose: 'deny-demo: mid-turn refresh at a grown estimate',
    estimatedCost: 500,
  });

  return jsonOut({
    command: 'deny-demo',
    demoRoom: DEMO_ROOM,
    ceilingTokens: DEMO_TOKEN_CEILING,
    tokensSpentBefore: DEMO_TOKENS_SPENT,
    steps: {
      '1_mint_under_ceiling': minted,
      '2_refresh_breaching': refreshed,
    },
    interruptFrames: sink.frames,
    activeReservationsAfter: broker.status().activeReservations,
    claims: claimReport(),
  });
}

/**
 * The 2026-09-13 Founder ruling, demonstrated in one command: "Only API
 * ceiling is $85. OAuth should be unlimited." The demo room is bound at
 * 1,000 tokens with 5,000 already spent — already breached. The api mint is
 * denied with an interrupt frame; the oauth mint in the same room succeeds
 * with no budget figure and no reservation.
 */
async function runOauthUnlimited(): Promise<CliResult> {
  const { broker, sink, room } = buildDemoBroker('fixture', { tokensSpent: 5_000 });

  const apiAttempt = await broker.mint({
    runId: 'demo-api-over',
    roomId: DEMO_ROOM,
    provider: 'demo-provider',
    purpose: 'oauth-unlimited demo: api mint, ceiling-gated',
    estimatedCost: 100,
    credentialKind: 'api',
  });

  const oauthMint = await broker.mint({
    runId: 'demo-oauth-unlimited',
    roomId: DEMO_ROOM,
    provider: 'demo-provider',
    purpose: 'oauth-unlimited demo: oauth mint, not ceiling-gated',
    estimatedCost: 100,
    credentialKind: 'oauth',
  });

  return jsonOut({
    command: 'oauth-unlimited',
    ruling:
      'Founder, 2026-09-13: "Only API ceiling is $85. OAuth should be unlimited."',
    demoRoom: DEMO_ROOM,
    ceilingTokens: room.tokenCeiling,
    tokensSpentBefore: room.tokensSpent,
    steps: {
      api_over_ceiling: apiAttempt,
      oauth_unlimited: oauthMint,
    },
    interruptFrames: sink.frames,
    activeReservationsAfter: broker.status().activeReservations,
    claims: claimReport(),
  });
}

async function runGatewayRefusal(kind: 'fail' | 'not-authorized'): Promise<CliResult> {
  const { broker, sink } = buildDemoBroker(kind);
  const result = await broker.mint({
    runId: kind === 'fail' ? 'demo-run-unavailable' : 'demo-run-denied',
    roomId: DEMO_ROOM,
    provider: 'demo-provider',
    purpose: 'demo: gateway refusal must deny, never pass',
    estimatedCost: 100,
  });
  return jsonOut({
    command: kind === 'fail' ? 'gateway-fail' : 'gateway-not-authorized',
    result,
    interruptFrames: sink.frames,
    claims: claimReport(),
  });
}

const COMMANDS: Readonly<Record<string, CommandSpec>> = Object.freeze({
  status: {
    summary: 'show the demo broker bindings and active reservations',
    run: () => runStatus(),
  },
  mint: {
    summary: 'mint against the demo room (--run-id required)',
    run: runMint,
  },
  'deny-demo': {
    summary: 'two-step demo: mint under ceiling, refresh past it',
    run: () => runDenyDemo(),
  },
  'oauth-unlimited': {
    summary: 'demo the 2026-09-13 ruling: api denied over ceiling, oauth unlimited',
    run: () => runOauthUnlimited(),
  },
  'gateway-fail': {
    summary: 'demo a gateway-unavailable denial',
    run: () => runGatewayRefusal('fail'),
  },
  'gateway-not-authorized': {
    summary: 'demo a gateway authorization refusal',
    run: () => runGatewayRefusal('not-authorized'),
  },
});

/** Entry point. Returns the report instead of writing, so tests can assert. */
export async function runCli(argv: readonly string[]): Promise<CliResult> {
  const [command, ...rest] = argv;
  if (command === undefined || command.startsWith('--')) {
    return failUsage('no command given');
  }
  const spec = COMMANDS[command];
  if (spec === undefined) {
    return failUsage(`unknown command: ${command}`);
  }
  return spec.run(parseFlags(rest));
}

async function main(): Promise<number> {
  const result = await runCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  return result.code;
}

// Direct execution: `node dist/packages/spend-broker/src/cli.js …`
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`cli failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}

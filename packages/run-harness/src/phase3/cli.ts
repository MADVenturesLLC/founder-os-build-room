#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { arch, hostname, platform } from 'node:os';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  ControlPlaneClient as GatewayControlPlaneClient,
  Custody,
  GatewayStateStore,
  SecurityCommandRunner,
  gatewayPaths,
} from '../../../gateway-daemon/src/index.js';
import { runDoctor } from '../../../gateway-cli/src/doctor.js';
import type { HarnessStreams, HmacKeyCustody } from '../../../redaction/src/index.js';
import {
  REDACTION_REFUSED_EXIT,
  isRedactionRefusal,
  processHarnessStreams,
  redactedHarnessStreams,
  redactionRefusalLine,
} from '../redaction-boundary.js';
import { Phase3AbortError, Phase3ControlPlaneClient } from './client.js';
import {
  loadPhase3CliConfig,
  type Phase3CliConfig,
  type Phase3CliConfigOptions,
} from './cli-config.js';
import {
  PHASE3_LOCAL_FAILURE_AUTHORIZES,
  disposePhase3EvidenceReservation,
  reservePhase3EvidenceFile,
} from './evidence.js';
import { writeRedactedPhase3Evidence } from './redacted-evidence.js';
import {
  DeterministicFixtureAdapter,
  loadFixtureDefinition,
  type FixtureDefinition,
  type FixtureLifecycleEvent,
} from './fixture-adapter.js';
import { verifyFixtureRepository, type VerifiedFixtureRepository } from './repository.js';
import type { Phase3AttemptPlan } from './model.js';
import {
  Phase3PreflightError,
  phase3LocalUnresolvedEvidence,
  performPhase3Attempt,
  type Phase3FixturePort,
} from './runner.js';

/** The collaborators the counted run talks to. Constructed only once the boundary is ready. */
export interface Phase3Clients {
  readonly paths: ReturnType<typeof gatewayPaths>;
  readonly gatewayClient: GatewayControlPlaneClient;
  readonly runClient: Phase3ControlPlaneClient;
  readonly custody: Custody;
  readonly state: GatewayStateStore;
}

export function defaultPhase3Clients(config: Phase3CliConfig): Phase3Clients {
  const paths = gatewayPaths();
  return {
    paths,
    gatewayClient: new GatewayControlPlaneClient(config.controlPlaneUrl),
    runClient: new Phase3ControlPlaneClient(config.controlPlaneUrl, config.controlPlaneToken),
    custody: new Custody(new SecurityCommandRunner()),
    state: new GatewayStateStore(paths),
  };
}

/** Test seams (Lane B wiring). The entrypoint passes none of them. */
export interface Phase3MainOptions {
  readonly keyCustody?: HmacKeyCustody;
  readonly streams?: HarnessStreams;
  readonly reserveEvidenceFile?: typeof reservePhase3EvidenceFile;
  readonly clients?: (config: Phase3CliConfig) => Phase3Clients;
  readonly buildRoomPath?: string;
}

export async function main(
  environment: NodeJS.ProcessEnv = process.env,
  options: Phase3MainOptions = {},
): Promise<number> {
  const streams = options.streams ?? processHarnessStreams();
  // Required configuration and the strict nonsecret plan are read before any
  // Keychain, daemon, HTTP, or database collaborator is constructed. The
  // secret boundary opens inside the loader, before the plan is read and
  // before the evidence file is reserved; a refusal ends the run here.
  let config: Phase3CliConfig;
  try {
    const loaderOptions: Phase3CliConfigOptions = {
      ...(options.keyCustody === undefined ? {} : { keyCustody: options.keyCustody }),
      ...(options.reserveEvidenceFile === undefined
        ? {}
        : { reserveEvidenceFile: options.reserveEvidenceFile }),
    };
    config = await loadPhase3CliConfig(
      environment,
      options.buildRoomPath ?? process.cwd(),
      loaderOptions,
    );
  } catch (error) {
    if (isRedactionRefusal(error)) {
      streams.err(redactionRefusalLine(error.code));
      return REDACTION_REFUSED_EXIT;
    }
    throw error;
  }
  try {
    return await runConfiguredPhase3(config, streams, options.clients ?? defaultPhase3Clients);
  } finally {
    await disposePhase3EvidenceReservation(config.evidenceReservation);
  }
}

async function runConfiguredPhase3(
  config: Phase3CliConfig,
  streams: HarnessStreams,
  clients: (config: Phase3CliConfig) => Phase3Clients,
): Promise<number> {
  const plan = config.plan;
  const out = redactedHarnessStreams(config.redaction, streams);
  const { paths, gatewayClient, runClient, custody, state } = clients(config);

  let verifiedFixture: VerifiedFixtureRepository | null = null;
  let verifiedDefinition: FixtureDefinition | null = null;
  let verifiedControlPlane: { readonly commit: string | null; readonly environment: string | null } | null = null;
  const observeEntry = async () => {
    if (verifiedControlPlane === null) throw new Error('control_plane_identity_not_verified');
    const repositories = await verifyPhase3EntryRepositories(plan);
    const doctor = await preflight('gateway_health_failed', () =>
      runDoctor({ paths, custody, client: gatewayClient, state }),
    );
    const enrollments = await preflight('enrollment_projection_failed', () =>
      runClient.enrollments(),
    );
    const machine = await preflight('context_invalid', localMachineIdentity);
    verifiedDefinition = await preflight('fixture_unavailable', () =>
      loadFixtureDefinition(repositories.fixture),
    );
    verifiedFixture = repositories.fixture;
    return {
      status: 'complete' as const,
      observedAt: new Date().toISOString(),
      founderOs: {
        repository: repositories.founderOs.repository,
        sha: repositories.founderOs.commitSha,
        treeSha: repositories.founderOs.treeSha,
        clean: repositories.founderOs.clean,
      },
      buildRoom: {
        repository: repositories.buildRoom.repository,
        sha: repositories.buildRoom.commitSha,
        treeSha: repositories.buildRoom.treeSha,
        clean: repositories.buildRoom.clean,
        buildPassed: config.buildVerifiedSha === repositories.buildRoom.commitSha,
      },
      controlPlane: {
        commit: verifiedControlPlane.commit ?? 'unknown',
        environment: verifiedControlPlane.environment ?? 'unknown',
        status: doctor.controlPlane.status,
      },
      machineIdentity: machine,
      nodeMajor: Number(process.versions.node.split('.')[0]),
      fixture: {
        repository: plan.fixture.repository,
        sha: repositories.fixture.commitSha,
        treeSha: repositories.fixture.treeSha,
        clean: repositories.fixture.clean,
      },
      enrollments,
      doctor: {
        daemonReachable: doctor.daemon.reachable,
        primaryLane: doctor.lanes.primary,
        stagingLane: doctor.lanes.staging,
        primaryCustody: doctor.custody.primary,
        stagingCustody: doctor.custody.staging,
        custodyError: doctor.custody.error !== null,
        stagingLockPresent: doctor.stagingLock.present,
      },
    };
  };

  let fixturePort: BoundFixturePort | null = null;
  const fixture = new LazyFixturePort(async () => {
    const repository =
      verifiedFixture ??
      (await verifyFixtureRepository({
        path: plan.fixture.path,
        expectedSha: plan.fixture.sha,
        expectedRepository: plan.fixture.repository,
      }));
    const definition = verifiedDefinition ?? (await loadFixtureDefinition(repository));
    fixturePort = new BoundFixturePort(
      new DeterministicFixtureAdapter(definition),
      repository,
      plan.runAttemptId,
    );
    return fixturePort;
  });

  try {
    // Tokenless identity first. No bearer credential is sent until the public
    // build and environment match the Founder-bound plan exactly.
    const version = await runClient.version();
    if (version.commit !== plan.buildRoomSha || version.environment !== plan.environment) {
      throw new Error('control_plane_identity_mismatch');
    }
    verifiedControlPlane = version;

    const result = await withPhase3TerminationSignals((signal) =>
      performPhase3Attempt(plan, {
        observeEntry,
        eventPort: runClient,
        fixture,
        fixtureStillBound: async () => {
          try {
            const after = await verifyFixtureRepository({
              path: plan.fixture.path,
              expectedSha: plan.fixture.sha,
              expectedRepository: plan.fixture.repository,
            });
            return verifiedFixture !== null && after.treeSha === verifiedFixture.treeSha;
          } catch {
            return false;
          }
        },
        newId: phase3NewId,
        now: () => new Date().toISOString(),
        signal,
      }),
    );
    const path = await writeRedactedPhase3Evidence(
      config.redaction,
      config.evidenceReservation,
      result.evidence,
    );
    await out.log(`Phase 3 attempt: ${result.outcome}\nevidence written to ${path}\n`);
    return result.outcome === 'awaiting_adjudication' ? 2 : 1;
  } catch (error) {
    const unresolved = isCommitOutcomeUnresolved(error);
    const fallback = unresolved
      ? phase3LocalUnresolvedEvidence(plan)
      : {
          schema: 'build-room/phase3-local-failure@1',
          attempt: {
            runAttemptId: plan.runAttemptId,
            runLabel: plan.label,
            buildRoomSha: plan.buildRoomSha,
            fixtureSha: plan.fixture.sha,
            outcome: 'failed',
            reasonCode: 'internal_error',
          },
          authorizes: PHASE3_LOCAL_FAILURE_AUTHORIZES,
        };
    try {
      const path = await writeRedactedPhase3Evidence(
        config.redaction,
        config.evidenceReservation,
        fallback,
      );
      await out.err(
        `Phase 3 attempt ${unresolved ? 'unresolved' : 'failed'}; evidence written to ${path}\n`,
      );
    } catch {
      await out.err(
        `Phase 3 attempt ${unresolved ? 'unresolved' : 'failed'} and evidence could not be written\n`,
      );
    }
    await out.err(`${describe(error)}\n`);
    return 1;
  }
}

function isCommitOutcomeUnresolved(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code) === 'commit_outcome_unresolved'
  );
}

class LazyFixturePort implements Phase3FixturePort {
  private loaded: Promise<BoundFixturePort> | null = null;

  constructor(private readonly load: () => Promise<BoundFixturePort>) {}

  private port(): Promise<BoundFixturePort> {
    this.loaded ??= this.load();
    return this.loaded;
  }

  async connect() {
    return (await this.port()).connect();
  }

  async register(sessionId: string) {
    return (await this.port()).register(sessionId);
  }

  async request(adapterId: string, requestId: string) {
    return (await this.port()).request(adapterId, requestId);
  }

  async disconnect(sessionId: string) {
    return (await this.port()).disconnect(sessionId);
  }
}

class BoundFixturePort implements Phase3FixturePort {
  private connection: { readonly sessionId: string } | null = null;
  private registration: { readonly adapterId: string } | null = null;

  constructor(
    private readonly adapter: DeterministicFixtureAdapter,
    private readonly repository: VerifiedFixtureRepository,
    private readonly runAttemptId: string,
  ) {}

  async connect() {
    this.connection = await this.adapter.connect(this.repository, this.runAttemptId);
    return { ...this.connection, artifactSha256: this.event('connect').artifactSha256 };
  }

  async register(sessionId: string) {
    this.registration = await this.adapter.register({ sessionId });
    return { ...this.registration, artifactSha256: this.event('adapter_registered').artifactSha256 };
  }

  async request(adapterId: string, requestId: string) {
    const result = await this.adapter.request({ adapterId }, requestId);
    return {
      exchangeId: result.requestId,
      requestSha256: result.requestDigest,
      responseSha256: result.responseDigest,
      matched: result.matched,
    };
  }

  async disconnect(sessionId: string) {
    await this.adapter.disconnect({ sessionId });
    return { artifactSha256: this.event('disconnect').artifactSha256 };
  }

  private event(stage: FixtureLifecycleEvent['stage']): FixtureLifecycleEvent {
    const event = this.adapter.events.findLast((candidate) => candidate.stage === stage);
    if (event === undefined) throw new Error(`fixture stage ${stage} produced no evidence`);
    return event;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function localMachineIdentity(): Promise<string> {
  if (platform() !== 'darwin') throw new Error('phase3_counted_run_requires_macos');
  const { stdout } = await promisify(execFile)('/usr/bin/sw_vers', ['-productVersion'], {
    maxBuffer: 1024,
  });
  const version = stdout.trim();
  if (!/^\d+(?:\.\d+){1,2}$/.test(version)) throw new Error('macos_version_unavailable');
  return formatMachineIdentity(hostname(), version, arch());
}

export function formatMachineIdentity(host: string, version: string, architecture: string): string {
  return `${host}+macOS:${version}+${architecture}`;
}

export function phase3NewId(): string {
  return randomUUID();
}

export async function withPhase3TerminationSignals<T>(
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const interrupt = (): void => {
    if (!controller.signal.aborted) controller.abort(new Phase3AbortError());
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    return await work(controller.signal);
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

export async function verifyPhase3EntryRepositories(
  plan: Phase3AttemptPlan,
  buildRoomPath = process.cwd(),
): Promise<{
  readonly founderOs: VerifiedFixtureRepository;
  readonly buildRoom: VerifiedFixtureRepository;
  readonly fixture: VerifiedFixtureRepository;
}> {
  const founderOs = await repositoryPreflight(
    'founderOs',
    plan.founderOs.path,
    plan.founderOsSha,
    plan.founderOs.repository,
  );
  const buildRoom = await repositoryPreflight(
    'build',
    buildRoomPath,
    plan.buildRoomSha,
    'MADVenturesLLC/founder-os-build-room',
  );
  const fixture = await repositoryPreflight(
    'fixture',
    plan.fixture.path,
    plan.fixture.sha,
    plan.fixture.repository,
  );
  return { founderOs, buildRoom, fixture };
}

async function preflight<T>(
  reasonCode: ConstructorParameters<typeof Phase3PreflightError>[0],
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch {
    throw new Phase3PreflightError(reasonCode);
  }
}

async function repositoryPreflight(
  kind: 'founderOs' | 'build' | 'fixture',
  path: string,
  expectedSha: string,
  expectedRepository: string,
): Promise<VerifiedFixtureRepository> {
  try {
    return await verifyFixtureRepository({ path, expectedSha, expectedRepository });
  } catch (error) {
    const message = describe(error);
    if (kind === 'founderOs') throw new Phase3PreflightError('founder_os_invalid');
    if (kind === 'build') {
      throw new Phase3PreflightError(
        message === 'fixture_sha_mismatch' ? 'build_sha_mismatch' : 'build_failed',
      );
    }
    throw new Phase3PreflightError(
      message === 'fixture_sha_mismatch' ? 'fixture_sha_mismatch' : 'fixture_unavailable',
    );
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${describe(error)}\n`);
      process.exitCode = 1;
    },
  );
}

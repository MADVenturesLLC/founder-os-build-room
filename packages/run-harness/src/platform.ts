/**
 * Deploy and restart, as a port.
 *
 * The Phase 2 run definition needs the control plane deployed and then
 * restarted. Both are platform acts, and this session's Railway access is
 * through tooling the harness process cannot call, so the port has two
 * implementations and **each records honestly who performed the act**:
 *
 * - `ExternalPlatform` — the deploy or restart is performed outside this
 *   process (an operator in the Railway dashboard, or an agent calling the
 *   Railway API). The harness does not claim to have done it. It waits for the
 *   service to prove a **new process** is serving, by watching `/version`'s
 *   `startedAt` change, and records the act as `performed_externally`.
 * - `CommandPlatform` — runs a configured shell command (a CLI, a script).
 *   Records the exact command and its exit status.
 *
 * Recording the actor matters more than it looks. Exit criterion 5 keeps this
 * evidence, and evidence that implies the harness restarted a service it only
 * watched restart is a false claim about what was verified.
 */

import { spawn } from 'node:child_process';

export type PlatformActor = 'harness' | 'performed_externally';

export interface PlatformAction {
  readonly action: 'deploy' | 'restart';
  readonly actor: PlatformActor;
  readonly requestedAt: string;
  readonly detail: string;
  readonly command?: string;
  readonly exitCode?: number;
}

export interface Platform {
  readonly kind: string;
  deploy(now: () => string): Promise<PlatformAction>;
  restart(now: () => string): Promise<PlatformAction>;
}

/**
 * The act happens outside this process. The harness only observes its effect.
 */
export class ExternalPlatform implements Platform {
  readonly kind = 'external';

  constructor(private readonly note: string = 'performed outside the harness process') {}

  async deploy(now: () => string): Promise<PlatformAction> {
    return {
      action: 'deploy',
      actor: 'performed_externally',
      requestedAt: now(),
      detail: `deploy ${this.note}; the harness verifies the result, it does not perform the act`,
    };
  }

  async restart(now: () => string): Promise<PlatformAction> {
    return {
      action: 'restart',
      actor: 'performed_externally',
      requestedAt: now(),
      detail: `restart ${this.note}; the harness confirms a new process by watching /version startedAt`,
    };
  }
}

export interface CommandPlatformConfig {
  readonly deployCommand?: string;
  readonly restartCommand: string;
  readonly timeoutMs?: number;
}

/** Runs a configured command. Used where a CLI or script can drive the platform. */
export class CommandPlatform implements Platform {
  readonly kind = 'command';

  constructor(private readonly config: CommandPlatformConfig) {}

  async deploy(now: () => string): Promise<PlatformAction> {
    const command = this.config.deployCommand;
    if (command === undefined) {
      return {
        action: 'deploy',
        actor: 'performed_externally',
        requestedAt: now(),
        detail: 'no deploy command configured; treating the running deployment as the one under test',
      };
    }
    return this.run('deploy', command, now);
  }

  restart(now: () => string): Promise<PlatformAction> {
    return this.run('restart', this.config.restartCommand, now);
  }

  private async run(
    action: 'deploy' | 'restart',
    command: string,
    now: () => string,
  ): Promise<PlatformAction> {
    const requestedAt = now();
    const exitCode = await execute(command, this.config.timeoutMs ?? 120_000);
    return {
      action,
      actor: 'harness',
      requestedAt,
      command,
      exitCode,
      detail: exitCode === 0 ? `command succeeded` : `command exited ${exitCode}`,
    };
  }
}

function execute(command: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true, stdio: 'inherit' });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code ?? -1);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(-1);
    });
  });
}

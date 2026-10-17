/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/adapter-claude-code/src/adapter.ts (lines 10-52) and
 *         packages/adapter-antigravity/src/adapter.ts (lines 10-50)
 * Blobs:  121bbd04e386c59c371cce06c37bb97eaf053757 and
 *         5d1cc5eafac0fed3cfb25c08ec7b12f1033169fd (both pinned, §5)
 * Changes from the source: only the AdapterV1 contract is consumed, not
 *   either adapter class. The two files' interface blocks are identical but
 *   for ExecutionIdentity.surface ("claude-code" in one, "antigravity" in
 *   the other); here it is the union of exactly those two, the registered
 *   set. The classes, their shells, attestation and config modules bind a
 *   provider and wait on the Founder's Q2 ruling (which adapter runs the
 *   Planner); DEC-20260827-01 §3.4 authorizes no provider binding.
 */

export interface ConfigChangeSet {
  readonly targetPath: string;
  readonly beforeSha256: string | null;
  readonly proposedSha256: string;
  readonly renderedDiff: string;
  readonly backupPath: string;
}

export interface LaunchInput {
  readonly sessionId: string;
  readonly executionId: string;
  readonly credentialPath: string;
  readonly repositoryPath: string;
  readonly exactModel: string;
  readonly provider: string;
  readonly effort: string;
}

export interface ManagedExecution {
  readonly executionId: string;
  readonly pid: number;
  readonly executablePath: string;
  readonly startedAt: string;
}

export interface ExecutionIdentity {
  readonly executionId: string;
  readonly role: string;
  readonly surface: "claude-code" | "antigravity";
  readonly model: string;
  readonly provider: string;
  readonly effort: string;
}

export interface AdapterV1 {
  attest(): Promise<ExecutionIdentity>;
  prepareConfigPreview(): Promise<ConfigChangeSet>;
  launch(input: LaunchInput): Promise<ManagedExecution>;
  notifyInbox(eventId: string): Promise<void>;
  pause(reason: string): Promise<void>;
  terminate(signal: "SIGTERM" | "SIGKILL"): Promise<void>;
}

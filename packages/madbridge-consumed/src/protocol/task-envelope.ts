/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/protocol/src/task-envelope.ts
 * Blob:   2daa99418e247c3648a5bc09e4edc3e83d6b894e (unpinned dependency, consumed under the Founder ruling of 2026-10-15)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/protocol/src/task-envelope.ts
// Task envelope V1 — the sole authority source for a session.

import { sha256CanonicalSync } from "./canonical-json.js";
import { normalizeIndependenceDomain } from "./normalization.js";
import { InvalidSurfaceIdError, parseSurfaceId, type SurfaceId } from "./surface-id.js";

export const PROTOCOL_VERSION = "madbridge-protocol/v1" as const;

export type CliSurface = "claude-code" | "antigravity";

export type ExecutionRole = "builder" | "independent-reviewer" | "observer";

export type DataClass = "public" | "internal" | "confidential" | "restricted";

export type CommandCategory = "read" | "write" | "build" | "test" | "git" | "shell" | "network";

export type ArtifactCategory = "code" | "diff" | "document" | "report" | "test-result";

export type Effort = "low" | "medium" | "high";

export const KNOWN_ROLES: readonly ExecutionRole[] = ["builder", "independent-reviewer", "observer"];
export const KNOWN_DATA_CLASSES: readonly DataClass[] = ["public", "internal", "confidential", "restricted"];
export const KNOWN_COMMAND_CATEGORIES: readonly CommandCategory[] = ["read", "write", "build", "test", "git", "shell", "network"];

export interface ExecutionIdentity {
  readonly execution_id: string;
  readonly role: ExecutionRole;
  readonly surface: SurfaceId;
  readonly model: string;        // exact model, not "auto"
  readonly provider: string;     // e.g. "anthropic", "google"
  readonly independence_domain: string;
  readonly effort: Effort;
}

export interface RepositoryFingerprint {
  readonly kind: "commit" | "working_tree";
  readonly sha256: string;
  readonly git_sha: string;
  readonly base_git_sha?: string; // only for working_tree
}

export interface TaskScope {
  readonly allowedReadPaths: readonly string[];
  readonly allowedWritePaths: readonly string[];
  readonly allowedCommandCategories: readonly CommandCategory[];
  readonly allowedArtifactCategories: readonly ArtifactCategory[];
  readonly maxArtifactSizeBytes: number;
  readonly dataClass: DataClass;
  readonly allowedEgressDestinations: readonly string[];
}

export interface TaskEnvelopeV1 {
  readonly protocol_version: typeof PROTOCOL_VERSION;
  readonly task_id: string;
  readonly authorization_reference: string;
  readonly repository: string;
  readonly branch: string;
  readonly worktree: string;
  readonly repository_fingerprint: RepositoryFingerprint;
  readonly executions: readonly ExecutionIdentity[];
  readonly initial_writer: string; // execution_id
  readonly scope: TaskScope;
  readonly expires_at: string; // ISO 8601
  readonly created_at: string;
  readonly envelope_hash: string;
}

const KNOWN_TOP_LEVEL_KEYS = new Set([
  "protocol_version", "task_id", "authorization_reference",
  "repository", "branch", "worktree", "repository_fingerprint",
  "executions", "initial_writer", "scope", "expires_at",
  "created_at", "envelope_hash",
]);

const SCOPE_KEYS = new Set([
  "allowedReadPaths", "allowedWritePaths", "allowedCommandCategories",
  "allowedArtifactCategories", "maxArtifactSizeBytes", "dataClass",
  "allowedEgressDestinations",
]);

export function parseTaskEnvelope(raw: Record<string, unknown>): TaskEnvelopeV1 {
  // Check for unknown top-level keys
  for (const key of Object.keys(raw)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      throw new Error(`unknown field: ${key}`);
    }
  }

  // envelope_hash must be present, lowercase 64-char hex
  const envelopeHash = raw["envelope_hash"];
  if (typeof envelopeHash !== "string" || !/^[0-9a-f]{64}$/.test(envelopeHash)) {
    throw new Error("missing or invalid envelope_hash");
  }

  // Hash verification: exclude envelope_hash and recompute
  const rawWithoutHash = { ...raw };
  delete rawWithoutHash["envelope_hash"];
  const computedHash = sha256CanonicalSync(rawWithoutHash);
  if (envelopeHash !== computedHash) {
    throw new Error("mismatched envelope_hash");
  }

  // Protocol version
  if (raw["protocol_version"] !== PROTOCOL_VERSION) {
    throw new Error(`unsupported protocol_version: ${String(raw["protocol_version"])}`);
  }

  // Authorization reference — must be present and non-empty
  const authRef = raw["authorization_reference"];
  if (typeof authRef !== "string" || authRef.length === 0) {
    throw new Error("missing authorization_reference");
  }

  // Expiration — must be present and future
  const expiresAt = raw["expires_at"];
  if (typeof expiresAt !== "string" || expiresAt.length === 0) {
    throw new Error("missing expiration");
  }
  const expiresAtTime = new Date(expiresAt).getTime();
  if (Number.isNaN(expiresAtTime)) {
    throw new Error("invalid expiration date");
  }
  if (expiresAtTime <= Date.now()) {
    throw new Error("expiration must be in the future");
  }

  // Repository/worktree — must not be ambiguous
  const repository = raw["repository"];
  const worktree = raw["worktree"];
  if (typeof repository !== "string" || repository.length === 0) {
    throw new Error("missing repository");
  }
  if (typeof worktree !== "string" || worktree.length === 0) {
    throw new Error("missing worktree");
  }
  if (repository === worktree) {
    throw new Error("ambiguous repository/worktree");
  }

  // Repository fingerprint
  const fingerprint = raw["repository_fingerprint"] as Record<string, unknown>;
  if (!fingerprint || typeof fingerprint !== "object") {
    throw new Error("missing repository_fingerprint");
  }
  if (fingerprint["kind"] !== "commit" && fingerprint["kind"] !== "working_tree") {
    throw new Error("invalid fingerprint kind");
  }
  if (typeof fingerprint["sha256"] !== "string" || !/^[0-9a-f]{64}$/.test(fingerprint["sha256"])) {
    throw new Error("invalid fingerprint sha256");
  }
  if (typeof fingerprint["git_sha"] !== "string" || !/^[0-9a-f]{40}$/.test(fingerprint["git_sha"])) {
    throw new Error("invalid fingerprint git_sha");
  }
  if (fingerprint["kind"] === "working_tree" && (typeof fingerprint["base_git_sha"] !== "string" || !/^[0-9a-f]{40}$/.test(fingerprint["base_git_sha"]))) {
    throw new Error("invalid fingerprint base_git_sha");
  }

  // Executions — validate each
  const executions = raw["executions"];
  if (!Array.isArray(executions) || executions.length === 0) {
    throw new Error("missing executions");
  }
  const seenExecutionIds = new Set<string>();
  for (const exec of executions) {
    if (typeof exec !== "object" || exec === null) {
      throw new Error("invalid execution entry");
    }
    const e = exec as Record<string, unknown>;
    const execId = e["execution_id"];
    if (typeof execId !== "string" || execId.length === 0) {
      throw new Error("invalid execution_id");
    }
    if (seenExecutionIds.has(execId)) {
      throw new Error("duplicate execution_id");
    }
    seenExecutionIds.add(execId);

    if (!KNOWN_ROLES.includes(e["role"] as ExecutionRole)) {
      throw new Error(`unknown role: ${String(e["role"])}`);
    }
    if (typeof e["surface"] !== "string") {
      throw new Error(`unknown surface: ${String(e["surface"])}`);
    }
    try {
      e["surface"] = parseSurfaceId(e["surface"]);
    } catch (err) {
      if (err instanceof InvalidSurfaceIdError) {
        throw new Error(`unknown surface: ${e["surface"]}`);
      }
      throw err;
    }
    if (typeof e["independence_domain"] !== "string" || e["independence_domain"].length === 0) {
      throw new Error("missing independence_domain");
    }
    const suppliedDomain = e["independence_domain"];
    const normalizedDomain = normalizeIndependenceDomain(suppliedDomain);
    if (normalizedDomain !== suppliedDomain) {
      throw new Error("noncanonical independence_domain");
    }
    if (typeof e["model"] !== "string" || e["model"] === "auto" || e["model"].length === 0) {
      throw new Error("automatic model selection is prohibited");
    }
    if (typeof e["provider"] !== "string" || e["provider"].length === 0) {
      throw new Error(`unknown provider: ${String(e["provider"])}`);
    }
  }

  // initial_writer
  const initialWriter = raw["initial_writer"];
  if (typeof initialWriter !== "string" || !seenExecutionIds.has(initialWriter)) {
    throw new Error("initial_writer not in executions");
  }

  // Scope — must have non-empty permitted paths and non-unrestricted commands
  const scope = raw["scope"];
  if (typeof scope !== "object" || scope === null) {
    throw new Error("missing scope");
  }
  const s = scope as Record<string, unknown>;
  for (const key of Object.keys(s)) {
    if (!SCOPE_KEYS.has(key)) {
      throw new Error(`unknown scope field: ${key}`);
    }
  }
  if (!Array.isArray(s["allowedWritePaths"]) || s["allowedWritePaths"].length === 0) {
    throw new Error("empty permitted paths");
  }
  if (!Array.isArray(s["allowedCommandCategories"]) || s["allowedCommandCategories"].length === 0) {
    throw new Error("unrestricted command patterns");
  }
  if (!KNOWN_DATA_CLASSES.includes(s["dataClass"] as DataClass)) {
    throw new Error(`unknown data class: ${String(s["dataClass"])}`);
  }

  return raw as unknown as TaskEnvelopeV1;
}
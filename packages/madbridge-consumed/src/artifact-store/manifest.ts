/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/artifact-store/src/manifest.ts
 * Blob:   9d8c1269d8a1e9ed51754739957c09d7437cbbb8 (pinned in DEC-20260827-01 §5)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/artifact-store/src/manifest.ts
// Manifest generation for evidence export.

import type { ArtifactMetadata } from "./store.js";

export interface ManifestEntry {
  sha256: string;
  size_bytes: number;
  type: string;
  task_id: string;
}

export interface FinalManifest {
  version: string;
  generated_at: string;
  artifact_count: number;
  artifacts: ManifestEntry[];
  ledger_head_hash: string;
  repo_fingerprint: string;
}

export function createManifest(
  artifacts: ArtifactMetadata[],
  ledgerHeadHash: string,
  repoFingerprint: string,
): FinalManifest {
  return {
    version: "madbridge-protocol/v1",
    generated_at: new Date().toISOString(),
    artifact_count: artifacts.length,
    artifacts: artifacts.map((a) => ({
      sha256: a.sha256,
      size_bytes: a.size_bytes,
      type: a.type,
      task_id: a.task_id,
    })),
    ledger_head_hash: ledgerHeadHash,
    repo_fingerprint: repoFingerprint,
  };
}
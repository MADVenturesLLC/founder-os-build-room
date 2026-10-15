/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/artifact-store/src/store.ts
 * Blob:   dac84ab9f82f5e7c1b2d88952ea03142705060a5 (pinned in DEC-20260827-01 §5)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/artifact-store/src/store.ts
// Content-addressed artifact store.
// Writes to temp file, hashes, atomically renames to sha256/<first-two>/<full-hash>.

import { writeFileSync, readFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { sha256Hex } from "../protocol/index.js";

export interface ArtifactMetadata {
  sha256: string;
  size_bytes: number;
  task_id: string;
  type: string;
  repo_fingerprint: string;
  created_at: string;
}

export interface PublishOptions {
  task_id: string;
  type: string;
  repo_fingerprint: string;
  declared_hash?: string;
}

const MAX_ARTIFACT_SIZE = 100 * 1024 * 1024; // 100MB

export class ArtifactStore {
  constructor(private baseDir: string) {
    mkdirSync(baseDir, { recursive: true, mode: 0o700 });
  }

  publish(data: Uint8Array, opts: PublishOptions): ArtifactMetadata {
    // Reject oversized artifacts
    if (data.length > MAX_ARTIFACT_SIZE) {
      throw new Error("artifact exceeds maximum size");
    }

    // Compute SHA-256 hash of content
    const hash = this.computeHash(data);

    // If declared hash is provided, verify it matches
    if (opts.declared_hash !== undefined && opts.declared_hash !== hash) {
      throw new Error("hash mismatch");
    }

    // Content-addressed path: sha256/<first-two>/<full-hash>
    const dir = join(this.baseDir, "sha256", hash.slice(0, 2));
    const path = join(dir, hash);

    // Deduplication: if already exists, return metadata
    if (existsSync(path)) {
      return {
        sha256: hash,
        size_bytes: data.length,
        task_id: opts.task_id,
        type: opts.type,
        repo_fingerprint: opts.repo_fingerprint,
        created_at: new Date().toISOString(),
      };
    }

    // Write to temp file in same directory, then atomically rename
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const tmpPath = path + ".tmp";
    writeFileSync(tmpPath, data);
    renameSync(tmpPath, path);

    return {
      sha256: hash,
      size_bytes: data.length,
      task_id: opts.task_id,
      type: opts.type,
      repo_fingerprint: opts.repo_fingerprint,
      created_at: new Date().toISOString(),
    };
  }

  inspect(hash: string): ArtifactMetadata | null {
    const dir = join(this.baseDir, "sha256", hash.slice(0, 2));
    const path = join(dir, hash);

    if (!existsSync(path)) return null;

    const data = readFileSync(path);
    return {
      sha256: hash,
      size_bytes: data.length,
      task_id: "", // metadata not persisted in V1 — would need a sidecar
      type: "",
      repo_fingerprint: "",
      created_at: new Date(0).toISOString(),
    };
  }

  private computeHash(data: Uint8Array): string {
    return sha256Hex(data);
  }
}
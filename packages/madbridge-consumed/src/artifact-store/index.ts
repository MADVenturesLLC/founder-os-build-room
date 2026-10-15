/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/artifact-store/src/index.ts
 * Blob:   67c37313816705ea5d317cfddc2a259765d13d5d (pinned in DEC-20260827-01 §5)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
export { ArtifactStore } from "./store.js";
export type { ArtifactMetadata, PublishOptions } from "./store.js";
export { createManifest } from "./manifest.js";
export type { ManifestEntry, FinalManifest } from "./manifest.js";
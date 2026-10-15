/*
 * Consumed from MADVenturesLLC/madventures-tui at
 * 7d37a61dcaeaef77c55013c7620deb8445726788
 * (DEC-20260827-01 §4 frozen consumption; plan r1 Q1).
 * Source: packages/policy/src/path-policy.ts
 * Blob:   8284c5431789e3f3449b8f1c058c3d89706a24d5 (pinned in DEC-20260827-01 §5)
 * Changes from the source: import specifiers only (Build Room module paths).
 */
// packages/policy/src/path-policy.ts
// Path validation: containment, traversal rejection, symlink rejection, glob matching.
//
// Authorization is always resolved against the caller-supplied repository root
// (from the task envelope / repository context) — never process.cwd().
//
// Fail-closed ordering:
//   1. Textual containment — reject `..` components, absolute escapes, and
//      sibling-prefix escapes (e.g. /tmp/repo vs /tmp/repo-secrets) BEFORE
//      any filesystem access or authorization.
//   2. lstat component walk from the trusted root to the candidate — reject
//      any symlink in any unresolved component, including the final one.
//   3. realpath containment — after the symlink-free walk, realpath the
//      deepest existing prefix and re-check path.relative containment:
//      reject if the relative result is absolute or escapes the root.
//   4. Glob matching on the contained relative path (behavior preserved).

import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function assertWithinAllowedPath(
  requestedPath: string,
  allowedPaths: readonly string[],
  repoRoot: string,
): void {
  if (requestedPath.length === 0) throw new Error("path_denied");
  if (!isAbsolute(repoRoot)) throw new Error("path_denied");

  const rootAbs = resolve(repoRoot);

  // Reject `..` traversal components in the raw request before anything else.
  if (requestedPath.split(/[\\/]/).includes("..")) {
    throw new Error("path_denied");
  }

  const candidateAbs = isAbsolute(requestedPath)
    ? resolve(requestedPath)
    : resolve(rootAbs, requestedPath);

  // Textual containment against the trusted root. Catches absolute paths
  // outside the repo and sibling-prefix escapes (/tmp/repo-secrets) before
  // any filesystem access.
  const relativeToRoot = relative(rootAbs, candidateAbs);
  if (isAbsolute(relativeToRoot) || escapesRoot(relativeToRoot)) {
    throw new Error("path_denied");
  }

  // Filesystem checks: reject symlink components, then re-verify containment
  // after realpath. Both are vacuous when the path does not exist on disk
  // (a nonexistent path cannot contain a symlink).
  assertNoSymlinkComponents(rootAbs, candidateAbs);
  assertRealpathContainment(rootAbs, candidateAbs);

  // Glob matching on the contained relative path.
  for (const pattern of allowedPaths) {
    if (matchGlob(relativeToRoot, pattern)) return;
  }

  throw new Error("path_denied");
}

function escapesRoot(rel: string): boolean {
  return rel === ".." || rel.startsWith(`..${sep}`);
}

// Walk every component from the trusted root to the candidate with lstat.
// Any symlink — intermediate directory or final file — is rejected before
// resolution. ENOENT/ENOTDIR means the component (and everything below it)
// does not exist, so no symlink can hide there; the walk stops clean.
// Any other filesystem error fails closed.
function assertNoSymlinkComponents(rootAbs: string, candidateAbs: string): void {
  const components = relative(rootAbs, candidateAbs).split(sep).filter((c) => c.length > 0);
  let current = rootAbs;
  for (const component of components) {
    current = join(current, component);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return;
      throw new Error("path_denied");
    }
    if (stat.isSymbolicLink()) throw new Error("path_denied");
  }
}

// Defense in depth after the symlink-free walk: realpath the deepest
// existing prefix of the candidate and the root, then require the candidate
// to remain contained. Rejects if path.relative is absolute or escapes.
function assertRealpathContainment(rootAbs: string, candidateAbs: string): void {
  try {
    lstatSync(rootAbs);
  } catch {
    return; // root absent on disk: nothing exists below it to resolve
  }

  const components = relative(rootAbs, candidateAbs).split(sep).filter((c) => c.length > 0);
  let deepest = rootAbs;
  for (const component of components) {
    const next = join(deepest, component);
    try {
      lstatSync(next);
    } catch {
      break;
    }
    deepest = next;
  }

  let realRoot: string;
  let realDeepest: string;
  try {
    realRoot = realpathSync(rootAbs);
    realDeepest = realpathSync(deepest);
  } catch {
    throw new Error("path_denied");
  }

  const suffix = components.slice(relative(rootAbs, deepest).split(sep).filter((c) => c.length > 0).length);
  const realCandidate = suffix.length > 0 ? join(realDeepest, ...suffix) : realDeepest;
  const relCheck = relative(realRoot, realCandidate);
  if (isAbsolute(relCheck) || escapesRoot(relCheck)) {
    throw new Error("path_denied");
  }
}

function matchGlob(path: string, pattern: string): boolean {
  // Convert glob to regex.
  // Order: escape regex specials in literal text, THEN replace glob markers.
  // Use placeholders for glob tokens to avoid collision with escaping.

  // Step 1: Mark glob tokens with placeholders
  let marked = pattern
    .replace(/\*\*/g, "\x00GLOBSTAR\x00")
    .replace(/\*/g, "\x00STAR\x00")
    .replace(/\?/g, "\x00Q\x00");

  // Step 2: Escape regex special characters in the remaining literal text
  marked = marked.replace(/[.+^${}()|[\]\\]/g, "\\$&");

  // Step 3: Replace placeholders with regex patterns
  const regexStr = marked
    .replace(/\x00GLOBSTAR\x00/g, ".*")
    .replace(/\x00STAR\x00/g, "[^/]*")
    .replace(/\x00Q\x00/g, "[^/]");

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(path);
}

export function isPathAllowed(
  requestedPath: string,
  allowedPaths: readonly string[],
  repoRoot: string,
): boolean {
  try {
    assertWithinAllowedPath(requestedPath, allowedPaths, repoRoot);
    return true;
  } catch {
    return false;
  }
}

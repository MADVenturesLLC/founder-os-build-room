/**
 * Canonical scope paths — what G5's "scope paths canonical" checks.
 *
 * T5 approves a plan whose scope paths are canonical (`DEC-20260815-11`,
 * T5 row; the Phase 4 authorization's "plan_hash match and canonical scope
 * paths"). Neither names the form, so it is fixed here, as the strictest
 * one that leaves nothing for a later reader to interpret:
 *
 * - each path is repository-relative POSIX: no leading `/`, no backslash,
 *   no empty, `.` or `..` segment, no trailing `/`;
 * - no glob or control characters (`*`, `?`, `[`, `]`, `{`, `}`, NUL and
 *   other C0 controls, DEL), so a path means exactly the file or directory
 *   it names;
 * - at most `MAX_SCOPE_PATH_LENGTH` UTF-16 code units each, and at most
 *   `MAX_SCOPE_PATHS` paths;
 * - the list is non-empty and strictly ascending by UTF-16 code unit order,
 *   which forbids duplicates and gives one spelling per set.
 *
 * Nothing is rewritten. A list that is not already canonical is refused, so
 * the approved scope is exactly the bytes the Planner wrote and the Founder
 * saw, and the plan hash covers them as written.
 */

export const MAX_SCOPE_PATHS = 1000;
export const MAX_SCOPE_PATH_LENGTH = 1024;

const FORBIDDEN_CHARACTERS = /[\u0000-\u001f\u007f*?[\]{}\\]/u;

/** Why one path is not canonical, or `null` when it is. */
export function scopePathDefect(path: string): string | null {
  if (typeof path !== 'string' || path.length === 0) return 'empty path';
  if (path.length > MAX_SCOPE_PATH_LENGTH) return `longer than ${MAX_SCOPE_PATH_LENGTH}`;
  if (FORBIDDEN_CHARACTERS.test(path)) return 'contains a glob, backslash or control character';
  if (path.startsWith('/')) return 'absolute path';
  if (path.endsWith('/')) return 'trailing slash';
  for (const segment of path.split('/')) {
    if (segment === '') return 'empty segment';
    if (segment === '.' || segment === '..') return `"${segment}" segment`;
  }
  return null;
}

export type ScopePathsVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly index: number | null; readonly reason: string };

/** The whole-list check G5 relies on. */
export function checkScopePaths(paths: readonly string[]): ScopePathsVerdict {
  if (!Array.isArray(paths) || paths.length === 0) {
    return { ok: false, index: null, reason: 'no scope paths' };
  }
  if (paths.length > MAX_SCOPE_PATHS) {
    return { ok: false, index: null, reason: `more than ${MAX_SCOPE_PATHS} scope paths` };
  }
  for (let i = 0; i < paths.length; i += 1) {
    const path = paths[i] as string;
    const defect = scopePathDefect(path);
    if (defect !== null) return { ok: false, index: i, reason: defect };
    if (i > 0 && !((paths[i - 1] as string) < path)) {
      return { ok: false, index: i, reason: 'not strictly ascending (unsorted or duplicate)' };
    }
  }
  return { ok: true };
}

export function isCanonicalScopePaths(paths: readonly string[]): boolean {
  return checkScopePaths(paths).ok;
}

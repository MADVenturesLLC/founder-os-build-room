/**
 * Policy bundles — approval tiers mapped to pre-approved tool-class bundles
 * (OMP→MAD Evolve Pack v0, Lane D).
 *
 * A gate or tranche act pre-approves a BUNDLE of tool rules (`read` /
 * `write` / `exec` classes with per-tool patterns) and GRANTS it to a scope.
 * A call is judged against the bundles granted to its scope:
 *
 *   - any matching `deny` rule → blocked (deny wins);
 *   - no matching `allow` rule → blocked (default deny);
 *   - no bundle granted to the scope → blocked;
 *   - otherwise allowed, naming the bundle and rule that allowed it.
 *
 * `authorization_ref` on a bundle is a REFERENCE to the act that approved
 * it; this module never adjudicates it (the handoff.ts rule). Bundles are
 * validated at construction and refused whole on any defect — a malformed
 * bundle is a hole, not a permission.
 *
 * Evolved from the act's "approval tiers → policy bundles" instruction; the
 * tier vocabulary is the act's own words (`gate`, `tranche`).
 */

import { TOOL_CLASSES, isToolClass, type PreHook, type PreHookDecision, type ToolCall, type ToolClass } from './tool-call-hooks.js';

export type ApprovalTier = 'gate' | 'tranche';
export const APPROVAL_TIERS: readonly ApprovalTier[] = ['gate', 'tranche'] as const;

export interface ToolRule {
  readonly tool_class: ToolClass;
  /** Dotted pattern: exact segments, `*` for one segment, a trailing `**` for the rest. */
  readonly tool_pattern: string;
}

export interface PolicyBundle {
  readonly bundle_id: string;
  readonly tier: ApprovalTier;
  /** Reference to the gate/tranche act; never adjudicated here. */
  readonly authorization_ref: string;
  readonly allow: readonly ToolRule[];
  readonly deny: readonly ToolRule[];
}

/** A bundle granted to a scope by the act that approved it. */
export interface BundleGrant {
  readonly bundle_id: string;
  readonly scope: string;
}

export interface RuleMatch {
  readonly bundle_id: string;
  readonly tier: ApprovalTier;
  readonly rule: ToolRule;
}

export type PolicyEvaluation =
  | { readonly decision: 'allow'; readonly allowed_by: RuleMatch; readonly denied_by: readonly RuleMatch[] }
  | { readonly decision: 'deny'; readonly code: PolicyDenyCode; readonly denied_by: readonly RuleMatch[]; readonly reason: string };

export type PolicyDenyCode = 'policy_no_grant' | 'policy_denied' | 'policy_no_allow';

export class PolicyBundleError extends Error {
  override readonly name = 'PolicyBundleError';
}

const PATTERN = /^([a-z0-9_-]+|\*)(\.([a-z0-9_-]+|\*))*(\.\*\*)?$|^\*\*$/i;
const TOOL = /^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/i;

/** Segment-wise glob: `fs.*` matches `fs.read`, not `fs.read.raw`; `fs.**` matches both; `**` matches everything. */
export function matchTool(pattern: string, tool: string): boolean {
  if (!PATTERN.test(pattern) || !TOOL.test(tool)) return false;
  if (pattern === '**') return true;
  const p = pattern.split('.');
  const t = tool.split('.');
  for (let i = 0; i < p.length; i += 1) {
    const segment = p[i]!;
    if (segment === '**') return i === p.length - 1 && t.length >= i;
    if (i >= t.length) return false;
    if (segment !== '*' && segment.toLowerCase() !== t[i]!.toLowerCase()) return false;
  }
  return p.length === t.length;
}

function validateRule(rule: unknown, where: string): string[] {
  if (typeof rule !== 'object' || rule === null) return [`${where}: rule must be an object`];
  const r = rule as Record<string, unknown>;
  const defects: string[] = [];
  if (!isToolClass(r.tool_class)) defects.push(`${where}: tool_class must be one of ${TOOL_CLASSES.join(', ')}`);
  if (typeof r.tool_pattern !== 'string' || !PATTERN.test(r.tool_pattern)) defects.push(`${where}: tool_pattern is not a dotted pattern`);
  for (const key of Object.keys(r)) if (key !== 'tool_class' && key !== 'tool_pattern') defects.push(`${where}: unknown key ${key}`);
  return defects;
}

/** Every defect in a bundle set; empty means valid. */
export function validateBundles(bundles: readonly unknown[]): string[] {
  const defects: string[] = [];
  const ids = new Set<string>();
  bundles.forEach((bundle, index) => {
    const where = `bundle[${index}]`;
    if (typeof bundle !== 'object' || bundle === null) {
      defects.push(`${where}: must be an object`);
      return;
    }
    const b = bundle as Record<string, unknown>;
    if (typeof b.bundle_id !== 'string' || b.bundle_id === '') defects.push(`${where}: bundle_id required`);
    else if (ids.has(b.bundle_id)) defects.push(`${where}: duplicate bundle_id ${b.bundle_id}`);
    else ids.add(b.bundle_id);
    if (!(APPROVAL_TIERS as readonly unknown[]).includes(b.tier)) defects.push(`${where}: tier must be one of ${APPROVAL_TIERS.join(', ')}`);
    if (typeof b.authorization_ref !== 'string' || b.authorization_ref === '') defects.push(`${where}: authorization_ref required (reference only)`);
    for (const list of ['allow', 'deny'] as const) {
      if (!Array.isArray(b[list])) {
        defects.push(`${where}: ${list} must be an array`);
        continue;
      }
      (b[list] as unknown[]).forEach((rule, i) => defects.push(...validateRule(rule, `${where}.${list}[${i}]`)));
    }
    if (Array.isArray(b.allow) && Array.isArray(b.deny) && b.allow.length === 0 && b.deny.length === 0) {
      defects.push(`${where}: a bundle with no rules approves nothing and must not exist`);
    }
    for (const key of Object.keys(b)) {
      if (!['bundle_id', 'tier', 'authorization_ref', 'allow', 'deny'].includes(key)) defects.push(`${where}: unknown key ${key}`);
    }
  });
  return defects;
}

export class PolicyBundleSet {
  private readonly bundles: ReadonlyMap<string, PolicyBundle>;
  private readonly grants: ReadonlyMap<string, readonly string[]>;

  constructor(bundles: readonly PolicyBundle[], grants: readonly BundleGrant[]) {
    const defects = validateBundles(bundles);
    if (defects.length > 0) throw new PolicyBundleError(defects.join('; '));
    const byId = new Map(bundles.map((b) => [b.bundle_id, b] as const));
    const byScope = new Map<string, string[]>();
    for (const grant of grants) {
      if (typeof grant.scope !== 'string' || grant.scope === '') throw new PolicyBundleError('grant scope required');
      if (!byId.has(grant.bundle_id)) throw new PolicyBundleError(`grant names unknown bundle ${grant.bundle_id}`);
      const list = byScope.get(grant.scope) ?? [];
      if (!list.includes(grant.bundle_id)) list.push(grant.bundle_id);
      byScope.set(grant.scope, list);
    }
    this.bundles = byId;
    this.grants = byScope;
  }

  evaluate(call: ToolCall): PolicyEvaluation {
    const granted = (this.grants.get(call.scope) ?? []).map((id) => this.bundles.get(id)!);
    if (granted.length === 0) {
      return { decision: 'deny', code: 'policy_no_grant', denied_by: [], reason: `no policy bundle is granted to scope ${JSON.stringify(call.scope)}` };
    }
    const denied: RuleMatch[] = [];
    let allowed: RuleMatch | null = null;
    for (const bundle of granted) {
      for (const rule of bundle.deny) {
        if (rule.tool_class === call.tool_class && matchTool(rule.tool_pattern, call.tool)) denied.push({ bundle_id: bundle.bundle_id, tier: bundle.tier, rule });
      }
      if (allowed === null) {
        for (const rule of bundle.allow) {
          if (rule.tool_class === call.tool_class && matchTool(rule.tool_pattern, call.tool)) {
            allowed = { bundle_id: bundle.bundle_id, tier: bundle.tier, rule };
            break;
          }
        }
      }
    }
    if (denied.length > 0) {
      return { decision: 'deny', code: 'policy_denied', denied_by: denied, reason: `denied by ${denied.map((d) => `${d.bundle_id}:${d.rule.tool_class}:${d.rule.tool_pattern}`).join(', ')}` };
    }
    if (allowed === null) {
      return { decision: 'deny', code: 'policy_no_allow', denied_by: [], reason: `no granted bundle allows ${call.tool_class} ${call.tool} (default deny)` };
    }
    return { decision: 'allow', allowed_by: allowed, denied_by: [] };
  }
}

/** The pre-hook: a policy deny is a block; the dispatcher is never reached. */
export function policyBundleHook(set: PolicyBundleSet, name = 'policy-bundles'): PreHook {
  return {
    name,
    run(call: ToolCall): PreHookDecision {
      const evaluation = set.evaluate(call);
      if (evaluation.decision === 'deny') {
        return { decision: 'block', code: evaluation.code, reason: evaluation.reason };
      }
      return { decision: 'allow' };
    },
  };
}

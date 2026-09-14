/**
 * Advisor verdict vocabulary and the strict parser (OMP→MAD Evolve Pack v0,
 * Lane E, Founder act of 2026-09-13).
 *
 * The reviewer seat emits findings in a CLOSED severity enum:
 * `nit | concern | blocker`. Anything else — an unknown severity, an extra
 * key, a non-JSON string, an oversized payload, a duplicate id, a malformed
 * target — is QUARANTINED. A quarantined output is never read as "no
 * findings"; the scope it was about is blocked until a person lifts the
 * quarantine. Auto-PASS on unparseable advice is the failure mode this
 * module exists to make impossible.
 *
 * Evolved from the OMP mechanism named in the act (an independent reviewer
 * that classifies nit / concern / blocker); the strict parser, the size and
 * count bounds, the target grammar, and quarantine-as-a-state are this
 * repository's own.
 */

export type AdvisorSeverity = 'nit' | 'concern' | 'blocker';
export const ADVISOR_SEVERITIES: readonly AdvisorSeverity[] = ['nit', 'concern', 'blocker'] as const;

export function isAdvisorSeverity(value: unknown): value is AdvisorSeverity {
  return typeof value === 'string' && (ADVISOR_SEVERITIES as readonly string[]).includes(value);
}

/** What a finding is about. `scope` = every call in the scope; `tool` = a dotted pattern; `call` = one call id. */
export type FindingTarget =
  | { readonly kind: 'scope' }
  | { readonly kind: 'tool'; readonly tool_pattern: string }
  | { readonly kind: 'call'; readonly call_id: string };

export interface AdvisorFinding {
  readonly finding_id: string;
  readonly severity: AdvisorSeverity;
  readonly summary: string;
  readonly target: FindingTarget;
}

export interface AdvisorReview {
  readonly findings: readonly AdvisorFinding[];
}

export type ParsedAdvisorOutput =
  | { readonly kind: 'parsed'; readonly review: AdvisorReview }
  | { readonly kind: 'quarantined'; readonly reason: string };

export const MAX_ADVISOR_OUTPUT_BYTES = 64 * 1024;
export const MAX_FINDINGS_PER_REVIEW = 50;
export const MAX_SUMMARY_LENGTH = 500;
export const MAX_ID_LENGTH = 100;

const TOOL_PATTERN = /^([a-z0-9_-]+|\*)(\.([a-z0-9_-]+|\*))*(\.\*\*)?$|^\*\*$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function quarantined(reason: string): ParsedAdvisorOutput {
  return { kind: 'quarantined', reason };
}

function parseTarget(target: unknown, where: string): { ok: true; target: FindingTarget } | { ok: false; reason: string } {
  if (!isPlainObject(target)) return { ok: false, reason: `${where}: target must be an object` };
  const keys = Object.keys(target).sort();
  switch (target.kind) {
    case 'scope':
      return keys.length === 1 ? { ok: true, target: { kind: 'scope' } } : { ok: false, reason: `${where}: scope target carries extra keys` };
    case 'tool':
      if (keys.join(',') !== 'kind,tool_pattern') return { ok: false, reason: `${where}: tool target must be exactly { kind, tool_pattern }` };
      if (typeof target.tool_pattern !== 'string' || !TOOL_PATTERN.test(target.tool_pattern)) return { ok: false, reason: `${where}: tool_pattern is not a dotted pattern` };
      return { ok: true, target: { kind: 'tool', tool_pattern: target.tool_pattern } };
    case 'call':
      if (keys.join(',') !== 'call_id,kind') return { ok: false, reason: `${where}: call target must be exactly { kind, call_id }` };
      if (typeof target.call_id !== 'string' || target.call_id === '' || target.call_id.length > MAX_ID_LENGTH) return { ok: false, reason: `${where}: call_id invalid` };
      return { ok: true, target: { kind: 'call', call_id: target.call_id } };
    default:
      return { ok: false, reason: `${where}: target kind ${JSON.stringify(target.kind)} is not scope | tool | call` };
  }
}

/**
 * Strict parse of whatever the reviewer seat returned. Accepts a JSON string
 * or an already-parsed object; refuses everything that is not exactly the
 * `{ findings: AdvisorFinding[] }` shape. Never throws.
 */
export function parseAdvisorOutput(raw: unknown): ParsedAdvisorOutput {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw, 'utf8') > MAX_ADVISOR_OUTPUT_BYTES) return quarantined(`output exceeds ${MAX_ADVISOR_OUTPUT_BYTES} bytes`);
    try {
      value = JSON.parse(raw);
    } catch (error) {
      return quarantined(`output is not JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (raw !== null && typeof raw === 'object') {
    let serialized: string;
    try {
      serialized = JSON.stringify(raw) ?? '';
    } catch {
      return quarantined('output is not serializable');
    }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_ADVISOR_OUTPUT_BYTES) return quarantined(`output exceeds ${MAX_ADVISOR_OUTPUT_BYTES} bytes`);
  } else {
    return quarantined(`output is ${raw === null ? 'null' : typeof raw}, not an object or JSON string`);
  }

  if (!isPlainObject(value)) return quarantined('output is not an object');
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'findings') return quarantined(`output must be exactly { findings }, got keys ${JSON.stringify(keys)}`);
  if (!Array.isArray(value.findings)) return quarantined('findings must be an array');
  if (value.findings.length > MAX_FINDINGS_PER_REVIEW) return quarantined(`more than ${MAX_FINDINGS_PER_REVIEW} findings`);

  const findings: AdvisorFinding[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < value.findings.length; i += 1) {
    const where = `findings[${i}]`;
    const finding = value.findings[i];
    if (!isPlainObject(finding)) return quarantined(`${where}: not an object`);
    const fkeys = Object.keys(finding).sort().join(',');
    if (fkeys !== 'finding_id,severity,summary,target') return quarantined(`${where}: must be exactly { finding_id, severity, summary, target }, got ${fkeys}`);
    if (typeof finding.finding_id !== 'string' || !ID.test(finding.finding_id) || finding.finding_id.length > MAX_ID_LENGTH) return quarantined(`${where}: finding_id invalid`);
    if (ids.has(finding.finding_id)) return quarantined(`${where}: duplicate finding_id ${finding.finding_id}`);
    ids.add(finding.finding_id);
    if (!isAdvisorSeverity(finding.severity)) return quarantined(`${where}: severity ${JSON.stringify(finding.severity)} is not nit | concern | blocker`);
    if (typeof finding.summary !== 'string' || finding.summary.trim() === '' || finding.summary.length > MAX_SUMMARY_LENGTH) return quarantined(`${where}: summary must be 1..${MAX_SUMMARY_LENGTH} characters`);
    const target = parseTarget(finding.target, where);
    if (!target.ok) return quarantined(target.reason);
    findings.push({ finding_id: finding.finding_id, severity: finding.severity, summary: finding.summary, target: target.target });
  }
  return { kind: 'parsed', review: { findings } };
}

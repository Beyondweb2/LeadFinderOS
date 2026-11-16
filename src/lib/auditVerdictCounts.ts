/* ════════════════════════════════════════════════════════════════════════════════════════════════
   STORED VERDICT COUNTS PER AUDIT (Paul, 2026-11-16, leftovers item 1; docs/OPPORTUNITY_SCORE.md).

   When a Discovery on rules v3/v4 finishes, its split — Already named / Winnable / Not winnable / AI doesn't name
   businesses / Couldn't measure — is stored on the audit (ai_audits.verdict_counts) by the audit-watch job, so
   the team's Opportunity score can read it without reading answers in bulk (docs/rules/engineering.md).

   ⛔ NOT A NEW RULE: the counts are pooledSummary's split, i.e. the report's own buildReportModel + verdictSplitOf on the
   same stored rows. Only the Discovery (opportunity design) has verdicts; every other audit stores nothing.
   ⛔ "Audit incomplete" stores incomplete: true and NO split — the report shows no figures, so nothing reads one.

   Pure. Reached by an edge function: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { pooledSummary, type PooledInput } from './auditListSummary.ts';
import { auditRulesFor } from './auditVerdict.ts';

export const VERDICT_COUNTS_VERSION = 1 as const;

export interface StoredVerdictCounts {
  v: typeof VERDICT_COUNTS_VERSION;
  rules: 3 | 4;
  /** When the counts were worked out (ISO). Newer answers (a run re-scored later) make the job recount. */
  at: string;
  /** Rules v3 "Audit incomplete": too many answers could not be measured. No split is stored. */
  incomplete: boolean;
  named: number;
  winnable: number;
  notWinnable: number;
  noNames: number;
  unmeasured: number;
  /** Distinct searches asked. */
  searches: number;
}

/** The counts to store for a finished audit, or null when it has none (not a Discovery, or not rules v3/v4). */
export function verdictCountsOf(inp: PooledInput, nowIso: string): StoredVerdictCounts | null {
  if (String(inp.audit.audit_purpose ?? '').trim().toLowerCase() !== 'discovery') return null;
  const rules = auditRulesFor({ createdAt: inp.audit.created_at, runRules: inp.runMeta.map((r) => r.rules) });
  if (rules !== 3 && rules !== 4) return null;
  const s = pooledSummary(inp);
  const base = { v: VERDICT_COUNTS_VERSION, rules, at: nowIso, searches: s.searches } as const;
  if (s.incomplete) {
    return { ...base, incomplete: true, named: 0, winnable: 0, notWinnable: 0, noNames: 0, unmeasured: s.incomplete.unmeasured };
  }
  if (!s.split) return null;
  return {
    ...base, incomplete: false,
    named: s.split.named, winnable: s.split.winnable, notWinnable: s.split.notWinnable,
    noNames: s.split.noNames ?? 0, unmeasured: s.split.unmeasured ?? 0,
  };
}

const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null);

/** Reads a stored value back. Anything malformed or of another version = null (never guessed). */
export function parseVerdictCounts(raw: unknown): StoredVerdictCounts | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== VERDICT_COUNTS_VERSION || (r.rules !== 3 && r.rules !== 4) || typeof r.at !== 'string' || typeof r.incomplete !== 'boolean') return null;
  const named = n(r.named), winnable = n(r.winnable), notWinnable = n(r.notWinnable), noNames = n(r.noNames), unmeasured = n(r.unmeasured), searches = n(r.searches);
  if (named === null || winnable === null || notWinnable === null || noNames === null || unmeasured === null || searches === null) return null;
  return { v: VERDICT_COUNTS_VERSION, rules: r.rules, at: r.at, incomplete: r.incomplete, named, winnable, notWinnable, noNames, unmeasured, searches };
}

/** The Opportunity score's "winnable searches" input: winnable of all searches given a verdict. null = not usable
 *  (none stored, Audit incomplete, or nothing judged). "AI doesn't name businesses" counts as judged, never as winnable. */
export function oppWinnableOf(c: StoredVerdictCounts | null | undefined): { winnable: number; judged: number } | null {
  if (!c || c.incomplete) return null;
  const judged = c.named + c.winnable + c.notWinnable + c.noNames;
  return judged > 0 ? { winnable: c.winnable, judged } : null;
}

/** A lead's counts: those of its NEWEST Discovery that stores counts. If that one is "Audit incomplete", the lead has
 *  none (an older Discovery never stands in for a newer one that could not be measured). */
export function leadVerdictCounts<T extends { lead_id: string | null; created_at: string; audit_purpose?: string | null; verdict_counts?: unknown }>(audits: readonly T[]): Map<string, StoredVerdictCounts> {
  const newest = new Map<string, { at: number; c: StoredVerdictCounts }>();
  for (const a of audits) {
    if (!a.lead_id || String(a.audit_purpose ?? '').trim().toLowerCase() !== 'discovery') continue;
    const c = parseVerdictCounts(a.verdict_counts);
    if (!c) continue;
    const t = Date.parse(a.created_at) || 0;
    const prev = newest.get(a.lead_id);
    if (!prev || t > prev.at) newest.set(a.lead_id, { at: t, c });
  }
  const out = new Map<string, StoredVerdictCounts>();
  for (const [k, v] of newest) if (oppWinnableOf(v.c)) out.set(k, v.c);
  return out;
}

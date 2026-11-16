/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PAST AUDITS LIST: WHAT KIND IS THIS AUDIT, AND WHAT DID IT FIND? (Paul, 2026-11-15)

   Pure. Two jobs, both READ-ONLY and neither a new rule:

   1. auditTypeOf  — the badge. Read from the audit's recorded `audit_purpose` (src/lib/auditKind.ts), never from
      the run count. A purpose we do not recognise reads as "Quick check", the plain ordinary audit.
   2. pooledSummary — the pooled result of the WHOLE audit (all runs together), computed with the SAME functions
      the public report uses (buildReportModel for the redesigned reports, the classic named count otherwise), so
      the number on the list is the number on the report. Nothing here scores, ranks or decides a verdict.

   ⛔ A re-scored copy (scripts/audit-rescore-v2.ts) is a NEW audit holding the old runs, with their created_at and
   their actor_cost_usd copied across. It cost nothing, so the list must not show that cost as spend.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { buildReportModel, type ReportModel } from './reportModel.ts';
import { theirAreas, type OppContext, type OppRow } from './reportOpportunity.ts';
import { chooseReportDesign, verdictSplitOf, winnableOf, type VerdictSplit } from './reportDesign.ts';
import { auditRulesFor } from './auditVerdict.ts';
import { cellNamed } from './namedSignal.ts';
import { isRealCompetitor, SCORED_ENGINES } from './auditReport.ts';
import { isAggregatorUrl } from './aggregators.ts';

export type AuditTypeKey = 'discovery' | 'baseline' | 'quick' | 'website' | 'measurement' | 'weekly';
export interface AuditType { key: AuditTypeKey; label: string; /** What the badge says it is, for the hover. */ hint: string }

export interface AuditTypeInput {
  audit_purpose?: string | null;
  baseline_target_runs?: number | null;
  is_measurement?: boolean | null;
  runs: { mention_rate: number | null; seo_grade: string | null; status: string }[];
}

/** The audit's real type, from what the writer recorded. "Website check" = an audit that holds a website grade and
 *  never measured AI at all (no run has a mention rate). */
export function auditTypeOf(a: AuditTypeInput): AuditType {
  const p = String(a.audit_purpose ?? '').trim().toLowerCase();
  if (p === 'discovery') return { key: 'discovery', label: 'Discovery', hint: 'Discovery scan: 40 searches asked once each. Breadth, not a measurement.' };
  if (p === 'baseline' || p === 'targeted') return { key: 'baseline', label: 'Baseline', hint: 'Baseline: the targeted searches asked of ChatGPT and Gemini.' };
  if (p === 'measurement' || p === 'remeasure') return { key: 'measurement', label: 'Measurement', hint: 'Full measurement or day-28 re-measure (internal).' };
  if (p === 'weekly_check') return { key: 'weekly', label: 'Weekly check', hint: 'Weekly visibility check (internal).' };
  if (p === 'named_recheck') return { key: 'weekly', label: 'Named re-check', hint: 'Quarterly re-check of the searches the Discovery already named them on (internal, never shown to the client).' };
  if (!p && Number(a.baseline_target_runs ?? 0) > 1) {
    return a.is_measurement === true
      ? { key: 'measurement', label: 'Measurement', hint: 'Full measurement (internal).' }
      : { key: 'baseline', label: 'Baseline', hint: 'Baseline (older audit, no recorded purpose).' };
  }
  const anyAi = a.runs.some((r) => r.mention_rate !== null && r.mention_rate !== undefined);
  const anySeo = a.runs.some((r) => !!r.seo_grade);
  if (!anyAi && anySeo) return { key: 'website', label: 'Website check', hint: 'Website check: how easy the site is for AI to read. No AI answers measured.' };
  return { key: 'quick', label: 'Quick check', hint: 'Quick check: a short set of searches.' };
}

/** A re-scored copy: its runs are older than the audit that holds them (the copy keeps each run's original created_at). */
export function isRescoredCopy(audit: { created_at: string; runs: { created_at: string }[] }): boolean {
  const made = Date.parse(audit.created_at);
  if (!Number.isFinite(made) || audit.runs.length === 0) return false;
  const oldest = Math.min(...audit.runs.map((r) => Date.parse(r.created_at)).filter((t) => Number.isFinite(t)));
  return Number.isFinite(oldest) && oldest < made - 60_000;
}

export interface PooledInput {
  audit: { business_name: string; business_type: string | null; location_text: string | null; website: string | null; audit_purpose: string | null; created_at: string };
  queue: { question: string; status: string; result: Record<string, unknown> | null }[];
  /** Per run: the stored website check and the rules stamp (results.report_rules). */
  runMeta: { crawl: unknown; rules: unknown }[];
  lead: { website: string | null; place_id: string | null } | null;
}

export interface PooledSummary {
  /** Pooled named %, whole audit. null = nothing answered. */
  pct: number | null;
  named: number;
  answers: number;
  /** Winnable X of N — only the report designs that show it (the Discovery's opportunity report). */
  winnable: { x: number; n: number } | null;
  /** Rules v2: "Already named X · Winnable Y · Not winnable Z", the report's own split (reportDesign.verdictSplitOf). */
  split: VerdictSplit | null;
  /** Distinct searches asked. */
  searches: number;
  /** Rules v3: too many answers could not be measured — the row reads "Audit incomplete", never a result. */
  incomplete?: { unmeasured: number; answers: number } | null;
}

interface Crawl { insights?: { services?: { name?: string; coverage?: string }[] }; signals?: { checkedPages?: { url?: string }[] } }

export function pooledSummary(inp: PooledInput): PooledSummary {
  const { audit, queue, runMeta, lead } = inp;
  const bizName = audit.business_name ?? '', trade = audit.business_type ?? '', town = audit.location_text ?? '';
  const nctx = { businessName: bizName, trade: trade || null, town: town || null };
  const purpose = String(audit.audit_purpose ?? '').trim().toLowerCase();
  const rules = auditRulesFor({ createdAt: audit.created_at, runRules: runMeta.map((r) => r.rules) });
  const searches = new Set(queue.filter((r) => r.status === 'done' || r.result).map((r) => r.question.trim())).size;

  const designKind = chooseReportDesign({
    auditPurpose: audit.audit_purpose,
    paidKind: purpose === 'baseline' ? 'baseline' : (purpose === 'measurement' || purpose === 'remeasure') ? 'remeasure' : null,
    hookComplete: false, measuring: false,
  });

  if (designKind === 'opportunity' || designKind === 'baseline') {
    /* The renderer's own context (supabase/functions/render-audit-report), rebuilt from the same stored rows. */
    const ownWebsite = (audit.website ?? '').trim() || (lead?.website ?? '').trim();
    const crawl = (runMeta.map((r) => r.crawl as Crawl | null).find((c) => Array.isArray(c?.insights?.services) && c!.insights!.services!.length) ?? null);
    const services = crawl ? crawl.insights!.services!.map((x) => ({ name: String(x.name ?? ''), dedicated: x.coverage === 'dedicated' })) : [];
    const pageUrls = crawl ? (crawl.signals?.checkedPages ?? []).map((x) => String(x.url ?? '')) : [];
    const rows: OppRow[] = queue.filter((r) => r.status === 'done' || r.result || (rules >= 2 && r.status === 'failed')).map((r) => ({ question: r.question, result: r.result }));
    const questions = [...new Set(rows.map((r) => r.question.trim()))];
    const ctx: OppContext = {
      businessName: bizName, services, pageUrls, town,
      siteText: crawl ? [bizName, trade, ...services.map((x) => x.name), ...pageUrls].join(' ').toLowerCase() : undefined,
      areas: theirAreas({ locationText: town, pageUrls, questions, fromDiscovery: true }),
      isDirectoryHost: (h: string) => isAggregatorUrl('https://' + h),
      isNamed: (c: unknown) => cellNamed(c as never, nctx),
      isRival: (n: string) => isRealCompetitor(n, town),
      rules,
      identity: rules >= 2 ? { name: bizName, domains: ownWebsite ? [ownWebsite] : [], placeIds: lead?.place_id ? [lead.place_id] : [] } : undefined,
    };
    const m: ReportModel = buildReportModel(rows, ctx, { kind: designKind, businessName: bizName, town, dateLabel: '', website: { state: 'not_checked', issues: [] }, order: questions, bestCount: 10 });
    let winnable: PooledSummary['winnable'] = null;
    let split: VerdictSplit | null = null;
    if (designKind === 'opportunity') {
      split = verdictSplitOf(m.all.filter((q) => winnableOf(q) !== null || q.verdict?.rule === 'unmeasured'));
      const live = m.all.map((q) => winnableOf(q)).filter((v) => v !== null);
      winnable = { x: live.filter((v) => v === 'winnable').length, n: live.length };
    }
    /* Rules v3 "Audit incomplete": the list says so instead of a result (the report page shows no figures either). */
    if (m.incomplete) return { pct: null, named: 0, answers: 0, winnable: null, split: null, searches: m.counts.searches, incomplete: m.incomplete };
    return { pct: m.score.value, named: m.score.named, answers: m.score.denominator, winnable, split, searches: m.counts.searches, incomplete: null };
  }

  /* The classic report's headline: named cells over answered ChatGPT + Gemini cells, every run pooled. */
  let named = 0; let answers = 0;
  for (const r of queue) {
    if (r.status !== 'done' || !r.result) continue;
    for (const e of SCORED_ENGINES) {
      const cell = (r.result as Record<string, unknown>)[e];
      if (!cell) continue;
      answers++;
      if (cellNamed(cell as never, nctx)) named++;
    }
  }
  return { pct: answers > 0 ? Math.round((100 * named) / answers) : null, named, answers, winnable: null, split: null, searches, incomplete: null };
}

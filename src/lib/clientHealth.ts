/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PAID CLIENT HEALTH (Admin control centre, release 4, 2026-09-30).
   One concise line per paying client, from REAL statuses — Paul: "do not make a subjective green
   health score". So there is none: the facts (route, site live, baseline, weekly check, official
   re-measure date, open improvement items, directory issues, payment) and a list of BLOCKERS, each a
   plain sentence with the rule behind it.
   ⛔ The weekly check shown here is directional monitoring (weeklyCheck.ts) — never the guarantee.
   Pure and edge-safe.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { compareWeeks, coverageLabel, weekCoverage, weeklyStart, WEEKLY_TREND_LABEL, type StartInput, type WeekComparison, type WeekCoverage, type WeekSummary } from './weeklyCheck.ts';

export interface WeeklyRunRow { lead_id: string; week_start: string; status: string; summary: WeekSummary | null; cost_usd: number | null; estimate_usd: number | null; reason: string | null }
export interface ClientExtras {
  sets: { lead_id: string; questions: string[]; frozen_at: string; start_reason: string }[];
  runs: WeeklyRunRow[];
  /** client_opportunities per lead: open (still being worked) and implemented. */
  opportunities: { lead_id: string; status: string | null; implemented_at: string | null }[];
  /** lead_directory_presence rows needing attention (inconsistent / worth fixing). */
  directoryIssues: { lead_id: string }[];
}
export interface ClientHealthInput {
  leadId: string;
  route: 'build' | 'optimise' | null;
  websiteBuild: StartInput['websiteBuild'];
  checklist: Record<string, unknown> | null;
  baselineStarted: boolean;
  remeasureDue: string | null; remeasured: boolean;
  payment: string; refunded: boolean;
  todayDay: string;
}
export type WeeklyState = 'waiting_to_start' | 'set_frozen' | 'running' | 'has_results' | 'failed' | 'stopped';
/** Why a refunded client's monitoring shows as stopped. weekly-visibility selects only isPaidLead
 *  clients, which a refund removes — this is the page saying so, not the rule itself. */
export const WEEKLY_STOPPED_REFUNDED = 'Stopped — refunded; no further weekly checks run. Past results are kept as history.';
export interface ClientHealth {
  siteLive: boolean | null;
  weekly: {
    state: WeeklyState;
    reason: string;
    questions: number;
    thisWeek: WeekSummary | null;
    lastWeek: WeekSummary | null;
    comparison: WeekComparison | null;
    /** How much of the set the latest shown week answered; coverageLabel is null for a complete week. */
    coverage: WeekCoverage | null;
    coverageLabel: string | null;
    trendLabel: string | null;
    costToDateUsd: number;
  };
  openImprovements: number;
  implementedImprovements: number;
  directoryIssues: number;
  blockers: string[];
}

const CLOSED_OPPORTUNITY: ReadonlySet<string> = new Set(['improved', 'no_change', 'not_pursuing']);

export function clientHealthOf(i: ClientHealthInput, x: ClientExtras): ClientHealth {
  const opps = x.opportunities.filter((o) => o.lead_id === i.leadId);
  const implemented = opps.filter((o) => !!o.implemented_at).length;
  const open = opps.filter((o) => !CLOSED_OPPORTUNITY.has(String(o.status ?? ''))).length;
  const start = weeklyStart({ route: i.route, websiteBuild: i.websiteBuild, checklist: i.checklist, implementedOpportunities: implemented });
  const set = x.sets.find((s) => s.lead_id === i.leadId) ?? null;
  const runs = x.runs.filter((r) => r.lead_id === i.leadId).sort((a, b) => b.week_start.localeCompare(a.week_start));
  const done = runs.filter((r) => r.status === 'complete' && r.summary);
  const latest = runs[0] ?? null;
  const thisWeek = done[0]?.summary ?? null;
  const lastWeek = done[1]?.summary ?? null;
  const comparison = thisWeek ? compareWeeks(thisWeek, lastWeek) : null;
  let state: WeeklyState; let reason: string;
  if (i.refunded) { state = 'stopped'; reason = WEEKLY_STOPPED_REFUNDED; }
  else if (!start.ok && !set) { state = 'waiting_to_start'; reason = start.reason; }
  else if (latest?.status === 'failed' && !thisWeek) { state = 'failed'; reason = latest.reason ?? 'The last start failed'; }
  else if (latest && (latest.status === 'started' || latest.status === 'starting')) { state = thisWeek ? 'has_results' : 'running'; reason = thisWeek ? 'This week\'s check is running; showing the last result' : 'First check running'; }
  else if (thisWeek) { state = 'has_results'; reason = set?.start_reason ?? start.reason; }
  else if (set) { state = 'set_frozen'; reason = `Set frozen (${set.questions.length} questions) — the next hourly run starts it`; }
  else { state = 'waiting_to_start'; reason = start.ok ? `${start.reason} — the next hourly run freezes the set` : start.reason; }

  const siteLive = i.route === 'build' ? (!!i.websiteBuild?.production_url && (i.websiteBuild?.qa?.production_checked === true || i.websiteBuild?.production_status === 'verified')) : null;
  const blockers: string[] = [];
  if (i.refunded) blockers.push('Refunded');
  if (i.payment === 'Payment failed') blockers.push('Monthly payment failed');
  if (!i.baselineStarted && !i.refunded) blockers.push('Official baseline not started');
  if (i.remeasureDue && !i.remeasured && i.remeasureDue < i.todayDay && !i.refunded) blockers.push(`Official re-measure overdue (due ${i.remeasureDue})`);
  if (i.route === 'build' && siteLive === false && !i.refunded) blockers.push('New site not live yet');
  if (state === 'failed') blockers.push('Weekly check failed to start');
  const coverage = thisWeek ? weekCoverage(thisWeek) : null;
  return {
    siteLive,
    weekly: {
      state, reason, questions: set?.questions.length ?? 0, thisWeek, lastWeek, comparison,
      coverage, coverageLabel: coverage ? coverageLabel(coverage) : null,
      trendLabel: comparison ? WEEKLY_TREND_LABEL[comparison.trend] : null,
      costToDateUsd: Math.round(runs.reduce((s, r) => s + (r.status === 'complete' ? Number(r.cost_usd ?? r.estimate_usd ?? 0) : 0), 0) * 1000) / 1000,
    },
    openImprovements: open, implementedImprovements: implemented,
    directoryIssues: x.directoryIssues.filter((d) => d.lead_id === i.leadId).length,
    blockers,
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE AUDIT SCORE, EVERYWHERE (2026-10-22, Paul: "the audit results in the Inbox do not sync up").
   Record: docs/audit-score-one-ruler.md.

   🔴 WHAT WAS WRONG (measured on the 1,653 Inbox leads with an audit, 22 Oct):
     · The list chips counted EVERY run of the newest audit of ANY purpose (68 leads doubled: 6/6 shown, 3/3 on the card).
     · The chips and the Visible flag judged "named" by the stored model verdict; the card, the report and the pitch read
       the answer TEXT first (cellNamed). 71 leads disagreed on ChatGPT or Gemini, 26 on the Visible verdict.
     · Google AI: the chips counted every row with text; the card counts a question once, only where Google showed an
       AI answer (103 leads differed).
     · The chips never refreshed when an audit finished (only a full reload), and the Visible sweep ran only when a reply
       was waiting.
   ⛔ THE RULE NOW: the card's own scorer (scoreHookAuditForCard → scoreHookRun, the report's ruler) on the card's own
      audit (pickHookAudit: newest outreach audit, its newest run). Computed ONCE per run by the ai-reply-drafts tick and
      STORED on the run (ai_audit_runs.hook_score). The database marks a run dirty (score_dirty_at) on every write of an
      answer, a run status or the audit's name / trade / town, so a stored score is never shown as current while its
      inputs have changed: a dirty run reads as "updating" until the tick rescores it.
   ⛔ Every screen reads the score through leadAuditScore / the stored shape below. Nobody counts answers on their own.
   Pure and edge-reachable: relative imports with explicit .ts, no Deno, no DOM.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { auditKind, type AuditKindRow } from './auditKind.ts';
import { scoringMethodFor, type ScoringMethod } from './aiOverview.ts';
import { assessCompetitorCleanliness, collectCompetitorNames, countAnsweredCells, isProvableJunkName } from './competitorCleaning.ts';
import { excludeSelfRivals } from './rivalHook.ts';
import { nameMatches } from './nameMatch.ts';
import { scoreHookRun, type HookScore, type HookScoreRow } from './hookScore.ts';
import { namedShareOf } from './namedShareRule.ts';

export interface HookCardAudit extends AuditKindRow {
  id: string;
  created_at: string | null;
  business_name: string | null;
  business_type: string | null;
  location_text: string | null;
  is_market?: boolean | null;
  lead_id?: string | null;
  short_code?: string | null;
  ai_audit_runs?: Array<{ id: string; status: string | null; run_number: number | null; created_at?: string | null; results?: unknown }> | null;
}

/** The kinds the card reads: an ordinary per-business audit (every hook is one) and the legacy
 *  pre-purpose single-run audit. A paid baseline, a measurement, a free check and a Discovery scan
 *  are different instruments and never shown as the outreach score. */
export function isOutreachAudit(a: Pick<HookCardAudit, 'is_market'> & AuditKindRow): boolean {
  if (a.is_market === true) return false;
  const k = auditKind(a);
  return k === 'ordinary' || k === 'single_run';
}

type PickableAudit = Pick<HookCardAudit, 'id' | 'created_at' | 'is_market'> & AuditKindRow & {
  ai_audit_runs?: ReadonlyArray<{ id: string; status: string | null; run_number: number | null; created_at?: string | null; results?: unknown }> | null;
};

/** The newest outreach audit for the lead that has a run, and its newest run. The newest one wins
 *  even while it is still running, so the card can show progress for the audit just started
 *  rather than the previous result. */
export function pickHookAudit<T extends PickableAudit>(audits: readonly T[]): { audit: T; runId: string; runStatus: string | null; runCreatedAt: string | null; runResults: unknown } | null {
  const sorted = [...audits].filter(isOutreachAudit).sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
  });
  for (const audit of sorted) {
    const runs = [...(audit.ai_audit_runs ?? [])].sort((x, y) => (y.run_number ?? 0) - (x.run_number ?? 0));
    const run = runs[0];
    if (run?.id) return { audit, runId: run.id, runStatus: run.status ?? null, runCreatedAt: run.created_at ?? audit.created_at ?? null, runResults: run.results ?? null };
  }
  return null;
}

export interface HookCardScore {
  score: HookScore;
  /** True when the run's rival names are withheld (provably uncleaned). The card says so instead of
   *  implying AI named nobody. */
  rivalsWithheld: boolean;
}

/** ⛔ THE ONE SCORER: the report's ruler (the audit's own business, trade and town), the report's competitor gates. */
export function scoreHookAuditForCard(input: {
  audit: Pick<HookCardAudit, 'business_name' | 'business_type' | 'location_text'> & { created_at?: string | null };
  state: unknown;
  runResults: unknown;
  rows: readonly HookScoreRow[];
}): HookCardScore {
  const business = (input.audit.business_name ?? '').trim();
  const rowsForCleaning = input.rows as unknown as Parameters<typeof collectCompetitorNames>[0];
  const cleanliness = assessCompetitorCleanliness(collectCompetitorNames(rowsForCleaning), input.runResults,
    { answeredCells: countAnsweredCells(input.rows as unknown as Parameters<typeof countAnsweredCells>[0]) });
  const rivalsWithheld = cleanliness.suppressNames;
  const score = scoreHookRun(input.state, input.rows, {
    named: { businessName: business, trade: input.audit.business_type || null, town: input.audit.location_text || null },
    town: input.audit.location_text ?? null,
    trade: input.audit.business_type ?? null,
    scoringMethod: scoringMethodFor(input.audit.created_at ?? null),
    cleanCompetitors: (names) => rivalsWithheld ? [] : excludeSelfRivals(names.filter((n) => !isProvableJunkName(n)), business, nameMatches),
  });
  return { score, rivalsWithheld };
}

/* ── the stored score (ai_audit_runs.hook_score) ─────────────────────────────────────────────────── */

/** Bump when what is stored, or how it is computed, changes: an older version reads as "updating" and is rescored. */
export const AUDIT_SCORE_VERSION = 1;

export interface EngineTally { named: number; valid: number }
export interface StoredAuditScore {
  v: number;
  /** Every expected answer is in (the card's own rule). Until then counts are partial and no percentage is shown. */
  complete: boolean;
  chatgpt: EngineTally | null;
  gemini: EngineTally | null;
  /** Google AI: questions where Google showed an AI answer, and how many of those named them. Not shown = left out. */
  googleAi: { named: number; shown: number };
  /** The card's headline score (method 2 adds Google AI for audits created on or after GOOGLE_AI_SCORED_SINCE). */
  scored: { named: number; expected: number; method: ScoringMethod };
  /** The pitch's one-third rule share (namedShareRule.namedShareOf): Gemini + Google AI where scored, never ChatGPT. */
  share: { named: number; total: number } | null;
}

export function storedScoreOf(s: HookScore): StoredAuditScore {
  const eng = (k: string): EngineTally | null => {
    const t = s.perEngine.find((e) => e.engine === k);
    return t ? { named: Math.max(0, t.named), valid: Math.max(0, t.valid) } : null;
  };
  return {
    v: AUDIT_SCORE_VERSION,
    complete: s.complete === true,
    chatgpt: eng('chatgpt'),
    gemini: eng('gemini'),
    googleAi: { named: Math.max(0, s.scored.googleAi?.named ?? 0), shown: Math.max(0, s.scored.googleAi?.shown ?? 0) },
    scored: { named: s.scored.named, expected: s.scored.expected, method: s.scored.method },
    share: namedShareOf(s),
  };
}

const tally = (x: unknown): EngineTally | null => {
  const o = x as { named?: unknown; valid?: unknown } | null;
  if (!o || typeof o !== 'object') return null;
  const n = Number(o.named); const v = Number(o.valid);
  return Number.isFinite(n) && Number.isFinite(v) && v >= 0 ? { named: Math.min(Math.max(0, n), v), valid: v } : null;
};

/** A stored score of THIS version, or null (absent, older version, unreadable). Never a guess. */
export function parseStoredScore(raw: unknown): StoredAuditScore | null {
  const o = raw as Partial<StoredAuditScore> | null;
  if (!o || typeof o !== 'object' || o.v !== AUDIT_SCORE_VERSION) return null;
  const g = o.googleAi as { named?: unknown; shown?: unknown } | undefined;
  const sc = o.scored as { named?: unknown; expected?: unknown; method?: unknown } | undefined;
  if (!g || !sc) return null;
  const share = o.share as { named?: unknown; total?: unknown } | null | undefined;
  return {
    v: AUDIT_SCORE_VERSION,
    complete: o.complete === true,
    chatgpt: tally(o.chatgpt),
    gemini: tally(o.gemini),
    googleAi: { named: Math.max(0, Number(g.named) || 0), shown: Math.max(0, Number(g.shown) || 0) },
    scored: { named: Number(sc.named) || 0, expected: Number(sc.expected) || 0, method: sc.method === 2 ? 2 : 1 },
    share: share && Number(share.total) > 0 ? { named: Number(share.named) || 0, total: Number(share.total) } : null,
  };
}

/** The Visible flag's counts from the stored score (visibleFlag.isVisible): Gemini, and Google AI where shown. */
export function visibleCountsOf(s: StoredAuditScore): { gemini: { named: number; answers: number } | null; overview: { named: number; answers: number } | null } {
  return {
    gemini: s.gemini ? { named: s.gemini.named, answers: s.gemini.valid } : null,
    overview: { named: s.googleAi.named, answers: s.googleAi.shown },
  };
}

/* ── the one read for a lead ─────────────────────────────────────────────────────────────────────── */

export type ScoredRun = { id: string; status: string | null; run_number: number | null; created_at?: string | null; hook_score?: unknown; score_dirty_at?: string | null };
export type ScoredAudit = Pick<HookCardAudit, 'id' | 'created_at' | 'is_market'> & AuditKindRow & { lead_id?: string | null; ai_audit_runs?: ScoredRun[] | null };

export interface LeadAuditScore {
  auditId: string;
  runId: string;
  /** The stored score, or null when none has been computed yet. */
  score: StoredAuditScore | null;
  /** True while the inputs changed after the score was computed (or none exists yet): show it as updating, never as final. */
  updating: boolean;
  /** The database has marked the run for rescoring (score_dirty_at): the tick will rescore it within about a minute. */
  dirty: boolean;
}

/** ⛔ THE ONE READ: the card's audit and run (pickHookAudit), and that run's stored score. */
export function leadAuditScore(audits: readonly ScoredAudit[]): LeadAuditScore | null {
  const picked = pickHookAudit(audits);
  if (!picked) return null;
  const run = (picked.audit.ai_audit_runs ?? []).find((r) => r.id === picked.runId) as ScoredRun | undefined;
  const score = parseStoredScore(run?.hook_score);
  const dirty = !!run?.score_dirty_at;
  return { auditId: picked.audit.id, runId: picked.runId, score, updating: !score || dirty, dirty };
}

/** Group a newest-first audit list by lead and read each lead's score once. */
export function leadAuditScores(audits: readonly ScoredAudit[]): Map<string, LeadAuditScore> {
  const byLead = new Map<string, ScoredAudit[]>();
  for (const a of audits) {
    if (!a.lead_id) continue;
    const list = byLead.get(a.lead_id);
    if (list) list.push(a); else byLead.set(a.lead_id, [a]);
  }
  const out = new Map<string, LeadAuditScore>();
  for (const [lead, list] of byLead) {
    const s = leadAuditScore(list);
    if (s) out.set(lead, s);
  }
  return out;
}

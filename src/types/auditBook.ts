/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE AUDIT BOOK'S SHAPES — extracted from AiAudit.tsx, 2026-09-10.

   These lived inside a 3,720-line page component, which meant the list, the wizard and the
   results view could not be separated: every one of them needs AuditLite. Moving the types out
   first is what makes that split possible, and it is a pure move — the declarations below are
   the originals, comments and all.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export interface AuditRow { id: string; business_name: string; business_type: string | null; location_text: string | null; country: string | null; has_website: boolean; created_at: string;
  /** The client's own site. Selected so the report's "Cited as a source" figure can tell a
   *  citation of their OWN domain from a citation of somebody else's. May be null. */
  website?: string | null;
  /** What the audit was FOR — 'baseline' | 'measurement' | 'remeasure' | 'free_check' | 'audit'
   *  (src/lib/auditKind.ts). Written by create-ai-audit since 2026-09-12; null on older rows. The
   *  row pills key on this, never on the run count: a 3-run free check is not a paying client. */
  audit_purpose?: string | null;
  /** MARKET audit: a trade and a town with no business attached. Its named count is 0 by
   *  construction, so nothing here may render it as a business's result — see isMarketAudit. */
  is_market?: boolean | null;
  /** Full Measurement (3-run, full question set). Re-audit reads this to reproduce a LIKE-FOR-LIKE
   *  re-measure — a measurement re-audits as a measurement, a quick audit stays quick. */
  is_measurement?: boolean | null;
  /** > 1 marks a PAID BASELINE — the only report that still shows SEO grades (seoStyleForAudit).
   *  Optional because the market/report list selects vary; absent reads as "not a baseline", which
   *  is the safe direction (withhold the grade rather than show one we cannot justify). */
  baseline_target_runs?: number | null;
  /** SOFT DELETE. Non-null = archived: hidden from the list, but the row, its runs and every
   *  stored answer are all still in the database. Absent (the column predates most rows, and an
   *  older deploy may not select it) reads as NOT archived, which is the safe direction — a
   *  missing column must never hide the whole book. */
  archived_at?: string | null }

/* ── The audit book, grouped ────────────────────────────────────────────────────
   The list used to be one flat row per AUDIT, which reads as duplicates because the
   Inbox button, the bulk runner and the wizard each mint a NEW ai_audits row for the
   same lead (only the wizard's edited re-run and the baseline chain reuse an audit id).
   That upstream behaviour is deliberately left alone: /a/<auditId> report links are
   already out with real prospects, and reusing ids would change which run they resolve to.

   So the grouping happens HERE: audits are folded by BUSINESS (lead_id when we have one,
   else the normalised name), and businesses are folded by TRADE via tradeWord(). One
   collapsed row per business; every audit and run stays reachable underneath. */

/** One run, with the scalars the list needs pulled out of results so no big JSONB moves. */
export interface RunLite {
  id: string;
  audit_id: string;
  run_number: number;
  status: string;
  mention_rate: number | null;
  created_at: string;
  actor_cost_usd: number | null;
  seo_grade: string | null;
  /** Live progress, only meaningful while in flight. done counts queue rows that have
   *  SETTLED — status 'done' or 'failed' (the queue's vocabulary is not 'complete'). */
  done: number;
  total: number;
}

export interface AuditLite extends AuditRow {
  lead_id: string | null;
  first_opened_at: string | null;
  open_count: number | null;
  baseline_target_runs: number | null;
  baseline_runs_counted: number | null;
  baseline_completed_at: string | null;
  baseline_error: string | null;
  report_slug: string | null;
  /** Whether the linked lead has paid. The slot the audit asked to keep: nothing qualifies yet
   *  (amount_paid is null on all 409 leads), so it simply does not render until one does. */
  lead_paid?: boolean;
  /** Newest run first. */
  runs: RunLite[];
}

export interface BusinessGroup {
  key: string;
  name: string;
  trade: string;
  business_type: string | null;
  location: string | null;
  has_website: boolean;
  /** A trade-and-town audit with no business attached. Read off the newest audit — already
   *  selected, so no extra query. Searchable like anything else, but badged, because a sentinel
   *  called "[market] locksmiths · Hastings" is not a client and must not read as one. */
  isMarket: boolean;
  /** Newest audit first. */
  audits: AuditLite[];
  /** The newest audit and its latest run — what the collapsed row shows. */
  latestAudit: AuditLite;
  latestRun: RunLite | null;
  runningRun: RunLite | null;
  auditCount: number;
  runCount: number;
  cost: number;
}
export interface LeadOption { id: string; business_name: string; category: string | null; country: string | null; website: string | null; address: string | null; search_keyword?: string | null; search_location?: string | null; derived_town?: string | null }


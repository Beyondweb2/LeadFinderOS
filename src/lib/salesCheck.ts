/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "CHECK BEFORE CALLING" — the salesperson's bulk pre-call check, its RULES (2026-10-04, fix/07,
   master plan M-034 / WS-7, Session E E-04). The engine is supabase/functions/_shared/sales-check.ts;
   the function is fn sales-prospect-check; the record is
   docs/pre-sales-certification/fixes-07-sales-bulk-audit.md.

   🔴 WHY A SEPARATE PATH. The admin bulk runner (fn bulk-jobs) is NOT safe to hand a rep (E-04): it
   checks outreach_leads.user_id — the data account, so a rep would reach the whole book — takes
   archived leads and clients, runs every item through create-ai-audit's internal door (no per-rep
   guard, no per-lead limit) and counts a 100-lead job as one guard row.

   ⛔ WHAT ONE ITEM IS. One lead, one research result: the SAME hook check the rep's single "Run the AI
   check" button makes (3 questions × ChatGPT + Google AI × 1 run), plus the free website crawl. Never
   a baseline, never the 20 × 3 client method. The result is an ordinary ai_audits row on that lead,
   so the Outreach row, the call screen and the report read it with no change.

   ⛔ EVERY DECISION HERE IS PER LEAD, AT THE MOMENT IT IS PROCESSED, NEVER AT PRESS TIME ONLY.
   A lead reassigned, archived or paid while a batch waits is refused when its turn comes.

   ⛔ NO COST REACHES A SALESPERSON. Allowances are counted in CHECKS; the dollar estimate stays on the
   server and in the admin view.

   Pure. IMPORTED BY AN EDGE FUNCTION: relative .ts imports only (CLAUDE.md §3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { auditKind, type AuditKindRow } from './auditKind.ts';
import { CRAWL_CHECK_VERSION, CRAWL_FRESH_MS } from './crawlCheck.ts';
import { SITE_EVIDENCE_VERSION } from './siteEvidence.ts';
import { DEFAULT_PROTECTION_LIMITS } from './protectionLimits.ts';

const DAY_MS = 86_400_000;

/* ── The numbers. Named once; never written as figures in prose (CLAUDE.md §4). ───────────────── */

/** Leads in one request. The server REFUSES more (never slices — a silent slice is a lie about what
 *  was checked). Sized so one batch is about one rep-hour of calls, and so its worst case (every lead
 *  a fresh paid check) is a small slice of the prospecting pool. */
export const SALES_CHECK_BATCH_MAX = 20;

/** A finished AI check on the lead younger than this is REUSED — no new spend. AI answers move week to
 *  week; two weeks keeps a reused result well inside the call screen's own staleness flag
 *  (coldCallPlaybook PLAYBOOK_AUDIT_STALE_DAYS) and the drip's repeat window. */
export const SALES_CHECK_AUDIT_REUSE_DAYS = 14;

/** "Check again" (refresh) buys a new check only for a result at least this old. Anything younger is
 *  reused even on a refresh: a day-old answer does not move, and the per-lead daily limit on hooks
 *  (create-ai-audit SALES_HOOKS_PER_LEAD_PER_DAY) exists for the same reason. */
export const SALES_CHECK_REFRESH_MIN_DAYS = 2;

/** The rep's own daily allowance of FRESH (paid) checks when the live protection_settings row does
 *  not name one (actions.sales_check.per_day). Absent never means unlimited. Reused results do not
 *  count. The number lives ONCE, in protectionLimits.ts (the value the migration adds to the live
 *  row); sized from the measured cost of one check (_shared/outreach-audit.ts OUTREACH_AUDIT_EST_USD):
 *  two full batches a day per rep. */
export const SALES_CHECK_DEFAULT_PER_REP_PER_DAY: number = Number(DEFAULT_PROTECTION_LIMITS.actions.sales_check.per_day);

/** Items worked at once inside one advance (each is one create-ai-audit call or one crawl). */
export const SALES_CHECK_CONCURRENCY = 4;

/** An AI check still unanswered after this is called failed (the bulk-jobs wait, same reasoning). */
export const SALES_CHECK_AUDIT_WAIT_MAX_MS = 45 * 60 * 1000;

/** An item claimed ("starting") but not moved on for this long was interrupted mid-call. */
export const SALES_CHECK_STARTING_STALE_MS = 3 * 60 * 1000;

/** Interrupted starts tried at most this many times before the item is called failed. */
export const SALES_CHECK_MAX_START_ATTEMPTS = 2;

/** How often the open Outreach page asks the server to move a batch on. */
export const SALES_CHECK_POLL_MS = 5_000;

/** Run statuses still being worked by the audit queue (auditRowState.ts's in-flight set). */
export const AUDIT_RUN_IN_FLIGHT: ReadonlySet<string> = new Set(['pending', 'queued', 'running', 'processing']);

/* ── Item and batch shapes ─────────────────────────────────────────────────────────────────────── */

export type ItemStatus = 'queued' | 'starting' | 'running' | 'done' | 'reused' | 'failed' | 'skipped';
export const TERMINAL_ITEM_STATUSES: ReadonlySet<ItemStatus> = new Set(['done', 'reused', 'failed', 'skipped']);
export type BatchStatus = 'active' | 'waiting' | 'finished';
export type AuditSource = 'new' | 'reused' | 'in_flight';
export type CrawlSource = 'new' | 'reused' | 'with_audit' | 'none' | 'failed';

export type SkipReason =
  | 'not_yours' | 'client' | 'archived' | 'suppressed' | 'not_interested' | 'already_won'
  | 'missing_name' | 'missing_trade' | 'missing_town' | 'town_unverified'
  | 'pitch_waiting' | 'auto_message_on'
  | 'allowance_used' | 'budget_used' | 'budget_unknown' | 'paused' | 'not_allowed'
  | 'cancelled' | 'no_longer_yours';
export type FailReason = 'audit_failed' | 'audit_not_run' | 'audit_timeout' | 'start_failed' | 'not_in_town';
export type ItemReason = SkipReason | FailReason;

/** What the rep reads for a reason. Plain words; never a cost, a provider or another person's data. */
export const REASON_TEXT: Record<ItemReason, string> = {
  not_yours: 'Not one of your leads — skipped.',
  client: 'Already a client — skipped.',
  archived: 'Archived — skipped.',
  suppressed: 'This business asked not to be contacted — skipped.',
  not_interested: 'Marked not interested — skipped.',
  already_won: 'Already marked won — skipped.',
  missing_name: 'No business name on this lead — add it, then check again.',
  missing_trade: 'No trade on this lead — add it, then check again.',
  missing_town: 'No town on this lead — add it, then check again.',
  town_unverified: 'Town not confirmed — confirm it on the lead, then check again.',
  pitch_waiting: 'An automatic WhatsApp is waiting on this lead\'s AI check, so no new check was started here. Ask Paul.',
  auto_message_on: 'New checks are off while a finished check sends an automatic WhatsApp. Ask Paul.',
  allowance_used: 'Today\'s checking allowance is used — try again tomorrow or ask Paul.',
  budget_used: 'Today\'s checking budget is used — your leads are still here, try tomorrow or ask Paul.',
  budget_unknown: 'Couldn\'t confirm today\'s allowance, so nothing was started. Try again in a minute.',
  paused: 'Checks are paused by Paul right now — nothing was started.',
  not_allowed: 'Your account can\'t start checks right now — ask Paul.',
  cancelled: 'Stopped before it started.',
  no_longer_yours: 'No longer one of your active leads.',
  audit_failed: 'The AI check failed — nothing usable came back. Check it again later.',
  audit_not_run: 'The AI check didn\'t run (the queue was full) — nothing was spent. Check it again later.',
  audit_timeout: 'The AI check took too long — check it again later.',
  start_failed: 'The AI check couldn\'t start — check it again later.',
  not_in_town: 'The business looks too far from the town on the lead — fix the town, then check again.',
};

export function reasonText(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return (REASON_TEXT as Record<string, string>)[reason] ?? 'Not checked — ask Paul.';
}

/* ── The request ───────────────────────────────────────────────────────────────────────────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function isRequestId(v: unknown): v is string {
  return typeof v === 'string' && REQUEST_ID_RE.test(v);
}

export type LeadIdsResult =
  | { ok: true; ids: string[]; invalid: number; duplicates: number }
  | { ok: false; error: 'no_leads' | 'too_many'; max: number; count: number };

/** The lead ids a request may name: strings shaped like a uuid, each once, in the order given.
 *  ⛔ Counted AFTER de-duplication and REFUSED above the maximum — the same lead twice is one lead,
 *  and 25 leads is a refusal, never 20 of them. */
export function normalizeLeadIds(raw: unknown, max: number = SALES_CHECK_BATCH_MAX): LeadIdsResult {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  let invalid = 0, duplicates = 0;
  for (const v of list) {
    if (typeof v !== 'string' || !UUID_RE.test(v.trim())) { invalid++; continue; }
    const id = v.trim().toLowerCase();
    if (seen.has(id)) { duplicates++; continue; }
    seen.add(id);
  }
  const ids = [...seen];
  if (ids.length === 0) return { ok: false, error: 'no_leads', max, count: 0 };
  if (ids.length > max) return { ok: false, error: 'too_many', max, count: ids.length };
  return { ok: true, ids, invalid, duplicates };
}

/* ── May this rep check this lead? ─────────────────────────────────────────────────────────────── */

export interface CheckLead {
  id: string;
  user_id?: string | null;
  assigned_to_user_id?: string | null;
  amount_paid?: unknown;
  status?: string | null;
  is_archived?: boolean | null;
  business_name?: string | null;
  search_keyword?: string | null;
  category?: string | null;
  search_location?: string | null;
  address?: string | null;
  derived_town?: string | null;
  country?: string | null;
  website?: string | null;
  services_included?: string[] | null;
  service_areas?: string[] | null;
}

/** Client statuses — the same set as roleRules.ts CLIENT_STATUSES (held equal by the test). */
const CLIENT_STATUSES: ReadonlySet<string> = new Set(['payment_received', 'in_delivery', 'completed', 'refunded']);
function isClient(lead: CheckLead): boolean {
  const paid = Number(lead.amount_paid ?? 0);
  return (Number.isFinite(paid) && paid > 0) || CLIENT_STATUSES.has(String(lead.status ?? ''));
}
const NOT_INTERESTED_STATUSES: ReadonlySet<string> = new Set(['not_interested', 'opted_out']);
const WON_STATUSES: ReadonlySet<string> = new Set(['won_pending_onboarding']);

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '');
export const leadTrade = (l: CheckLead) => clean(l.search_keyword) || clean(l.category);
export const leadTown = (l: CheckLead) => clean(l.derived_town) || clean(l.search_location) || clean(l.address);

export type Eligibility = { ok: true } | { ok: false; reason: SkipReason };

/**
 * May `actorId` (a salesperson) work this lead now?
 * ⛔ ORDER IS A PRIVACY RULE. "Not yours" is answered FIRST and covers a missing row too, so a rep
 * can never learn whether another person's lead exists, is archived or is a client. Only for a lead
 * assigned to them are the other reasons told.
 * ⛔ POSITIVE MATCH: assigned_to_user_id must EQUAL the actor (canWorkLead's sales rule) — never
 * outreach_leads.user_id, which is the data account on every lead.
 */
export function leadEligibility(actorId: string, lead: CheckLead | null | undefined): Eligibility {
  if (!lead || typeof lead.assigned_to_user_id !== 'string' || !actorId || lead.assigned_to_user_id !== actorId) {
    return { ok: false, reason: 'not_yours' };
  }
  if (isClient(lead)) return { ok: false, reason: 'client' };
  if (lead.is_archived === true) return { ok: false, reason: 'archived' };
  const status = String(lead.status ?? '');
  if (NOT_INTERESTED_STATUSES.has(status)) return { ok: false, reason: 'not_interested' };
  if (WON_STATUSES.has(status)) return { ok: false, reason: 'already_won' };
  if (!clean(lead.business_name)) return { ok: false, reason: 'missing_name' };
  if (!leadTrade(lead)) return { ok: false, reason: 'missing_trade' };
  if (!leadTown(lead)) return { ok: false, reason: 'missing_town' };
  return { ok: true };
}

/** A lead that was eligible may have stopped being so while its check ran. Which reason, for the
 *  item that is now hidden from the rep (the result belongs to the lead, not to them). */
export function stillWorkable(actorId: string, lead: CheckLead | null | undefined): Eligibility {
  if (!lead || lead.assigned_to_user_id !== actorId) return { ok: false, reason: 'no_longer_yours' };
  if (isClient(lead)) return { ok: false, reason: 'no_longer_yours' };
  if (lead.is_archived === true) return { ok: false, reason: 'archived' };
  return { ok: true };
}

/* ── What to do for one eligible lead ─────────────────────────────────────────────────────────── */

export interface CheckAuditRow extends AuditKindRow {
  id: string;
  lead_id: string | null;
  created_at: string | null;
}
export interface CheckRunRow {
  id: string;
  audit_id: string;
  status: string | null;
  run_number?: number | null;
  created_at: string | null;
  /** For a capped run only: how many questions were genuinely answered (a capped run that never
   *  started a question is not a result — the bulk-jobs lesson). Undefined = not counted. */
  answered?: number;
}
export interface CheckCrawlRow {
  created_at: string | null;
  result?: { version?: number; evidenceVersion?: number; status?: string; signals?: { fetchFailed?: boolean } } | null;
}

/** The kinds of audit a pre-call check may reuse: a hook / ordinary audit, a free check, a legacy
 *  single run. Never a baseline, a measurement, a replay, a Discovery or a weekly check. */
const REUSABLE_KINDS: ReadonlySet<string> = new Set(['ordinary', 'free_check', 'single_run']);
export function isReusableAudit(a: AuditKindRow): boolean {
  return REUSABLE_KINDS.has(auditKind(a));
}

/** A run that is a usable answer: complete, or capped WITH at least one answered question. */
export function runIsUsable(r: Pick<CheckRunRow, 'status' | 'answered'>): boolean {
  if (r.status === 'complete') return true;
  if (r.status === 'capped') return typeof r.answered === 'number' && r.answered > 0;
  return false;
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

export type AuditPlan =
  | { kind: 'reuse'; auditId: string; runId: string; resultAt: string | null }
  | { kind: 'attach'; auditId: string; runId: string }
  | { kind: 'start' }
  | { kind: 'refuse'; reason: SkipReason };
export type CrawlPlan = 'reuse' | 'run' | 'with_audit' | 'none';

export interface PlanInput {
  leadId: string;
  audits: readonly CheckAuditRow[];
  runs: readonly CheckRunRow[];
  crawl: CheckCrawlRow | null;
  /** The lead's own website (directory / social URLs already removed), or null. */
  ownWebsite: string | null;
  refresh: boolean;
  nowMs: number;
  /** Google could not confirm the town (townVerdict.ts townGated). Blocks only a NEW check. */
  townGated: boolean;
  /** An automatic pitch is parked on this lead waiting for an audit to complete. */
  pitchWaiting: boolean;
  /** Completing ANY audit currently queues a WhatsApp (whatsapp_outreach_state.audit_complete_template
   *  is set), or that setting could not be read. Blocks only a NEW check. */
  autoMessageOn: boolean;
}

/**
 * The plan for one eligible lead.
 *   1. An AI check already in flight on the lead → wait for it (no spend).
 *   2. A usable reusable result younger than the reuse window → reuse it, unless this is a refresh
 *      and the result is old enough to refresh.
 *   3. Otherwise a NEW check — refused when the town is unconfirmed, a pitch is waiting on an audit,
 *      or a finished audit would message the lead.
 * The crawl: none without a website; with a new check the audit queue crawls at finalise; otherwise
 * a fresh, current crawl carrying sales evidence is reused, and anything else is crawled now (free).
 */
export function planItem(i: PlanInput): { audit: AuditPlan; crawl: CrawlPlan } {
  const reusable = i.audits.filter((a) => a.lead_id === i.leadId && isReusableAudit(a));
  const ids = new Set(reusable.map((a) => a.id));
  const runs = i.runs.filter((r) => ids.has(r.audit_id));
  const newestFirst = (a: CheckRunRow, b: CheckRunRow) => (ms(b.created_at) || 0) - (ms(a.created_at) || 0) || (a.id < b.id ? 1 : -1);

  const inFlight = runs
    .filter((r) => AUDIT_RUN_IN_FLIGHT.has(String(r.status)) && i.nowMs - (ms(r.created_at) || 0) < SALES_CHECK_AUDIT_WAIT_MAX_MS)
    .sort(newestFirst)[0];
  const usable = runs.filter(runIsUsable).sort(newestFirst)[0];
  const ageMs = usable ? i.nowMs - (ms(usable.created_at) || 0) : Infinity;
  const refreshAllowed = i.refresh && ageMs >= SALES_CHECK_REFRESH_MIN_DAYS * DAY_MS;

  let audit: AuditPlan;
  if (inFlight) audit = { kind: 'attach', auditId: inFlight.audit_id, runId: inFlight.id };
  else if (usable && ageMs < SALES_CHECK_AUDIT_REUSE_DAYS * DAY_MS && !refreshAllowed) {
    audit = { kind: 'reuse', auditId: usable.audit_id, runId: usable.id, resultAt: usable.created_at };
  } else if (i.autoMessageOn) audit = { kind: 'refuse', reason: 'auto_message_on' };
  else if (i.pitchWaiting) audit = { kind: 'refuse', reason: 'pitch_waiting' };
  else if (i.townGated) audit = { kind: 'refuse', reason: 'town_unverified' };
  else audit = { kind: 'start' };

  let crawl: CrawlPlan;
  if (!i.ownWebsite) crawl = 'none';
  else if (audit.kind === 'start' || audit.kind === 'attach') crawl = 'with_audit';
  else if (audit.kind === 'refuse') crawl = 'none';
  else crawl = crawlUsable(i.crawl, i.nowMs) && !(i.refresh && crawlAgeMs(i.crawl, i.nowMs) >= SALES_CHECK_REFRESH_MIN_DAYS * DAY_MS) ? 'reuse' : 'run';
  return { audit, crawl };
}

function crawlAgeMs(c: CheckCrawlRow | null, nowMs: number): number {
  const t = ms(c?.created_at);
  return Number.isFinite(t) ? nowMs - t : Infinity;
}

/** A stored lead crawl the call screen can use: fresh, current version, a real read of the site, and
 *  carrying the sales evidence (a shallow crawl has none, so it is not "already checked" for a call). */
export function crawlUsable(c: CheckCrawlRow | null | undefined, nowMs: number): boolean {
  if (!c?.result) return false;
  if (crawlAgeMs(c, nowMs) >= CRAWL_FRESH_MS) return false;
  if ((c.result.version ?? 1) < CRAWL_CHECK_VERSION) return false;
  if (c.result.status === 'unavailable' || c.result.signals?.fetchFailed === true) return false;
  return (c.result.evidenceVersion ?? 0) >= SITE_EVIDENCE_VERSION;
}

/* ── A started check, later ───────────────────────────────────────────────────────────────────── */

export type RunOutcome = { kind: 'wait' } | { kind: 'usable' } | { kind: 'failed'; reason: FailReason };

/** Where a started (or attached) check has got to, from its run. */
export function runOutcome(run: Pick<CheckRunRow, 'status' | 'answered'> | null | undefined, startedAtMs: number, nowMs: number): RunOutcome {
  if (run && runIsUsable(run)) return { kind: 'usable' };
  if (run?.status === 'capped') return { kind: 'failed', reason: 'audit_not_run' };
  if (run && (run.status === 'failed' || run.status === 'cancelled')) return { kind: 'failed', reason: 'audit_failed' };
  if (nowMs - startedAtMs > SALES_CHECK_AUDIT_WAIT_MAX_MS) return { kind: 'failed', reason: 'audit_timeout' };
  return { kind: 'wait' };
}

/** create-ai-audit's refusal → the item's reason. Positive matches; anything else failed to start. */
export function startRefusalReason(res: { status?: number; error?: unknown }): { status: 'skipped' | 'failed'; reason: ItemReason } {
  const e = String(res.error ?? '');
  if (e.startsWith('town_unverified')) return { status: 'skipped', reason: 'town_unverified' };
  if (e === 'business_not_in_town') return { status: 'failed', reason: 'not_in_town' };
  if (e === 'prospecting_budget_used') return { status: 'skipped', reason: 'budget_used' };
  if (e === 'usage_paused' || e === 'all_stop') return { status: 'skipped', reason: 'paused' };
  return { status: 'failed', reason: 'start_failed' };
}

/** The guard's refusal reason (public.guard_action) → the item's reason. */
export function guardRefusalReason(reason: string | null | undefined): SkipReason {
  if (reason === 'paused' || reason === 'all_stop') return 'paused';
  if (reason === 'suspended' || reason === 'no_role' || reason === 'not_allowed') return 'not_allowed';
  if (reason === 'guard_unavailable') return 'budget_unknown';
  return 'allowance_used';
}

/* ── The allowance ─────────────────────────────────────────────────────────────────────────────── */

/** The rep's daily allowance of fresh checks from the live limits row (actions.sales_check.per_day),
 *  else the default. A malformed value is the default, never unlimited. */
export function perRepDailyAllowance(limits: unknown): number {
  const v = (limits as { actions?: { sales_check?: { per_day?: unknown } } } | null)?.actions?.sales_check?.per_day;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : SALES_CHECK_DEFAULT_PER_REP_PER_DAY;
}

export interface Allowance { used: number; limit: number; remaining: number }
export function allowance(used: number, limit: number): Allowance {
  const u = Math.max(0, Math.floor(used || 0));
  return { used: u, limit, remaining: Math.max(0, limit - u) };
}

/* ── The batch ─────────────────────────────────────────────────────────────────────────────────── */

export interface ItemCounts { total: number; queued: number; running: number; done: number; reused: number; failed: number; skipped: number }
export function itemCounts(items: ReadonlyArray<{ status: string }>): ItemCounts {
  const c: ItemCounts = { total: items.length, queued: 0, running: 0, done: 0, reused: 0, failed: 0, skipped: 0 };
  for (const it of items) {
    if (it.status === 'queued' || it.status === 'starting') c.queued++;
    else if (it.status === 'running') c.running++;
    else if (it.status === 'done') c.done++;
    else if (it.status === 'reused') c.reused++;
    else if (it.status === 'failed') c.failed++;
    else c.skipped++;
  }
  return c;
}

/** active while anything waits to START; waiting while only started checks are still running;
 *  finished once every item is terminal. Positive matches; an unknown item status keeps it active. */
export function batchStatusFor(items: ReadonlyArray<{ status: string }>): BatchStatus {
  if (items.some((i) => !['running', 'done', 'reused', 'failed', 'skipped'].includes(i.status))) return 'active';
  if (items.some((i) => i.status === 'running')) return 'waiting';
  return 'finished';
}

/** The ready ones, in the order the rep chose them — what "Open the next ready lead" walks. */
export function readyItems<T extends { status: string; position?: number | null }>(items: readonly T[]): T[] {
  return items.filter((i) => i.status === 'done' || i.status === 'reused')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/** "checked today" / "checked yesterday" / "checked 3 days ago" — for a reused result. */
export function checkedAgo(iso: string | null | undefined, nowMs: number): string | null {
  const t = ms(iso);
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((nowMs - t) / DAY_MS);
  if (days <= 0) return 'checked today';
  if (days === 1) return 'checked yesterday';
  return `checked ${days} days ago`;
}

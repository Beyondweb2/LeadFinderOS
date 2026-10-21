/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FIND LEADS: ADD TO CRM IN ONE BATCH (2026-10-17; EVERY BUSINESS IS ADDABLE since 2026-10-19, Paul) — pure.

   Every Find Leads add (the row button, the bulk buttons, the Coverage niche panel) runs ONE path:
     1. a free preview call to coverage_add_leads (_commit=false) says which rows are new — the rest are
        already in the CRM (the database's own dedupe: place id → phone → Maps link, same name in the same
        country, added before, same website, repeated in this batch, and for MY / SG the +60 / +65 phone,
        website and name + town) and are skipped. ⛔ A DUPLICATE IS THE ONLY SKIP.
     2. each NEW lead's phone (+ address, town) is looked up — Google's text search returns no phone — so the
        lead is saved with its number and the phone dedupe can run. PLACE_LOOKUP_CONCURRENCY at a time; a
        throttled lookup (429) waits and retries (LOOKUP_RETRY_DELAYS_MS); an answer is remembered for this
        page session (lookupCache) so a second add never pays for the same place twice. A lookup that still
        fails, or a refusal, does NOT stop the add: that lead is saved without a phone ("No phone").
     3. ONE committing call to coverage_add_leads saves them all (one request, one transaction; more than
        COVERAGE_ADD_MAX_ROWS rows go in chunks of that size).
   ⛔ 16 Oct–19 Oct 2026 this path skipped UK landlines and no-number leads. Paul reversed it (19 Oct): a
      landline is a callable lead. WhatsApp is protected where it SENDS — every queue / send path refuses a
      non-mobile (docs/find-leads-bulk-add.md lists them) — never by keeping the lead out of the CRM.
   ⛔ The database stays the dedupe — nothing here decides a duplicate.
   ⛔ Network injected (deps), so scripts/find-leads-bulk-add.test.ts drives the whole thing with fakes.
   Record: docs/find-leads-bulk-add.md.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { businessKey, isWithoutWebsite } from './websiteStatusClass.ts';
import { salesAddPayload, type PlaceDetailsForAdd, type SearchResultForAdd } from './salesAddPayload.ts';
import { toWhatsAppDigits } from './waNumber.ts';
import { mobileMarketOf } from './outreachMarkets.ts';
import { verifiedInSearchedTown } from './inTown.ts';
import { cleanTypedTown } from './typedTown.ts';
import { isAustralianLead, withAuState } from './australiaTowns.ts';

/** Rows per coverage_add_leads call — the SQL function's own ceiling (v_max). */
export const COVERAGE_ADD_MAX_ROWS = 500;
/** Lookups in flight at once (Paul, 2026-10-19: "cap about 8 to 10"). The server's own guard (guard_action
 *  'place_details', per minute / per hour, protection_settings) is the limit; a throttled call is retried. */
export const PLACE_LOOKUP_CONCURRENCY = 8;
/** Waits before each retry of a throttled lookup. Together they span a full minute, the guard's window. */
export const LOOKUP_RETRY_DELAYS_MS: readonly number[] = [2_000, 5_000, 10_000, 20_000, 30_000];
/** How long a looked-up answer is reused on this page. */
export const LOOKUP_CACHE_MS = 30 * 60_000;

/* ── WHAT KIND OF NUMBER (a label only — never a reason to skip) ─────────────────────────────────────
   'mobile' = a UK / MY / SG mobile by its digits (outreachMarkets.mobileMarketOf, the queue's own test);
   'landline' = any other number; 'no_phone' = none. Shown as a small grey label, never a block. */
export type PhoneKind = 'mobile' | 'landline' | 'no_phone';
export const PHONE_KIND_LABEL: Record<Exclude<PhoneKind, 'mobile'>, string> = { landline: 'Landline', no_phone: 'No phone' };

const UK_COUNTRIES = new Set(['UK', 'GB', 'UNITED KINGDOM', 'GREAT BRITAIN', 'ENGLAND', 'SCOTLAND', 'WALES', 'NORTHERN IRELAND']);
/** A blank country is the column default, UK. */
export function isUkCountry(country: string | null | undefined): boolean {
  const c = String(country ?? '').trim().toUpperCase();
  return !c || UK_COUNTRIES.has(c);
}

/** The WhatsApp digits of a stored phone, with "+44 (0)7…" read as +44 7…. */
function digitsOf(phone: string | null | undefined, country: string | null | undefined): string | null {
  const d = toWhatsAppDigits(phone, isUkCountry(country) ? 'UK' : country);
  if (!d) return null;
  return /^440\d{10}$/.test(d) ? '44' + d.slice(3) : d;
}

/** The kind of a lead's number, for its grey label. */
export function phoneKindOf(phone: string | null | undefined, country: string | null | undefined): PhoneKind {
  const raw = String(phone ?? '').trim();
  if (!raw.replace(/\D/g, '')) return 'no_phone';
  const digits = digitsOf(raw, country);
  return digits && mobileMarketOf(digits) ? 'mobile' : 'landline';
}

/** The grey label for a lead's number, or null for a mobile. */
export function phoneLabelOf(phone: string | null | undefined, country: string | null | undefined): string | null {
  const k = phoneKindOf(phone, country);
  return k === 'mobile' ? null : PHONE_KIND_LABEL[k];
}

/* ── ONE ROW FOR coverage_add_leads ──────────────────────────────────────────────────────────── */

export interface BulkAddLead extends SearchResultForAdd {
  id: string;
  name: string;
  websiteStatus?: string | null;
  searchRunId?: string;
  townCheck?: { inTown: boolean | null } | null;
}

/** The Coverage town saved on the lead (2026-10-20): the town it was searched in, ONLY when search-leads judged it IN
 *  that town (src/lib/inTown.ts). The audit then asks about it with no distance cap. Anything else: null. */
export function coverageTownFor(lead: BulkAddLead, town: string | null, country?: string | null): string | null {
  if (!verifiedInSearchedTown(lead)) return null;
  const t = cleanTypedTown(town).split(',')[0].trim();
  /* ⛔ An Australian Coverage town keeps its STATE ("Ballarat VIC"); a town typed bare takes it from the address. */
  if (t && isAustralianLead(country ?? null, lead.address ?? null)) return withAuState(t, lead.address ?? null) || null;
  return t || null;
}

/** What the search behind a result says: the trade, the town it was searched in, its country. */
export interface AddContext { trade: string | null; town: string | null; country: string }

/** The single add's own payload (salesAddPayload) + the run it came from, keyed by the result's id. */
export function addRowFor(lead: BulkAddLead, ctx: AddContext, details: PlaceDetailsForAdd | null, email: string | null, campaignId: string | null): Record<string, unknown> {
  const p = salesAddPayload({
    lead, details, email, searchKeyword: String(ctx.trade ?? ''), searchLocation: ctx.town,
    country: ctx.country, listType: 'no_website', campaignId,
  });
  const key = businessKey(lead);
  return {
    ...p,
    k: lead.id,
    search_run_id: lead.searchRunId ?? null,
    search_key: key || null,
    without_website: isWithoutWebsite(lead.websiteStatus ?? null),
    coverage_town: coverageTownFor(lead, ctx.town, ctx.country),
  };
}

/* ── THE ANSWER ───────────────────────────────────────────────────────────────────────────────── */

export type AddRowOutcome = 'new' | 'created' | 'skipped' | 'invalid' | 'limit' | 'failed';
export interface AddRowAnswer { k?: string; business_name?: string; outcome: AddRowOutcome; reasons?: string[]; owner_name?: string; lead_id?: string }

/** The reasons a row was not added, grouped the way the summary says them. A duplicate is the only reason the
 *  ADD skips a business; the others are the database refusing a row (no search behind it) or a failed save. */
export type SkipGroup = 'in_crm' | 'no_search' | 'failed';

const IN_CRM = new Set(['already_yours', 'owned_by_other', 'exists_unassigned', 'same_name', 'previously_added', 'same_website', 'duplicate_in_batch', 'duplicate_race']);

export function skipGroupOf(r: AddRowAnswer): SkipGroup | null {
  if (r.outcome === 'created' || r.outcome === 'new') return null;
  const reason = r.reasons?.[0] ?? '';
  if (IN_CRM.has(reason)) return 'in_crm';
  if (r.outcome === 'invalid' && (r.reasons ?? []).some((x) => x === 'no_trade' || x === 'no_town')) return 'no_search';
  if (r.outcome === 'skipped') return 'in_crm';
  return 'failed';
}

export const SKIP_GROUP_WORDS: Record<SkipGroup, string> = {
  in_crm: 'already in CRM',
  no_search: 'no search behind it — run the search again',
  failed: 'could not be saved',
};

export interface AddSummary { added: number; skipped: number; by: Record<SkipGroup, number>; total: number }

export function summariseAdd(rows: readonly AddRowAnswer[]): AddSummary {
  const by: Record<SkipGroup, number> = { in_crm: 0, no_search: 0, failed: 0 };
  let added = 0;
  for (const r of rows) {
    if (r.outcome === 'created') { added++; continue; }
    const g = skipGroupOf(r);
    if (g) by[g]++;
  }
  const skipped = Object.values(by).reduce((a, b) => a + b, 0);
  return { added, skipped, by, total: rows.length };
}

/** "Added 12, skipped 8" + the reasons, biggest first: "8 already in CRM". */
export function addSummaryTitle(s: AddSummary): string {
  return `Added ${s.added}, skipped ${s.skipped}`;
}
export function addSummaryReasons(s: AddSummary): string {
  return (Object.keys(s.by) as SkipGroup[])
    .filter((g) => s.by[g] > 0)
    .sort((a, b) => s.by[b] - s.by[a])
    .map((g) => `${s.by[g]} ${SKIP_GROUP_WORDS[g]}`)
    .join(' · ');
}

/** The sentence for a refusal of the whole call. */
export function addRefusalText(code: string | null | undefined): string {
  switch (code) {
    case 'unknown_campaign': return 'That campaign is not available to you any more. Choose another one.';
    case 'usage_paused': return 'Usage temporarily paused — contact Paul';
    case 'no_rows': return 'Nothing selected to add.';
    default: return 'The add could not be completed. Nothing was added — try again.';
  }
}

/* ── CAN THE PERSON SEE WHAT THEY JUST ADDED? (2026-10-20, fix/sales-leads-view-invoker) ─────────────────────────
   "Added to CRM" was true while every salesperson's Outreach read 0 rows (sales_leads had been switched to the
   caller's rights outside the code). After a save the new leads are read back through the person's OWN source
   (leadSourceFor: sales_leads for a rep, outreach_leads for the admin) and the line says what is really there.
   null = the read-back did not answer: nothing is claimed either way. */
export interface AddVisibility { visible: number; queued: number }

/** The person's own read of just-created leads: how many came back, how many of those are queued. */
export function visibilityOf(rows: readonly { status?: string | null; sms_queued_at?: string | null }[]): AddVisibility {
  return { visible: rows.length, queued: rows.filter((r) => r.status === 'queued' || !!r.sms_queued_at).length };
}

/** "21 added to CRM, 0 visible in your Outreach: tell Paul (lead access problem)" · "21 added to CRM, 0 queued: you
 *  haven't queued them yet" · "21 added to CRM, 5 queued". null when nothing was added or the read-back failed. */
export function addVisibilityLine(added: number, v: AddVisibility | null | undefined): string | null {
  if (added <= 0 || !v) return null;
  if (v.visible < added) return `${added} added to CRM, ${v.visible} visible in your Outreach: tell Paul (lead access problem)`;
  return v.queued > 0 ? `${added} added to CRM, ${v.queued} queued` : `${added} added to CRM, 0 queued: you haven't queued them yet`;
}

export const isAccessProblem = (added: number, v: AddVisibility | null | undefined): boolean => !!v && added > 0 && v.visible < added;

/* ── THE PROGRESS LINE ("Adding 23 of 40") ──────────────────────────────────────────────────────── */

export interface AddProgress { phase: 'checking' | 'lookups' | 'saving' | 'done'; done: number; total: number }
export function addProgressText(p: AddProgress | null | undefined): string | null {
  if (!p) return null;
  if (p.phase === 'checking') return `Checking ${p.total}…`;
  if (p.phase === 'saving') return `Saving ${p.total}…`;
  return `Adding ${Math.min(p.done, p.total)} of ${p.total}`;
}

/* ── THE ADD, START TO FINISH ──────────────────────────────────────────────────────────────────── */

export type LookupAnswer = (PlaceDetailsForAdd & { email?: string | null }) | null;
/** A lookup's answer: the details; null = failed (saved without them); { throttled } = 429, wait and retry;
 *  { limit } = a refusal no retry will change (suspended, paused, not allowed) — no further lookups are made. */
export type LookupResult = LookupAnswer | { throttled: true } | { limit: true };
export interface BulkAddDeps {
  /** coverage_add_leads. Returns the function's JSON (or { ok:false, error }). */
  addLeads: (rows: Record<string, unknown>[], campaignId: string | null, commit: boolean) => Promise<{ ok?: boolean; error?: string; rows?: AddRowAnswer[] }>;
  /** google-place-details for one place id. */
  lookup: (placeId: string) => Promise<LookupResult>;
  onProgress?: (p: AddProgress) => void;
  /** Injected so the tests do not wait real seconds. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface BulkAddResult {
  ok: true; summary: AddSummary; rows: AddRowAnswer[]; saveCalls: number;
  /** Lookups actually made / answered from this page's cache / saved without a lookup answer. */
  lookups: { made: number; cached: number; withoutAnswer: number; retries: number };
  /** Filled by the hook after the save: the person's own read-back of the created leads (null = it did not answer). */
  visibility?: AddVisibility | null;
}
export type BulkAddOutcome = BulkAddResult | { ok: false; message: string };

/* ── THE LOOKUP CACHE (this page session) ─────────────────────────────────────────────────────────
   Only real answers are kept, never a failure, for LOOKUP_CACHE_MS. A preview-then-add, a retry after a failed
   save, or the same business on two many-towns searches costs one lookup, not several. */
const lookupCache = new Map<string, { at: number; d: NonNullable<LookupAnswer> }>();
export function clearLookupCache(): void { lookupCache.clear(); }

function chunks<T>(a: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

const isThrottled = (d: LookupResult): d is { throttled: true } => !!d && typeof d === 'object' && 'throttled' in d;
const isLimit = (d: LookupResult): d is { limit: true } => !!d && typeof d === 'object' && 'limit' in d;

export async function runFindLeadsBulkAdd(
  leads: readonly BulkAddLead[],
  ctxOf: (lead: BulkAddLead) => AddContext,
  emailOf: (lead: BulkAddLead) => string | null,
  campaignId: string | null,
  deps: BulkAddDeps,
): Promise<BulkAddOutcome> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  // A business on screen twice (many towns) is one row.
  const seen = new Set<string>();
  const rows = leads.filter((l) => (seen.has(l.id) ? false : (seen.add(l.id), true)));
  if (rows.length === 0) return { ok: false, message: addRefusalText('no_rows') };
  const total = rows.length;

  // 1. The free preview: which are new. A duplicate is the only skip.
  deps.onProgress?.({ phase: 'checking', done: 0, total });
  const preRows: AddRowAnswer[] = [];
  for (const part of chunks(rows, COVERAGE_ADD_MAX_ROWS)) {
    let pre: Awaited<ReturnType<BulkAddDeps['addLeads']>>;
    try { pre = await deps.addLeads(part.map((l) => addRowFor(l, ctxOf(l), null, emailOf(l), campaignId)), campaignId, false); } catch { pre = { ok: false }; }
    if (!pre?.ok) return { ok: false, message: addRefusalText(pre?.error) };
    preRows.push(...(pre.rows ?? []));
  }
  const isNew = new Set(preRows.filter((r) => r.outcome === 'new' && r.k).map((r) => r.k as string));
  const fresh = rows.filter((l) => isNew.has(l.id));

  // 2. The lookups: PLACE_LOOKUP_CONCURRENCY at a time, cached, a throttled one retried.
  const needsLookup = (l: BulkAddLead) => !String(l.phone ?? '').trim() || !String(l.address ?? '').trim();
  const details = new Map<string, LookupAnswer>();
  const stats = { made: 0, cached: 0, withoutAnswer: 0, retries: 0 };
  let done = total - fresh.length;          // duplicates are done
  const tick = () => deps.onProgress?.({ phase: 'lookups', done, total });
  for (const l of fresh) {
    if (!needsLookup(l)) { done++; continue; }
    const c = lookupCache.get(l.id);
    if (c && now() - c.at < LOOKUP_CACHE_MS) { details.set(l.id, c.d); stats.cached++; done++; }
  }
  tick();
  const toLookUp = fresh.filter((l) => needsLookup(l) && !details.has(l.id));
  let refused = false;
  let idx = 0;
  const worker = async () => {
    for (;;) {
      const i = idx++;
      if (i >= toLookUp.length) return;
      const l = toLookUp[i];
      let d: LookupResult = null;
      if (!refused) {
        for (let attempt = 0; ; attempt++) {
          try { d = await deps.lookup(l.id); } catch { d = null; }
          stats.made++;
          if (!isThrottled(d)) break;
          if (attempt >= LOOKUP_RETRY_DELAYS_MS.length) { d = null; break; }
          stats.retries++;
          await sleep(LOOKUP_RETRY_DELAYS_MS[attempt]);
        }
        if (isLimit(d)) { refused = true; d = null; }
      }
      const answer = (d && !isThrottled(d) && !isLimit(d)) ? d : null;
      if (answer) lookupCache.set(l.id, { at: now(), d: answer }); else stats.withoutAnswer++;
      details.set(l.id, answer);
      done++;
      tick();
    }
  };
  await Promise.all(Array.from({ length: Math.min(PLACE_LOOKUP_CONCURRENCY, Math.max(1, toLookUp.length)) }, worker));

  // 3. Every new business is saved — with its looked-up number, or without one ("No phone").
  const toSave = fresh.map((l) => {
    const d = needsLookup(l) ? details.get(l.id) ?? null : null;
    const email = String(d?.email ?? '').trim() || emailOf(l);
    return addRowFor(l, ctxOf(l), d, email, campaignId);
  });

  // 4. ONE committing call (per COVERAGE_ADD_MAX_ROWS rows).
  let out: AddRowAnswer[] = preRows.filter((r) => r.outcome !== 'new');
  let saveCalls = 0;
  if (toSave.length > 0) {
    deps.onProgress?.({ phase: 'saving', done, total: toSave.length });
    for (const part of chunks(toSave, COVERAGE_ADD_MAX_ROWS)) {
      let a: Awaited<ReturnType<BulkAddDeps['addLeads']>>;
      try { a = await deps.addLeads(part, campaignId, true); } catch { a = { ok: false }; }
      saveCalls++;
      if (!a?.ok) {
        if (saveCalls === 1) return { ok: false, message: addRefusalText(a?.error) };
        out = [...out, ...part.map((r) => ({ k: String(r.k), business_name: String(r.business_name ?? ''), outcome: 'failed' as const, reasons: ['write_failed'] }))];
        continue;
      }
      out = [...out, ...(a.rows ?? [])];
    }
  }
  deps.onProgress?.({ phase: 'done', done: total, total });
  return { ok: true, summary: summariseAdd(out), rows: out, saveCalls, lookups: stats };
}

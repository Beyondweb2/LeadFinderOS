/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FIND LEADS: ADD TO CRM IN ONE BATCH, MOBILES ONLY FOR THE UK (2026-10-17, Paul) — the rules, pure.

   Before: "Add to CRM (N)" ran one add per lead, one after another (N inserts, N duplicate checks), and the
   phone was looked up AFTER the insert, so a landline was only discovered once it was already in the CRM.
   Now every Find Leads add (the row button and the bulk buttons) runs ONE path:
     1. a free preview call to coverage_add_leads (_commit=false) says which rows are new — the rest are
        already in the CRM (the database's own dedupe: place id → phone → Maps link, same name in the same
        country, added before, same website, repeated in this batch) and are skipped;
     2. each NEW lead's phone (+ address, town) is looked up first — Google's text search returns no phone,
        so this is the only way to know a landline before it is added — paced under google-place-details'
        own per-minute limit; a LIMIT refusal stops the lookups and those rows are reported, never added blind;
     3. the phone rule below drops landlines and leads with no number;
     4. ONE committing call to coverage_add_leads saves the rest (one request, one transaction; more than
        COVERAGE_ADD_MAX_ROWS rows go in chunks of that size).
   ⛔ The database stays the dedupe — nothing here decides a duplicate.
   ⛔ Network injected (deps), so scripts/find-leads-bulk-add.test.ts drives the whole thing with fakes.
   Record: docs/find-leads-bulk-add.md.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { businessKey, isWithoutWebsite } from './websiteStatusClass.ts';
import { salesAddPayload, type PlaceDetailsForAdd, type SearchResultForAdd } from './salesAddPayload.ts';
import { toWhatsAppDigits } from './waNumber.ts';
import { isUkColdDestination } from './ukColdDestination.ts';

/** Rows per coverage_add_leads call — the SQL function's own ceiling (v_max). */
export const COVERAGE_ADD_MAX_ROWS = 500;
/** Lookups started per minute. google-place-details allows 30 a minute per person; staying under it means the
 *  add never trips the limit it would then have to wait out. */
export const PLACE_LOOKUPS_PER_MINUTE = 25;
/** Lookups in flight at once. */
export const PLACE_LOOKUP_CONCURRENCY = 3;

/* ── THE PHONE RULE ───────────────────────────────────────────────────────────────────────────────
   ⛔ UK: ONLY A MOBILE IS ADDED. A UK number is decided by its DIGITS (the same 44-then-7 test the cold
   WhatsApp queue uses, ukColdDestination.ts) — never by the search's country alone. Every other UK number is
   skipped as a landline: 01 / 02 / 03 (incl. 0333) / 0808 and every other non-07 number (0800, 0845, 05…).
   A UK lead (or a lead whose country is unknown — the column default is UK) with no number is skipped.
   ⛔ NON-UK (Malaysia, Singapore, Australia…): UNCHANGED. A phone of that country's own is added as before;
   with no phone, the old rule — kept if it has an email, else skipped as "no number". */

export type PhoneSkip = 'landline' | 'no_number' | null;

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

/** Why a Find Leads result may not be added for its number, or null when its number is fine. */
export function findLeadsPhoneSkip(phone: string | null | undefined, country: string | null | undefined, email?: string | null): PhoneSkip {
  const raw = String(phone ?? '').trim();
  const digits = digitsOf(raw, country);
  if (digits && digits.startsWith('44')) return isUkColdDestination(digits) ? null : 'landline';
  if (isUkCountry(country)) {
    // A UK lead whose number is not a +44 number at all: a foreign number is that country's business (unchanged);
    // nothing usable is "no number".
    if (digits) return null;
    return 'no_number';
  }
  if (raw) return null;
  return String(email ?? '').trim() ? null : 'no_number';
}

/* ── ONE ROW FOR coverage_add_leads ──────────────────────────────────────────────────────────── */

export interface BulkAddLead extends SearchResultForAdd {
  id: string;
  name: string;
  websiteStatus?: string | null;
  searchRunId?: string;
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
  };
}

/* ── THE ANSWER ───────────────────────────────────────────────────────────────────────────────── */

export type AddRowOutcome = 'new' | 'created' | 'skipped' | 'invalid' | 'limit' | 'failed';
export interface AddRowAnswer { k?: string; business_name?: string; outcome: AddRowOutcome; reasons?: string[]; owner_name?: string; lead_id?: string }

/** The reasons a row was not added, grouped the way the summary says them. */
export type SkipGroup = 'in_crm' | 'landline' | 'no_number' | 'lookup_failed' | 'limit' | 'no_search' | 'failed';

const IN_CRM = new Set(['already_yours', 'owned_by_other', 'exists_unassigned', 'same_name', 'previously_added', 'same_website', 'duplicate_in_batch', 'duplicate_race']);

export function skipGroupOf(r: AddRowAnswer): SkipGroup | null {
  if (r.outcome === 'created' || r.outcome === 'new') return null;
  const reason = r.reasons?.[0] ?? '';
  if (r.outcome === 'limit') return 'limit';
  if (reason === 'landline') return 'landline';
  if (reason === 'no_number') return 'no_number';
  if (reason === 'lookup_failed') return 'lookup_failed';
  if (IN_CRM.has(reason)) return 'in_crm';
  if (r.outcome === 'invalid' && (r.reasons ?? []).some((x) => x === 'no_trade' || x === 'no_town')) return 'no_search';
  if (r.outcome === 'skipped') return 'in_crm';
  return 'failed';
}

export const SKIP_GROUP_WORDS: Record<SkipGroup, string> = {
  in_crm: 'already in CRM',
  landline: 'landline',
  no_number: 'no number',
  lookup_failed: 'number could not be looked up — try again',
  limit: 'limit reached — try again later',
  no_search: 'no search behind it — run the search again',
  failed: 'could not be saved',
};

export interface AddSummary { added: number; skipped: number; by: Record<SkipGroup, number>; total: number }

export function summariseAdd(rows: readonly AddRowAnswer[]): AddSummary {
  const by: Record<SkipGroup, number> = { in_crm: 0, landline: 0, no_number: 0, lookup_failed: 0, limit: 0, no_search: 0, failed: 0 };
  let added = 0;
  for (const r of rows) {
    if (r.outcome === 'created') { added++; continue; }
    const g = skipGroupOf(r);
    if (g) by[g]++;
  }
  const skipped = Object.values(by).reduce((a, b) => a + b, 0);
  return { added, skipped, by, total: rows.length };
}

/** "Added 12, skipped 8" + the reasons, biggest first: "5 already in CRM · 2 landline · 1 no number". */
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

/* ── THE ADD, START TO FINISH ──────────────────────────────────────────────────────────────────── */

export type LookupAnswer = (PlaceDetailsForAdd & { email?: string | null }) | null;
export interface BulkAddDeps {
  /** coverage_add_leads. Returns the function's JSON (or { ok:false, error }). */
  addLeads: (rows: Record<string, unknown>[], campaignId: string | null, commit: boolean) => Promise<{ ok?: boolean; error?: string; rows?: AddRowAnswer[] }>;
  /** google-place-details for one place id: the details, null for a failed lookup, or { limit: true } when a limit refused it. */
  lookup: (placeId: string) => Promise<LookupAnswer | { limit: true }>;
  onProgress?: (p: { phase: 'checking' | 'lookups' | 'saving'; done: number; total: number }) => void;
  /** Injected so the tests do not wait real minutes. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface BulkAddResult { ok: true; summary: AddSummary; rows: AddRowAnswer[]; saveCalls: number }
export type BulkAddOutcome = BulkAddResult | { ok: false; message: string };

function chunks<T>(a: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

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

  // 1. The free preview: which are new.
  deps.onProgress?.({ phase: 'checking', done: 0, total: rows.length });
  const preRows: AddRowAnswer[] = [];
  for (const part of chunks(rows, COVERAGE_ADD_MAX_ROWS)) {
    let pre: Awaited<ReturnType<BulkAddDeps['addLeads']>>;
    try { pre = await deps.addLeads(part.map((l) => addRowFor(l, ctxOf(l), null, emailOf(l), campaignId)), campaignId, false); } catch { pre = { ok: false }; }
    if (!pre?.ok) return { ok: false, message: addRefusalText(pre?.error) };
    preRows.push(...(pre.rows ?? []));
  }
  const isNew = new Set(preRows.filter((r) => r.outcome === 'new' && r.k).map((r) => r.k as string));
  const fresh = rows.filter((l) => isNew.has(l.id));

  // 2. The lookups, paced.
  const details = new Map<string, LookupAnswer>();
  let limited = false;
  let done = 0;
  let idx = 0;
  const started: number[] = [];
  const needsLookup = (l: BulkAddLead) => !String(l.phone ?? '').trim() || !String(l.address ?? '').trim();
  const toLookUp = fresh.filter(needsLookup);
  deps.onProgress?.({ phase: 'lookups', done, total: toLookUp.length });
  const worker = async () => {
    for (;;) {
      if (limited) return;
      const i = idx++;
      if (i >= toLookUp.length) return;
      while (started.length && now() - started[0] >= 60_000) started.shift();
      if (started.length >= PLACE_LOOKUPS_PER_MINUTE) {
        await sleep(Math.max(0, 60_000 - (now() - started[0])) + 250);
        while (started.length && now() - started[0] >= 60_000) started.shift();
      }
      if (limited) return;
      started.push(now());
      const l = toLookUp[i];
      let d: LookupAnswer | { limit: true };
      try { d = await deps.lookup(l.id); } catch { d = null; }
      if (d && 'limit' in d) { limited = true; return; }
      details.set(l.id, d as LookupAnswer);
      done++;
      deps.onProgress?.({ phase: 'lookups', done, total: toLookUp.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PLACE_LOOKUP_CONCURRENCY, Math.max(1, toLookUp.length)) }, worker));

  // 3. The phone rule.
  const toSave: Record<string, unknown>[] = [];
  const notAdded: AddRowAnswer[] = [];
  for (const l of fresh) {
    const looked = needsLookup(l);
    if (looked && !details.has(l.id)) {
      notAdded.push({ k: l.id, business_name: l.name, outcome: 'limit', reasons: ['limit'] });
      continue;
    }
    const d = looked ? details.get(l.id) ?? null : null;
    const ctx = ctxOf(l);
    const email = String(d?.email ?? '').trim() || emailOf(l);
    const phone = String(l.phone ?? '').trim() || String(d?.phone ?? '').trim();
    const row = addRowFor(l, ctx, d, email, campaignId);
    const country = String(row.country ?? ctx.country ?? '');
    const skip = findLeadsPhoneSkip(phone, country, email);
    if (skip) {
      // A failed lookup on a lead with no number is not "no number" — we never got to see one.
      const reason = skip === 'no_number' && looked && !d ? 'lookup_failed' : skip;
      notAdded.push({ k: l.id, business_name: l.name, outcome: 'skipped', reasons: [reason] });
      continue;
    }
    toSave.push(row);
  }

  // 4. ONE committing call (per COVERAGE_ADD_MAX_ROWS rows).
  let out: AddRowAnswer[] = preRows.filter((r) => r.outcome !== 'new');
  let saveCalls = 0;
  if (toSave.length > 0) {
    deps.onProgress?.({ phase: 'saving', done: 0, total: toSave.length });
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
  const all = [...out, ...notAdded];
  return { ok: true, summary: summariseAdd(all), rows: all, saveCalls };
}

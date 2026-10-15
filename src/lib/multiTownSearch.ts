/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COVERAGE: FIND LEADS IN MANY TOWNS AT ONCE, ADD THEM IN ONE GO (2026-10-15, Paul) — the rules, pure.

   React-free and import-light so the node tests read exactly what the page runs. The page's hook
   (src/hooks/useMultiTownLeads.ts) only supplies the network; every decision is here:
     · which selected towns are searched now (MULTI_TOWN_MAX_TOWNS per press, the rest stay selected);
     · the price line (admin only — a salesperson never sees a cost) and how long the add's lookups take;
     · ONE merged list with a Town column, de-duplicated across towns, with the count removed;
     · which refusals are a LIMIT (stop starting towns, say so plainly, keep what was found) and which are
       a one-town failure (that town failed, the others carry on);
     · the rows sent to coverage_add_leads (built by salesAddPayload, the single add's own builder) and
       the words for its answer.
   ⛔ Each town is ONE ordinary search-leads call with townOnly — the same search a Coverage row's
      "Find leads" runs — so every server cap (the usage guard, the per-minute limiter, the spend caps)
      applies to each town exactly as before. townOnly always takes the Google path, never Apify, so this
      spends nothing from the Apify cap or its 85% reserve.
   Record: docs/coverage-multi-town.md.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { MARKET_SEARCH_USD, USD_TO_GBP_DISPLAY } from './marketView.ts';
import { GOOGLE_SKUS } from './apiCostAccounting.ts';
import { businessKey, isWithoutWebsite } from './websiteStatusClass.ts';
import { salesAddPayload, type PlaceDetailsForAdd } from './salesAddPayload.ts';

/** Towns searched per press. Change it here only — the page, the estimate and the tests read it. */
export const MULTI_TOWN_MAX_TOWNS = 10;
/** Towns searched at the same time (search-leads allows 10 searches a minute per person). */
export const MULTI_TOWN_CONCURRENCY = 2;
/** Rows per page of the merged results. */
export const MULTI_TOWN_PAGE_SIZE = 25;
/** Rows per coverage_add_leads call — the SQL function's own ceiling (v_max). */
export const COVERAGE_ADD_MAX_ROWS = 500;
/** Phone / town lookups started per minute while adding. google-place-details allows 30 a minute per person;
 *  staying under it means the add never trips the limit it would then have to wait out. */
export const PLACE_LOOKUPS_PER_MINUTE = 25;
/** Lookups in flight at once. */
export const PLACE_LOOKUP_CONCURRENCY = 3;
/** One Place Details lookup (the add looks up each new lead's phone and town): Place Details Enterprise. */
export const PLACE_DETAILS_USD = GOOGLE_SKUS.place_details_enterprise.usdPer1000 / 1000;

/* ── WHICH TOWNS ──────────────────────────────────────────────────────────────────────────────── */

/** The first MULTI_TOWN_MAX_TOWNS of the selection (in the list's own order) are searched now; the rest wait. */
export function townsToSearch<T>(selected: readonly T[], max = MULTI_TOWN_MAX_TOWNS): { run: T[]; later: T[] } {
  const cap = Math.max(1, Math.floor(max));
  return { run: selected.slice(0, cap), later: selected.slice(cap) };
}

/* ── THE PRICE LINE ───────────────────────────────────────────────────────────────────────────── */

export function gbpLabel(usd: number): string {
  const gbp = Math.max(0, usd) * USD_TO_GBP_DISPLAY;
  return gbp < 0.01 ? 'under 1p' : gbp < 1 ? `${Math.round(gbp * 100)}p` : `£${gbp.toFixed(2)}`;
}

/** What a search of `towns` towns may cost (MARKET_SEARCH_USD is a typical town search; a town searched in the
 *  last 72 hours is served from the cache and costs nothing). */
export function estimateMultiTownSearch(towns: number): { towns: number; usd: number; label: string } {
  const n = Math.max(0, Math.floor(towns));
  const usd = n * MARKET_SEARCH_USD;
  return { towns: n, usd, label: `about ${gbpLabel(usd)}` };
}

/** The sentence above the Find leads button. ⛔ A salesperson never sees a cost (CLAUDE.md §0). */
export function searchEstimateSentence(a: { selected: number; isAdmin: boolean }): string {
  const { run, later } = townsToSearch(Array.from({ length: Math.max(0, a.selected) }, (_, i) => i));
  const towns = `${run.length} town${run.length === 1 ? '' : 's'}`;
  const waiting = later.length > 0
    ? ` Up to ${MULTI_TOWN_MAX_TOWNS} towns per search: the other ${later.length} stay selected for the next one.`
    : '';
  if (!a.isAdmin) return `Searches ${towns}.${waiting}`;
  return `Searches ${towns} on Google Maps — ${estimateMultiTownSearch(run.length).label} (a town searched in the last 3 days is free; no Apify).${waiting}`;
}

/** The add looks up each NEW lead's phone and town first (as a single add does), paced under the lookup limit. */
export function addLookupEstimate(newLeads: number): { usd: number; minutes: number; label: string } {
  const n = Math.max(0, Math.floor(newLeads));
  const usd = n * PLACE_DETAILS_USD;
  const minutes = Math.max(1, Math.ceil(n / PLACE_LOOKUPS_PER_MINUTE));
  return { usd, minutes, label: n === 0 ? 'nothing to look up' : `about ${minutes} minute${minutes === 1 ? '' : 's'}` };
}

/* ── ONE MERGED LIST ──────────────────────────────────────────────────────────────────────────── */

/** The minimum a search result carries (search-leads' Lead). */
export interface ResultLead {
  id: string;
  name: string;
  googleMapsUrl: string;
  websiteUrl?: string;
  websiteStatus: string;
  phone?: string;
  address?: string;
  category?: string;
  rating?: number;
  reviewCount?: number;
  outsideTown?: boolean;
  searchRunId?: string;
}

/** One town's answer. `location` is the exact text searched (stored as the lead's search_location). */
export interface TownResult<L extends ResultLead = ResultLead> {
  town: string;
  location: string;
  /** The country Google resolved the search to, else the Coverage country. */
  country: string;
  leads: L[];
}

export type MergedLead<L extends ResultLead = ResultLead> = L & {
  /** Stable row key in the merged list. */
  rowKey: string;
  town: string;
  searchLocation: string;
  country: string;
  /** Other selected towns that also returned this business (removed as duplicates). */
  alsoIn: string[];
};

const normName = (s: string | null | undefined) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const digits = (s: string | null | undefined) => String(s ?? '').replace(/\D+/g, '');
/** A website's identity for the same-business test: host, lower case, no www. */
export function siteIdentity(url: string | null | undefined): string {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Every key that says "this is the same business": the place id, the Maps link, the name with the phone,
 *  the name with the website. Two results sharing ANY key are one business. */
export function sameBusinessKeys(l: ResultLead): string[] {
  const keys: string[] = [];
  if (l.id) keys.push(`p:${l.id}`);
  if (l.googleMapsUrl) keys.push(`m:${l.googleMapsUrl}`);
  const n = normName(l.name);
  const ph = digits(l.phone);
  if (n && ph.length >= 7) keys.push(`np:${n}|${ph}`);
  const site = siteIdentity(l.websiteUrl);
  if (n && site) keys.push(`nw:${n}|${site}`);
  return keys;
}

/** The merged list: every town's results in town order, a business found in more than one town kept ONCE
 *  (under the first town that found it, the others listed in `alsoIn`). `removed` = how many rows that dropped. */
export function mergeTownResults<L extends ResultLead>(towns: readonly TownResult<L>[]): { rows: MergedLead<L>[]; removed: number } {
  const rows: MergedLead<L>[] = [];
  const byKey = new Map<string, MergedLead<L>>();
  let removed = 0;
  for (const t of towns) {
    for (const lead of t.leads) {
      const keys = sameBusinessKeys(lead);
      const first = keys.map((k) => byKey.get(k)).find(Boolean);
      if (first) {
        removed++;
        if (first.town !== t.town && !first.alsoIn.includes(t.town)) first.alsoIn.push(t.town);
        for (const k of keys) if (!byKey.has(k)) byKey.set(k, first);
        continue;
      }
      const row: MergedLead<L> = {
        ...lead,
        rowKey: keys[0] ?? `${t.town}#${rows.length}`,
        town: t.town,
        searchLocation: t.location,
        country: t.country,
        alsoIn: [],
      };
      rows.push(row);
      for (const k of keys) byKey.set(k, row);
    }
  }
  return { rows, removed };
}

/* ── SELECTION ────────────────────────────────────────────────────────────────────────────────── */

export function pageCount(total: number, size = MULTI_TOWN_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}
export function pageRows<T>(rows: readonly T[], page: number, size = MULTI_TOWN_PAGE_SIZE): T[] {
  const p = Math.min(Math.max(0, page), pageCount(rows.length, size) - 1);
  return rows.slice(p * size, p * size + size);
}
/** Tick (or untick) every row on THIS page only; rows on other pages keep their state. */
export function selectPage(selected: ReadonlySet<string>, page: readonly { rowKey: string }[], on: boolean): Set<string> {
  const next = new Set(selected);
  for (const r of page) { if (on) next.add(r.rowKey); else next.delete(r.rowKey); }
  return next;
}
/** "Select all results" — a separate, deliberate choice: every row on every page. */
export function selectAllResults(rows: readonly { rowKey: string }[]): Set<string> {
  return new Set(rows.map((r) => r.rowKey));
}

/* ── LIMITS VS FAILURES ───────────────────────────────────────────────────────────────────────── */

/** A refusal that means "you have hit a limit" (stop starting towns), not "this town broke". The usage guard
 *  answers 429 (rate / spend) or 403 with usage_paused / not_ready_to_sell; search-leads' own limiter answers 429. */
export function isLimitRefusal(e: { status?: number | null; code?: string | null } | null | undefined): boolean {
  if (!e) return false;
  if (e.status === 429) return true;
  return e.code === 'usage_paused' || e.code === 'all_stop' || e.code === 'not_ready_to_sell';
}

export type TownStatus =
  | { kind: 'waiting' }
  | { kind: 'searching' }
  | { kind: 'done'; found: number }
  | { kind: 'failed'; message: string }
  | { kind: 'not_searched'; message: string };

export type TownSearchOutcome<L extends ResultLead = ResultLead> =
  | { ok: true; result: TownResult<L> }
  | { ok: false; limit: boolean; message: string };

/**
 * Search the towns, MULTI_TOWN_CONCURRENCY at a time, reporting each town as it changes (results appear as
 * towns finish). The first LIMIT refusal stops new towns from starting: they are reported `not_searched` with
 * the limit's own words, and everything already found is kept. A one-town failure never stops the others.
 */
export async function runTownSearches<T extends { town: string }, L extends ResultLead>(
  towns: readonly T[],
  search: (t: T) => Promise<TownSearchOutcome<L>>,
  opts: { concurrency?: number; onStatus: (town: string, s: TownStatus, result?: TownResult<L>) => void; isStopped?: () => boolean },
): Promise<{ results: TownResult<L>[]; searched: number; failed: number; notSearched: number; limitMessage: string | null }> {
  const results: (TownResult<L> | undefined)[] = new Array(towns.length).fill(undefined);
  const final: ('done' | 'failed' | 'not_searched' | undefined)[] = new Array(towns.length).fill(undefined);
  let next = 0;
  let limitMessage: string | null = null;
  for (const t of towns) opts.onStatus(t.town, { kind: 'waiting' });
  const worker = async () => {
    for (;;) {
      if (limitMessage !== null || opts.isStopped?.()) return;
      const idx = next++;
      if (idx >= towns.length) return;
      const t = towns[idx];
      opts.onStatus(t.town, { kind: 'searching' });
      let out: TownSearchOutcome<L>;
      try {
        out = await search(t);
      } catch (e) {
        out = { ok: false, limit: false, message: e instanceof Error ? e.message : 'Search failed' };
      }
      const bad = out as Extract<TownSearchOutcome<L>, { ok: false }>;
      if (out.ok === true) {
        results[idx] = out.result;
        final[idx] = 'done';
        opts.onStatus(t.town, { kind: 'done', found: out.result.leads.length }, out.result);
      } else if (bad.limit) {
        if (limitMessage === null) limitMessage = bad.message;
        final[idx] = 'not_searched';
        opts.onStatus(t.town, { kind: 'not_searched', message: bad.message });
      } else {
        final[idx] = 'failed';
        opts.onStatus(t.town, { kind: 'failed', message: bad.message });
      }
    }
  };
  const n = Math.max(1, Math.min(opts.concurrency ?? MULTI_TOWN_CONCURRENCY, towns.length || 1));
  await Promise.all(Array.from({ length: n }, worker));
  // Every town that never started is reported once, with the limit's words (or "stopped").
  const reason = limitMessage ?? 'Stopped before this town was searched.';
  towns.forEach((t, i) => {
    if (final[i] === undefined) { final[i] = 'not_searched'; opts.onStatus(t.town, { kind: 'not_searched', message: reason }); }
  });
  return {
    results: results.filter((r): r is TownResult<L> => !!r),
    searched: final.filter((s) => s === 'done').length,
    failed: final.filter((s) => s === 'failed').length,
    notSearched: final.filter((s) => s === 'not_searched').length,
    limitMessage,
  };
}

/** The one line under the results when a limit stopped the search. Plain words, no machine token. */
export function limitSummary(a: { searched: number; total: number; notSearched: number; message: string }): string {
  return `Searched ${a.searched} of ${a.total} town${a.total === 1 ? '' : 's'}. The other ${a.notSearched} ${a.notSearched === 1 ? 'was' : 'were'} not searched: ${a.message.replace(/\.$/, '')}. They stay selected — press Find leads again later to search them.`;
}

/* ── THE BULK ADD ─────────────────────────────────────────────────────────────────────────────── */

/** One row for coverage_add_leads: the single add's own payload (salesAddPayload) + the run it came from. */
export function addRowFor(lead: MergedLead, trade: string, details: PlaceDetailsForAdd | null): Record<string, unknown> {
  const p = salesAddPayload({
    lead, details, email: null, searchKeyword: trade, searchLocation: lead.searchLocation,
    country: lead.country, listType: 'no_website', campaignId: null,
  });
  const key = businessKey(lead);
  return {
    ...p,
    k: lead.rowKey,
    search_run_id: lead.searchRunId ?? null,
    search_key: key || null,
    without_website: isWithoutWebsite(lead.websiteStatus),
  };
}

/** The single add's no-contact rule: a lookup that ANSWERED with neither a phone nor an email is not added.
 *  A lookup that failed never blocks the add (the lead keeps what the search returned). */
export function noContactAfterLookup(lead: { phone?: string | null }, details: (PlaceDetailsForAdd & { email?: string | null }) | null): boolean {
  if (!details) return false;
  const phone = String(details.phone ?? lead.phone ?? '').trim();
  const email = String(details.email ?? '').trim();
  return !phone && !email;
}

export type AddRowOutcome = 'new' | 'created' | 'skipped' | 'invalid' | 'limit' | 'failed';
export interface AddRowAnswer { k?: string; business_name?: string; outcome: AddRowOutcome; reasons?: string[]; owner_name?: string; lead_id?: string }

/** Words for one row's reason. A salesperson is never told whose lead it is (the server never says). */
export const ADD_REASON_WORDS: Record<string, string> = {
  already_yours: 'already one of your leads',
  owned_by_other: 'already in the CRM (another person’s lead)',
  exists_unassigned: 'already in the CRM (unassigned)',
  same_name: 'a lead with the same name is already in the CRM',
  previously_added: 'added before',
  same_website: 'a lead with the same website is already in the CRM (add a separate branch from Find Leads)',
  duplicate_in_batch: 'the same business appears twice in this add',
  no_contact: 'no phone or email found',
  limit: 'the add limit was reached — try the rest later',
  stopped: 'stopped before it was looked up',
  duplicate_race: 'added by someone else at the same moment',
  refused: 'refused by the server',
  write_failed: 'could not be saved',
  no_trade: 'no trade',
  no_town: 'no town',
};

export interface AddSummary { added: number; skippedDuplicate: number; noContact: number; limit: number; failed: number; invalid: number }

/** The result summary: added, skipped as duplicate, not added for no contact, stopped by a limit, failed. */
export function summariseAdd(rows: readonly AddRowAnswer[], extra: { noContact: number; limit: number; stopped: number }): AddSummary {
  const c = (o: AddRowOutcome) => rows.filter((r) => r.outcome === o).length;
  return {
    added: c('created'),
    skippedDuplicate: c('skipped'),
    noContact: extra.noContact,
    limit: c('limit') + extra.limit + extra.stopped,
    failed: c('failed'),
    invalid: c('invalid'),
  };
}

export function addSummarySentence(s: AddSummary): string {
  const parts = [`${s.added} added`];
  if (s.skippedDuplicate) parts.push(`${s.skippedDuplicate} skipped (already in the CRM)`);
  if (s.noContact) parts.push(`${s.noContact} not added (no phone or email)`);
  if (s.limit) parts.push(`${s.limit} not added yet (limit reached — try again later)`);
  if (s.failed) parts.push(`${s.failed} failed`);
  if (s.invalid) parts.push(`${s.invalid} could not be read`);
  return parts.join(' · ');
}

/** The sentence for a refusal of the whole call. */
export function addRefusalText(code: string | null | undefined): string {
  switch (code) {
    case 'unknown_campaign': return 'That campaign is not available to you any more. Choose another one.';
    case 'too_many_rows': return `Up to ${COVERAGE_ADD_MAX_ROWS} leads can be added at once. Select fewer.`;
    case 'usage_paused': return 'Usage temporarily paused — contact Paul';
    case 'no_rows': return 'Nothing selected to add.';
    default: return 'The add could not be completed. Nothing was added — try again.';
  }
}

/* ── THE ADD, START TO FINISH (network injected, so the tests drive it with fakes) ───────────────── */

export type LookupAnswer = (PlaceDetailsForAdd & { email?: string | null }) | null;
export interface BulkAddDeps {
  /** coverage_add_leads. Returns the function's JSON (or { ok:false, error }). */
  addLeads: (rows: Record<string, unknown>[], campaignId: string | null, commit: boolean) => Promise<{ ok?: boolean; error?: string; rows?: AddRowAnswer[]; counts?: Record<string, number> }>;
  /** google-place-details for one place id: the details, null for a failed lookup, or { limit: true } when a limit refused it. */
  lookup: (placeId: string) => Promise<LookupAnswer | { limit: true }>;
  onPhase: (p: AddPhase) => void;
  isStopped?: () => boolean;
  /** Injected so the tests do not wait real minutes. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type AddPhase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'lookups'; done: number; total: number; waiting: boolean }
  | { kind: 'saving'; total: number }
  | { kind: 'done'; summary: AddSummary; rows: AddRowAnswer[] }
  | { kind: 'error'; message: string };

/**
 * ONE bulk add: (1) a free preview says which rows are new (the rest are already in the CRM and are skipped);
 * (2) each new lead's phone and town are looked up — at most PLACE_LOOKUPS_PER_MINUTE started in any minute,
 * PLACE_LOOKUP_CONCURRENCY at once; a LIMIT refusal stops the lookups (those rows are reported, never added
 * without their lookup); a failed lookup never blocks the add; (3) a lookup that answered with no phone and no
 * email is not added (the single add's rule); (4) ONE committing call saves the rest.
 */
export async function runBulkAdd(rows: readonly MergedLead[], trade: string, campaignId: string | null, deps: BulkAddDeps): Promise<{ summary: AddSummary; rows: AddRowAnswer[] } | null> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => Date.now());
  if (rows.length === 0) return null;
  if (rows.length > COVERAGE_ADD_MAX_ROWS) { deps.onPhase({ kind: 'error', message: addRefusalText('too_many_rows') }); return null; }
  deps.onPhase({ kind: 'checking' });
  let pre: Awaited<ReturnType<BulkAddDeps['addLeads']>>;
  try { pre = await deps.addLeads(rows.map((r) => addRowFor(r, trade, null)), campaignId, false); } catch { pre = { ok: false }; }
  if (!pre?.ok) { deps.onPhase({ kind: 'error', message: addRefusalText(pre?.error) }); return null; }
  const preRows = pre.rows ?? [];
  const isNew = new Set(preRows.filter((r) => r.outcome === 'new' && r.k).map((r) => r.k as string));
  const fresh = rows.filter((r) => isNew.has(r.rowKey));

  const details = new Map<string, LookupAnswer>();
  let limited = false;
  let done = 0;
  let waiting = false;
  let idx = 0;
  const started: number[] = [];
  const report = () => deps.onPhase({ kind: 'lookups', done, total: fresh.length, waiting });
  report();
  const worker = async () => {
    for (;;) {
      if (limited || deps.isStopped?.()) return;
      const i = idx++;
      if (i >= fresh.length) return;
      while (started.length && now() - started[0] >= 60_000) started.shift();
      if (started.length >= PLACE_LOOKUPS_PER_MINUTE) {
        waiting = true; report();
        await sleep(Math.max(0, 60_000 - (now() - started[0])) + 250);
        waiting = false;
        while (started.length && now() - started[0] >= 60_000) started.shift();
      }
      if (limited || deps.isStopped?.()) return;   // never looked up: counted below as limit / stopped
      started.push(now());
      const r = fresh[i];
      let d: LookupAnswer | { limit: true };
      try { d = await deps.lookup(r.id); } catch { d = null; }
      if (d && 'limit' in d) { limited = true; return; }
      details.set(r.rowKey, d as LookupAnswer);
      done++; report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(PLACE_LOOKUP_CONCURRENCY, Math.max(1, fresh.length)) }, worker));

  let noContact = 0;
  let limitCount = 0;
  let stopped = 0;
  const toSave: Record<string, unknown>[] = [];
  const notAdded: AddRowAnswer[] = [];
  for (const r of fresh) {
    if (!details.has(r.rowKey)) {
      if (limited) limitCount++; else stopped++;
      notAdded.push({ k: r.rowKey, business_name: r.name, outcome: 'limit', reasons: [limited ? 'limit' : 'stopped'] });
      continue;
    }
    const d = details.get(r.rowKey) ?? null;
    if (noContactAfterLookup(r, d)) {
      noContact++;
      notAdded.push({ k: r.rowKey, business_name: r.name, outcome: 'skipped', reasons: ['no_contact'] });
      continue;
    }
    toSave.push(addRowFor(r, trade, d));
  }

  let out: AddRowAnswer[] = preRows.filter((r) => r.outcome !== 'new');
  if (toSave.length > 0) {
    deps.onPhase({ kind: 'saving', total: toSave.length });
    let a: Awaited<ReturnType<BulkAddDeps['addLeads']>>;
    try { a = await deps.addLeads(toSave, campaignId, true); } catch { a = { ok: false }; }
    if (!a?.ok) { deps.onPhase({ kind: 'error', message: addRefusalText(a?.error) }); return null; }
    out = [...out, ...(a.rows ?? [])];
  }
  /* The summary counts the no-contact and limit rows from `extra`, so they are listed for the reader but not
     counted twice: they are kept out of the rows summariseAdd counts. */
  const summary = summariseAdd(out, { noContact, limit: limitCount, stopped });
  const all = [...out, ...notAdded];
  deps.onPhase({ kind: 'done', summary, rows: all });
  return { summary, rows: all };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHICH SEARCH RESULTS ARE ALREADY IN THE CRM — ASKED FOR THE RESULTS ON SCREEN ONLY  (2026-10-13)

   🔴 WHY THIS FILE. Find Leads used to download the WHOLE book to mark its results: every active
   lead (~5,600, six 1,000-row pages fired at once), every archived lead and every outreach_history
   row (~5,600 more) — ~17 requests and several MB on every visit, just to answer "is this one of
   ours?" for the 20–60 businesses a search returns. Those pages ran near the database's 8-second
   statement timeout and were the cause of "Error loading leads [object Object]".

   Now the page asks only about the businesses on screen: their place ids, Maps links and names, in
   small batches, on the indexed columns (place_id and google_maps_url are indexed; a name match is a
   ~4 ms scan of the table). A 60-result search is 3 batches × 2 tables = 6 small requests.

   ⛔ THE SAME MATCH RULES AS BEFORE, ROW FOR ROW (the old in-memory scans in Index.getCrmState and
   useOutreach.isInOutreach):
     · crmStateFor  — the ACTIVE lead whose Maps link, OR name, OR place id equals the result's, the
                      newest first (the old list's order). Fresh → Remove; worked → "In CRM".
     · inOutreachFor — any lead, active or archived, OR any outreach_history row (a business ever
                      added, even if deleted), by name OR Maps link.
   ⛔ This is the MARKER only. Add to CRM's own database dedupe (useOutreach.addLead) stays the
   authority on duplicates, so a lookup that is slow or fails can never let a duplicate in.

   React-free leaf: tested by scripts/find-leads-crm-match.test.ts.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

import { SALES_VIEW_COLUMNS } from './outreachLeadColumns.ts';

/** The columns one lead match needs: identity + the freshness fields isFreshLead reads. */
export const CRM_MATCH_COLUMNS = [
  'id', 'business_name', 'google_maps_url', 'place_id', 'campaign_id', 'is_archived', 'country', 'created_at',
  'status', 'whatsapp_sent_at', 'whatsapp_delivery_status', 'whatsapp_message_id', 'contact_method', 'notes',
  'queued_at', 'next_action', 'last_outreach_attempt_at', 'outreach_attempts', 'is_potential_work',
] as const;

/** Admin reads the table; a salesperson the safe view, which lacks some freshness columns (they arrive
 *  absent — a salesperson cannot Remove a lead anyway). */
export function crmMatchSelect(role: 'admin' | 'sales' | null | undefined): string {
  if (role !== 'sales') return CRM_MATCH_COLUMNS.join(', ');
  const view = new Set<string>(SALES_VIEW_COLUMNS);
  return CRM_MATCH_COLUMNS.filter((c) => view.has(c)).join(', ');
}

export interface CrmMatchRow {
  id: string;
  business_name: string | null;
  google_maps_url: string | null;
  place_id?: string | null;
  campaign_id?: string | null;
  is_archived?: boolean | null;
  country?: string | null;
  created_at?: string | null;
  status?: string | null;
  whatsapp_sent_at?: string | null;
  whatsapp_delivery_status?: string | null;
  whatsapp_message_id?: string | null;
  contact_method?: string | null;
  notes?: string | null;
  queued_at?: string | null;
  next_action?: string | null;
  last_outreach_attempt_at?: string | null;
  outreach_attempts?: number | null;
  is_potential_work?: boolean | null;
}
export interface HistoryMatchRow { business_name: string | null; google_maps_url: string | null }

/** What identifies a search result. `id` IS the Google place id (search-leads sets it so). */
export interface ResultIdentity { id: string; name: string; googleMapsUrl?: string | null }

/** Results per request. Each batch sends at most this many place ids + Maps links + names in one URL. */
export const CRM_MATCH_BATCH = 25;
/** Batches in flight at once — the API shares ~10 database connections with everyone. */
export const CRM_MATCH_CONCURRENCY = 2;
/** Extra tries for a failed request before the lookup says it failed. */
export const CRM_MATCH_RETRIES = 2;

/** One PostgREST list value, always double-quoted so commas, brackets, dots and colons in a name are
 *  data; a backslash or a double quote inside is escaped. */
export function quoteFilterValue(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
const inList = (vals: readonly string[]) => `(${vals.map(quoteFilterValue).join(',')})`;

const clean = (v: string | null | undefined) => {
  const s = String(v ?? '');
  return s.trim() ? s : '';
};

export interface MatchBatch { placeIds: string[]; mapsUrls: string[]; names: string[] }

/** The results cut into batches of distinct keys. Values are matched EXACTLY (no trimming), as the old
 *  in-memory scan compared them; blank keys are never sent. */
export function matchBatches(results: readonly ResultIdentity[], size = CRM_MATCH_BATCH): MatchBatch[] {
  const seen = new Set<string>();
  const unique: ResultIdentity[] = [];
  for (const r of results) {
    const k = `${r.id}\u0000${r.googleMapsUrl ?? ''}\u0000${r.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(r);
  }
  const out: MatchBatch[] = [];
  for (let i = 0; i < unique.length; i += size) {
    const slice = unique.slice(i, i + size);
    const uniq = (xs: string[]) => Array.from(new Set(xs.filter(Boolean)));
    const b = {
      placeIds: uniq(slice.map((r) => clean(r.id))),
      mapsUrls: uniq(slice.map((r) => clean(r.googleMapsUrl))),
      names: uniq(slice.map((r) => clean(r.name))),
    };
    if (b.placeIds.length || b.mapsUrls.length || b.names.length) out.push(b);
  }
  return out;
}

/** The lead query's `or` filter for one batch: place id, Maps link or name. */
export function leadOrFilter(b: MatchBatch): string {
  const parts: string[] = [];
  if (b.placeIds.length) parts.push(`place_id.in.${inList(b.placeIds)}`);
  if (b.mapsUrls.length) parts.push(`google_maps_url.in.${inList(b.mapsUrls)}`);
  if (b.names.length) parts.push(`business_name.in.${inList(b.names)}`);
  return parts.join(',');
}
/** The outreach_history query's `or` filter for one batch: name or Maps link (it has no place id). */
export function historyOrFilter(b: MatchBatch): string {
  const parts: string[] = [];
  if (b.mapsUrls.length) parts.push(`google_maps_url.in.${inList(b.mapsUrls)}`);
  if (b.names.length) parts.push(`business_name.in.${inList(b.names)}`);
  return parts.join(',');
}

export interface CrmMatchQueries {
  /** Rows of the caller's lead source matching the `or` filter. Throws on error. */
  leads: (orFilter: string) => Promise<CrmMatchRow[]>;
  /** outreach_history rows matching the `or` filter. Throws on error. */
  history: (orFilter: string) => Promise<HistoryMatchRow[]>;
}

export interface CrmMatchResult { leads: CrmMatchRow[]; history: HistoryMatchRow[]; requests: number }

async function withRetry<T>(run: () => Promise<T>, retries: number, onAttempt: () => void): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    onAttempt();
    try { return await run(); } catch (e) {
      last = e;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw last;
}

/** Ask the database about these results only. Batches run a few at a time; each request is retried;
 *  any batch that still fails fails the whole lookup (the caller keeps what it had and says so). */
export async function lookupCrmMatches(
  results: readonly ResultIdentity[],
  q: CrmMatchQueries,
  opts: { batchSize?: number; concurrency?: number; retries?: number } = {},
): Promise<CrmMatchResult> {
  const batches = matchBatches(results, opts.batchSize ?? CRM_MATCH_BATCH);
  const concurrency = Math.max(1, opts.concurrency ?? CRM_MATCH_CONCURRENCY);
  const retries = Math.max(0, opts.retries ?? CRM_MATCH_RETRIES);
  const leads = new Map<string, CrmMatchRow>();
  const history: HistoryMatchRow[] = [];
  let requests = 0;
  const count = () => { requests += 1; };
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const b = batches[next++];
      const lf = leadOrFilter(b);
      const hf = historyOrFilter(b);
      const [ls, hs] = await Promise.all([
        lf ? withRetry(() => q.leads(lf), retries, count) : Promise.resolve([] as CrmMatchRow[]),
        hf ? withRetry(() => q.history(hf), retries, count) : Promise.resolve([] as HistoryMatchRow[]),
      ]);
      for (const r of ls) if (r && r.id) leads.set(r.id, r);
      history.push(...hs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
  return { leads: Array.from(leads.values()), history, requests };
}

/** The old list order: newest lead first, then id — so "the first match" is the same row it was. */
export function sortNewestFirst(rows: readonly CrmMatchRow[]): CrmMatchRow[] {
  return [...rows].sort((a, b) => {
    const ta = a.created_at ?? '';
    const tb = b.created_at ?? '';
    if (ta !== tb) return ta < tb ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface CrmMatchIndex { leads: CrmMatchRow[]; history: HistoryMatchRow[] }

/** Lay what changed on this page since a lookup started over its answer: an add is shown at once, a
 *  removal stays removed. */
export function withLocalChanges(index: CrmMatchIndex, added: readonly CrmMatchRow[], removed: ReadonlySet<string>): CrmMatchIndex {
  const byId = new Map<string, CrmMatchRow>();
  for (const r of index.leads) byId.set(r.id, r);
  for (const r of added) byId.set(r.id, { ...byId.get(r.id), ...r });
  for (const id of removed) byId.delete(id);
  const removedKeys = index.leads.filter((r) => removed.has(r.id));
  /* A removed lead's history rows were deleted with it (removeFreshLead): hide them too. */
  const history = removedKeys.length
    ? index.history.filter((h) => !removedKeys.some((r) => (h.business_name && h.business_name === r.business_name) || (h.google_maps_url && h.google_maps_url === r.google_maps_url)))
    : index.history;
  return { leads: sortNewestFirst(Array.from(byId.values())), history };
}

export interface CrmState { inCrm: boolean; isFresh: boolean; crmLeadId: string | null; campaignId: string | null }

/** Index.getCrmState's rule: the newest ACTIVE lead matching by Maps link, name or place id. */
export function crmMatchFor(result: ResultIdentity, index: CrmMatchIndex): CrmMatchRow | null {
  return index.leads.find((l) => !l.is_archived && (
    (!!result.googleMapsUrl && l.google_maps_url === result.googleMapsUrl) ||
    l.business_name === result.name ||
    (!!result.id && l.place_id === result.id)
  )) ?? null;
}

/** useOutreach.isInOutreach's rule: ever added — history, active or archived — by name or Maps link. */
export function inOutreachFor(name: string, googleMapsUrl: string | null | undefined, index: CrmMatchIndex): boolean {
  const hit = (n: string | null, u: string | null) => n === name || (!!googleMapsUrl && u === googleMapsUrl);
  return index.history.some((h) => hit(h.business_name, h.google_maps_url))
    || index.leads.some((l) => hit(l.business_name, l.google_maps_url));
}

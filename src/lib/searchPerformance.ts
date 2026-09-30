/* ════════════════════════════════════════════════════════════════════════════════════════════
   SEARCH PERFORMANCE — the rules, in ONE place (2026-09-22, Phase 1).

   URL identity, period windows, and every rate/comparison in the Performance section. Pure: no
   React, no Supabase, no Date.now() — every function that needs "today" is handed it, so the maths
   is deterministic and unit-tested in scripts/search-performance.test.ts.

   ⛔ THIS FILE IS IMPORTED BY THE EDGE FUNCTIONS AS WELL AS THE SPA, so it has NO imports at all
      and must never gain a '@/' one. supabase/functions/performance-sync and
      supabase/functions/client-performance both reach it as
      '../../../src/lib/searchPerformance.ts' — relative, with the EXPLICIT .ts extension, which is
      load-bearing: the Supabase bundler refuses an extensionless relative import outright while
      tsc, vite and every tsx suite resolve it happily, so the whole local gate reads green and only
      the deploy says no (CLAUDE.md §4, recorded twice).

   🔴 WHY ONE MODULE AND NOT A COPY EACH SIDE. Normalisation decides what "the same page" means.
      The sync writes Search Console's URL strings; the read function matches them against the
      tracked-page inventory. If the two sides normalise even slightly differently the join matches
      NOTHING and every page on the screen reads "untracked" — a total failure that looks exactly
      like "Google returned unfamiliar URLs". Sharing the module is what makes that impossible
      rather than merely unlikely (CLAUDE.md §6: one rule written in N places).
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** How far behind "today" Search Console data is treated as settled.
 *
 *  Google publishes preliminary rows for very recent days and revises them for a further day or
 *  two. Two days is the conservative boundary: everything we DISPLAY is at or before today-2, and
 *  the sync re-fetches a window that reaches further back than this so a revised day is corrected
 *  by an upsert rather than frozen wrong.
 *
 *  ⛔ THIS IS NOT A CLAIM ABOUT WHEN A PROPERTY'S DATA STARTS. Google can begin collecting for a
 *  property before it is verified, so there is no "data starts at verification" rule anywhere in
 *  this feature. What we have is what is in the table; coverage is max(date), nothing else. */
export const SETTLED_LAG_DAYS = 2;

/** The rolling window the daily sync re-fetches: today-6 … today-2 inclusive (5 days).
 *  Reaches three days past the settled boundary so a revision lands as an upsert. */
export const SYNC_WINDOW_FROM_DAYS = 6;
export const SYNC_WINDOW_TO_DAYS = SETTLED_LAG_DAYS;

/** The only periods the UI offers in Phase 1. A custom range is deliberately not built. */
export const PERFORMANCE_PERIODS = [7, 28, 90] as const;
export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number];

export function isPerformancePeriod(v: unknown): v is PerformancePeriod {
  return typeof v === 'number' && (PERFORMANCE_PERIODS as readonly number[]).includes(v);
}

/** How far back a first backfill reaches. Search Console keeps 16 months; 90 days covers the
 *  longest period the UI can select and keeps the first sync inside the edge time limit. */
export const BACKFILL_MAX_DAYS = 90;
/** Days per backfill invocation. Bounded so one call can never run past the platform's wall clock;
 *  the caller loops. */
export const BACKFILL_CHUNK_DAYS = 30;

export const PAGE_TYPES = ['home', 'service', 'location', 'commercial', 'other'] as const;
export type PageType = (typeof PAGE_TYPES)[number];

export function isPageType(v: unknown): v is PageType {
  return typeof v === 'string' && (PAGE_TYPES as readonly string[]).includes(v);
}

/* ── Dates. UTC throughout ────────────────────────────────────────────────────────────────────
   ⛔ Everything here is UTC. A stored day formatted in local time renders as the NEXT day under
   BST, which is how a report once dated every row a day late (CLAUDE.md §4). */

/** 'YYYY-MM-DD' for a Date, in UTC. */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse 'YYYY-MM-DD' (or a full ISO timestamp) to midnight UTC. Returns null on anything else —
 *  never a silently wrong date. */
export function parseISODate(iso: string | null | undefined): Date | null {
  if (typeof iso !== 'string') return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Shift an ISO day by n days, in UTC. Returns null if the input is not a date. */
export function addDays(iso: string, n: number): string | null {
  const d = parseISODate(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return toISODate(d);
}

/** Inclusive day count between two ISO days, or null. */
export function daysBetween(fromISO: string, toISO: string): number | null {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}

export interface DateWindow { from: string; to: string }
export interface PeriodWindows { current: DateWindow; previous: DateWindow }

/** The current window and the IMMEDIATELY PRECEDING window of equal length.
 *
 *  Both end at or before today-SETTLED_LAG_DAYS, so neither contains a day Google has not settled.
 *  The previous window abuts the current one with no gap and no overlap — a one-day overlap would
 *  double-count a day into both sides of every comparison on the screen. */
export function periodWindows(period: PerformancePeriod, todayISO: string): PeriodWindows | null {
  const to = addDays(todayISO, -SETTLED_LAG_DAYS);
  if (!to) return null;
  const from = addDays(to, -(period - 1));
  const prevTo = addDays(to, -period);
  const prevFrom = addDays(to, -(period * 2 - 1));
  if (!from || !prevTo || !prevFrom) return null;
  return { current: { from, to }, previous: { from: prevFrom, to: prevTo } };
}

/** The rolling window the nightly sync re-fetches. */
export function syncWindow(todayISO: string): DateWindow | null {
  const from = addDays(todayISO, -SYNC_WINDOW_FROM_DAYS);
  const to = addDays(todayISO, -SYNC_WINDOW_TO_DAYS);
  return from && to ? { from, to } : null;
}

/** Split a window into chunks of at most `days`, oldest first. Used by the backfill so a single
 *  invocation is always bounded. */
export function chunkWindow(window: DateWindow, days: number): DateWindow[] {
  const size = Math.max(1, Math.floor(days));
  const out: DateWindow[] = [];
  let cursor = window.from;
  let guard = 0;
  while (cursor <= window.to && guard++ < 400) {
    const end = addDays(cursor, size - 1);
    if (!end) break;
    out.push({ from: cursor, to: end > window.to ? window.to : end });
    const next = addDays(cursor, size);
    if (!next) break;
    cursor = next;
  }
  return out;
}

/* ── URL identity — the one normaliser ────────────────────────────────────────────────────── */

/** Strip a leading 'www.' and lowercase. */
function bareHost(host: string): string {
  const h = host.trim().toLowerCase().replace(/\.$/, '');
  return h.startsWith('www.') ? h.slice(4) : h;
}

/** The canonical host to render, given the client's configured canonical domain.
 *
 *  Honours the configured form: if a client's canonical domain IS 'www.example.co.uk' then both
 *  'example.co.uk' and 'www.example.co.uk' normalise TO the www form, because that is the address
 *  that actually serves. With no configured domain we fall back to the bare host, which is still
 *  deterministic — and determinism, not prettiness, is what makes the join work. */
function canonicalHostFor(host: string, canonicalDomain?: string | null): string {
  const bare = bareHost(host);
  const configured = typeof canonicalDomain === 'string' ? canonicalDomain.trim().toLowerCase() : '';
  if (!configured) return bare;
  // Accept a configured value written as a full URL or with a trailing slash.
  const cleaned = configured.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (!cleaned) return bare;
  return bareHost(cleaned) === bare ? cleaned : bare;
}

/**
 * The ONE rule for "is this the same page". Applied to every Search Console URL on write and to
 * every tracked page's URL, so the two can be compared as plain strings.
 *
 *   https, always            — a client's site is https; http and https are not two pages
 *   host per canonicalDomain — www and apex are not two pages
 *   no query, no fragment    — '?utm_source=x' and '#book' are not two pages
 *   no trailing slash        — except the root, which is '/' and stays that way
 *
 * Returns null for anything that is not a usable absolute-or-rooted URL. ⛔ A caller must treat
 * null as "could not identify", never as a match against another null.
 */
export function normaliseUrl(raw: string | null | undefined, canonicalDomain?: string | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL | null = null;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      parsed = new URL(trimmed);
    } else if (trimmed.startsWith('/')) {
      // A bare path is only resolvable against a configured domain; without one it is not a page.
      const host = typeof canonicalDomain === 'string' ? canonicalDomain.trim() : '';
      if (!host) return null;
      parsed = new URL(`https://${host.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}${trimmed}`);
    } else if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
      parsed = new URL(`https://${trimmed}`);
    } else {
      return null;
    }
  } catch {
    return null;
  }

  const host = canonicalHostFor(parsed.hostname, canonicalDomain);
  if (!host) return null;

  let path = parsed.pathname || '/';
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (!path.startsWith('/')) path = `/${path}`;

  return `https://${host}${path}`;
}

/** The path shown when a page has no label — '/car-keys', or 'Home' for the root. */
export function pagePath(url: string | null | undefined): string {
  const n = normaliseUrl(url);
  if (!n) return typeof url === 'string' && url.trim() ? url.trim() : '—';
  const path = n.replace(/^https:\/\/[^/]+/, '');
  return path === '/' || path === '' ? '/' : path;
}

/** What to show in the Page column: the human label if one was recorded, otherwise the path. */
export function pageLabel(label: string | null | undefined, url: string): string {
  const l = typeof label === 'string' ? label.trim() : '';
  return l || pagePath(url);
}

/* ── Totals. SQL sums; THIS computes every rate ───────────────────────────────────────────────
   🔴 The additive triple. clicks, impressions and Σ(position × impressions) are the only three
   quantities that may be summed across days or pages. CTR and average position are derived from
   them once, in finaliseTotals, and nowhere else. */

export interface Totals { clicks: number; impressions: number; positionImpressions: number }
export interface FinalTotals {
  clicks: number;
  impressions: number;
  /** sum(clicks) / sum(impressions). null when there were no impressions — a rate with no
   *  denominator is unknown, and 0 would read as "we ranked and nobody clicked". */
  ctr: number | null;
  /** Impression-weighted mean position. null when there were no impressions. */
  position: number | null;
}

export const EMPTY_TOTALS: Totals = { clicks: 0, impressions: 0, positionImpressions: 0 };

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** One raw daily row → the additive triple. */
export function totalsFromRow(row: { clicks?: unknown; impressions?: unknown; position?: unknown }): Totals {
  const impressions = num(row.impressions);
  return { clicks: num(row.clicks), impressions, positionImpressions: num(row.position) * impressions };
}

/** A row already grouped by SQL (clicks, impressions, position_impressions) → the triple. */
export function totalsFromAggregate(row: { clicks?: unknown; impressions?: unknown; position_impressions?: unknown }): Totals {
  return {
    clicks: num(row.clicks),
    impressions: num(row.impressions),
    positionImpressions: num(row.position_impressions),
  };
}

export function addTotals(a: Totals, b: Totals): Totals {
  return {
    clicks: a.clicks + b.clicks,
    impressions: a.impressions + b.impressions,
    positionImpressions: a.positionImpressions + b.positionImpressions,
  };
}

export function sumTotals(list: readonly Totals[]): Totals {
  return list.reduce(addTotals, EMPTY_TOTALS);
}

/** The ONE place CTR and average position are computed.
 *
 *  ⛔ CTR is sum(clicks)/sum(impressions). It is NOT the mean of daily CTRs: a day with 1 impression
 *     and 1 click is 100%, and averaging it against a day of 1000/10 gives 55% instead of the true
 *     1.1%.
 *  ⛔ Position is impression-weighted. A plain mean of row positions lets a page that appeared once
 *     at position 1 outweigh one that appeared 5,000 times at position 12. */
export function finaliseTotals(t: Totals): FinalTotals {
  const impressions = t.impressions;
  return {
    clicks: t.clicks,
    impressions,
    ctr: impressions > 0 ? t.clicks / impressions : null,
    position: impressions > 0 ? t.positionImpressions / impressions : null,
  };
}

/* ── Comparison ──────────────────────────────────────────────────────────────────────────── */

export interface Change {
  /** Absolute difference, current − previous. */
  delta: number;
  /** Proportional change, or null when there is no usable baseline. */
  pct: number | null;
  /** True when this movement is good. For position that means the number went DOWN. */
  improved: boolean;
}

/** Change for a metric where MORE is better (impressions, clicks, CTR).
 *
 *  ⛔ Returns null — not +100% — when the previous period had nothing. "Up 100%" from a baseline of
 *     zero is not a measurement, and the screen must say "—". */
export function changeHigherIsBetter(current: number | null, previous: number | null): Change | null {
  if (current === null || previous === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const delta = current - previous;
  const pct = previous === 0 ? null : delta / previous;
  return { delta, pct, improved: delta > 0 };
}

/** Change for average position, where LOWER IS BETTER.
 *
 *  🔴 The sign flip lives here and only here. Position 8 → 3 is a delta of −5 and it is an
 *     IMPROVEMENT; every arrow and colour on the page reads `improved`, never the sign of `delta`.
 *     No percentage is offered: "position improved 62%" is not a thing anyone can act on. */
export function changePosition(current: number | null, previous: number | null): Change | null {
  if (current === null || previous === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const delta = current - previous;
  return { delta, pct: null, improved: delta < 0 };
}

/**
 * Should a page's period-over-period comparison be hidden?
 *
 * A page built or rebuilt inside the compared span did not exist for all of the previous window, so
 * its "change" measures its own creation, not its performance. That number is worse than no number:
 * it looks like a result. Suppress it and show the rebuild date instead.
 *
 * ⛔ A NULL build date is UNKNOWN, NOT "old". We never record a build date we cannot establish, so
 *    null must not silently license a comparison we would suppress if we knew the truth... but it
 *    also must not suppress every comparison on every client forever. The rule: null → compare
 *    (the honest default for a page we have simply always had), and the UI states the date is
 *    unrecorded. The moment a date is recorded, it governs.
 */
export function comparisonSuppressed(builtOrRebuiltOn: string | null | undefined, previous: DateWindow): boolean {
  const built = parseISODate(builtOrRebuiltOn ?? null);
  if (!built) return false;
  const start = parseISODate(previous.from);
  if (!start) return false;
  return built.getTime() >= start.getTime();
}

/* ── The five states, enumerated ──────────────────────────────────────────────────────────────
   ⛔ NO CATCH-ALL ELSE. Every arm is a positive test and the fallthrough is 'not_connected', the
   state that shows setup instructions. An unknown status must never resolve to 'populated' — that
   would render an empty dashboard as a real measurement (CLAUDE.md §4: absent must not mean
   "offer ungated"). */

export type PerformanceState = 'not_connected' | 'property_missing' | 'no_data' | 'error' | 'populated';

export interface ConnectionSnapshot {
  status?: string | null;
  gsc_property?: string | null;
}

export function resolvePerformanceState(
  connection: ConnectionSnapshot | null | undefined,
  rowsInPeriod: number,
): PerformanceState {
  if (!connection) return 'not_connected';
  if (connection.status === 'error') return 'error';
  const property = typeof connection.gsc_property === 'string' ? connection.gsc_property.trim() : '';
  if (!property) return 'property_missing';
  if (connection.status === 'connected') return rowsInPeriod > 0 ? 'populated' : 'no_data';
  if (connection.status === 'not_connected') return 'not_connected';
  return 'not_connected';
}

/* ── Joining Search Console rows to the tracked inventory ───────────────────────────────────── */

export interface TrackedPage {
  canonical_url: string;
  label?: string | null;
  page_type?: string | null;
  existed_before_findable?: boolean | null;
  built_or_rebuilt_on?: string | null;
}

export interface PageRow {
  url: string;
  label: string;
  pageType: PageType;
  /** False when Search Console reported a URL that is not in the tracked inventory. */
  tracked: boolean;
  builtOrRebuiltOn: string | null;
  existedBeforeFindable: boolean;
  current: FinalTotals;
  previous: FinalTotals | null;
  comparisonSuppressed: boolean;
}

/** Index a tracked-page list by normalised URL. */
export function indexTrackedPages(
  pages: readonly TrackedPage[],
  canonicalDomain?: string | null,
): Map<string, TrackedPage> {
  const map = new Map<string, TrackedPage>();
  for (const p of pages) {
    const key = normaliseUrl(p.canonical_url, canonicalDomain);
    if (key) map.set(key, p);
  }
  return map;
}

/**
 * Build the Pages table.
 *
 * 🔴 EVERY URL SEARCH CONSOLE RETURNED APPEARS, tracked or not. An unknown URL is rendered as
 *    `tracked: false` / page type 'other' and labelled "untracked" by the UI. Dropping it would
 *    hide real traffic and — worse — would hide a broken normaliser, because a join that matches
 *    nothing and a client with no traffic look identical once the rows are gone.
 */
export function buildPageRows(
  current: ReadonlyMap<string, Totals>,
  previous: ReadonlyMap<string, Totals>,
  tracked: ReadonlyMap<string, TrackedPage>,
  previousWindow: DateWindow,
): PageRow[] {
  const urls = new Set<string>([...current.keys(), ...previous.keys()]);
  const rows: PageRow[] = [];
  for (const url of urls) {
    const meta = tracked.get(url);
    const built = meta?.built_or_rebuilt_on ?? null;
    const prevTotals = previous.get(url) ?? null;
    rows.push({
      url,
      label: pageLabel(meta?.label, url),
      pageType: isPageType(meta?.page_type) ? meta.page_type : 'other',
      tracked: !!meta,
      builtOrRebuiltOn: built,
      existedBeforeFindable: meta?.existed_before_findable === true,
      current: finaliseTotals(current.get(url) ?? EMPTY_TOTALS),
      previous: prevTotals ? finaliseTotals(prevTotals) : null,
      comparisonSuppressed: comparisonSuppressed(built, previousWindow),
    });
  }
  return rows.sort((a, b) => b.current.clicks - a.current.clicks || b.current.impressions - a.current.impressions);
}

/** How many query rows the UI asks for. Top-by-clicks is enough for v1; no delta analysis. */
export const QUERY_ROW_LIMIT = 50;

/* ── Folding Search Console rows onto the unique key BEFORE they are written ────────────────── */

export interface RawAnalyticsRow { date: string; page: string; query?: string; clicks: number; impressions: number; position: number }
export interface FoldedRow { date: string; page: string; query?: string; clicks: number; impressions: number; ctr: number | null; position: number | null }

/**
 * Collapse Google's rows onto exactly the key the unique index uses, summing as it goes.
 *
 * 🔴 WITHOUT THIS THE WRITE FAILS OUTRIGHT. Two Search Console URLs can normalise to one page —
 *    '/car-keys/' and '/car-keys/?utm_source=gbp' are the same page by our rule and Google reports
 *    them as two rows. Upserting both in one statement is a hard Postgres error ("ON CONFLICT DO
 *    UPDATE command cannot affect row a second time") and the whole day's write is lost. Summing is
 *    also the only correct answer: the page really did receive those clicks between them.
 *
 * 🔴 AND IT IS WHAT MAKES RE-SYNCING FREE. The output is one row per unique key, so re-running the
 *    same window upserts the same rows onto themselves — no duplicate snapshot is possible, which
 *    is why the rolling window can safely re-fetch days Google may still revise.
 *
 * ⛔ A row whose URL will not normalise keeps its raw string rather than being dropped. A dropped
 *    row is traffic that silently never existed.
 */
export function foldDailyRows(rows: readonly RawAnalyticsRow[], canonicalDomain: string | null, withQuery: boolean): FoldedRow[] {
  const map = new Map<string, { date: string; page: string; query?: string; totals: Totals }>();
  for (const row of rows) {
    const page = normaliseUrl(row.page, canonicalDomain) ?? (typeof row.page === 'string' ? row.page.trim() : '');
    const date = typeof row.date === 'string' ? row.date.trim() : '';
    if (!page || !date) continue;
    const query = withQuery ? (typeof row.query === 'string' ? row.query.trim() : '') : '';
    if (withQuery && !query) continue;
    const key = `${date}\u0000${page}\u0000${query}`;
    const add = totalsFromRow(row);
    const prev = map.get(key);
    if (prev) prev.totals = addTotals(prev.totals, add);
    else map.set(key, { date, page, ...(withQuery ? { query } : {}), totals: add });
  }
  return [...map.values()].map((e) => {
    const final = finaliseTotals(e.totals);
    return {
      date: e.date,
      page: e.page,
      ...(e.query === undefined ? {} : { query: e.query }),
      clicks: final.clicks,
      impressions: final.impressions,
      ctr: final.ctr,
      position: final.position,
    };
  });
}

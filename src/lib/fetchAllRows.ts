/**
 * Fetch every row of a query, a page at a time.
 *
 * PostgREST caps a single response at the project's `db-max-rows` (default 1000) and returns the
 * truncated page with NO error and no indication it was cut. So an unpaginated select does not fail
 * when a table outgrows the cap — it silently starts under-reporting, and every number derived from
 * it quietly gets smaller. outreach_leads is at 689 rows and whatsapp_messages at 403.
 *
 * The loop advances by the number of rows actually RETURNED rather than by the requested page size,
 * so it stays correct even when the server's cap is lower than PAGE (which we cannot read from the
 * client). It ends when a page comes back empty. MAX_PAGES is a runaway guard, not an expected
 * limit; reaching it logs and reports `truncated`.
 *
 * ORDERING MATTERS. Paging is only stable if the query's sort is TOTAL. Ordering by a timestamp
 * alone is not: whatsapp_messages currently has 3 groups of rows sharing a created_at, and rows
 * that compare equal may land on either side of a page boundary, so one can be fetched twice and
 * another missed. Always add a unique tiebreaker (`.order('id')`) alongside the sort you want.
 */
const PAGE = 1000;
const MAX_PAGES = 50;

export async function fetchAllRows<T>(
  label: string,
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  let from = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length === 0) return { rows, truncated: false };
    from += batch.length;
  }
  console.warn(`${label}: stopped paging at ${MAX_PAGES} pages (${rows.length} rows) — numbers may be incomplete.`);
  return { rows, truncated: true };
}

/**
 * The same result as fetchAllRows, fetched several pages at a time (2026-09-27, Inbox/Outreach speed).
 *
 * 🔴 WHY. The Outreach page's 5,200 leads came in six sequential round trips (~1.4 s each on the
 * live app) — nine seconds of waiting for a database that answers each page in a fraction of one.
 *
 * ⛔ STILL CORRECT WHEN THE SERVER'S CAP IS BELOW PAGE. The first page is fetched alone and its
 * length becomes the page size for the rest, so a cap of 500 cannot leave a gap between parallel
 * offsets. The waves stop at the first SHORT page (fewer rows than the page size) — exactly the end
 * condition the sequential loop reaches one page later.
 * ⛔ DEDUPED BY KEY. Separate requests are separate snapshots: a row inserted mid-read shifts the
 * offsets, and the row at a boundary can then arrive twice. `keyOf` (the unique id) drops the copy.
 * The sequential loop has the same snapshot gap; this does not widen it.
 * Order is preserved: pages are concatenated in offset order. Six at a time: 5-6k-row lists (leads, messages) arrive in two round trips after the first.
 *
 * ⚡ A SHORT FIRST PAGE SENDS ONE PROBE, NOT A WAVE OF SIX (2026-09-27, site-wide speed pass). Every
 * list under 1,000 rows used to cost 7 requests, 6 of them empty. The probe is still needed: a short
 * page means "the end" OR "the server's cap is below 1,000", and only a read at offset `size` can
 * tell them apart. If the probe finds rows, the waves carry on exactly as before.
 * ⚡ AND THE FIRST WAVE IS SIZED FROM LAST TIME'S COUNT (same day). A full page 0 used to fire six more
 * pages whatever the list's size: 1,554 rows cost 7 requests, 5 of them past the end — and an empty
 * page is not free, the database still sorts the whole filtered set to skip to its offset, holding
 * one of the API's ~10 shared connections while it does. The count this label returned last time
 * (this tab, else this browser) now sizes that first wave: 1,554 → one more page. Still fetched
 * AFTER page 0, as before; a list that grew past its guess just carries on in waves of six.
 * ⛔ TRIED AND REJECTED the same day: using that count to fire every page TOGETHER with page 0.
 * Measured live on the Outreach leads read it was SLOWER (8.4–8.6 s vs 3.2–6.0 s): the database and
 * the API's small connection pool, not the round trip, are the bottleneck, and six wide pages at
 * once just queue.
 */
const rowCountHint = new Map<string, number>();
const HINT_KEY = 'fetchAllRows.rowCounts.v1';
function readHint(label: string): number | undefined {
  if (rowCountHint.has(label)) return rowCountHint.get(label);
  try {
    const n = (JSON.parse(globalThis.localStorage?.getItem(HINT_KEY) ?? '{}') as Record<string, unknown>)[label];
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : undefined;
  } catch { return undefined; }
}
function writeHint(label: string, n: number) {
  rowCountHint.set(label, n);
  try {
    const all = JSON.parse(globalThis.localStorage?.getItem(HINT_KEY) ?? '{}') as Record<string, number>;
    all[label] = n;
    globalThis.localStorage?.setItem(HINT_KEY, JSON.stringify(all));
  } catch { /* storage unavailable: the in-memory count still serves this tab */ }
}
/** Test-only: forget every remembered count. */
export function resetRowCountHints() {
  rowCountHint.clear();
  try { globalThis.localStorage?.removeItem(HINT_KEY); } catch { /* ignore */ }
}

/**
 * The rest of a list whose FIRST page is already on screen (Outreach progressive loading, 2026-09-28).
 * Same rows as fetchAllRowsParallel would return, given page 0 and the exact row count that came
 * with it: page 0's length is the page size (a server cap below PAGE cannot leave gaps); a short
 * page 0 is the end only when the count agrees (otherwise the cap is lower and paging continues);
 * the waves are sized from the count and stop at the first short page, so a list that grew still
 * finishes. Deduped by key, page order kept. Throws on any page error — the caller shows what it has
 * and says the rest failed; it never treats a partial list as complete.
 */
/* ⛔ ONE SLOW PAGE MUST NOT FAIL THE WHOLE LIST (2026-10-11). The database answers one Outreach page in
   ~35 ms when idle, but this small shared instance stalls now and then (pg_stat_statements: the same
   page query has a 7.5 s worst case against the API's 8 s statement timeout, and the same stall shows
   on unrelated statements). A page that hit a stall used to throw and drop the remaining thousands of
   leads ("failed to load"). Each page is now tried up to PAGE_ATTEMPTS times with a short back-off; a
   page that keeps failing still throws, so a partial list is never treated as complete. */
const PAGE_ATTEMPTS = 3;
const PAGE_RETRY_BASE_MS = 600;
async function buildWithRetry(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  from: number,
  to: number,
): Promise<{ data: unknown; error: unknown }> {
  let last: { data: unknown; error: unknown } = { data: null, error: null };
  for (let attempt = 1; attempt <= PAGE_ATTEMPTS; attempt++) {
    try {
      last = await build(from, to);
      if (!last.error) return last;
    } catch (e) {
      last = { data: null, error: e };
    }
    if (attempt < PAGE_ATTEMPTS) await new Promise((r) => setTimeout(r, PAGE_RETRY_BASE_MS * attempt));
  }
  return last;
}

export async function fetchPagesAfterFirst<T>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  keyOf: (row: T) => string,
  firstRows: readonly T[],
  total: number | null,
  concurrency = 3,
): Promise<T[]> {
  const size = firstRows.length;
  const pages: T[][] = [[...firstRows]];
  const endAtFirst = size === 0 || (size < PAGE && total != null && total <= size);
  if (!endAtFirst) {
    let next = 1;
    let waveLen = total != null && size > 0
      ? Math.min(concurrency, Math.max(1, Math.ceil(Math.max(0, total - size) / size) + (total % size === 0 ? 1 : 0)))
      : concurrency;
    outer: for (;;) {
      if (next >= MAX_PAGES) { console.warn(`fetchPagesAfterFirst: stopped at ${MAX_PAGES} pages.`); break; }
      const wave = Array.from({ length: Math.min(waveLen, MAX_PAGES - next) }, (_, i) => next + i);
      waveLen = concurrency;
      const results = await Promise.all(wave.map((p) => buildWithRetry(build, p * size, p * size + size - 1)));
      for (const r of results) {
        if (r.error) throw r.error;
        const batch = (r.data ?? []) as T[];
        pages.push(batch);
        if (batch.length < size) break outer;
      }
      next += wave.length;
    }
  }
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const batch of pages) for (const row of batch) {
    const k = keyOf(row);
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push(row);
  }
  return rows;
}

export async function fetchAllRowsParallel<T>(
  label: string,
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
  keyOf: (row: T) => string,
  concurrency = 6,
): Promise<{ rows: T[]; truncated: boolean }> {
  const first = await build(0, PAGE - 1);
  if (first.error) throw first.error;
  const firstRows = (first.data ?? []) as T[];
  const size = firstRows.length;
  const pages: T[][] = [firstRows];
  let truncated = false;
  if (size > 0) {
    let next = 1;
    let waveLen = size < PAGE ? 1 : concurrency;
    const hint = readHint(label);
    if (size === PAGE && hint !== undefined) {
      // The pages after page 0 that last time's count fills, plus one if it ended exactly on a page
      // boundary (only a page past it can show the end). Never fewer than one.
      const more = Math.ceil(Math.max(0, hint - size) / size) + (hint % size === 0 ? 1 : 0);
      waveLen = Math.min(concurrency, Math.max(1, more));
    }
    outer: for (;;) {
      if (next >= MAX_PAGES) { truncated = true; break; }
      const wave = Array.from({ length: Math.min(waveLen, MAX_PAGES - next) }, (_, i) => next + i);
      waveLen = concurrency;
      const results = await Promise.all(wave.map((p) => build(p * size, p * size + size - 1)));
      for (const r of results) {
        if (r.error) throw r.error;
        const batch = (r.data ?? []) as T[];
        pages.push(batch);
        if (batch.length < size) break outer;
      }
      next += wave.length;
    }
  }
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const batch of pages) for (const row of batch) {
    const k = keyOf(row);
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push(row);
  }
  if (truncated) console.warn(`${label}: stopped paging at ${MAX_PAGES} pages (${rows.length} rows) — numbers may be incomplete.`);
  else writeHint(label, rows.length);
  return { rows, truncated };
}

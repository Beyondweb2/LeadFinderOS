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
 */
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
    outer: for (;;) {
      if (next >= MAX_PAGES) { truncated = true; break; }
      const wave = Array.from({ length: Math.min(concurrency, MAX_PAGES - next) }, (_, i) => next + i);
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
  return { rows, truncated };
}

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

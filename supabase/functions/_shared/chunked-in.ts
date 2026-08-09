/* ════════════════════════════════════════════════════════════════════════════════════════════
   A .in() FILTER THAT DOES NOT DIE ON A BIG SELECTION.

   ⛔ THE BUG THIS EXISTS TO FIX, MEASURED 2026-08-09. PostgREST puts .in() values in the URL, so a
   long id list becomes a long request line and the request is dropped by the server before
   PostgREST sees it. supabase-js reports it as `TypeError: fetch failed` — not a 4xx with a
   message, just a dead socket — which lands in a catch and becomes a generic 500.

     .in() with  200 ids  (~7,400 url bytes)   ok
     .in() with  400 ids  (~14,800 url bytes)  TypeError: fetch failed

   Paul pressed "Fix missing town" with every lead selected (~1,000 ids). The whole call died in
   the candidate query, before a single Google request, and the dialog showed "non 2xx error".

   ⚠️ IT IS A CLIFF, NOT A SLOPE, AND THE OTHER CALLER WAS ALREADY ON THE EDGE. bulk-jobs'
   triageForPush does the same thing with the operator's raw selection: 316 leads (~11,700 bytes)
   worked, which is between the two measurements above. It was luck, not design.

   ⚠️ CHUNKING PRESERVES SEMANTICS EXACTLY — it is the same filter, asked in pieces, with the rows
   concatenated. What it does NOT preserve is a database-side LIMIT or ORDER: those would apply per
   chunk and mean something different. So this deliberately takes neither, and the caller sorts and
   caps the merged result itself.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Ids per request. 150 ≈ 5,500 URL bytes, comfortably inside the ~8KB where 200 still worked. */
export const IN_CHUNK = 150;

/**
 * Run a `.in(column, ids)` query in safe-sized batches and concatenate the rows.
 *
 * `run` is handed one chunk at a time and must apply the id filter itself, so the caller keeps full
 * control of the select and the other filters.
 *
 * ⛔ AN ERROR ON ANY CHUNK THROWS. It must never return a short list quietly: a partial answer here
 * would read as "these are all the candidates" and silently drop work — the same shape as a filter
 * constant that matches nothing.
 */
export async function selectInChunks<T>(
  ids: string[],
  /* ⚠️ PromiseLike, not Promise. A PostgREST builder is a THENABLE — awaitable but without
     .catch/.finally — so demanding a Promise here forces every caller to wrap it in an async
     lambda for no reason, and the compiler says so in eleven lines of generics. */
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))];
  if (unique.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    const { data, error } = await run(chunk);
    if (error) {
      throw new Error(`chunked .in() failed on ids ${i}-${i + chunk.length} of ${unique.length}: ${error.message}`);
    }
    if (data) out.push(...data);
  }
  return out;
}

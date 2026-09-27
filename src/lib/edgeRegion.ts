/* ════════════════════════════════════════════════════════════════════════════════════════════
   RUN EDGE FUNCTIONS NEXT TO THE DATABASE (2026-09-27, site-wide speed pass).

   🔴 WHY. Supabase runs an edge function in the region nearest the CALLER. Called from Paul's
   browser in Thailand, every function ran in Singapore (x-sb-edge-region: ap-southeast-1) while the
   database is in Ireland (eu-west-1) — so every database read inside every function crossed the
   world, and functions that read several tables paid it again and again. Measured on the Coverage
   niche lookup: sign-in 0.45–2.7 s → 0.14 s, its audit+run reads 1.1 s → 0.19 s, the whole call
   22–29 s → 12.5 s, output identical; a one-read function (apify-usage-status) 1.75 s → 0.9 s.

   ⛔ THE QUERY PARAMETER, NOT THE HEADER. supabase-js's own `region` option sends an `x-region`
   header as well, and every function's CORS preflight allows only authorization / x-client-info /
   apikey / content-type — the header would fail every browser call. `forceFunctionRegion` alone
   pins the region (verified: x-sb-edge-region eu-west-1) and the preflight passes unchanged.
   Only /functions/v1/ URLs are touched; database, auth and storage requests pass through as-is.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** The database's region (Supabase project ruusxpkkmwtljxxulhbq). */
export const EDGE_FUNCTION_REGION = 'eu-west-1';

/** The same URL with forceFunctionRegion set, if it is one of this project's edge functions. */
export function pinFunctionRegion(url: string, supabaseUrl: string, region: string = EDGE_FUNCTION_REGION): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  if (!base || !url.startsWith(`${base}/functions/v1/`)) return url;
  const u = new URL(url);
  if (!u.searchParams.has('forceFunctionRegion')) u.searchParams.set('forceFunctionRegion', region);
  return u.toString();
}

/** A fetch for the Supabase client: pins edge-function calls, passes everything else through.
 *  Calls the global fetch at call time (so anything that swaps window.fetch still applies). */
export function regionPinnedFetch(supabaseUrl: string): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return globalThis.fetch(pinFunctionRegion(input, supabaseUrl), init);
    if (input instanceof URL) return globalThis.fetch(pinFunctionRegion(input.toString(), supabaseUrl), init);
    const pinned = pinFunctionRegion(input.url, supabaseUrl);
    return globalThis.fetch(pinned === input.url ? input : new Request(pinned, input), init);
  };
}

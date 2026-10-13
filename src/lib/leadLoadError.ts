/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE LEAD LIST FAILED TO LOAD — SAY WHAT FAILED AND WHAT TO DO, NEVER "[object Object]".

   🔴 WHY THIS FILE (2026-10-13). Find Leads showed "Error loading leads [object Object]" while a
   search was on screen. supabase-js errors are PLAIN OBJECTS ({ code, message, details, hint }), not
   Error instances, and the load path did `String(reason)` on them. The real error underneath was the
   database's 8-second statement timeout (Postgres code 57014): the lead-list page queries peak at
   ~7.6 s on this small shared instance (pg_stat_statements, read 2026-10-13), so one slow page out of
   six fired in parallel sank the whole list.

   React-free leaf: tested by scripts/lead-load-error.test.ts.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

type ErrorLike = { message?: unknown; code?: unknown; details?: unknown; hint?: unknown; status?: unknown; name?: unknown };

/** The text inside any thrown value — an Error, a supabase-js plain object, a string. Never
 *  "[object Object]", never empty. */
export function errorMessageOf(e: unknown): string {
  if (e == null) return 'Unknown error';
  if (typeof e === 'string') return e.trim() || 'Unknown error';
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  if (typeof e === 'object') {
    const o = e as ErrorLike;
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
    if (typeof o.details === 'string' && o.details.trim()) return o.details.trim();
    if (typeof o.code === 'string' && o.code.trim()) return `Error ${o.code.trim()}`;
    try {
      const json = JSON.stringify(e);
      if (json && json !== '{}') return json.length > 200 ? `${json.slice(0, 199)}…` : json;
    } catch { /* circular — fall through */ }
  }
  const s = String(e);
  return s && s !== '[object Object]' ? s : 'Unknown error';
}

export type LeadLoadErrorKind = 'timeout' | 'network' | 'signed_out' | 'other';

/** What kind of failure it was, read from the code first, then the words. */
export function leadLoadErrorKind(e: unknown): LeadLoadErrorKind {
  const o = (e && typeof e === 'object' ? e : {}) as ErrorLike;
  const code = typeof o.code === 'string' ? o.code : '';
  const status = typeof o.status === 'number' ? o.status : null;
  const msg = errorMessageOf(e).toLowerCase();
  if (code === '57014' || /statement timeout|canceling statement|timed? ?out|upstream_timeout|\b504\b|\b522\b/.test(msg)) return 'timeout';
  if (code === 'PGRST301' || code === 'PGRST302' || status === 401 || /jwt expired|invalid jwt|not authenticated/.test(msg)) return 'signed_out';
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/.test(msg)) return 'network';
  return 'other';
}

/** The toast for a failed lead-list load: what failed, what still works, what to do. */
export function leadLoadErrorText(e: unknown): { title: string; description: string } {
  const title = 'Your lead list did not finish loading';
  switch (leadLoadErrorKind(e)) {
    case 'timeout':
      return { title, description: 'The database was busy and took too long to answer. Your search results are fine, and Add to CRM still checks for duplicates. Reload the page in a moment to load the list again.' };
    case 'network':
      return { title, description: 'The connection dropped while loading. Check your internet, then reload the page.' };
    case 'signed_out':
      return { title, description: 'Your sign-in has expired. Sign in again, then reload the page.' };
    default:
      return { title, description: `Reload the page to try again. (Detail: ${errorMessageOf(e)})` };
  }
}

/** The key an Add to CRM is single-flighted on: the Google place id, else the Maps link, else the name.
 *  Two presses for the same business while the first add runs share one add (useOutreach.addLead). */
export function addInFlightKey(lead: { id?: string | null; googleMapsUrl?: string | null; name?: string | null }): string {
  const id = String(lead.id ?? '').trim();
  if (id) return `place:${id}`;
  const url = String(lead.googleMapsUrl ?? '').trim();
  if (url) return `maps:${url}`;
  return `name:${String(lead.name ?? '').trim().toLowerCase()}`;
}

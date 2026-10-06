/* ══ PAID CLIENT TOOLS — where the page plan, the page generator and review replies live (2026-10-06) ══
   Paul: "Their functionality is now handled within Paid Clients." They were three admin destinations
   (/page-plan, /page-generator, /review-replies); they are now
     · the Tools tab of Paid Clients   /paid-clients?tool=<key>        — every client, with the pickers
                                                                         (lead-less national clients too)
     · a client's "Pages & reviews"    /paid-clients/<leadId>?section=pages&tool=<key>
                                                                       — scoped to that client
   The old URLs redirect here (legacyToolRedirect), so a bookmark, a notification or a hand-off link
   lands on the same capability instead of a 404. Nothing server-side moved: the same edge functions
   (page-generator, review-reply), tables (client_pages, client_page_questions) and logic.

   ⛔ ONE PLACE FOR THESE ADDRESSES. The hand-off (pagePlanHandoff.ts), the website-build links and the
   redirects all build them here. Pure, no imports — scripts/paid-client-tools.test.ts drives it. */

export const PAID_CLIENT_TOOLS = ['page-plan', 'page-generator', 'review-replies'] as const;
export type PaidClientTool = (typeof PAID_CLIENT_TOOLS)[number];

export const PAID_CLIENT_TOOL_LABEL: Record<PaidClientTool, string> = {
  'page-plan': 'Page plan',
  'page-generator': 'Page generator',
  'review-replies': 'Review replies',
};

/** The client hub section that holds the three tools (ClientHub ?section=). */
export const CLIENT_TOOLS_SECTION = 'pages';

/** A tool key from a URL value — anything unknown is null (never guessed into a tool). */
export function toolOf(v: string | null | undefined): PaidClientTool | null {
  return (PAID_CLIENT_TOOLS as readonly string[]).includes(v ?? '') ? (v as PaidClientTool) : null;
}

function query(pairs: Array<[string, string | null | undefined]>): string {
  const p = new URLSearchParams();
  for (const [k, v] of pairs) if (v !== null && v !== undefined && v !== '') p.set(k, v);
  return p.toString();
}

/** The Tools tab of Paid Clients, optionally carrying the generator's one-shot seed. */
export function paidClientToolUrl(tool: PaidClientTool, seed: Record<string, string | null | undefined> = {}): string {
  return '/paid-clients?' + query([['tool', tool], ...Object.entries(seed)]);
}

/** One client's "Pages & reviews" section, on the given tool, optionally carrying the seed. */
export function clientToolUrl(leadId: string, tool: PaidClientTool, seed: Record<string, string | null | undefined> = {}): string {
  return '/paid-clients/' + encodeURIComponent(leadId) + '?' + query([['section', CLIENT_TOOLS_SECTION], ['tool', tool], ...Object.entries(seed)]);
}

/** The retired admin pages, and the tool each became. */
export const LEGACY_TOOL_PATHS: Record<string, PaidClientTool> = {
  '/page-plan': 'page-plan',
  '/page-generator': 'page-generator',
  '/review-replies': 'review-replies',
};

/** Where an old URL goes now. The query string is carried over as it was (the generator's seed —
 *  mode / client / page_key / question — is read on arrival exactly as before), so an old deep link
 *  still opens the same client and page. Not a retired path → null. */
export function legacyToolRedirect(pathname: string, search: string): string | null {
  const tool = LEGACY_TOOL_PATHS[pathname.replace(/\/+$/, '')];
  if (!tool) return null;
  const carried = new URLSearchParams(search);
  carried.delete('tool');
  const rest = carried.toString();
  return '/paid-clients?tool=' + tool + (rest ? '&' + rest : '');
}

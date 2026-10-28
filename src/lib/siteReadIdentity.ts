/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE WAY TO READ A BUSINESS'S OWN WEBSITE (Paul, 2026-10-26, fix/crawl-one-standard; docs/website-check.md).

   Every path that fetches a prospect's or client's own site — the quick check and the deep crawl (crawl-check,
   crawl-worker), the agency check, the Google-listing link follow, the warm-reply research, the prospect preview,
   the Page Generator scan, the audit's homepage trade read and the email finder — sends THESE headers.

   ⛔ AN HONEST CRAWLER NAME, NEVER A BROWSER AND NEVER AN AI BOT'S NAME (Paul, 2026-10-01, first set in
   _shared/agency-crawl.ts). Until 2026-10-26 the crawl fetched pages AS OAI-SearchBot / ChatGPT-User / Claude-User /
   PerplexityBot. Cloudflare and similar firewalls refuse a request that claims a known bot's name from an address
   that is not that bot's own, so our impostor was refused while the real crawler, from its real address, got in:
   drivewelluk.co.uk answered our "OAI-SearchBot" with a 403 challenge and the same server, same second, answered
   this name with the full page. Measured on the 76 stored checks that said "all four AI crawlers are blocked": this
   name read 37 of them, none read under the bot name that this name could not read, and the rest refused or failed
   for EVERY name (dead sites, 404s, 5xx). So a refusal of our request is never evidence about an AI crawler.
   IMPORTED BY EDGE FUNCTIONS: no imports, relative path with an explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The name every site read carries: plainly a named crawler with a contact link (measured 2026-10-02: the bare name
 *  is accepted by hosts that refuse a "Mozilla/5.0 (compatible; …)" wrapper). */
export const SITE_CHECK_UA = 'LeadFinderOS-SiteCheck/1.0 (+https://findable.live)';

export const SITE_CHECK_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

/** The headers of every page read. A caller asking for something other than a page passes its own Accept. */
export const SITE_CHECK_HEADERS: Readonly<Record<string, string>> = {
  'User-Agent': SITE_CHECK_UA,
  Accept: SITE_CHECK_ACCEPT,
  'Accept-Language': 'en-GB,en;q=0.9',
};

/** How long one page read waits before it is "did not answer" — the same for the quick check and the deep crawl. */
export const SITE_FETCH_TIMEOUT_MS = 10_000;

/** What `signals.readableAs` says for a check made with this name (any non-null value = the homepage was read). */
export const SITE_CHECK_READ_AS = 'site check';

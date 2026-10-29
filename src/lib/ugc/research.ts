/* UGC AUTO-RESEARCH — fills Jess's required fields for one brand, pure (docs/ugc-brand-finder.md).
 * fn ugc-brands fetches the pages (one honest crawler name) and makes ONE model call; everything else is here.
 *
 *   pages:  the brand's own homepage, ONE product page it links to, its shipping page, and a review source
 *           (Trustpilot). Nothing else.
 *   fields (her pitch system section 2): one named product, a verified product detail written as a moment of use or a
 *           benefit (not a spec), what the brand is pushing now, reviews (buy reason / hesitation), ships to Thailand,
 *           the Instagram handle — EACH with its source URL.
 *
 * ⛔ NEVER GUESSED. The model must return, for each field, the page it came from and a quote copied from that page.
 *    verifyResearch() keeps a field ONLY when that quote is really on that page; anything else stays unknown. The
 *    Instagram handle comes from the site's own links (code, no model). Unknown stays unknown.
 * ⛔ "Reviews: none found" is recorded only when a review source was actually read and had none — never when it
 *    could not be read (her rule: never guess a hesitation). */

export type PageKind = 'home' | 'product' | 'shipping' | 'reviews';
export interface FetchedPage { kind: PageKind; url: string; ok: boolean; text: string; links: { href: string; text: string }[] }

export interface Sourced { value: string; url: string; quote: string }
export interface ResearchResult {
  product: Sourced | null;
  product_detail: Sourced | null;
  pushing_now: Sourced | null;
  reviews: { buy_reason: Sourced | null; hesitation: Sourced | null; none_found: boolean; url: string | null } | null;
  ships_to_thailand: (Sourced & { ships: boolean }) | null;
  instagram: { handle: string; url: string } | null;
  pages: { kind: PageKind; url: string; ok: boolean }[];
  rejected: string[];
}

/** Ceiling for one brand's research (one gpt-4o call over up to four capped pages). Shown before a run. */
export const RESEARCH_USD_CEILING = 0.05;
/** Brands researched automatically after a contacts run (top-ranked first). */
export const AUTO_RESEARCH_TOP = 10;
/** Characters of each page's text given to the model. */
export const PAGE_TEXT_CHARS = 9000;

/* ── HTML → text and links ─────────────────────────────────────────────────────────────────── */

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&rsquo;': "'", '&lsquo;': "'", '&ldquo;': '"', '&rdquo;': '"', '&ndash;': '-', '&mdash;': '-' };
export function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp|rsquo|lsquo|ldquo|rdquo|ndash|mdash);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function htmlToText(html: string): string {
  return decodeEntities(html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|article|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

export function htmlLinks(html: string, base: string): { href: string; text: string }[] {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 400) {
    try { out.push({ href: new URL(decodeEntities(m[1]), base).toString(), text: htmlToText(m[2]).slice(0, 80) }); } catch { /* skip */ }
  }
  return out;
}

const sameSite = (href: string, domain: string) => {
  try { const h = new URL(href).hostname.toLowerCase().replace(/^www\./, ''); return h === domain || h.endsWith(`.${domain}`); } catch { return false; }
};

/** ONE product page from the homepage's own links: a product path first, then a shop / collection path. */
export function pickProductUrl(links: readonly { href: string; text: string }[], domain: string): string | null {
  const own = links.filter((l) => sameSite(l.href, domain));
  const by = (re: RegExp) => own.find((l) => re.test(new URL(l.href).pathname))?.href ?? null;
  return by(/\/(products?|p)\/[^/]+/i) ?? by(/\/(shop|store)\/[^/]+/i) ?? by(/\/collections\/[^/]+\/products\//i) ?? by(/\/(shop|store|collections)\b/i);
}

export function pickShippingUrl(links: readonly { href: string; text: string }[], domain: string): string | null {
  const own = links.filter((l) => sameSite(l.href, domain));
  return own.find((l) => /shipping|delivery/i.test(`${new URL(l.href).pathname} ${l.text}`))?.href
    ?? own.find((l) => /\/(faq|help|returns)\b/i.test(new URL(l.href).pathname))?.href ?? null;
}

export function reviewSourceUrl(domain: string): string {
  return `https://uk.trustpilot.com/review/${domain}`;
}

/** The brand's Instagram handle from its own site's links (no model). */
export function instagramFromLinks(links: readonly { href: string }[]): { handle: string; url: string } | null {
  for (const l of links) {
    const m = l.href.match(/^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/);
    if (m && !['p', 'reel', 'reels', 'explore', 'accounts', 'stories'].includes(m[1].toLowerCase())) return { handle: m[1].toLowerCase(), url: `https://www.instagram.com/${m[1].toLowerCase()}/` };
  }
  return null;
}

/* ── the model's job, and checking it ──────────────────────────────────────────────────────── */

export const RESEARCH_OUTPUT_SHAPE = '{"product":{"value":"","url":"","quote":""},"product_detail":{"value":"","url":"","quote":""},"pushing_now":{"value":"","url":"","quote":""},"reviews":{"buy_reason":{"value":"","url":"","quote":""},"hesitation":{"value":"","url":"","quote":""},"none_found":false},"ships_to_thailand":{"ships":true,"value":"","url":"","quote":""}}';

export function researchPrompt(brand: string, pages: readonly FetchedPage[]): { system: string; user: string } {
  const system = [
    "You research a brand for a UGC creator's pitch. Use ONLY the page texts given. Never use outside knowledge, never guess.",
    'For every field give: value (short, in plain words), url (exactly one of the page URLs given), and quote (words copied EXACTLY from that page, 5 to 30 words, that prove the value). If a page does not state it, the field is null.',
    'product: ONE named product the brand sells (from the product page if there is one).',
    'product_detail: one true, specific line about THAT product written as a moment of use or a benefit, not a spec list (e.g. "the scoop goes straight into a coffee you are already drinking", not "30 ingredients in one 10g serving"). A number may support it, never be the whole line.',
    'pushing_now: what the brand pushes hardest right now (homepage hero, best-seller, headline message).',
    'reviews: from the REVIEW page only. buy_reason = the most common praise; hesitation = the most common doubt or complaint. If the review page was read and shows no reviews, set none_found true and both to null. If there is no review page, reviews is null.',
    'ships_to_thailand: from the shipping page or FAQ: ships true/false only when the page says so (Thailand by name, or a stated list/region that clearly includes or excludes it). Otherwise null.',
    `Return JSON only, this shape: ${RESEARCH_OUTPUT_SHAPE}`,
  ].join('\n');
  const user = [`Brand: ${brand}`, ...pages.filter((p) => p.ok && p.text).map((p) => `\n=== PAGE (${p.kind}) ${p.url}\n${p.text.slice(0, PAGE_TEXT_CHARS)}`)].join('\n');
  return { system, user };
}

const squash = (s: string) => decodeEntities(String(s ?? '')).toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9'"%£$.,]+/g, ' ').trim();

/** A model answer is kept only when its quote is really on the page it names (and is long enough to mean it). */
export function verifySourced(raw: unknown, pages: readonly FetchedPage[], allowed: readonly PageKind[], rejected: string[], field: string): Sourced | null {
  const o = (raw && typeof raw === 'object' ? raw : null) as { value?: unknown; url?: unknown; quote?: unknown } | null;
  if (!o || !String(o.value ?? '').trim()) return null;
  const url = String(o.url ?? '').trim();
  const quote = String(o.quote ?? '').trim();
  const page = pages.find((p) => p.ok && p.url === url && allowed.includes(p.kind));
  if (!page) { rejected.push(`${field}: source is not one of the pages read`); return null; }
  const q = squash(quote);
  if (q.split(' ').length < 4 || !squash(page.text).includes(q)) { rejected.push(`${field}: quote not found on ${page.kind} page`); return null; }
  return { value: String(o.value).trim().slice(0, 300), url, quote: quote.slice(0, 300) };
}

export function verifyResearch(raw: Record<string, unknown> | null, pages: readonly FetchedPage[]): ResearchResult {
  const rejected: string[] = [];
  const r = raw ?? {};
  const home = pages.find((p) => p.kind === 'home');
  const reviewsPage = pages.find((p) => p.kind === 'reviews' && p.ok);
  const rv = (r.reviews && typeof r.reviews === 'object' ? r.reviews : null) as { buy_reason?: unknown; hesitation?: unknown; none_found?: unknown } | null;
  const buy = rv ? verifySourced(rv.buy_reason, pages, ['reviews'], rejected, 'reviews.buy_reason') : null;
  const hes = rv ? verifySourced(rv.hesitation, pages, ['reviews'], rejected, 'reviews.hesitation') : null;
  /* "none found" only when the review page was really read and the model says it has none. */
  const noneFound = !!reviewsPage && !buy && !hes && rv?.none_found === true;
  const sh = (r.ships_to_thailand && typeof r.ships_to_thailand === 'object' ? r.ships_to_thailand : null) as { ships?: unknown } | null;
  const ships = sh && typeof sh.ships === 'boolean' ? verifySourced(sh, pages, ['shipping', 'home', 'product'], rejected, 'ships_to_thailand') : null;
  return {
    product: verifySourced(r.product, pages, ['product', 'home'], rejected, 'product'),
    product_detail: verifySourced(r.product_detail, pages, ['product', 'home'], rejected, 'product_detail'),
    pushing_now: verifySourced(r.pushing_now, pages, ['home'], rejected, 'pushing_now'),
    reviews: buy || hes || noneFound ? { buy_reason: buy, hesitation: hes, none_found: noneFound, url: reviewsPage?.url ?? null } : null,
    ships_to_thailand: ships && sh ? { ...ships, ships: sh.ships as boolean } : null,
    instagram: home ? instagramFromLinks(home.links) : null,
    pages: pages.map((p) => ({ kind: p.kind, url: p.url, ok: p.ok })),
    rejected,
  };
}

/** Her readiness fields from a research result: what is still missing before a pitch may be drafted. */
export function researchGaps(r: Partial<ResearchResult> | null | undefined): string[] {
  const g: string[] = [];
  if (!r?.product) g.push('product');
  if (!r?.product_detail) g.push('verified product detail');
  if (!r?.pushing_now) g.push('what the brand is pushing now');
  if (!r?.reviews) g.push('reviews (or a review source read with none found)');
  return g;
}

/** The reviews line in her format: "buy reason: …; hesitation: …" or "none found". */
export function reviewsLine(r: ResearchResult['reviews']): string | null {
  if (!r) return null;
  if (r.none_found) return 'Reviews: none found';
  return [r.buy_reason ? `buy reason: ${r.buy_reason.value}` : null, r.hesitation ? `hesitation: ${r.hesitation.value}` : null].filter(Boolean).join('; ') || null;
}

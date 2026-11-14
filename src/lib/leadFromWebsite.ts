/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FILL A LEAD FROM ITS WEBSITE (2026-11-14, v1/add-lead-from-website; ported in behaviour from V2's add-by-website).

   "Add a lead you found": paste the website, press "Fill from website", and the form is filled with what the
   site itself STATES — name, trade, phone, email, address / town, services and areas. The edge function
   `lead-from-website` fetches the pages; this module holds every rule, so it is tested here
   (scripts/lead-from-website.test.ts) and nothing is decided in the browser.

   ⛔ ONLY FACTS THE SITE STATES. A blank stays blank. Every value the model returns is checked against the
      text it was given (keepStatedFacts): a phone whose digits are not on the page, an email not on the page, a
      service or place the page never names — dropped. The form only fills fields the person left empty.
   ⛔ THE NAME, IN THIS ORDER (pickBusinessName): structured data (schema.org LocalBusiness / Organization —
      legalName, then a name that is not a service heading) → the footer's legal name ("© 2026 London Domestic
      Maintenance Ltd.") → og:site_name → the page title, cleaned, as the last resort (never a service heading
      like "EICR Certificate Camden Town").
   ⛔ THE TRADE IS THE BUSINESS AS A WHOLE, never the one service page that was pasted: the edge function always
      reads the site's HOMEPAGE, whatever path was pasted. Order (pickTrade): the specific schema.org type
      ("RoofingContractor" → "roofing contractor") → the name minus its place ("London Domestic Maintenance Ltd"
      → "domestic maintenance") → the model's trade, only when its words are on the site.
   ⛔ A SITE THAT BLOCKS AUTOMATED READERS is said plainly on the form, never worked around. It says nothing about
      whether AI tools can read it (siteReadIdentity.ts), so it is never worded as "AI is blocked". Same detector
      as the agency check (agencyDetect.ts pageProblem).

   Pure; no I/O. IMPORTED BY AN EDGE FUNCTION: no imports.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface WebsiteFacts {
  name?: string;
  /** Where the name came from (a title-only guess is said as one on the form). */
  nameSource?: 'structured_data' | 'footer_legal_name' | 'site_name' | 'title';
  trade?: string;
  phone?: string;
  email?: string;
  address?: string;
  town?: string;
  services?: string[];
  areas?: string[];
}

export interface FillResult {
  ok: boolean;
  /** The site refused our reader (401 / 403 / 429 / a bot-check page). */
  blocked?: boolean;
  /** The site could not be reached / read at all (dead, timeout, not a page). */
  unreadable?: boolean;
  facts: WebsiteFacts;
  /** The homepage actually read. */
  readUrl?: string;
  pagesRead?: number;
  error?: string;
}

export const BLOCKED_LINE = 'This website blocks automated readers, so nothing could be filled in. Type the details yourself. When you add the lead it is noted on the lead as a website finding.';
export const UNREADABLE_LINE = 'This website could not be read (it did not answer, or there was no page). Type the details yourself.';
export const NOTHING_FOUND_LINE = 'The website was read, but it does not state these details. Type them yourself.';

/* ── HTML helpers ─────────────────────────────────────────────────────────────────────────────── */

const NAMED: Record<string, string> = {
  nbsp: ' ', amp: '&', pound: '£', quot: '"', apos: "'", lt: '<', gt: '>', euro: '€', copy: '©', reg: '®',
  trade: '™', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', bull: '•',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => { const n = parseInt(h, 16); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' '; })
    .replace(/&#(\d+);/g, (_m, d) => { const n = parseInt(d, 10); return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ' '; })
    .replace(/&([a-z][a-z0-9]*);/gi, (_m, k) => NAMED[String(k).toLowerCase()] ?? ' ');
}

const ZW = /[\u200b-\u200d\u2060\ufeff]/g;
const clean = (s: string) => decodeEntities(s).replace(ZW, '').replace(/\s+/g, ' ').trim();

/** Readable text of a page (scripts / styles / tags out, whitespace collapsed, block ends kept as line breaks). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/footer|\/section)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(ZW, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const c = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
  return c ? clean(c) || null : null;
}

export function pageTitle(html: string): string | undefined {
  const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return t ? clean(t) || undefined : undefined;
}

/* ── Blocked / unreadable ─────────────────────────────────────────────────────────────────────── */

/** Did the site refuse our reader? The agency check's rule (agencyDetect.ts pageProblem): 401 / 403 / 429, or a
 *  Cloudflare / SiteGround / captcha challenge page. A challenge is never worked around. */
export function isBlockedResponse(status: number, html: string): boolean {
  if (status === 401 || status === 403 || status === 429) return true;
  if (/<title>\s*(just a moment|attention required|access denied|checking your browser)/i.test(html)) return true;
  return /cf-chl|challenge-platform|captcha-delivery|\/\.well-known\/sgcaptcha\//i.test(html);
}

/** The address to read, or null. https:// is added when missing; only http(s) to a public-looking host, no
 *  user:password, no spaces (V2's websiteToRead). The edge function adds the private-address check. */
export function websiteToRead(raw: string): URL | null {
  const v = (raw ?? '').trim();
  if (!v || v.length > 300 || /\s/.test(v)) return null;
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || !u.hostname.includes('.')) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid)$/i.test(u.hostname)) return null;
  return u;
}

/** A social / directory page is not the business's own website. */
export function isSocialOrDirectory(u: URL): boolean {
  return /(^|\.)(facebook|fb|instagram|linkedin|twitter|x|tiktok|youtube|yell|checkatrade|trustatrader|mybuilder|ratedpeople|bark|google|goo)\.(com|co\.uk|gl|ie)$/i.test(u.hostname);
}

/* ── Structured data (schema.org JSON-LD) ─────────────────────────────────────────────────────── */

/** schema.org types that never describe the business itself. */
const NOT_A_BUSINESS = /^(WebSite|WebPage|ItemPage|AboutPage|ContactPage|CollectionPage|BreadcrumbList|ListItem|ImageObject|Product|Offer|Article|BlogPosting|NewsArticle|FAQPage|Question|Answer|Person|Review|Rating|AggregateRating|SearchAction|SiteNavigationElement|VideoObject|Event|PostalAddress|GeoCoordinates|Place|OpeningHoursSpecification|Service|ReadAction|EntryPoint|ContactPoint|Brand)$/i;

export interface LdBusiness { types: string[]; legalName?: string; name?: string; telephone?: string; email?: string; address?: string; town?: string }

function flattenLd(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) { for (const n of node) flattenLd(n, out); return; }
  if (!node || typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  out.push(o);
  if (o['@graph']) flattenLd(o['@graph'], out);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && clean(v) ? clean(v) : undefined);

/** Every business node in the page's JSON-LD (bad JSON is skipped, never guessed at). */
export function ldBusinesses(html: string): LdBusiness[] {
  const nodes: Record<string, unknown>[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { flattenLd(JSON.parse(m[1].trim()), nodes); } catch { /* malformed JSON-LD: ignored */ }
  }
  const out: LdBusiness[] = [];
  for (const n of nodes) {
    const t = n['@type'];
    const types = (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string');
    if (!types.length || types.some((x) => NOT_A_BUSINESS.test(x))) continue;
    const a = n.address;
    const addr = (Array.isArray(a) ? a[0] : a) as Record<string, unknown> | string | undefined;
    let address: string | undefined; let town: string | undefined;
    if (typeof addr === 'string') address = str(addr);
    else if (addr && typeof addr === 'object') {
      const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion, addr.postalCode].map(str).filter(Boolean) as string[];
      address = parts.length ? parts.join(', ') : undefined;
      town = str(addr.addressLocality);
    }
    if (!str(n.name) && !str(n.legalName) && !str(n.telephone) && !address) continue;
    out.push({ types, legalName: str(n.legalName), name: str(n.name), telephone: str(n.telephone), email: str(n.email)?.replace(/^mailto:/i, ''), address, town });
  }
  return out;
}

/* ── The name ─────────────────────────────────────────────────────────────────────────────────── */

const LEGAL_SUFFIX = String.raw`(?:Ltd\.?|Limited|LLP|PLC|plc|CIC|Pty\.? Ltd\.?|Teoranta|DAC|Sdn\.? Bhd\.?|Pte\.? Ltd\.?)`;

/** A heading, not a name: "EICR Certificate Camden Town", "Emergency Plumber in Leeds", "Boiler Repairs 24/7" (V2's rule). */
const SERVICE_WORDS = /\b(certificates?|repairs?|installations?|installers?|replacements?|quotes?|prices?|costs?|emergency|cheap|best|near me|services? in|in [A-Z])\b|\d/i;
export const looksLikeServiceHeading = (n: string) => SERVICE_WORDS.test(n);

/** The footer's legal name: "© 2026 London Domestic Maintenance Ltd. All rights reserved.", "Copyright © 2019-2024
 *  Acme Plumbing Limited", "Acme Ltd is registered in England…". The name only; the year and the rest are cut. */
export function footerLegalName(text: string): string | undefined {
  const flat = text.replace(/\s+/g, ' ');
  const name = String.raw`([A-Z0-9&][\w&'’.-]*(?:\s+[A-Z0-9&][\w&'’.-]*){0,6}\s+${LEGAL_SUFFIX})(?![A-Za-z])`;
  const pats = [
    new RegExp(String.raw`(?:©|\([cC]\)|[cC]opyright|COPYRIGHT)\s*(?:©\s*)?(?:\d{4}\s*(?:[-–]\s*\d{4}\s*)?)?(?:by\s+)?${name}`),
    new RegExp(String.raw`${name}\s*[,(]?\s*(?:is\s+)?(?:a\s+company\s+)?(?:registered\s+in|Company\s+(?:No|Number|Reg))`),
  ];
  for (const re of pats) {
    const m = flat.match(re);
    if (m) return m[1].replace(/\.$/, '').replace(/\s+/g, ' ').trim();
  }
  return undefined;
}

/** "London Domestic Maintenance Ltd | Professional Property Services" → the first part; "Home - Acme Plumbing"
 *  → "Acme Plumbing". */
export function cleanTitle(title: string): string | undefined {
  const t = clean(title);
  if (!t) return undefined;
  const parts = t.split(/\s[|–—\-:•·»]\s/).map((p) => p.trim()).filter(Boolean);
  const junk = /^(home|homepage|home page|welcome|index|official site|official website)$/i;
  const pick = parts.filter((p) => !junk.test(p))[0] ?? parts[0];
  if (!pick || pick.length > 70) return undefined;
  return pick.replace(/^welcome to\s+/i, '').trim() || undefined;
}

export function pickBusinessName(html: string, text = htmlToText(html)): { name?: string; source?: WebsiteFacts['nameSource'] } {
  for (const b of ldBusinesses(html)) {
    /* legalName first; a "name" that reads like a service heading never wins. */
    if (b.legalName && b.legalName.length <= 90) return { name: b.legalName, source: 'structured_data' };
    if (b.name && b.name.length <= 90 && !looksLikeServiceHeading(b.name)) return { name: b.name, source: 'structured_data' };
  }
  const legal = footerLegalName(text);
  if (legal) return { name: legal, source: 'footer_legal_name' };
  const site = metaContent(html, 'og:site_name');
  const siteName = site ? cleanTitle(site) : undefined;
  if (siteName) return { name: siteName, source: 'site_name' };
  const title = pageTitle(html);
  const fromTitle = title ? cleanTitle(title) : undefined;
  return fromTitle && !looksLikeServiceHeading(fromTitle) ? { name: fromTitle, source: 'title' } : {};
}

/* ── The trade (the business as a whole) ──────────────────────────────────────────────────────── */

const GENERIC_TYPES = /^(LocalBusiness|Organization|Corporation|ProfessionalService|HomeAndConstructionBusiness|Store|OnlineBusiness|OnlineStore)$/i;

/** The most specific schema.org type, in words: "RoofingContractor" → "roofing contractor". */
export function tradeFromSchema(html: string): string | undefined {
  for (const b of ldBusinesses(html)) {
    const t = b.types.find((x) => !GENERIC_TYPES.test(x));
    if (t) return t.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }
  return undefined;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "London Domestic Maintenance Ltd" with London a known place → "domestic maintenance". Counts only when a place
 *  was actually taken out and 1-4 plain words remain (V2's rule), so "Acme Roofing Ltd" or "Moments" give nothing. */
export function tradeFromName(name: string, places: string[]): string | undefined {
  let n = name.replace(new RegExp(String.raw`\s*(?:&\s*Co\.?|${LEGAL_SUFFIX})\s*$`, 'i'), '').trim();
  const ps = [...new Set(places.map((p) => p.trim()).filter((p) => p.length >= 3))].sort((a, b) => b.length - a.length);
  let removed = false;
  for (const p of ps) {
    const re = new RegExp(String.raw`\b${escapeRe(p)}\b`, 'i');
    if (re.test(n)) { n = n.replace(re, ' ').replace(/\s+/g, ' ').trim(); removed = true; }
  }
  n = n.replace(/^(?:of|the|and|&)\s+|\s+(?:of|the|and|&)$/gi, '').trim();
  const words = n.split(' ').filter(Boolean);
  if (!removed || !words.length || words.length > 4 || /\d/.test(n)) return undefined;
  return n.toLowerCase();
}

/** Trade, in order: the schema type → the name minus its place → the model's trade (already checked as stated). */
export function pickTrade(html: string, name: string | undefined, places: string[], modelTrade: string | undefined): string | undefined {
  return tradeFromSchema(html) ?? (name ? tradeFromName(name, places) : undefined) ?? modelTrade;
}

/* ── Phone / email (read off the markup, never guessed) ───────────────────────────────────────── */

export function telLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) {
    let v = m[1];
    try { v = decodeURIComponent(v); } catch { /* keep raw */ }
    v = clean(v).replace(/^\/\//, '');
    const n = v.replace(/\D/g, '').length;
    if (n >= 9 && n <= 15 && !out.includes(v)) out.push(v);
  }
  return out;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const JUNK_EMAIL = /^(no-?reply|donotreply|example|test|user|name|email|your|you|someone)@|@(example|domain|yourdomain|sentry|wixpress|email)\.|\.(png|jpe?g|gif|webp|svg)$/i;

export function emailsOn(html: string): string[] {
  const out: string[] = [];
  const add = (e: string) => {
    let v = e; try { v = decodeURIComponent(e); } catch { /* keep raw */ }
    v = v.trim().toLowerCase();
    if (/^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(v) && !JUNK_EMAIL.test(v) && !out.includes(v)) out.push(v);
  };
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)) add(m[1]);
  for (const m of htmlToText(html).matchAll(EMAIL_RE)) add(m[0]);
  return out;
}

/** Own-domain email first ("info@acme.co.uk" over "acme@gmail.com"). */
export function pickEmail(emails: string[], host: string): string | undefined {
  const root = host.replace(/^www\./, '').toLowerCase();
  return emails.find((e) => e.endsWith(`@${root}`) || e.endsWith(`.${root}`)) ?? emails[0];
}

/* ── Same-site pages worth reading ───────────────────────────────────────────────────────────── */

/** Contact first, then about / services / areas pages (same site only, no files). */
export function pagesWorthReading(html: string, base: URL, limit = 3): string[] {
  const score = (s: string) => (/contact|get-in-touch|find-us/i.test(s) ? 3 : /about|who-we-are/i.test(s) ? 2 : /service|what-we-do|area/i.test(s) ? 1 : 0);
  const cands: { url: string; s: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (/^(mailto|tel|javascript):/i.test(m[1])) continue;
    let u: URL;
    try { u = new URL(m[1], base); } catch { continue; }
    if (u.hostname !== base.hostname || !/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4)$/i.test(u.pathname)) continue;
    const s = score(u.pathname + ' ' + htmlToText(m[2]));
    if (!s) continue;
    u.hash = ''; u.search = '';
    if (u.href === base.href || cands.some((c) => c.url === u.href)) continue;
    cands.push({ url: u.href, s });
  }
  cands.sort((a, b) => b.s - a.s);
  return cands.slice(0, limit).map((c) => c.url);
}

/* ── Keep only what the site states ──────────────────────────────────────────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
const digits = (s: string) => s.replace(/\D/g, '');

/** Is this phrase on the page? Case- and spacing-insensitive, whole phrase. */
export function statedIn(text: string, phrase: string): boolean {
  const p = norm(phrase);
  return p.length > 1 && norm(text).includes(p);
}

/** Every word (3+ letters) of the trade is on the page, allowing a plural / "-er" ending: "domestic maintenance"
 *  passes on a site that says "domestic maintenance services"; "electrician" fails on a site that never says it. */
export function tradeStated(text: string, trade: string): boolean {
  const words = norm(trade).split(/[^a-z]+/).filter((w) => w.length >= 3);
  if (!words.length) return false;
  const t = norm(text);
  return words.every((w) => t.includes(w.length > 5 ? w.replace(/(ers|er|s)$/, '') : w));
}

export interface ModelFacts { trade?: unknown; phone?: unknown; email?: unknown; address?: unknown; town?: unknown; services?: unknown; areas?: unknown }

const one = (v: unknown, cap: number) => (typeof v === 'string' && clean(v) ? clean(v).slice(0, cap) : undefined);
const list = (v: unknown, cap: number, max: number) => {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>(); const out: string[] = [];
  for (const x of v) {
    const s = one(x, cap);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase()); out.push(s);
    if (out.length >= max) break;
  }
  return out;
};

/** The model's answer, with everything the page does not state removed. */
export function keepStatedFacts(m: ModelFacts, text: string): WebsiteFacts {
  const out: WebsiteFacts = {};
  const pageDigits = digits(text);
  const trade = one(m.trade, 60);
  if (trade && trade.split(' ').length <= 4 && tradeStated(text, trade)) out.trade = trade.toLowerCase();
  const phone = one(m.phone, 40);
  if (phone && digits(phone).length >= 9 && pageDigits.includes(digits(phone))) out.phone = phone;
  const email = one(m.email, 120)?.toLowerCase();
  if (email && /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(email) && !JUNK_EMAIL.test(email) && norm(text).includes(email)) out.email = email;
  /* An address is kept only when every comma part is on the page — the model cannot assemble one from fragments. */
  const address = one(m.address, 200);
  if (address && address.split(',').map((p) => p.trim()).filter(Boolean).every((p) => statedIn(text, p))) out.address = address;
  const town = one(m.town, 60);
  if (town && statedIn(text, town)) out.town = town;
  const services = list(m.services, 80, 15).filter((s) => statedIn(text, s));
  if (services.length) out.services = services;
  const areas = list(m.areas, 40, 15).filter((a) => statedIn(text, a) && !/\b(surrounding|nearby|areas?|nationwide|uk|united kingdom|ireland|australia)\b/i.test(a));
  if (areas.length) out.areas = areas;
  return out;
}

/** Deterministic facts from the homepage (+ the other pages' html): name, phone, email, address / town. */
export function readMarkup(homeHtml: string, otherHtml: string[], host: string): WebsiteFacts {
  const out: WebsiteFacts = {};
  const { name, source } = pickBusinessName(homeHtml);
  if (name) { out.name = name; out.nameSource = source; }
  const ld = [homeHtml, ...otherHtml].flatMap(ldBusinesses);
  const phone = ld.find((b) => b.telephone)?.telephone ?? telLinks(homeHtml)[0] ?? otherHtml.flatMap(telLinks)[0];
  if (phone) out.phone = phone;
  const email = ld.find((b) => b.email && !JUNK_EMAIL.test(b.email))?.email?.toLowerCase() ?? pickEmail([homeHtml, ...otherHtml].flatMap(emailsOn), host);
  if (email) out.email = email;
  const addr = ld.find((b) => b.address);
  if (addr?.address) out.address = addr.address;
  if (addr?.town) out.town = addr.town;
  return out;
}

/** Markup facts and (stated) model facts together: the markup wins for the same field; the trade follows pickTrade. */
export function combineFacts(homeHtml: string, markup: WebsiteFacts, model: WebsiteFacts): WebsiteFacts {
  const out: WebsiteFacts = { ...model };
  for (const [k, v] of Object.entries(markup) as [keyof WebsiteFacts, never][]) if (v !== undefined && v !== '') out[k] = v;
  const places = [out.town, ...(out.areas ?? []), model.town].filter((p): p is string => !!p);
  const trade = pickTrade(homeHtml, out.name, places, model.trade);
  if (trade) out.trade = trade; else delete out.trade;
  return out;
}

/** The prompt the edge function sends with the page text. Literal only. */
export const FACTS_SYSTEM_PROMPT = `You read the plain text of a business's OWN website and report only facts the text STATES.

THE ONE RULE: never invent, infer, guess, normalise or complete a value. If the text does not state it, omit the field. An omitted field is the correct answer when it is not shown.

- "trade": what the business as a WHOLE does, in 1-4 plain words a customer would search for, using words that appear in the text (e.g. "plumber", "domestic maintenance", "electrician", "dental practice"). Describe the whole business, not one service or one page. Omit if unclear.
- "phone": the business phone exactly as written. Omit if none.
- "email": the business email exactly as written. Omit if none.
- "address": the business's postal address as one comma-joined line exactly as written. Omit if none is shown; never assemble one from scattered fragments.
- "town": the town or city the business is based in, exactly as written in its address or a phrase like "based in X". Omit if not stated.
- "services": up to 15 services the site names, exactly as written. No navigation labels, headings, prices, reviews or accreditations.
- "areas": up to 15 towns, cities or districts the site says it covers or serves, exactly as written. Place names only; no "surrounding areas", no counties as catch-alls.

Return ONLY a JSON object: {"trade"?: string, "phone"?: string, "email"?: string, "address"?: string, "town"?: string, "services"?: string[], "areas"?: string[]}`;

/** The up-front "Phone (or Google Maps link)" box holds either; a link goes to the Maps field. */
export function isMapsLink(v: string): boolean {
  const s = (v ?? '').trim();
  return /^https?:\/\//i.test(s) || /(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.)/i.test(s);
}

/** A number the site writes with its country code says the country ("+353 …" → Ireland). Only these five, the
 *  countries the form offers; anything else says nothing. */
export function countryFromPhone(phone: string | undefined): 'UK' | 'Ireland' | 'Australia' | 'Malaysia' | 'Singapore' | null {
  const d = (phone ?? '').trim().replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (!d.startsWith('+')) return null;
  if (d.startsWith('+44')) return 'UK';
  if (d.startsWith('+353')) return 'Ireland';
  if (d.startsWith('+61')) return 'Australia';
  if (d.startsWith('+60')) return 'Malaysia';
  if (d.startsWith('+65')) return 'Singapore';
  return null;
}

/** Fill only the form fields the person left blank (a typed value is never overwritten). */
export function fillBlanks<T extends Record<string, string>>(form: T, facts: WebsiteFacts): { next: T; filled: string[] } {
  const next = { ...form } as Record<string, string>;
  const filled: string[] = [];
  const set = (k: string, v: string | undefined) => {
    if (!v || !(k in next) || next[k].trim()) return;
    next[k] = v; filled.push(k);
  };
  set('businessName', facts.name);
  set('trade', facts.trade);
  set('town', facts.town);
  set('phone', facts.phone);
  set('email', facts.email);
  set('address', facts.address);
  set('services', facts.services?.join(', '));
  set('areas', facts.areas?.join(', '));
  return { next: next as T, filled };
}

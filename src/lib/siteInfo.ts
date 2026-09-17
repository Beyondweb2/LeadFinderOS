/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SITE INFO — everything useful in the HTML crawl-check already fetches, for the operator to read
   BEFORE a conversation (Paul, 2026-09-17). Kept STRICTLY SEPARATE from the AI-visibility faults
   (CrawlSignals): the faults decide whether audit_followup_fault is available; this is reading
   material and must never leak into that decision, or the other way.

   ⛔ ONLY WHAT WAS ACTUALLY FOUND. NO INFERENCE. A field with no clear signal is null / empty and the
   UI shows it as missing. Every value here is read out of the markup — a link, a schema field, a
   footer line — never guessed from the absence of one. This is a leaf (no DOM, no React), so the
   edge function and the tests both run it; it works on the raw HTML string the crawler received.

   The two Paul reads first: WHO BUILT IT (predicts whether he can get access) and WHICH DIRECTORIES
   (where ChatGPT likely got its information). Both are captured conservatively and reported as the
   raw thing found — a domain, a brand name — not an interpretation of it. */

/** Bump when the shape of what we extract changes, so the popup can tell a pre-siteInfo crawl row
 *  ("run again to capture site info") from one that genuinely found nothing. SEPARATE from
 *  CRAWL_CHECK_VERSION — that versions the faults, and bumping it would blank the report's fault
 *  section and the audit_followup_fault gate for every lead. This never touches the faults. */
export const SITE_INFO_VERSION = 1;

export interface SiteBuiltBy {
  /** The name after "website/site/designed/built/developed/powered by …", verbatim, or null. */
  credit: string | null;
  /** The platform, when a known signature is present (WordPress, Wix, Squarespace, …), or null. */
  platform: string | null;
  /** External domains linked in the FOOTER that are not this site, a social network, a directory or
   *  a known platform CDN — a footer link to an agency's domain is the tell even with no words
   *  (Paul). Reported as the bare domains found, never named as "the builder". */
  footerLinks: string[];
}

export interface SiteStaleness {
  /** The largest year next to a © / copyright in the page, or null. */
  copyrightYear: number | null;
  /** The newest JSON-LD datePublished found across the pages read (ISO date), or null. A blog date
   *  we can actually see; we never guess one from an absent feed. */
  lastDatePublished: string | null;
}

export interface SiteInfo {
  email: string | null;
  phone: string | null;
  address: string | null;
  /** Opening hours strings from schema.org markup only — freeform "Mon–Fri 9–5" text is not read,
   *  because pulling hours out of prose is exactly the inference this file refuses. */
  openingHours: string[] | null;
  companyNumber: string | null;
  builtBy: SiteBuiltBy;
  socialLinks: Array<{ platform: string; url: string }>;
  /** Services listed in the nav and in sampled page titles — real menu/markup text, deduped. */
  services: string[];
  /** Towns from the location-page cluster crawl-check already found — the varying slug part. */
  towns: string[];
  /** Directory / trust brands referenced (link or visible text): Yell, Checkatrade, … Reported by
   *  brand name. */
  directories: string[];
  staleness: SiteStaleness;
}

export interface SiteInfoInput {
  /** The site's own origin, e.g. https://acme.co.uk — to tell internal from external links. */
  origin: string;
  /** Sampled inner pages (their HTML), for services from <title> and the newest datePublished. */
  samplePages?: Array<{ url: string; html: string }>;
  /** The URLs of the templated location-page cluster crawl-check found — the town source. */
  clusterUrls?: string[];
}

/* ── small HTML helpers (string-level, deliberately crude, never throw) ─────────────────────────── */

/** Decode the handful of entities that matter for the text we read. Not a full decoder. */
function decode(s: string): string {
  return s
    .replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ")
    .replace(/&#0?39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_m, d) => { try { return String.fromCodePoint(Number(d)); } catch { return _m; } })
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

/** Strip tags to visible-ish text, collapsing whitespace. */
function textOf(html: string): string {
  return decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** All href values in the html (raw, not resolved). */
function hrefs(html: string): string[] {
  const out: string[] = [];
  const re = /<a\b[^>]*href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(decode(m[1]));
  return out;
}

/** The footer region: the last <footer>…</footer> if present, else the last 20% of the body. Where
 *  the copyright, the "built by" line and the agency link live. */
function footerHtml(html: string): string {
  const m = /<footer\b[^>]*>([\s\S]*?)<\/footer>/i.exec(html);
  if (m) return m[1];
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return body.slice(Math.floor(body.length * 0.8));
}

/** hostname of a URL, lowercased, www-stripped, or null. */
function hostOf(u: string): string | null {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; }
}

/* ── the JSON-LD blocks, parsed and walked ─────────────────────────────────────────────────────── */

// deno-lint-ignore no-explicit-any
function jsonLdNodes(html: string): any[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const stack = [parsed];
      while (stack.length) {
        const n = stack.pop();
        if (Array.isArray(n)) stack.push(...n);
        else if (n && typeof n === "object") {
          out.push(n);
          for (const v of Object.values(n)) if (v && typeof v === "object") stack.push(v);
        }
      }
    } catch { /* a malformed block is skipped, never fatal */ }
  }
  // deno-lint-ignore no-explicit-any
  return out as any[];
}

/* ── social + directory + platform tables ──────────────────────────────────────────────────────── */

const SOCIAL: Array<{ platform: string; host: RegExp }> = [
  { platform: "Facebook", host: /(^|\.)facebook\.com$/ },
  { platform: "Instagram", host: /(^|\.)instagram\.com$/ },
  { platform: "X", host: /(^|\.)(twitter|x)\.com$/ },
  { platform: "LinkedIn", host: /(^|\.)linkedin\.com$/ },
  { platform: "YouTube", host: /(^|\.)(youtube\.com|youtu\.be)$/ },
  { platform: "TikTok", host: /(^|\.)tiktok\.com$/ },
];

/** Directory / trust brands — Yell first, it turns up most in Paul's ChatGPT citations. Detected by
 *  a link to the domain OR the brand named in visible text. Reported by brand name. */
const DIRECTORIES: Array<{ name: string; host: RegExp; text: RegExp }> = [
  { name: "Yell", host: /(^|\.)yell\.com$/, text: /\byell\.com\b|\byell\b/i },
  { name: "Checkatrade", host: /(^|\.)checkatrade\.com$/, text: /\bcheckatrade\b/i },
  { name: "TrustATrader", host: /(^|\.)trustatrader\.com$/, text: /\btrust\s*a\s*trader\b/i },
  { name: "Which? Trusted Trader", host: /(^|\.)which\.co\.uk$/, text: /\bwhich\?\s*trusted\s*trader\b|\bwhich\?\s*trusted\b/i },
  { name: "Trustpilot", host: /(^|\.)trustpilot\.com$/, text: /\btrustpilot\b/i },
  { name: "MyBuilder", host: /(^|\.)mybuilder\.com$/, text: /\bmybuilder\b/i },
  { name: "Rated People", host: /(^|\.)ratedpeople\.com$/, text: /\brated\s*people\b/i },
  { name: "Bark", host: /(^|\.)bark\.com$/, text: /\bbark\.com\b/i },
];

/** Platform signatures — a generator meta tag, a tell-tale asset host, or a body marker. */
const PLATFORMS: Array<{ name: string; re: RegExp }> = [
  { name: "WordPress", re: /wp-content|wp-includes|<meta[^>]+generator[^>]+wordpress/i },
  { name: "Wix", re: /static\.wixstatic\.com|wix\.com|_wixcssimports|X-Wix-/i },
  { name: "Squarespace", re: /static1\.squarespace\.com|squarespace\.com|\bsquarespace\b/i },
  { name: "Shopify", re: /cdn\.shopify\.com|\.myshopify\.com|shopify/i },
  { name: "GoDaddy", re: /godaddy|website builder.*godaddy/i },
  { name: "Weebly", re: /weebly\.com|editmysite\.com/i },
  { name: "Duda", re: /dudamobile|\/dmalbum\/|irp\.cdn-website\.com/i },
  { name: "Webflow", re: /\.webflow\.io|webflow\.com|data-wf-/i },
];

/* Hosts that are NOT an agency even when linked in the footer — socials, directories, platforms,
   maps, review widgets, government. Keeps builtBy.footerLinks to genuine candidates. */
const NON_AGENCY_HOST = /(^|\.)(facebook|instagram|twitter|x|linkedin|youtube|youtu|tiktok|yell|checkatrade|trustatrader|which|trustpilot|mybuilder|ratedpeople|bark|google|goo\.gl|maps|bing|apple|wix|squarespace|shopify|godaddy|weebly|webflow|wordpress|gov\.uk|paypal|stripe|whatsapp|wa\.me|mailto|tel)\b/i;

/* ── the extractors ─────────────────────────────────────────────────────────────────────────────── */

function firstEmail(html: string): string | null {
  const mailto = /href=["']mailto:([^"'?]+)/i.exec(html);
  const cand = mailto?.[1] ?? textOf(html).match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0] ?? null;
  if (!cand) return null;
  const e = cand.trim().toLowerCase();
  // Drop obvious non-contact noise (tracking / placeholder / image sprites misread as emails).
  if (/(sentry|example\.|wixpress|\.png$|\.jpg$|\.gif$|@sentry|@2x)/.test(e)) return null;
  return e;
}

function firstPhone(html: string): string | null {
  const tel = /href=["']tel:([+\d][\d\s()+-]{6,})/i.exec(html);
  if (tel) return tel[1].replace(/\s+/g, " ").trim();
  const m = textOf(html).match(/(?:\+44\s?|\(?0)\d(?:[\d\s()-]{7,12})\d/);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

// deno-lint-ignore no-explicit-any
function fromJsonLd(nodes: any[]) {
  let email: string | null = null, phone: string | null = null, address: string | null = null;
  let hours: string[] | null = null, newestDate: string | null = null;
  for (const n of nodes) {
    if (!email && typeof n.email === "string") email = n.email.replace(/^mailto:/i, "").trim().toLowerCase();
    if (!phone && typeof n.telephone === "string") phone = n.telephone.trim();
    if (!address && n.address && typeof n.address === "object") {
      const a = n.address;
      const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter((x: unknown) => typeof x === "string" && x.trim());
      if (parts.length) address = parts.join(", ");
    }
    const oh = n.openingHours ?? n.openingHoursSpecification;
    if (!hours && oh) {
      const arr = Array.isArray(oh) ? oh : [oh];
      const strs = arr.map((x: unknown) => typeof x === "string" ? x
        // deno-lint-ignore no-explicit-any
        : (x && typeof x === "object") ? [(x as any).dayOfWeek, (x as any).opens, (x as any).closes].filter(Boolean).join(" ") : "")
        .map((s: string) => (Array.isArray(s) ? s.join(", ") : String(s)).trim()).filter(Boolean);
      if (strs.length) hours = strs;
    }
    for (const k of ["datePublished", "dateModified"]) {
      const d = n[k];
      if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d) && (!newestDate || d > newestDate)) newestDate = d.slice(0, 10);
    }
  }
  return { email, phone, address, hours, newestDate };
}

function addressFromTag(html: string): string | null {
  const m = /<address\b[^>]*>([\s\S]*?)<\/address>/i.exec(html);
  const t = m ? textOf(m[1]) : "";
  return t && t.length <= 200 ? t : null;
}

function companyNumber(html: string): string | null {
  const t = textOf(html);
  const m = /(?:company\s*(?:no\.?|number|reg(?:istration)?(?:\s*no\.?)?)|registered\s+in\s+england(?:\s+(?:and|&)\s+wales)?[^0-9]{0,30})[:#\s]*?(\d{7,8})\b/i.exec(t)
    ?? /\bcompany\s*(?:no\.?|number)\b[^0-9]{0,10}(\d{7,8})\b/i.exec(t);
  return m ? m[1] : null;
}

function builtBy(html: string, origin: string): SiteBuiltBy {
  const foot = footerHtml(html);
  const footText = textOf(foot);
  const credit = /\b(?:website|site|web\s*design|designed|built|developed|created|powered)\s+by\s+([A-Z0-9][\w&'.\- ]{1,40}?)(?=[.,|·•\n<]|\s{2,}|$)/i
    .exec(footText)?.[1]?.trim() || null;
  const selfHost = hostOf(origin);
  const foots = new Set<string>();
  for (const h of hrefs(foot)) {
    const host = hostOf(/^https?:/i.test(h) ? h : `https://${h.replace(/^\/\//, "")}`);
    if (!host || host === selfHost) continue;
    if (NON_AGENCY_HOST.test(host)) continue;
    if (!/\./.test(host)) continue;
    foots.add(host);
  }
  let platform: string | null = null;
  for (const p of PLATFORMS) if (p.re.test(html)) { platform = p.name; break; }
  return { credit, platform, footerLinks: [...foots].slice(0, 5) };
}

function socials(html: string): Array<{ platform: string; url: string }> {
  const out: Array<{ platform: string; url: string }> = [];
  const seen = new Set<string>();
  for (const h of hrefs(html)) {
    const host = hostOf(/^https?:/i.test(h) ? h : `https://${h.replace(/^\/\//, "")}`);
    if (!host) continue;
    for (const s of SOCIAL) {
      if (s.host.test(host) && !seen.has(s.platform)) {
        // Skip bare "share this" intent links (no profile path).
        if (/sharer|share\?|intent\/|\/plugins\//i.test(h)) continue;
        seen.add(s.platform); out.push({ platform: s.platform, url: h });
      }
    }
  }
  return out;
}

function directories(html: string): string[] {
  const allHosts = hrefs(html).map((h) => hostOf(/^https?:/i.test(h) ? h : `https://${h.replace(/^\/\//, "")}`) ?? "");
  const text = textOf(html);
  const out: string[] = [];
  for (const d of DIRECTORIES) {
    if (allHosts.some((h) => d.host.test(h)) || d.text.test(text)) out.push(d.name);
  }
  return out;
}

const GENERIC_NAV = /^(home|contact|contact us|about|about us|blog|news|gallery|reviews|testimonials|privacy|privacy policy|cookies?|cookie policy|terms|terms & conditions|sitemap|faq|faqs|login|log in|sign in|basket|cart|checkout|search|menu)$/i;

function services(html: string, samplePages: Array<{ url: string; html: string }>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const s = raw.replace(/\s+/g, " ").trim();
    if (!s || s.length > 60 || GENERIC_NAV.test(s)) return;
    if (!/[a-z]/i.test(s)) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k); out.push(s);
  };
  // Nav link texts.
  const navBlocks = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi) ?? [];
  const menuBlocks = html.match(/<ul\b[^>]*(?:menu|nav)[^>]*>[\s\S]*?<\/ul>/gi) ?? [];
  for (const block of [...navBlocks, ...menuBlocks]) {
    const re = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) add(textOf(m[1]));
  }
  // Sampled page titles (minus the site-name tail after a | or – or ·).
  for (const p of samplePages) {
    const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(p.html)?.[1];
    if (t) add(textOf(t).split(/\s[|\-–—·]\s/)[0]);
  }
  return out.slice(0, 20);
}

/** Towns from the location-page cluster: tokens that VARY across the cluster's URL slugs are the
 *  towns (the shared tokens are the trade template). Reads the URLs crawl-check already grouped —
 *  no page fetch, no inference beyond "the part that differs is the place". */
function townsFromCluster(clusterUrls: string[]): string[] {
  const slugs: string[][] = [];
  for (const u of clusterUrls) {
    let path = "";
    try { path = new URL(u).pathname; } catch { continue; }
    const last = path.replace(/\/+$/, "").split("/").pop() ?? "";
    const toks = last.replace(/\.(html?|php|aspx?)$/i, "").split(/[-_]+/).filter(Boolean).map((t) => t.toLowerCase());
    if (toks.length) slugs.push(toks);
  }
  if (slugs.length < 2) return [];
  // Tokens shared by most slugs = the template (trade/qualifier); drop them.
  const freq = new Map<string, number>();
  for (const toks of slugs) for (const t of new Set(toks)) freq.set(t, (freq.get(t) ?? 0) + 1);
  const common = new Set([...freq].filter(([, n]) => n >= slugs.length * 0.6).map(([t]) => t));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const toks of slugs) {
    const town = toks.filter((t) => !common.has(t) && !/^\d+$/.test(t) && t.length > 1)
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(" ").trim();
    const k = town.toLowerCase();
    if (town && !seen.has(k)) { seen.add(k); out.push(town); }
  }
  return out.slice(0, 30);
}

function copyrightYear(html: string): number | null {
  const foot = textOf(footerHtml(html));
  const years: number[] = [];
  const re = /(?:©|&copy;|copyright|\(c\))\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(foot)) !== null) years.push(Number(m[1]));
  return years.length ? Math.max(...years) : null;
}

/** Extract the site info from the crawl-check's fetched HTML. Homepage-driven, with the sampled
 *  inner pages and the location cluster passed in for services, freshness and towns. Never throws. */
export function extractSiteInfo(homeHtml: string, input: SiteInfoInput): SiteInfo {
  const samplePages = input.samplePages ?? [];
  const clusterUrls = input.clusterUrls ?? [];
  // JSON-LD across the homepage and the sampled pages, for the schema-backed fields + freshness.
  const nodes = [homeHtml, ...samplePages.map((p) => p.html)].flatMap(jsonLdNodes);
  const ld = fromJsonLd(nodes);

  const email = ld.email ?? firstEmail(homeHtml);
  const phone = ld.phone ?? firstPhone(homeHtml);
  const address = ld.address ?? addressFromTag(homeHtml);

  // Newest datePublished across all pages read.
  let lastDatePublished = ld.newestDate;
  for (const extra of samplePages.map((p) => fromJsonLd(jsonLdNodes(p.html)).newestDate)) {
    if (extra && (!lastDatePublished || extra > lastDatePublished)) lastDatePublished = extra;
  }

  return {
    email: email ?? null,
    phone: phone ?? null,
    address: address ?? null,
    openingHours: ld.hours,
    companyNumber: companyNumber(homeHtml),
    builtBy: builtBy(homeHtml, input.origin),
    socialLinks: socials(homeHtml),
    services: services(homeHtml, samplePages),
    towns: townsFromCluster(clusterUrls),
    directories: directories(homeHtml),
    staleness: { copyrightYear: copyrightYear(homeHtml), lastDatePublished: lastDatePublished ?? null },
  };
}

/** True when this site-info block found at least one thing worth reading — used only to decide the
 *  popup's "nothing found" line, NEVER to gate a template (that is the faults' job, kept separate). */
export function siteInfoHasAnything(s: SiteInfo | null | undefined): boolean {
  if (!s) return false;
  return !!(s.email || s.phone || s.address || (s.openingHours?.length) || s.companyNumber
    || s.builtBy.credit || s.builtBy.platform || s.builtBy.footerLinks.length
    || s.socialLinks.length || s.services.length || s.towns.length || s.directories.length
    || s.staleness.copyrightYear || s.staleness.lastDatePublished);
}

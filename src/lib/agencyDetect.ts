/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHO RUNS THEIR WEBSITE? — the agency check (2026-10-01). PURE: pages in, a verdict out.

   Find Leads checks each result's own website (supabase/functions/_shared/agency-crawl.ts fetches a
   small sample: the homepage, the sitemap, contact / about / a service page and one or two others) so a
   salesperson can avoid businesses whose site an outside agency controls — getting access through
   another agency is too much hassle. No AI, no paid call.

   THREE ANSWERS, NEVER A FAKE CERTAINTY:
   - agency_likely  — meaningful evidence that an outside web agency / developer built or runs it:
                       a credit ("Website by …", "Designed by …") in the footer or the page source, or
                       two independent supporting signs that point at the SAME supplier.
   - no_evidence    — the pages were read and nothing meaningful was found. NOT "self-managed".
   - unknown        — the site could not be assessed (blocked, broken, script-only, timed out).
   The confidence is in the CLASSIFICATION (how strong and consistent the evidence is, how much of the
   site was read) — never a probability that an agency manages the site.

   ⛔ FALSE POSITIVES COST MORE THAN MISSES (Paul, 2026-10-01). One weak technical sign is never enough.
   The platform (WordPress, Wix, Squarespace, Shopify, Webflow…), the host, Cloudflare and Google Tag
   Manager are CONTEXT ONLY — shown, never counted. "Powered by WordPress" is not a credit, and a business
   crediting itself is not an agency.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { hostOf, hrefs, NON_AGENCY_HOST, PLATFORMS, textOf } from './siteInfo.ts';
import { registrableDomain } from './siteEvidence.ts';

/** Bump when the rules change: cached results from an older version are checked again. */
export const AGENCY_CHECK_VERSION = 2;
/** How long a completed check is reused (a domain that changes is a new key, checked at once). */
export const AGENCY_CACHE_DAYS = 30;
/** A check that could not complete is retried sooner — a blocked minute should not stick for a month. */
export const AGENCY_FAILED_CACHE_DAYS = 1;
/** Agency-likely at or above this confidence is "high confidence": flagged, sorted last, not pre-selected. */
export const AGENCY_DEPRIORITISE_CONFIDENCE = 75;

export type AgencyClass = 'agency_likely' | 'no_evidence' | 'unknown';
export const AGENCY_CLASS_LABEL: Record<AgencyClass, string> = {
  agency_likely: 'Agency likely',
  no_evidence: 'No agency evidence',
  unknown: 'Unknown',
};

export interface AgencyPage { url: string; html: string }
export type SignalKind = 'credit' | 'credit_link' | 'source_comment' | 'meta_developer' | 'footer_link' | 'theme' | 'asset_domain' | 'meta_author';
/** Strong = on its own enough; support = needs a second, independent sign naming the same supplier. */
export const SIGNAL_STRENGTH: Record<SignalKind, 'strong' | 'support'> = {
  credit: 'strong', credit_link: 'strong', source_comment: 'strong', meta_developer: 'strong',
  footer_link: 'support', theme: 'support', asset_domain: 'support', meta_author: 'support',
};
export interface AgencySignal { kind: SignalKind; key: string; name: string; domain: string | null; text: string; pages: number }

export interface AgencyVerdict {
  classification: AgencyClass;
  /** 0–100: confidence in the classification (see the header). */
  confidence: number;
  /** The supplier named by the strongest sign, when there is one. */
  agency: string | null;
  agencyDomain: string | null;
  /** Plain-English lines a salesperson can read (no HTML). */
  evidence: string[];
  /** Context only — never counted. */
  platform: string | null;
  pagesChecked: number;
  failure: string | null;
}

/* ── words ──────────────────────────────────────────────────────────────────────────────────────── */

/** Self-service builders and tools: "by" one of these is the platform, not an agency. */
const NOT_AN_AGENCY = /^(word\s*press|wp|wix(\.com)?|squarespace|shopify|go\s*daddy|weebly|webflow|duda|jimdo|joomla|drupal|elementor|divi|yola|site123|strikingly|ionos|1&1|hostinger|google|yoast|rank\s*math|cloudflare|the\s+owner|us|me|our\s+team|ourselves|hand|love|passion)\b/i;
/** Plugin / cache / analytics notes that say "by" in an HTML comment and are not a developer. */
const TOOL_COMMENT = /yoast|rank\s*math|plugin|cache|litespeed|wp\s*rocket|autoptimize|w3\s*total|monsterinsights|elementor|wordfence|jetpack|cloudflare|google|analytics|tag\s*manager|seo\s*pack|all\s*in\s*one|smush|imagify|optimi[sz]ed|minif|generated|wpml|woocommerce|slider|revolution|gtm|hotjar|facebook|pixel/i;
/** Words that make a linked domain or a theme folder read as a web supplier. */
const AGENCY_WORD = /(design|digital|web|media|creative|studio|agency|marketing|seo|sites|dev|interactive|online|solutions|pixel|brand|code)/i;
/** Stock themes and frameworks — a theme folder with one of these names says nothing. */
const STOCK_THEME = /^(astra|divi|extra|avada|hello-elementor|hello|generatepress|oceanwp|twenty\w*|kadence|neve|enfold|salient|flatsome|betheme|the7|dt-the7|bridge|x|pro|storefront|sydney|hestia|zakra|colibri|blocksy|bricks|oxygen|genesis|beaver\w*|uncode|impreza|jupiter\w*|porto|woodmart|thrive\w*|total|newspaper|soledad|houzez|bb-theme|understrap|sage|roots|starter|theme|child|main|custom|default|site)(-child|-pro|-theme)?$/i;
/** Asset hosts that are shared infrastructure, never a supplier. */
const SHARED_ASSET_HOST = /(^|\.)(googleapis|gstatic|google|googletagmanager|google-analytics|doubleclick|cloudflare|cloudflareinsights|jsdelivr|unpkg|cdnjs|bootstrapcdn|fontawesome|typekit|jquery|wp\.com|wordpress\.com|gravatar|facebook|fbcdn|instagram|twitter|youtube|vimeo|wixstatic|parastorage|squarespace|squarespace-cdn|shopify|shopifycdn|webflow|hotjar|hubspot|mailchimp|recaptcha|stripe|paypal|trustpilot|tawk|intercom|crisp|zendesk|cookiebot|onetrust|cookieyes|termly|usercentrics|bing|clarity|yell|checkatrade|amazonaws|cloudfront|akamai|fastly|cdn-website|website-files|editmysite|weebly|godaddy|secureserver|wsimg|jimdo|strikingly|site123|webnode|zyrosite|hostinger|ionos|1and1)\./i;

const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const labelOf = (domain: string) => domain.split('.')[0];
/** Do two supplier keys name the same supplier? Equal, or one contains the other (5+ letters). */
export function sameSupplier(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 5 && l.includes(s);
}
function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/^[\s:–—-]+|[\s.,:–—-]+$/g, '').replace(/\b(ltd|limited|llp|uk)\.?$/i, (m) => m).trim();
}
function isSelf(key: string, siteDomain: string | null): boolean {
  if (!siteDomain) return false;
  const self = norm(labelOf(siteDomain));
  return sameSupplier(key, self);
}

/* ── signals on one page ────────────────────────────────────────────────────────────────────────── */

/* "SEO by …" counts (found in the 50-site measurement: "SEO by Pod Digital", linked): an SEO agency credited
   in the footer works on the site. Hosting alone does not ("Hosted by 123-reg" is a host, not a supplier). */
const CREDIT_PHRASE = String.raw`(?:(?:web\s*)?site|web\s*design(?:ed)?|web\s*development|website\s+design|seo|search\s+engine\s+optimi[sz]ation)\s+(?:(?:design(?:ed)?|built|developed|created|managed|maintained|hosted)\s+)?(?:(?:and|&)\s+\w+\s+)?by|(?:designed|built|developed|created|crafted)(?:\s+(?:and|&)\s+(?:built|hosted|developed|designed|managed|maintained))?\s+by`;
const CREDIT_TEXT_RE = new RegExp(String.raw`\b(?:${CREDIT_PHRASE})\s*[:\-–]?\s*([A-Z0-9][\w&'.\- ]{1,40}?)(?=\s*(?:[.,|·•©\n<()/]|\s{2,}|$)|\s+(?:all\s+rights|copyright|privacy|terms|cookie|registered|company|reg\b|tel\b|phone|call\b|email|vat\b|\d|click\b|back\b|follow\b|menu\b|home\b|top\b))`, 'i');
const CREDIT_LINK_RE = new RegExp(String.raw`(?:${CREDIT_PHRASE})\s*[:\-–]?\s*(?:<(?!a\b)[^>]+>\s*)*<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{1,80}?)<\/a>`, 'i');

/* ── where a credit can be (v2, 2026-10-02) ─────────────────────────────────────────────────────────
   footerHtml() takes the FIRST <footer> — on a site with a <footer> inside a blog card, a testimonial or
   a widget that is not the site footer, and the real one (where credits live) was never read. v2 reads
   EVERY <footer> element plus the tail of the body (credits often sit in a bottom bar after the footer).
   ⛔ Only the CREDIT patterns read the tail; footer LINKS (a weak sign) are still read from footer
   elements only (the tail when a page has none), so a partner-logo strip cannot add weak signs. */
const BODY_TAIL_SHARE = 0.2;
export function creditRegions(html: string): { credits: string; links: string } {
  const footers = [...html.matchAll(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gi)].map((m) => m[1]);
  /* The tail is measured on the page WITHOUT its scripts, styles and inline graphics: on a site with no
     <footer> element, a large script or style block after the footer pushed the real footer outside a
     tail measured in raw characters (measured: "Website built by Lab Creative", "Website hosted and
     managed by Zest & Punch" — both missed). */
  const body = (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html)
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const tail = body.slice(Math.floor(body.length * (1 - BODY_TAIL_SHARE)));
  /* Joined with a hard stop ("|"): a credit at the end of one region must not run on into the next. */
  const SEP = '\n<p>|</p>\n';
  const links = footers.length ? footers.join(SEP) : tail;
  return { credits: [...footers, tail].join(SEP), links };
}

/* A sentence in the page body that credits the site itself: "This website was designed by Bright Digital",
   "Our site is built and maintained by …". Narrow on purpose (it must say THIS/OUR website), so a service
   page saying "kitchens designed by our team" never counts. Read on every page (about / legal pages). */
const BODY_CREDIT_RE = /\b(?:this|our)\s+(?:web\s*)?site\s+(?:was\s+|is\s+|has\s+been\s+)?(?:proudly\s+)?(?:designed|built|developed|created|made|managed|maintained)(?:\s+(?:and|&)\s+(?:designed|built|developed|hosted|managed|maintained))?\s+by\s*[:\-–]?\s*([A-Z0-9][\w&'.\- ]{1,40}?)(?=\s*(?:[.,|·•©\n<()]|\s{2,}|$))/gi;
/* A link whose own words (text, title, aria-label or image alt) are the credit:
   <a href="https://brightdigital.co.uk" title="Web design by Bright Digital"><img alt="Bright Digital"></a>. */
const CREDIT_WORDS_RE = new RegExp(String.raw`\b(?:${CREDIT_PHRASE})\b`, 'i');

export function pageSignals(page: AgencyPage, siteDomain: string | null): AgencySignal[] {
  const out: AgencySignal[] = [];
  const html = page.html;
  const region = creditRegions(html);
  const foot = region.credits;
  const footText = textOf(foot);
  const push = (kind: SignalKind, name: string, domain: string | null, text: string) => {
    const key = norm(domain ? labelOf(domain) : name);
    if (!key || key.length < 3 || isSelf(key, siteDomain)) return;
    if (!out.some((s) => s.kind === kind && s.key === key)) out.push({ kind, key, name, domain, text, pages: 1 });
  };

  const supplierDomain = (href: string): string | null => {
    if (!/^(https?:)?\/\//i.test(href)) return null; // a relative link is the site itself
    const host = hostOf(/^https?:/i.test(href) ? href : `https:${href}`);
    const dom = host ? registrableDomain(host) : null;
    return dom && dom !== siteDomain && dom.includes('.') && !NON_AGENCY_HOST.test(dom) ? dom : null;
  };
  /* v2: EVERY match is tried, not just the first — "Theme by Astra · Website by Bright Digital" used to stop
     at the rejected first one and miss the real credit. */
  // 1. A credit WITH a link to the supplier (strongest): "Website by <a href=…>Bright Digital</a>".
  for (const cl of foot.matchAll(new RegExp(CREDIT_LINK_RE.source, 'gi'))) {
    const dom = supplierDomain(/^https?:|^\/\//i.test(cl[1]) ? cl[1] : `//${cl[1]}`);
    const name = cleanName(textOf(cl[2]));
    if (dom && !NOT_AN_AGENCY.test(name) && !NOT_AN_AGENCY.test(labelOf(dom))) { push('credit_link', name || dom, dom, `Footer: “${cleanName(textOf(cl[0]))}”`); break; }
  }
  // 1b. A link that IS the credit: <a href=…>Website by Bright Digital</a>, or its title / aria-label / alt says so.
  //     Only when 1 found none (one credit link per page; the same supplier twice is not new evidence).
  for (const a of out.some((s) => s.kind === 'credit_link') ? [] : foot.matchAll(/<a\b([^>]*)>([\s\S]{0,400}?)<\/a>/gi)) {
    const attrs = a[1];
    const href = /\bhref=["']([^"']+)["']/i.exec(attrs)?.[1];
    const dom = href ? supplierDomain(href) : null;
    if (!dom || NOT_AN_AGENCY.test(labelOf(dom))) continue;
    const words = [textOf(a[2]), ...[...`${attrs} ${a[2]}`.matchAll(/\b(?:title|aria-label|alt)=["']([^"']{3,120})["']/gi)].map((m) => m[1])];
    const said = words.find((w) => CREDIT_WORDS_RE.test(w));
    if (!said) continue;
    const named = new RegExp(String.raw`(?:${CREDIT_PHRASE})\s*[:\-–]?\s*(.{2,40})`, 'i').exec(said)?.[1];
    const name = cleanName(named ?? labelOf(dom));
    if (NOT_AN_AGENCY.test(name)) continue;
    push('credit_link', name || dom, dom, `Footer: “${cleanName(said)}” (links to ${dom})`);
    break;
  }
  // 2. A credit in the footer text: "Website by Bright Digital", "Designed and built by …".
  for (const ct of footText.matchAll(new RegExp(CREDIT_TEXT_RE.source, 'gi'))) {
    const name = cleanName(ct[1]);
    if (name && !NOT_AN_AGENCY.test(name)) { push('credit', name, null, `Footer: “${cleanName(ct[0])}”`); break; }
  }
  // 2b. "This website was designed by …" anywhere in the page's own words (an about or legal page).
  for (const bc of textOf(html).matchAll(BODY_CREDIT_RE)) {
    const name = cleanName(bc[1]);
    if (name && !NOT_AN_AGENCY.test(name)) { push('credit', name, null, `On the page: “${cleanName(bc[0])}”`); break; }
  }
  // 3. A developer note in the page source: <!-- Website by … -->.
  for (const m of html.matchAll(/<!--([\s\S]{0,300}?)-->/g)) {
    const c = m[1];
    if (TOOL_COMMENT.test(c)) continue;
    const r = /\b(?:website|site|theme|developed|designed|built|created)\s+(?:(?:designed|built|developed)\s+)?by\s*[:\-–]?\s*([A-Z0-9][\w&'.\- ]{1,40})/i.exec(c);
    if (r && !NOT_AN_AGENCY.test(cleanName(r[1]))) { push('source_comment', cleanName(r[1]), null, `Developer note in the page source: “${cleanName(r[0])}”`); break; }
  }
  // 4. Developer / designer metadata.
  for (const m of html.matchAll(/<meta\b[^>]*name=["'](designer|developer|web_author|author)["'][^>]*content=["']([^"']{2,80})["']/gi)) {
    const name = cleanName(m[2]);
    if (!name || NOT_AN_AGENCY.test(name)) continue;
    if (m[1].toLowerCase() === 'author') { if (AGENCY_WORD.test(name)) push('meta_author', name, null, `Page author is “${name}”`); }
    else push('meta_developer', name, null, `Page ${m[1].toLowerCase()} is “${name}”`);
  }
  // 5. Footer links to a web supplier's own domain (external, not a social / directory / platform).
  for (const h of hrefs(region.links)) {
    /* Only a link that names another host (absolute, or //host): a relative page link is the site itself. */
    if (!/^(https?:)?\/\//i.test(h)) continue;
    const host = hostOf(/^https?:/i.test(h) ? h : `https:${h}`);
    const dom = host ? registrableDomain(host) : null;
    if (!dom || dom === siteDomain || NON_AGENCY_HOST.test(dom) || !dom.includes('.')) continue;
    if (AGENCY_WORD.test(labelOf(dom))) push('footer_link', labelOf(dom), dom, `Footer links to ${dom}`);
  }
  // 6. A bespoke WordPress theme folder named after a supplier.
  for (const m of html.matchAll(/\/wp-content\/themes\/([a-z0-9_-]{3,60})\//gi)) {
    const slug = m[1].toLowerCase();
    if (STOCK_THEME.test(slug)) continue;
    const base = slug.replace(/[-_](child|theme|wp|v\d+)$/g, '');
    if (AGENCY_WORD.test(base)) push('theme', base, null, `Custom theme folder “${slug}”`);
  }
  // 7. Scripts / styles loaded from a non-shared external domain (only counts beside another sign).
  for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)=["'](https?:)?\/\/([^/"']+)/gi)) {
    const dom = registrableDomain(m[2]);
    if (!dom || dom === siteDomain || SHARED_ASSET_HOST.test(`${dom}.`) || NON_AGENCY_HOST.test(dom)) continue;
    if (AGENCY_WORD.test(labelOf(dom))) push('asset_domain', labelOf(dom), dom, `Loads files from ${dom}`);
  }
  return out;
}

export function platformOf(pages: AgencyPage[]): string | null {
  for (const p of PLATFORMS) if (pages.some((pg) => p.re.test(pg.html))) return p.name;
  return null;
}

/** Is this page a real, readable page (not a block / challenge / script-only shell)? */
export function pageProblem(html: string, status: number): string | null {
  if (status === 401 || status === 403 || status === 429) return 'The site blocked the check';
  if (status >= 500) return 'The site returned an error';
  if (status >= 400) return 'The page was not found';
  /* v2: SiteGround's bot challenge (a 202 that refreshes to /.well-known/sgcaptcha/) is a block, not a
     script-built page. ⛔ A challenge is never worked around — it reads Unknown, honestly labelled. */
  if (/<title>\s*(just a moment|attention required|access denied|checking your browser)/i.test(html) || /cf-chl|challenge-platform|captcha-delivery|\/\.well-known\/sgcaptcha\//i.test(html)) return 'The site blocked the check';
  if (textOf(html).length < 200) return 'The page has almost no readable text (built by script)';
  return null;
}

/* ── the verdict ────────────────────────────────────────────────────────────────────────────────── */

export function classifyAgency(pages: AgencyPage[], siteUrl: string, failure: string | null = null): AgencyVerdict {
  const siteDomain = registrableDomain(siteUrl);
  const platform = platformOf(pages);
  const ctx = platform ? [`Built on ${platform} — a platform, not evidence either way`] : [];
  if (pages.length === 0) {
    return { classification: 'unknown', confidence: 0, agency: null, agencyDomain: null, evidence: [failure ?? 'The site could not be read', ...ctx], platform, pagesChecked: 0, failure: failure ?? 'The site could not be read' };
  }
  // Merge the same sign across pages (sitewide footers repeat; that repetition is consistency, not new evidence).
  const merged: AgencySignal[] = [];
  for (const p of pages) for (const s of pageSignals(p, siteDomain)) {
    const m = merged.find((x) => x.kind === s.kind && sameSupplier(x.key, s.key));
    if (m) { m.pages += 1; if (!m.domain && s.domain) m.domain = s.domain; } else merged.push({ ...s });
  }
  const strong = merged.filter((s) => SIGNAL_STRENGTH[s.kind] === 'strong');
  // The supplier: the strongest sign's (a credit link first), else the one most supporting signs agree on.
  const lead = strong.find((s) => s.kind === 'credit_link') ?? strong[0] ?? null;
  const supports = merged.filter((s) => SIGNAL_STRENGTH[s.kind] === 'support');
  const groupOf = (key: string) => merged.filter((s) => sameSupplier(s.key, key));
  let verdictGroup: AgencySignal[] = [];
  if (lead) verdictGroup = groupOf(lead.key);
  else {
    for (const s of supports) {
      const g = groupOf(s.key);
      const kinds = new Set(g.map((x) => x.kind));
      if (kinds.size >= 2 && g.length > verdictGroup.length) verdictGroup = g;
    }
  }
  const sitewide = (g: AgencySignal[]) => g.some((s) => s.pages >= 2);
  if (verdictGroup.length > 0) {
    const kinds = new Set(verdictGroup.map((s) => s.kind));
    const hasStrong = verdictGroup.some((s) => SIGNAL_STRENGTH[s.kind] === 'strong');
    const domain = verdictGroup.find((s) => s.domain)?.domain ?? null;
    let confidence: number;
    if (hasStrong) {
      confidence = 80;
      if (domain) confidence += 8;
      if (sitewide(verdictGroup)) confidence += 5;
      if (kinds.size >= 2) confidence += 4;
      confidence = Math.min(96, confidence);
    } else {
      confidence = Math.min(80, 62 + 6 * (kinds.size - 2) + (sitewide(verdictGroup) ? 4 : 0));
    }
    const ordered = [...verdictGroup].sort((a, b) => (SIGNAL_STRENGTH[a.kind] === 'strong' ? 0 : 1) - (SIGNAL_STRENGTH[b.kind] === 'strong' ? 0 : 1));
    /* One footer-credit line: a linked credit says it best, and a second wording of the same credit (another
       page's text run) is the same evidence, not more of it. */
    const hasLinkedCredit = ordered.some((s) => s.kind === 'credit_link');
    const evidence = [...new Set(ordered.filter((s) => !(hasLinkedCredit && s.kind === 'credit' && s.text.startsWith('Footer:'))).map((s) => s.text))];
    if (domain && !evidence.some((e) => e.includes(domain))) evidence.push(`Links to ${domain}`);
    const most = Math.max(...verdictGroup.map((s) => s.pages));
    if (pages.length >= 2) evidence.push(`Seen on ${Math.min(most, pages.length)} of ${pages.length} pages checked`);
    const name = (lead ?? ordered[0]).name;
    return { classification: 'agency_likely', confidence, agency: name, agencyDomain: domain, evidence: [...evidence.slice(0, 5), ...ctx], platform, pagesChecked: pages.length, failure: null };
  }
  // Read, nothing meaningful. Confidence grows with how much of the site was read.
  const homeThin = textOf(pages[0].html).length < 600;
  const confidence = Math.max(40, [0, 55, 62, 68, 72, 76, 78][Math.min(pages.length, 6)] - (homeThin ? 10 : 0));
  const weak = supports.length ? [`Weak signs only, not enough on their own: ${supports.slice(0, 2).map((s) => s.text.toLowerCase()).join('; ')}`] : [];
  return { classification: 'no_evidence', confidence, agency: null, agencyDomain: null,
    evidence: [`No “website by” credit, developer note or agency link on ${pages.length} page${pages.length === 1 ? '' : 's'} checked`, ...weak, ...ctx],
    platform, pagesChecked: pages.length, failure: null };
}

/* ── which pages to read ────────────────────────────────────────────────────────────────────────── */

const SKIP_PATH = /\/(wp-admin|wp-json|wp-login|feed|tag|category|author|cart|basket|checkout|my-account|login|search|cookie|cookies|gdpr|sitemap)(\/|$)|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3|xml|txt|css|js)(\?|$)/i;
const WANT: { re: RegExp; tag: string }[] = [
  { re: /contact/i, tag: 'contact' },
  { re: /about|who-we-are|our-story|meet/i, tag: 'about' },
  { re: /service|what-we-do|our-work|plumb|electric|roof|lock|repair|install|clean|build/i, tag: 'service' },
  /* v2: ONE page where a developer is often credited in the body — a credits page first, else the legal /
     privacy / terms page. Read for "This website was designed by …" (BODY_CREDIT_RE) and its footer. */
  { re: /credits|site-?credits|website-?credits|accessibility|legal|privacy|terms/i, tag: 'legal' },
];
/** Legal-type pages are only ever taken through their own WANT slot, never as a filler "shallow page". */
const LEGAL_PATH = /\/(privacy|privacy-policy|terms|terms-and-conditions|legal|accessibility|cookie|cookies|credits|site-?credits|website-?credits)(\/|$)/i;

/** Up to `max` same-site pages: contact, about, a service page, then other shallow pages, in that order. */
export function selectSamplePages(siteUrl: string, candidates: string[], max = 6): string[] {
  const host = hostOf(siteUrl);
  const home = (() => { try { return new URL(siteUrl).pathname.replace(/\/+$/, '') || '/'; } catch { return '/'; } })();
  const seen = new Set<string>();
  const pool: { url: string; path: string; depth: number }[] = [];
  for (const raw of candidates) {
    let u: URL;
    try { u = new URL(raw, siteUrl); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || hostOf(u.href) !== host) continue;
    if (u.search || SKIP_PATH.test(u.pathname)) continue;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (path === home || seen.has(path)) continue;
    seen.add(path);
    pool.push({ url: `${u.origin}${u.pathname}`, path, depth: path.split('/').filter(Boolean).length });
  }
  const picked: string[] = [];
  const creditsFirst = (p: { path: string }) => (/credits/i.test(p.path) ? 0 : 1);
  for (const w of WANT) {
    const hit = pool.filter((p) => w.re.test(p.path) && !picked.includes(p.url) && (w.tag === 'legal' || !LEGAL_PATH.test(p.path)))
      .sort((a, b) => (w.tag === 'legal' ? creditsFirst(a) - creditsFirst(b) : 0) || a.depth - b.depth || a.path.length - b.path.length)[0];
    if (hit) picked.push(hit.url);
  }
  const firstSeg = (p: string) => p.split('/').filter(Boolean)[0] ?? '';
  const used = new Set(picked.map((u) => firstSeg(new URL(u).pathname)));
  for (const p of [...pool].sort((a, b) => a.depth - b.depth || a.path.length - b.path.length)) {
    if (picked.length >= max) break;
    if (picked.includes(p.url) || used.has(firstSeg(p.path)) || LEGAL_PATH.test(p.path)) continue;
    picked.push(p.url); used.add(firstSeg(p.path));
  }
  return picked.slice(0, max);
}

/** Links on a page (absolute), for page selection when there is no sitemap. */
export function pageLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  for (const h of hrefs(html)) { try { out.push(new URL(h, baseUrl).href); } catch { /* skip */ } }
  return out;
}

/** The URLs in a sitemap (or the child sitemaps of a sitemap index). */
export function sitemapLocs(xml: string): { pages: string[]; children: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  const isIndex = /<sitemapindex\b/i.test(xml);
  return isIndex ? { pages: [], children: locs } : { pages: locs, children: [] };
}

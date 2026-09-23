/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CRAWL URLS — normalisation, eligibility and trap protection for the exhaustive manual crawl.

   An exhaustive crawl continues until the frontier is empty, so what decides "the frontier" is the
   whole safety story. Every URL the crawl meets goes through classifyCrawlUrl, which either returns
   ONE canonical form (so duplicates collapse onto one row) or a named skip reason (recorded, never
   silently dropped).

   ⛔ SAME SITE = THE SERVED HOST, `www.` IGNORED, http/https folded (the BS4 bug, 2026-09-23).
   ⛔ QUERY STRINGS ARE KEPT ONLY WHEN THEY CAN MEAN A DIFFERENT PAGE. Tracking and session
   parameters are removed; pagination (?page=2) is kept; anything that looks like a filter / search /
   calendar permutation is skipped as a trap. Parameter order is normalised, so permutations
   collapse.
   ⛔ PUBLIC PAGES ONLY: admin, login, account, cart, checkout, feeds and API paths are skipped;
   only GET is ever issued.

   IMPORTED BY EDGE FUNCTIONS: relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type SkipReason =
  | 'off_site' | 'not_http' | 'asset' | 'private_path' | 'robots_disallow' | 'query_trap'
  | 'path_trap' | 'too_long' | 'safety_ceiling' | 'not_html' | 'removed_since_last_crawl';

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  off_site: 'another website',
  not_http: 'not a web link',
  asset: 'a file, not a page',
  private_path: 'admin / login / account / cart area',
  robots_disallow: 'robots.txt asks crawlers not to',
  query_trap: 'a filter / search / calendar variation',
  path_trap: 'a repeating (infinite) path',
  too_long: 'an implausibly long address',
  safety_ceiling: 'past the runaway-site safety ceiling',
  not_html: 'not an HTML page',
  removed_since_last_crawl: 'was on the last crawl, now gone',
};

/** Parameters that never change the page: removed, never a reason to skip. */
const TRACKING = /^(utm_[a-z0-9_]+|gclid|gbraid|wbraid|fbclid|msclkid|dclid|yclid|mc_cid|mc_eid|_ga|_gl|_hsenc|_hsmi|hsctatracking|mkt_tok|ref|referrer|source|campaign|igshid|si|trk|cmpid|srsltid|oly_[a-z_]+|vero_[a-z_]+)$/i;
const SESSION = /^(sid|sessionid|session_id|phpsessid|jsessionid|aspsessionid[a-z]*|cfid|cftoken|token|auth|nonce|_wpnonce)$/i;
/** Parameters that paginate a listing — kept, with a numeric value only. */
const PAGINATION = /^(page|paged|pg|start|offset|pagenum|page_number)$/i;
/** Parameters that ARE the page on a CMS without pretty URLs (WordPress ?page_id=12, ?p=123). Kept, numeric. */
const CONTENT_ID = /^(page_id|p|post|post_id|id|article|article_id|item|product_id|pid)$/i;
/** Parameters that generate unbounded permutations. */
const TRAP_PARAM = /^(s|q|query|search|keyword|filter.*|sort.*|order.*|orderby|dir|view|display|limit|per_?page|price.*|min_.*|max_.*|color|colour|size|brand|tag|cat|category|date|day|month|year|week|calendar.*|ical|outlook-ical|tribe-bar-date|eventdisplay|add-to-cart|add_to_wishlist|replytocom|share|print|format|lang|currency|lightbox|variant|amp)$/i;
/** Highest page number a ?page= may carry before it is treated as an infinite "next" chain. */
export const MAX_PAGINATION = 500;

const PRIVATE_PATH = /(^|\/)(wp-admin|wp-login\.php|admin|administrator|login|log-in|signin|sign-in|logout|log-out|register|signup|sign-up|account|my-account|members?-area|portal|dashboard|cart|basket|checkout|order-received|wp-json|xmlrpc\.php|feed|rss|cdn-cgi|_api|_partials|api|graphql|cgi-bin|wishlist|compare|search)(\/|$)/i;
const ASSET = /\.(?:jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|pdf|docx?|xlsx?|pptx?|csv|zip|rar|7z|gz|tar|mp[34]|m4[av]|mov|avi|wmv|webm|ogg|wav|flac|css|js|mjs|map|json|txt|rss|atom|woff2?|ttf|otf|eot|apk|exe|dmg|ics)$/i;
const MAX_URL_LENGTH = 400;
const MAX_SEGMENTS = 12;

export const hostKey = (host: string) => host.toLowerCase().replace(/^www\./, '');

/** Same website: same host once `www.` is ignored; http and https are the same site. */
export function sameSite(url: string, servedUrl: string): boolean {
  try {
    const a = new URL(url), b = new URL(servedUrl);
    return /^https?:$/.test(a.protocol) && hostKey(a.hostname) === hostKey(b.hostname);
  } catch { return false; }
}

/* ── robots.txt ───────────────────────────────────────────────────────────────────────────────── */

export interface RobotsRules { allow: string[]; disallow: string[]; sitemaps: string[] }

/** The `User-agent: *` group's rules and every Sitemap: line. */
export function parseRobots(body: string | null | undefined): RobotsRules {
  const out: RobotsRules = { allow: [], disallow: [], sitemaps: [] };
  let agents: string[] = [];
  let inRules = false;
  for (const raw of (body || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase(), value = m[2].trim();
    if (field === 'sitemap') { if (/^https?:\/\//i.test(value)) out.sitemaps.push(value); continue; }
    if (field === 'user-agent') { if (inRules) { agents = []; inRules = false; } agents.push(value); continue; }
    inRules = true;
    if (!agents.includes('*')) continue;
    if (field === 'disallow' && value) out.disallow.push(value);
    if (field === 'allow' && value) out.allow.push(value);
  }
  out.sitemaps = [...new Set(out.sitemaps)];
  return out;
}

function ruleMatches(rule: string, pathAndQuery: string): boolean {
  const anchored = rule.endsWith('$');
  const body = anchored ? rule.slice(0, -1) : rule;
  const re = new RegExp('^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''));
  return re.test(pathAndQuery);
}

/** Longest-match wins, Allow beats Disallow on a tie — the standard reading. */
export function robotsAllows(rules: RobotsRules | null | undefined, pathAndQuery: string): boolean {
  if (!rules) return true;
  let best = -1, allowed = true;
  for (const r of rules.disallow) if (ruleMatches(r, pathAndQuery) && r.length > best) { best = r.length; allowed = false; }
  for (const r of rules.allow) if (ruleMatches(r, pathAndQuery) && r.length >= best) { best = r.length; allowed = true; }
  return allowed;
}

/* ── the classifier ───────────────────────────────────────────────────────────────────────────── */

export type Classified = { ok: true; url: string } | { ok: false; reason: SkipReason; url: string | null };

/**
 * One URL → its canonical crawl form, or why it is not crawled. `servedUrl` is where the homepage
 * finally resolved; every same-site URL is rewritten onto its scheme and host, so apex/www and
 * http/https twins are one row. Pure.
 */
export function classifyCrawlUrl(raw: string, base: string, servedUrl: string, robots?: RobotsRules | null): Classified {
  const t = (raw || '').trim();
  if (!t || /^(mailto|tel|sms|javascript|data|ftp|whatsapp|skype|viber|callto|geo|file):/i.test(t)) return { ok: false, reason: 'not_http', url: null };
  let u: URL;
  try { u = new URL(t, base); } catch { return { ok: false, reason: 'not_http', url: null }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, reason: 'not_http', url: null };
  if (!sameSite(u.href, servedUrl)) return { ok: false, reason: 'off_site', url: u.href };
  const served = new URL(servedUrl);
  u.protocol = served.protocol; u.hostname = served.hostname; u.port = served.port; u.hash = '';
  u.username = ''; u.password = '';
  // Path: collapse duplicate slashes, decode-safe lower-casing is NOT applied (paths are case-sensitive).
  let path = u.pathname.replace(/\/{2,}/g, '/');
  path = path.replace(/\/index\.(html?|php)$/i, '/');
  u.pathname = path;
  if (ASSET.test(path)) return { ok: false, reason: 'asset', url: u.href };
  if (PRIVATE_PATH.test(path)) return { ok: false, reason: 'private_path', url: u.href };
  const segs = path.split('/').filter(Boolean);
  if (segs.length > MAX_SEGMENTS) return { ok: false, reason: 'path_trap', url: u.href };
  const counts = new Map<string, number>();
  for (const s of segs) counts.set(s, (counts.get(s) ?? 0) + 1);
  if ([...counts.values()].some((n) => n >= 3)) return { ok: false, reason: 'path_trap', url: u.href };
  // Query: drop tracking/session; keep numeric pagination; anything else is a trap.
  const kept: Array<[string, string]> = [];
  for (const [k, v] of u.searchParams) {
    if (TRACKING.test(k) || SESSION.test(k)) continue;
    if (PAGINATION.test(k)) {
      if (!/^\d{1,4}$/.test(v) || Number(v) > MAX_PAGINATION) return { ok: false, reason: 'query_trap', url: u.href };
      if (Number(v) <= 1) continue;   // ?page=1 is the page itself
      kept.push([k.toLowerCase(), v]);
      continue;
    }
    if (CONTENT_ID.test(k)) {
      if (!/^d{1,10}$/.test(v)) return { ok: false, reason: 'query_trap', url: u.href };
      kept.push([k.toLowerCase(), v]);
      continue;
    }
    if (TRAP_PARAM.test(k)) return { ok: false, reason: 'query_trap', url: u.href };
    return { ok: false, reason: 'query_trap', url: u.href };   // unknown parameters: not a distinct page we can trust
  }
  if (kept.length > 2) return { ok: false, reason: 'query_trap', url: u.href };
  kept.sort((a, b) => a[0].localeCompare(b[0]));
  u.search = kept.length ? '?' + kept.map(([k, v]) => k + '=' + v).join('&') : '';
  const href = u.href;
  if (href.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long', url: href.slice(0, MAX_URL_LENGTH) };
  if (!robotsAllows(robots, u.pathname + u.search)) return { ok: false, reason: 'robots_disallow', url: href };
  return { ok: true, url: href };
}

/** A sitemap document address, same site, normalised (no trap rules: sitemaps are not pages). */
export function classifySitemapUrl(raw: string, servedUrl: string): string | null {
  try {
    const u = new URL(raw.trim(), servedUrl);
    if (!/^https?:$/.test(u.protocol) || !sameSite(u.href, servedUrl)) return null;
    const served = new URL(servedUrl);
    u.protocol = served.protocol; u.hostname = served.hostname; u.port = served.port; u.hash = '';
    return u.href;
  } catch { return null; }
}

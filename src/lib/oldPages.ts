/* ════════════════════════════════════════════════════════════════════════════════════════════════
   OLD PAGES — RANKING PROTECTION (2026-10-10, docs/website-build-redirects.md)

   When a client with an existing website gets a new one (Template, Visual rebuild, Close recreation,
   Bespoke), every IMPORTANT old address must still answer, or redirect ONCE and PERMANENTLY to the right
   new page. A client with no old site is exempt — but only by an explicit, recorded "no old site".
   Ported from V2 (packages/core/src/websiteBuild/oldUrls.ts, cf83459) into V1's one-JSON-column shape:
   everything lives in outreach_leads.website_build.old_pages (no migration).

     inventoryFromCrawl()   the old site's addresses, from the stored crawl (its sitemap + links)
     mergeOldUrls()         a new read ADDS addresses and keeps every decision; nothing found is dropped
     autoMapOldUrls()       a suggestion per unmapped address — never the home page for anything else
     judgeOldUrlResult()    LeadFinderOS's own verdict on ONE fetched result (the gate's raw facts:
                            hops, final status, final path, soft 404, noindex) — the report's own
                            "passed" is never read. ⛔ THE SAME RULE as judgeOldUrl in
                            scripts/site-quality-gate.mjs (website-build-redirects.test.ts runs both)
     oldPagesSummary()      "Old pages protected: X of Y" and the missing ones in plain English
     oldPagesProblems()     why the launch (preview) or the live check (production) cannot count
     oldPagesSaveRefusal()  the server's refusal: a found address removed, a must-keep page unmarked,
                            or "no old site" recorded while old pages are listed

   ⛔ V1 judges a PASTED gate report. Nothing here can prove the fetch happened: a hand-typed report with
      invented raw facts still reads as fetched. What it does stop: a report that only SAYS passed, a
      302 / chain / wrong target / home dump / noindex / soft 404 called fine, a check of another address
      or an older mapping, and any important address the report left out.
   ⚠️ Edge-reachable (paid-client-hub via websiteBuildState / websiteLaunch): relative .ts imports only,
      no template literals (CLAUDE.md §3). Pure.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const OLD_URL_SOURCES = ['crawl', 'sitemap', 'person'] as const;
export type OldUrlSource = (typeof OLD_URL_SOURCES)[number];
/** Why an old address matters. These make it important whatever anyone says. */
export const MANDATORY_REASONS = ['homepage', 'service', 'contact', 'sitemap_linked'] as const;
export const OLD_URL_REASONS = [...MANDATORY_REASONS, 'sitemap', 'linked', 'unsure', 'added'] as const;
export type OldUrlReason = (typeof OLD_URL_REASONS)[number];
export const REASON_LABEL: Record<OldUrlReason, string> = {
  homepage: 'home page', service: 'service page', contact: 'contact page', sitemap_linked: 'in the sitemap and linked',
  sitemap: 'in the sitemap', linked: 'linked from other pages', unsure: 'kept to be safe', added: 'added by hand',
};
export const READ_FROM = ['full_crawl', 'quick_crawl', 'homepage_only'] as const;
export type OldSiteReadFrom = (typeof READ_FROM)[number];

export interface OldUrl {
  path: string;
  source: OldUrlSource;
  important: boolean;
  reasons: OldUrlReason[];
  /** The new page this address must land on ('' = not chosen). Same path = kept, no redirect. */
  target: string;
  /** Why a non-home address goes to the home page (required for that, at least MIN_HOME_REASON chars). */
  home_reason: string;
}
export interface OldPagesState {
  /** The old site the list was read from ('' = none read). */
  site_url: string;
  recorded_at: string;
  read_from: OldSiteReadFrom | '';
  /** The explicit "the client has no old website" record. */
  none_at: string;
  none_reason: string;
  urls: OldUrl[];
}
export const EMPTY_OLD_PAGES: OldPagesState = { site_url: '', recorded_at: '', read_from: '', none_at: '', none_reason: '', urls: [] };
export const MAX_OLD_URLS = 300;
export const MIN_HOME_REASON = 10;
export const MIN_NONE_REASON = 10;

/** One fetched result, as the gate reports it (raw facts only). */
export interface OldUrlResult {
  path: string;
  /** The target the gate was told to expect (from the expect file). */
  target: string;
  hops: number[];
  final_status: number;
  final_path: string | null;
  soft_404: boolean;
  noindex: boolean;
  /** Set when the gate could not follow (off-site, loop, unreadable location, too many hops). */
  problem: string;
}
/** The old-address part of one gate run (preview or live). `reported` false = the gate never checked them. */
export interface OldUrlCheck { reported: boolean; base: string; results: OldUrlResult[] }
export const EMPTY_OLD_URL_CHECK: OldUrlCheck = { reported: false, base: '', results: [] };

/* ── small readers (stored state and pasted reports — never trusted for shape) ────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, cap: number) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, cap);

/** The comparable form of an address: no query or fragment, lower case, no trailing slash (the root stays "/"). */
export function pathKey(p: string): string {
  let k = String(p || '').replace(/[?#].*$/, '');
  try { k = decodeURI(k); } catch { /* keep */ }
  k = k.toLowerCase().replace(/\/index\.html?$/, '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return k === '' ? '/' : k;
}
/** An old address as it is stored: the path only (a full address is cut to its path), starting with "/". '' when unusable. */
export function oldPath(input: string): string {
  let p = String(input || '').trim();
  if (/^https?:\/\//i.test(p)) { try { p = new URL(p).pathname; } catch { return ''; } }
  p = p.replace(/[?#].*$/, '').replace(/\/{2,}/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  return /^\/[^\s?#]{0,299}$/.test(p) ? p : '';
}
export const isMandatory = (reasons: readonly string[]) => reasons.some((r) => (MANDATORY_REASONS as readonly string[]).includes(r));
const isHome = (p: string) => pathKey(p) === '/';

function readOldUrl(raw: unknown): OldUrl | null {
  const o = isObj(raw) ? raw : {};
  const path = oldPath(str(o.path, 300));
  if (!path) return null;
  const reasons = (Array.isArray(o.reasons) ? o.reasons : []).map((r) => str(r, 30)).filter((r): r is OldUrlReason => (OLD_URL_REASONS as readonly string[]).includes(r));
  const source = (OLD_URL_SOURCES as readonly string[]).includes(str(o.source, 20)) ? str(o.source, 20) as OldUrlSource : 'person';
  const target = str(o.target, 300) ? oldPath(str(o.target, 300)) : '';
  /* ⛔ A must-keep page is important whatever was stored. */
  const important = isMandatory(reasons) || o.important !== false;
  return { path, source, important, reasons: reasons.length ? [...new Set(reasons)] : ['unsure'], target, home_reason: str(o.home_reason, 300) };
}

/** Read website_build.old_pages. Duplicate paths (by pathKey) keep the first. */
export function readOldPages(v: unknown): OldPagesState {
  if (!isObj(v)) return EMPTY_OLD_PAGES;
  const seen = new Set<string>();
  const urls = (Array.isArray(v.urls) ? v.urls : []).map(readOldUrl)
    .filter((u): u is OldUrl => !!u && !seen.has(pathKey(u.path)) && !!seen.add(pathKey(u.path))).slice(0, MAX_OLD_URLS);
  const rf = str(v.read_from, 20);
  return {
    site_url: str(v.site_url, 500), recorded_at: str(v.recorded_at, 40), read_from: (READ_FROM as readonly string[]).includes(rf) ? rf as OldSiteReadFrom : '',
    none_at: str(v.none_at, 40), none_reason: str(v.none_reason, 500), urls,
  };
}

function readResult(raw: unknown): OldUrlResult | null {
  if (!isObj(raw)) return null;
  const path = oldPath(str(raw.path, 300));
  if (!path) return null;
  const n = (x: unknown) => { const v = Math.floor(Number(x)); return Number.isFinite(v) && v >= 0 && v < 1000 ? v : 0; };
  const fp = raw.final_path == null ? null : oldPath(str(raw.final_path, 300)) || null;
  return {
    path, target: str(raw.target, 300) ? oldPath(str(raw.target, 300)) : '',
    hops: (Array.isArray(raw.hops) ? raw.hops : []).map(n).slice(0, 10),
    final_status: n(raw.final_status), final_path: fp,
    /* ⛔ Absent flags read as the BAD value: a report that does not say "not a soft 404" has not shown it. */
    soft_404: raw.soft_404 !== false, noindex: raw.noindex !== false,
    problem: str(raw.problem, 300),
  };
}
/** Read the gate report's `oldUrls` block (or a stored check). Absent = not reported, never "nothing to check". */
export function readOldUrlCheck(v: unknown): OldUrlCheck {
  /* A stored "not reported" stays not reported (the gate report itself carries no `reported` key). */
  if (!isObj(v) || v.reported === false || !Array.isArray(v.results)) return EMPTY_OLD_URL_CHECK;
  return { reported: true, base: str(v.base, 300).toLowerCase(), results: v.results.map(readResult).filter((r): r is OldUrlResult => !!r).slice(0, MAX_OLD_URLS) };
}

/* ── finding the old addresses (the stored crawl of the client's own site) ────────────────────── */

const NOT_A_PAGE = /\.(?:jpe?g|png|gif|svg|webp|avif|ico|pdf|css|js|json|xml|txt|zip|mp4|mp3|woff2?|docx?|xlsx?)$/i;
const NOT_CONTENT = /^\/(?:wp-admin|wp-login|wp-json|wp-content|wp-includes|feed|cdn-cgi|cart|basket|checkout|my-account|login|tag|author|xmlrpc\.php)(?:\/|$|\.)/i;
const tokens = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
  .filter((w) => w.length > 2 && ['and', 'the', 'our', 'html', 'php', 'htm', 'for', 'with'].indexOf(w) < 0);

/** One page row of the stored crawl, reduced (paid-client-hub `old_site_pages`). */
export interface CrawlPageRow {
  url: string;
  /** How the crawler first found it: seed / sitemap / link / redirect / previous. */
  source: string | null;
  /** Internal links pointing at it, when the crawl kept its link graph; null = not known. */
  inbound: number | null;
  /** True when the address is listed in a sitemap the crawl read; null = not known. */
  in_sitemap?: boolean | null;
  http_status: number | null;
  status: string | null;
}
export interface FoundOldUrl { path: string; source: 'crawl' | 'sitemap'; reasons: OldUrlReason[] }

/**
 * The old site's addresses from the crawl rows. Same host only; assets, logins, feeds, tags and carts are
 * not pages; a page that answered 404 / 410 on the old site is not one worth protecting. The home page is
 * always there. Important by rule: the home page, a service page (its path names "service" or a confirmed
 * service), contact, and a sitemap page with inbound links — and a sitemap page whose links are NOT known
 * (default to important when unsure).
 */
export function inventoryFromCrawl(x: { siteUrl: string; rows: readonly CrawlPageRow[]; services: readonly string[] }): FoundOldUrl[] {
  let host = '';
  try { host = new URL(/^https?:\/\//i.test(x.siteUrl) ? x.siteUrl : 'https://' + x.siteUrl).hostname.toLowerCase().replace(/^www\./, ''); } catch { return []; }
  const byKey = new Map<string, { path: string; sitemap: boolean | null; inbound: number | null }>();
  byKey.set('/', { path: '/', sitemap: null, inbound: null });
  for (const r of x.rows) {
    let u: URL;
    try { u = new URL(r.url); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.hostname.toLowerCase().replace(/^www\./, '') !== host) continue;
    const p = oldPath(u.pathname);
    if (!p || NOT_A_PAGE.test(p) || NOT_CONTENT.test(p)) continue;
    if (r.http_status === 404 || r.http_status === 410) continue;
    if (r.status === 'failed' || (r.status === 'skipped' && r.source !== 'sitemap')) continue;
    const listed = r.in_sitemap === true || r.source === 'sitemap' ? true : r.in_sitemap === false ? false : null;
    const k = pathKey(p);
    const had = byKey.get(k);
    if (!had) byKey.set(k, { path: p, sitemap: listed, inbound: r.inbound });
    else byKey.set(k, { path: had.path, sitemap: had.sitemap === true || listed === true ? true : had.sitemap ?? listed, inbound: had.inbound == null ? r.inbound : Math.max(had.inbound, r.inbound ?? 0) });
  }
  const serviceTokens = x.services.map(tokens).filter((t) => t.length);
  return [...byKey.values()].slice(0, MAX_OLD_URLS).map((e): FoundOldUrl => {
    const k = pathKey(e.path);
    const words = new Set(tokens(e.path));
    const reasons: OldUrlReason[] = [];
    if (k === '/') reasons.push('homepage');
    if (/servic/i.test(e.path) || serviceTokens.some((t) => t.every((w) => words.has(w)))) reasons.push('service');
    if (/contact/i.test(e.path)) reasons.push('contact');
    const linked = e.inbound == null ? null : e.inbound > 0;
    if (e.sitemap === true && linked !== false) reasons.push('sitemap_linked');
    else if (e.sitemap === true) reasons.push('sitemap');
    else if (linked === true) reasons.push('linked');
    if (!reasons.length) reasons.push('unsure');
    return { path: e.path, source: e.sitemap === true ? 'sitemap' : 'crawl', reasons };
  });
}

/**
 * A new read of the old site merged into the stored list. ⛔ Nothing found is ever dropped by a re-read,
 * and every decision (important, target, home reason) is kept; a hand-added address that is now found
 * becomes a found one. A DIFFERENT old site (another host) starts again.
 */
export function mergeOldUrls(prev: OldPagesState, found: readonly FoundOldUrl[], x: { siteUrl: string; readFrom: OldSiteReadFrom; now: string }): OldPagesState {
  const hostOf = (u: string) => { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
  const sameSite = !prev.site_url || hostOf(prev.site_url) === hostOf(x.siteUrl);
  const base = sameSite ? prev.urls : [];
  const out: OldUrl[] = base.map((u) => ({ ...u }));
  for (const f of found) {
    const at = out.findIndex((u) => pathKey(u.path) === pathKey(f.path));
    if (at < 0) { out.push({ path: f.path, source: f.source, important: true, reasons: f.reasons, target: '', home_reason: '' }); continue; }
    const u = out[at];
    const reasons = [...new Set([...u.reasons.filter((r) => r !== 'unsure' || f.reasons.includes('unsure')), ...f.reasons])];
    out[at] = { ...u, source: u.source === 'person' || f.source === 'sitemap' ? f.source : u.source, reasons, important: isMandatory(reasons) ? true : u.important };
  }
  /* Read order is kept; the rank only matters for what is shown first. */
  const rank: Record<OldSiteReadFrom, number> = { homepage_only: 0, quick_crawl: 1, full_crawl: 2 };
  const readFrom = sameSite && prev.read_from && rank[prev.read_from] > rank[x.readFrom] ? prev.read_from : x.readFrom;
  return { ...prev, site_url: x.siteUrl, recorded_at: x.now, read_from: readFrom, none_at: '', none_reason: '', urls: out.slice(0, MAX_OLD_URLS) };
}

/** Paul adds an address by hand (a page he knows ranks or is linked to). Important by default. */
export function addOldUrl(op: OldPagesState, input: string): { state: OldPagesState; error: string } {
  const p = oldPath(input);
  if (!p) return { state: op, error: 'That is not a web address or a path (e.g. /boiler-repair/).' };
  if (op.urls.some((u) => pathKey(u.path) === pathKey(p))) return { state: op, error: p + ' is already on the list.' };
  if (op.urls.length >= MAX_OLD_URLS) return { state: op, error: 'The list is full (' + MAX_OLD_URLS + ' addresses).' };
  return { state: { ...op, urls: [...op.urls, { path: p, source: 'person', important: true, reasons: ['added'], target: '', home_reason: '' }] }, error: '' };
}
/** Remove an address — only one Paul added. A found one can be marked not important (when allowed), never removed. */
export function removeOldUrl(op: OldPagesState, path: string): OldPagesState {
  return { ...op, urls: op.urls.filter((u) => u.source !== 'person' || pathKey(u.path) !== pathKey(path)) };
}
/** Mark an address important / not important. A must-keep page cannot be unmarked. */
export function setOldUrlImportant(op: OldPagesState, path: string, important: boolean): OldPagesState {
  return { ...op, urls: op.urls.map((u) => (pathKey(u.path) === pathKey(path) ? { ...u, important: isMandatory(u.reasons) ? true : important } : u)) };
}
/** Point an address at a new page. The home page for a non-home address needs a written reason. */
export function mapOldUrl(op: OldPagesState, path: string, target: string, homeReason = ''): OldPagesState {
  const t = target ? oldPath(target) : '';
  return { ...op, urls: op.urls.map((u) => (pathKey(u.path) === pathKey(path) ? { ...u, target: t, home_reason: t && isHome(t) && !isHome(u.path) ? homeReason.trim().slice(0, 300) : '' } : u)) };
}
/** "The client has no old website" — refused while a current site or old pages are on record. */
export function noOldSiteRefusal(op: OldPagesState, hasCurrentSite: boolean, reason: string): string {
  if (hasCurrentSite) return 'The client has a current website on record — its old pages must be protected.';
  if (op.urls.length) return 'Old pages are listed — "no old site" cannot be recorded while they are.';
  if (reason.trim().length < MIN_NONE_REASON) return 'Say how you know there is no old site (at least ' + MIN_NONE_REASON + ' characters).';
  return '';
}
export function recordNoOldSite(op: OldPagesState, reason: string, now: string): OldPagesState {
  return { ...op, none_at: now, none_reason: reason.trim().slice(0, 500) };
}

/* ── mapping old to new (a suggestion; Paul decides) ─────────────────────────────────────────────── */

export interface NewPage { path: string; family: string; title: string }

/**
 * Suggests the new page for each unmapped important address: the same address where the plan keeps it;
 * contact, about, privacy and areas to their page; a service to the service page that shares its words,
 * else the services hub. ⛔ Never the home page for anything but the home page: a retired page with no
 * close match stays unmapped for Paul.
 */
export function autoMapOldUrls(op: OldPagesState, pages: readonly NewPage[]): OldPagesState {
  const real = pages.filter((p) => p.path && /^\//.test(p.path) && p.path.indexOf('<') < 0);
  const byKey = new Map(real.map((p) => [pathKey(p.path), p.path]));
  const fam = (f: string, path?: RegExp) => real.find((p) => p.family === f && (!path || path.test(p.path)))?.path ?? '';
  const services = real.filter((p) => p.family === 'service').map((p) => ({ path: p.path, words: new Set(tokens(p.path + ' ' + p.title)) }));
  const urls = op.urls.map((u) => {
    if (u.target) return u;
    const k = pathKey(u.path);
    let t = byKey.get(k) ?? '';
    if (!t && /contact/.test(k)) t = fam('contact');
    if (!t && /about|who-we-are|our-story|team/.test(k)) t = fam('about');
    if (!t && /privacy|cookie/.test(k)) t = fam('legal', /privacy/);
    if (!t && /area|location|cover/.test(k)) t = fam('locations_index');
    if (!t) {
      /* "services" alone says nothing about WHICH service: it never decides the match. */
      const words = tokens(u.path).filter((w) => !/^servic/.test(w));
      let best: { path: string; score: number } | null = null;
      for (const s of services) {
        const hit = words.filter((w) => s.words.has(w)).length;
        const score = hit / Math.max(1, Math.min(words.length, s.words.size));
        if (hit && (!best || score > best.score)) best = { path: s.path, score };
      }
      if (best && best.score >= 0.5) t = best.path;
      else if (/servic/.test(k)) t = fam('services_index');
    }
    if (t && isHome(t) && !isHome(u.path)) t = '';
    return t ? { ...u, target: t } : u;
  });
  return { ...op, urls };
}

/* ── the verdict on one fetched result ───────────────────────────────────────────────────────────── */

const PERMANENT = [301, 308];
/**
 * LeadFinderOS's verdict on one result, from its raw facts only. ⛔ THE SAME RULE as judgeOldUrl in
 * scripts/site-quality-gate.mjs. `target` is the CURRENT mapping (a result for another target fails).
 */
export function judgeOldUrlResult(r: OldUrlResult, target: string): { passed: boolean; detail: string } {
  const p = r.path;
  if (!target) return { passed: false, detail: p + ' has no new page chosen.' };
  if (r.target && pathKey(r.target) !== pathKey(target)) return { passed: false, detail: p + ' was checked against ' + r.target + ', but it now goes to ' + target + ' — run the check again.' };
  if (r.problem) return { passed: false, detail: p + ' ' + r.problem + '.' };
  if (r.final_status === 404 || r.final_status === 410) return { passed: false, detail: p + ' answers ' + r.final_status + ': the page is gone and nothing redirects it.' };
  if (r.final_status !== 200 || !r.final_path) return { passed: false, detail: p + ' ends with HTTP ' + (r.final_status || 'no answer') + '.' };
  if (r.soft_404) return { passed: false, detail: p + ' shows a "page not found" page with HTTP 200 (a soft 404).' };
  if (pathKey(r.final_path) !== pathKey(target)) return { passed: false, detail: isHome(r.final_path) ? p + ' sends visitors to the home page instead of ' + target + '.' : p + ' lands on ' + r.final_path + ', not on ' + target + '.' };
  const temp = r.hops.find((h) => PERMANENT.indexOf(h) < 0);
  if (temp != null) return { passed: false, detail: p + ' uses a temporary redirect (' + temp + ') where a permanent 301 is needed.' };
  if (r.hops.length > 1) return { passed: false, detail: p + ' goes through ' + r.hops.length + ' redirects (a chain): redirect it straight to ' + target + '.' };
  if (r.noindex) return { passed: false, detail: p + ' lands on ' + target + ', which carries noindex.' };
  return { passed: true, detail: r.hops.length ? p + ' redirects once (' + r.hops[0] + ') to ' + target + '.' : p + ' still answers.' };
}

/* ── the summary, the problems, the server's refusal ─────────────────────────────────────────────── */

export type OldSiteMode = 'exempt' | 'recorded' | 'not_recorded';
/* ⛔ An absent record (a hand-built state, an old caller) reads as EMPTY = not recorded — it blocks, never passes. */
const orEmpty = (op: OldPagesState | null | undefined): OldPagesState => op ?? EMPTY_OLD_PAGES;
export const importantOldUrls = (op: OldPagesState) => orEmpty(op).urls.filter((u) => u.important);
export function oldSiteMode(op0: OldPagesState): OldSiteMode {
  const op = orEmpty(op0);
  if (op.urls.length) return 'recorded';
  if (op.none_at && op.none_reason.length >= MIN_NONE_REASON) return 'exempt';
  return 'not_recorded';
}
/** Important addresses whose mapping is not usable yet (no page, or the home page without a reason). */
export function unmappedOldUrls(op: OldPagesState): OldUrl[] {
  return importantOldUrls(op).filter((u) => !u.target || (isHome(u.target) && !isHome(u.path) && u.home_reason.trim().length < MIN_HOME_REASON));
}

/** The host a check ran on, compared without www. */
const bareHost = (u: string) => { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };

export interface OldPagesSummary {
  mode: OldSiteMode;
  total: number;
  protectedCount: number;
  /** One plain sentence per important address that is not protected yet. */
  missing: string[];
  line: string;
}
/**
 * "Old pages protected: X of Y". Protected = mapped, and the given check (preview or live) fetched it
 * and LeadFinderOS judged the result a pass for its CURRENT mapping. `check` null = nothing checked yet.
 */
export function oldPagesSummary(op0: OldPagesState, check: OldUrlCheck | null, expectBase = ''): OldPagesSummary {
  const op = orEmpty(op0);
  const mode = oldSiteMode(op);
  if (mode === 'exempt') return { mode, total: 0, protectedCount: 0, missing: [], line: 'No old site (recorded: ' + op.none_reason + ')' };
  if (mode === 'not_recorded') return { mode, total: 0, protectedCount: 0, missing: ['The old site’s pages are not recorded yet — press Prepare website, or record that the client has no old site.'], line: 'Old pages: not recorded yet' };
  const important = importantOldUrls(op);
  const wrongBase = !!(check && check.reported && expectBase && bareHost(check.base) !== bareHost(expectBase));
  const missing: string[] = [];
  let protectedCount = 0;
  for (const u of important) {
    if (!u.target) { missing.push(u.path + ' has no new page chosen.'); continue; }
    if (isHome(u.target) && !isHome(u.path) && u.home_reason.trim().length < MIN_HOME_REASON) { missing.push(u.path + ' goes to the home page with no reason written.'); continue; }
    if (!check || !check.reported) { missing.push(u.path + ' → ' + u.target + ' has not been checked yet.'); continue; }
    if (wrongBase) { missing.push(u.path + ' was checked on ' + (check.base || 'an unknown address') + ', not ' + expectBase + '.'); continue; }
    const r = check.results.find((x) => pathKey(x.path) === pathKey(u.path));
    if (!r) { missing.push(u.path + ' was not in the check — re-run it with the current list.'); continue; }
    const v = judgeOldUrlResult(r, u.target);
    if (v.passed) protectedCount++;
    else missing.push(v.detail);
  }
  return { mode, total: important.length, protectedCount, missing, line: 'Old pages protected: ' + protectedCount + ' of ' + important.length };
}

/** Why old pages stop the launch (preview check) or "Production checked" (live check). Empty = they don't. */
export function oldPagesProblems(op: OldPagesState, check: OldUrlCheck | null, x: { stage: 'preview' | 'production'; base: string }): string[] {
  const s = oldPagesSummary(op, check, x.base);
  if (s.mode === 'exempt') return [];
  if (s.mode === 'not_recorded') return ['Old pages not recorded — read the old site (Prepare website) or record that the client has no old site'];
  if (!s.missing.length) return [];
  const where = x.stage === 'production' ? 'on the live site' : 'on the preview';
  return [s.line + ' ' + where + ' — ' + s.missing.slice(0, 4).join(' ') + (s.missing.length > 4 ? ' (+' + (s.missing.length - 4) + ' more)' : '')];
}

/** The important, mapped addresses for the gate's expect file (the gate fetches each). */
export function oldUrlsForExpect(op: OldPagesState): Array<{ path: string; target: string }> {
  return importantOldUrls(op).filter((u) => !!u.target).map((u) => ({ path: u.path, target: u.target }));
}

/** The prompt lines: keep where sensible, else ONE permanent redirect in the host's redirects file. */
export function oldUrlPromptLines(op: OldPagesState): string[] {
  const important = importantOldUrls(op).filter((u) => !!u.target);
  if (!important.length) return [];
  const kept = important.filter((u) => pathKey(u.path) === pathKey(u.target));
  const moved = important.filter((u) => pathKey(u.path) !== pathKey(u.target));
  return [
    'OLD ADDRESSES — ranking protection. LeadFinderOS requests every one of these on the preview and on the live site, and the launch waits for them:',
    ...(kept.length ? ['Keep these addresses exactly as they are (the new page lives at the same address — the trailing slash may differ):', ...kept.map((u) => '- ' + u.path)] : []),
    ...(moved.length ? [
      'Redirect each of these with ONE permanent 301 in public/_redirects (Cloudflare Pages: one line per address, "/old-path /new-path/ 301" — the 301 MUST be written; a line without it is a 302):',
      ...moved.map((u) => '- ' + u.path + ' -> ' + u.target + (isHome(u.target) ? '  (home page on purpose: ' + u.home_reason + ')' : '')),
    ] : []),
    '- Redirect straight to the FINAL address, trailing slash included, so there is never a second hop. Never a 302. Never send an old address to the home page unless it is listed above. The pages these land on must be indexable on production (no noindex in the page itself), and must not be a "page not found" page.',
    '- These addresses are in qa/findable-expect.json as "oldUrls": the gate fetches each on the preview (--url) and fails a 404, a soft 404, the wrong target, a home-page dump, a 302, a chain or a noindex target. Never edit the list.',
  ];
}

/**
 * The server's refusal of a save that would QUIETLY lose protection: a found address removed, a must-keep
 * page marked not important, or "no old site" recorded while old pages are listed. A different old site
 * (another host) may start a new list. '' = allowed.
 */
export function oldPagesSaveRefusal(prev0: OldPagesState, next0: OldPagesState): string {
  const prev = orEmpty(prev0), next = orEmpty(next0);
  const sameSite = !prev.site_url || !next.site_url || bareHost(prev.site_url) === bareHost(next.site_url);
  if (sameSite) {
    const lost = prev.urls.filter((u) => u.source !== 'person' && !next.urls.some((n) => pathKey(n.path) === pathKey(u.path)));
    if (lost.length) return 'Not saved: this would remove ' + lost.length + ' old page(s) found on the client’s site (' + lost.slice(0, 3).map((u) => u.path).join(', ') + '). A found page can be marked not important, never removed.';
  }
  const unmarked = next.urls.filter((u) => isMandatory(u.reasons) && !u.important);
  if (unmarked.length) return 'Not saved: ' + unmarked.slice(0, 3).map((u) => u.path).join(', ') + ' must stay important (home, service, contact or a linked sitemap page).';
  if (next.none_at && next.urls.length) return 'Not saved: "no old site" cannot be recorded while old pages are listed.';
  return '';
}

#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FINDABLE SITE QUALITY GATE — the final pre-deploy check of a BUILT client website.

   Every Findable build route (template, faithful rebuild, bespoke) ends in the same place: a static
   site in a client repository, deployed to Cloudflare Pages. Before 2026-09-30 every "passed" in the
   build result (qa.linksPassed, qa.schemaPassed …) was Claude's own word. This script reads the REAL
   output and checks what a machine can check reliably. It never judges taste, and it never calls a
   subjective thing passed: those are listed under "human review".

   Two ways to run it (plain Node 18+, no dependencies — it is copied into client repositories):
     node site-quality-gate.mjs --dist dist --domain example.co.uk [--expect qa/findable-expect.json]
     node site-quality-gate.mjs --url https://preview.<project>.pages.dev --domain example.co.uk --preview
   Options: --forbid-host old-site.co.uk,another.com   --json qa/site-gate.json   --quiet

   --dist reads the build output folder (the pages, robots.txt, sitemap, _headers, _redirects).
   --url  crawls a deployed copy (up to 300 pages) and adds what only a live copy can show: response
          headers, the search crawlers' user agents getting a real page (WAF / bot-fight compatibility),
          http -> https and www / apex in one hop (production only). --preview expects a noindex HEADER
          (a *.pages.dev preview) and does not check the production redirects.

   --expect is the Site Intent Map LeadFinderOS prints in the Build Execution prompt (X6b): the business
   identity and every approved intent with the page that OWNS it. Without it the identity and intent
   checks are skipped and SAY so — skipped is never passed.

   Exit code: 0 = no FAIL, 1 = at least one FAIL, 2 = the gate could not run. The JSON report
   (siteGateVersion 1) goes in the build result as quality.siteGate.
   ⛔ Never weaken a check to make a build pass. Fix the site, or report the check as failed.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SITE_GATE_VERSION = 1;

/** The search / answer crawlers the Findable standard requires robots.txt to ALLOW. */
export const REQUIRED_CRAWLERS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-User', 'PerplexityBot', 'Googlebot', 'Bingbot'];
/** schema.org LocalBusiness and the subtypes Findable trades use. A business node must be one of them. */
const LOCAL_BUSINESS_TYPES = new Set(['LocalBusiness', 'Locksmith', 'Electrician', 'Plumber', 'HVACBusiness', 'RoofingContractor',
  'HousePainter', 'GeneralContractor', 'HomeAndConstructionBusiness', 'MovingCompany', 'AutoRepair', 'AutomotiveBusiness',
  'AccountingService', 'FinancialService', 'ProfessionalService', 'LegalService', 'Attorney', 'Dentist', 'MedicalBusiness',
  'HealthAndBeautyBusiness', 'HairSalon', 'BeautySalon', 'DaySpa', 'ChildCare', 'CleaningService' /* not schema.org core, tolerated */,
  'DryCleaningOrLaundry', 'EmergencyService', 'EntertainmentBusiness', 'FoodEstablishment', 'Restaurant', 'Store', 'HomeGoodsStore',
  'HardwareStore', 'LodgingBusiness', 'RealEstateAgent', 'SelfStorage', 'SportsActivityLocation', 'TravelAgency', 'Veterinary',
  'VeterinaryCare', 'AnimalShelter', 'EmploymentAgency', 'InsuranceAgency', 'InternetCafe', 'Library', 'RecyclingCenter',
  'ShoppingCenter', 'TouristInformationCenter', 'GovernmentOffice', 'DrivingSchool', 'EducationalOrganization']);
const PREVIEW_OR_DEV_HOST = /(^|\.)pages\.dev$|(^|\.)trycloudflare\.com$|^localhost$|^127\.0\.0\.1$|^0\.0\.0\.0$|^\[::1\]$/i;
const PLACEHOLDER = /lorem ipsum|\bTODO\b|\bTBC\b|\[CLIENT[ _-]?(INPUT|CONFIRM)\]|\bPLACEHOLDER\b|\{\{[^}]*\}\}|example\.com|your business name|01234 ?567 ?890|07700 ?900/i;

/* ── small parsers (static HTML only — the build output, never a DOM) ─────────────────────────── */

const decode = (s) => String(s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&middot;/g, '·').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const squash = (s) => decode(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
function attrs(tag) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  const body = tag.replace(/^<\s*[a-zA-Z0-9]+/, '').replace(/\/?>$/, '');
  while ((m = re.exec(body))) out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? '');
  return out;
}
const tags = (html, name) => [...html.matchAll(new RegExp('<' + name + '\\b[^>]*>', 'gi'))].map((m) => attrs(m[0]));
const stripNonContent = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ');
/** The page's own content: without the site chrome, so two pages are compared on what differs. */
const mainContent = (html) => {
  const body = stripNonContent(html);
  const main = body.match(/<main\b[\s\S]*?<\/main>/i);
  return (main ? main[0] : body).replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ');
};
const words = (text) => (text.toLowerCase().match(/[a-z0-9£'’-]+/g) ?? []);
const digits = (s) => String(s).replace(/[^\d+]/g, '').replace(/^\+44/, '0').replace(/^0044/, '0').replace(/^44(?=\d{10}$)/, '0');
const UK_PHONE = /(?:\+44\s?\(?0?\)?\s?|\b0)(?:\d[\s-]?){9,10}\b/g;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export function parsePage(html) {
  const h = String(html);
  const noScripts = h.replace(/<!--[\s\S]*?-->/g, ' ');
  const title = [...noScripts.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => squash(m[1]));
  const metas = tags(noScripts, 'meta');
  const links = tags(noScripts, 'link');
  const body = stripNonContent(h);
  const headings = [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: squash(m[2]) }));
  const anchors = [...body.matchAll(/<a\b[^>]*>/gi)].map((m) => attrs(m[0]).href).filter((x) => x != null);
  const jsonld = [...h.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim());
  const imgs = tags(body, 'img');
  const text = squash(body);
  const mainText = squash(mainContent(h));
  const htmlTag = tags(noScripts, 'html')[0] ?? {};
  const headScripts = tags((noScripts.match(/<head\b[\s\S]*?<\/head>/i) ?? [''])[0], 'script');
  const firstParas = [...mainContent(h).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].slice(0, 4).map((m) => squash(m[1]));
  return {
    titles: title, headings, anchors, jsonld, imgs, text, mainText, firstParas,
    lang: htmlTag.lang ?? '',
    description: metas.filter((m) => (m.name ?? '').toLowerCase() === 'description').map((m) => m.content ?? ''),
    robots: metas.filter((m) => /^(robots|googlebot|bingbot)$/i.test(m.name ?? '')).map((m) => (m.content ?? '').toLowerCase()),
    viewport: metas.filter((m) => (m.name ?? '').toLowerCase() === 'viewport').map((m) => m.content ?? ''),
    canonical: links.filter((l) => (l.rel ?? '').toLowerCase().split(/\s+/).includes('canonical')).map((l) => l.href ?? ''),
    blockingScripts: headScripts.filter((s) => s.src && !('async' in s) && !('defer' in s) && (s.type ?? '') !== 'module').map((s) => s.src),
    bytes: Buffer.byteLength(h),
  };
}

/** robots.txt → does this user agent get "/"? Longest-match of Allow / Disallow in its group, else "*". */
export function robotsAllows(robotsTxt, agent, urlPath = '/') {
  const groups = [];
  let cur = null, lastWasAgent = false;
  for (const raw of String(robotsTxt).split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (cur && (k === 'allow' || k === 'disallow')) cur.rules.push({ allow: k === 'allow', path: v });
  }
  const a = agent.toLowerCase();
  const group = groups.find((g) => g.agents.some((x) => x !== '*' && a.startsWith(x))) ?? groups.find((g) => g.agents.includes('*'));
  if (!group) return true;
  let best = null;
  for (const r of group.rules) {
    if (!r.path) { if (!r.allow) continue; }
    const pat = r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    if (!new RegExp('^' + pat).test(urlPath)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

/** Cloudflare Pages _headers → the rules that apply to a host + path. */
export function parseHeaders(txt) {
  const rules = [];
  let cur = null;
  for (const raw of String(txt ?? '').split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) { cur = { pattern: raw.trim(), headers: [] }; rules.push(cur); continue; }
    const m = raw.trim().match(/^([^:]+):\s*(.*)$/);
    if (cur && m) cur.headers.push({ name: m[1].trim().toLowerCase(), value: m[2].trim() });
  }
  return rules;
}
/** Cloudflare Pages _redirects → [{ from, to, status }]. Splat / placeholder sources match by prefix. */
export function parseRedirects(txt) {
  return String(txt ?? '').split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean)
    .map((l) => l.split(/\s+/)).filter((p) => p.length >= 2).map(([from, to, status]) => ({ from, to, status: Number(status) || 301 }));
}
const redirectFor = (redirects, p) => redirects.find((r) => {
  if (!/[*:]/.test(r.from)) return norm(r.from) === norm(p);
  const pre = r.from.split(/[*:]/)[0];
  return norm(p).startsWith(norm(pre).replace(/\/$/, '') + '/') || norm(p) === norm(pre);
});
const norm = (p) => { let x = String(p || '/').split(/[?#]/)[0]; try { x = decodeURI(x); } catch { /* keep */ } x = x.replace(/\/index\.html$/i, '/').replace(/\/{2,}/g, '/'); return x.length > 1 ? x.replace(/\/$/, '') : '/'; };

/** Every <loc> in a sitemap (index or urlset). */
export const sitemapLocs = (xml) => [...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));

/* ── the input: a set of files, from a dist folder or a crawl ────────────────────────────────── */

/** Read a build output folder into { pages: Map(urlPath -> html), files: Set(urlPath), robots, sitemaps, headers, redirects }. */
export function loadDist(dir) {
  const root = path.resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error('No build output folder at ' + root + ' — run the production build first.');
  const pages = new Map(), files = new Set(), sitemaps = new Map(), sizes = new Map();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      const rel = '/' + path.relative(root, full).split(path.sep).join('/');
      files.add(rel);
      sizes.set(rel, statSync(full).size);
      if (/\.html?$/i.test(rel)) {
        const url = rel === '/404.html' ? '/404.html' : /\/index\.html$/i.test(rel) ? rel.replace(/index\.html$/i, '') : rel.replace(/\.html$/i, '');
        pages.set(url, readFileSync(full, 'utf8'));
      } else if (/sitemap[^/]*\.xml$/i.test(rel)) sitemaps.set(rel, readFileSync(full, 'utf8'));
    }
  };
  walk(root);
  const read = (f) => (existsSync(path.join(root, f)) ? readFileSync(path.join(root, f), 'utf8') : null);
  return { mode: 'dist', pages, files, sizes, sitemaps, robots: read('robots.txt'), headers: read('_headers'), redirects: read('_redirects'), llms: files.has('/llms.txt'), live: null };
}

/* ── the checks ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Audit a loaded site. Pure over its input (a dist load or a crawl), so it is tested with fixtures.
 * @param site    from loadDist() / crawlSite()
 * @param opts    { domain, expect?, forbidHosts?: string[], preview?: boolean }
 */
export function auditSite(site, opts) {
  const domain = String(opts.domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const origin = 'https://' + domain;
  const expect = opts.expect ?? null;
  const forbid = (opts.forbidHosts ?? []).map((h) => h.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean);
  const checks = [];
  const human = [];
  const add = (id, group, label, level, details = []) => checks.push({ id, group, label, level, details: details.slice(0, 40), more: Math.max(0, details.length - 40) });
  const uniq = (a) => [...new Set(a)];
  const result = (id, group, label, fails0, warns0 = []) => { const fails = uniq(fails0), warns = uniq(warns0); add(id, group, label, fails.length ? 'fail' : warns.length ? 'warn' : 'pass', fails.length ? [...fails, ...warns.map((w) => 'also: ' + w)] : warns); };

  if (!domain) { add('domain', 'technical', 'Canonical domain given', 'fail', ['No --domain: every canonical / sitemap / schema check needs the production domain.']); return finish(); }

  const redirects = parseRedirects(site.redirects);
  const headerRules = parseHeaders(site.headers);
  const parsed = new Map([...site.pages].map(([p, html]) => [p, parsePage(html)]));
  const is404 = (p) => /^\/404(\.html)?\/?$/.test(p);
  const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
  const sameHost = (h) => h === domain || h.replace(/^www\./, '') === domain.replace(/^www\./, '');
  const pageFor = (p) => { const n = norm(p); for (const k of parsed.keys()) if (norm(k) === n) return k; return null; };
  const metaNoindex = (p) => parsed.get(p).robots.some((r) => /noindex|none/.test(r));
  const indexable = [...parsed.keys()].filter((p) => !is404(p) && !metaNoindex(p));

  /* ── T1 robots.txt and crawler access ── */
  {
    const fails = [], warns = [];
    if (site.robots == null) fails.push('robots.txt is missing.');
    else {
      for (const bot of REQUIRED_CRAWLERS) if (!robotsAllows(site.robots, bot, '/')) fails.push('robots.txt blocks ' + bot + ' from the site.');
      const sm = [...String(site.robots).matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
      if (!sm.length) fails.push('robots.txt has no Sitemap: line.');
      for (const u of sm) if (!u.startsWith(origin + '/')) fails.push('robots.txt Sitemap points at ' + u + ' — expected ' + origin + '/…');
      for (const bot of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'CCBot']) if (!robotsAllows(site.robots, bot, '/')) warns.push(bot + ' (model-training crawler) is blocked — allowed only if Paul decided it; it does not affect search.');
    }
    if (site.live?.botFetch) for (const b of site.live.botFetch) if (!b.ok) fails.push(b.agent + ' was refused the home page by the server / WAF: ' + b.detail);
    result('robots', 'crawl', 'robots.txt allows the search and answer crawlers and names the sitemap', fails, warns);
  }

  /* ── T2 no accidental noindex ── */
  {
    const fails = [], warns = [];
    for (const p of parsed.keys()) if (!is404(p) && metaNoindex(p)) fails.push(p + ' carries a robots meta noindex — it would ship to production.');
    for (const r of headerRules) {
      const noindex = r.headers.some((h) => h.name === 'x-robots-tag' && /noindex|none/i.test(h.value));
      if (!noindex) continue;
      const host = /^https?:\/\//i.test(r.pattern) ? hostOf(r.pattern.replace(/:[a-z]+/gi, 'x').replace(/\*/g, 'x')) : '';
      if (!host) fails.push('_headers sends X-Robots-Tag noindex for "' + r.pattern + '" on EVERY host — the production domain too. Scope it to https://:project.pages.dev/* only.');
      else if (sameHost(host)) fails.push('_headers noindexes the production domain ("' + r.pattern + '").');
    }
    if (site.live) {
      const hdr = site.live.homeRobotsHeader || '';
      if (opts.preview && !/noindex/i.test(hdr)) fails.push('The preview home page has no X-Robots-Tag noindex header — a preview must never be indexable.');
      if (!opts.preview && /noindex|none/i.test(hdr)) fails.push('The production home page is served with X-Robots-Tag "' + hdr + '".');
    }
    result('noindex', 'crawl', opts.preview ? 'Preview is noindexed by header; nothing noindexes production' : 'Nothing noindexes the production site', fails, warns);
  }

  /* ── T3 sitemap ── */
  {
    const fails = [], warns = [];
    let locs = [];
    if (!site.sitemaps.size) fails.push('No sitemap*.xml in the build.');
    else {
      for (const [, xml] of site.sitemaps) if (!/<sitemapindex\b/i.test(xml)) locs.push(...sitemapLocs(xml));
      locs = [...new Set(locs)];
      if (!locs.length) fails.push('The sitemap lists no pages.');
    }
    const listed = new Set();
    for (const u of locs) {
      const h = hostOf(u);
      if (!u.startsWith('https://')) fails.push('Sitemap URL is not https: ' + u);
      if (h !== domain) { fails.push('Sitemap URL on the wrong host: ' + u + ' (expected ' + domain + ')'); continue; }
      const p = new URL(u).pathname;
      const page = pageFor(p);
      if (!page) { fails.push('Sitemap lists ' + p + ', which the build does not serve.'); continue; }
      if (norm(page) === norm(p) && page !== p && !page.endsWith('.html')) warns.push('Sitemap URL ' + p + ' differs from the page address ' + page + ' by a trailing slash.');
      if (redirectFor(redirects, p) && norm(redirectFor(redirects, p).to) !== norm(p)) fails.push('Sitemap lists ' + p + ', which _redirects sends elsewhere.');
      if (metaNoindex(page)) fails.push('Sitemap lists ' + p + ', which is noindexed.');
      listed.add(norm(page));
    }
    if (locs.length) for (const p of indexable) if (!listed.has(norm(p))) fails.push('Indexable page missing from the sitemap: ' + p);
    result('sitemap', 'crawl', 'XML sitemap lists every indexable page and nothing else, on the production domain', fails, warns);
  }

  /* ── T4 canonicals ── */
  {
    const fails = [];
    for (const [p, x] of parsed) {
      if (is404(p) || metaNoindex(p)) continue;
      if (x.canonical.length !== 1) { fails.push(p + ': ' + (x.canonical.length ? x.canonical.length + ' canonical tags' : 'no canonical')); continue; }
      const c = x.canonical[0];
      if (!/^https:\/\//i.test(c)) { fails.push(p + ': canonical is not an absolute https URL (' + c + ')'); continue; }
      if (hostOf(c) !== domain) { fails.push(p + ': canonical host ' + hostOf(c) + ' (expected ' + domain + ')'); continue; }
      const cp = new URL(c).pathname;
      if (norm(cp) !== norm(p)) fails.push(p + ': canonical points at another page (' + cp + ')');
      else if (cp !== p && !p.endsWith('.html')) fails.push(p + ': canonical ' + cp + ' differs from the served address by a trailing slash');
    }
    result('canonical', 'crawl', 'One self-referencing https canonical per page on the production domain', fails);
  }

  /* ── T5 domain correctness ── */
  {
    const fails = [], seen = new Set();
    const scan = (where, text) => {
      for (const m of String(text).matchAll(/\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,}|localhost|127\.0\.0\.1)(:\d+)?[^\s"'<>)]*/gi)) {
        const host = m[1].toLowerCase(), url = m[0];
        const bad = PREVIEW_OR_DEV_HOST.test(host) ? 'a preview / development address'
          : forbid.some((f) => host === f || host.endsWith('.' + f)) ? 'a forbidden (old / seed) host'
          : sameHost(host) && url.startsWith('http://') ? 'plain http on the production domain'
          : sameHost(host) && host !== domain ? 'the non-canonical ' + (host.startsWith('www.') ? 'www' : 'apex') + ' host' : '';
        const key = where + '|' + host + '|' + bad;
        if (bad && !seen.has(key)) { seen.add(key); fails.push(where + ': ' + url.slice(0, 120) + ' — ' + bad); }
      }
    };
    for (const [p, html] of site.pages) scan(p, stripNonContent(html) + ' ' + parsed.get(p).jsonld.join(' '));
    if (site.robots) scan('robots.txt', site.robots);
    for (const [f, xml] of site.sitemaps) scan(f, xml);
    for (const r of redirects) scan('_redirects', r.to);
    result('domain', 'crawl', 'No preview, development, old or non-canonical host anywhere in the build', fails);
  }

  /* ── T6 internal links resolve ── */
  const inbound = new Map([...parsed.keys()].map((p) => [norm(p), new Set()]));
  const outLinks = new Map();
  const cfEmail = new Set();
  {
    const fails = [], warns = [];
    for (const [p, x] of parsed) {
      const outs = new Set();
      for (const href0 of x.anchors) {
        const href = href0.trim();
        if (!href || href.startsWith('#')) continue;
        if (/^(tel|mailto|sms|whatsapp):/i.test(href)) continue;
        if (/^javascript:/i.test(href)) { warns.push(p + ': a javascript: link'); continue; }
        let u;
        try { u = new URL(href, origin + (p.endsWith('/') || p.endsWith('.html') ? p : p + '/')); } catch { fails.push(p + ': unparseable link "' + href.slice(0, 80) + '"'); continue; }
        if (!/^https?:$/.test(u.protocol)) continue;
        if (!sameHost(u.hostname.toLowerCase()) && !(PREVIEW_OR_DEV_HOST.test(u.hostname) && /^\//.test(href))) continue;
        const target = u.pathname;
        if (target.startsWith('/cdn-cgi/')) { if (/email-protection/.test(target)) cfEmail.add(p); continue; }
        const page = pageFor(target);
        if (page) {
          outs.add(norm(page));
          if (norm(page) !== norm(p)) inbound.get(norm(page)).add(norm(p));
          if (target !== page && !page.endsWith('.html') && !target.endsWith('.html') && page !== '/') warns.push(p + ' links to ' + target + ' — the page is ' + page + ' (an extra redirect hop)');
          continue;
        }
        if (site.files.has(target) || site.files.has(decodeURI(target))) continue;
        const r = redirectFor(redirects, target);
        if (r) { warns.push(p + ' links to ' + target + ', a redirect to ' + r.to + ' — link to the target'); continue; }
        if (site.mode === 'url' && !site.pagesComplete) continue;
        fails.push(p + ' → ' + target + ' (not in the build)');
      }
      outLinks.set(norm(p), outs);
    }
    if (cfEmail.size) warns.push('Cloudflare Email Address Obfuscation is ON (' + cfEmail.size + ' page(s)): the email address is replaced by a /cdn-cgi/ link, so crawlers and AI engines cannot read it. Turn it off (Scrape Shield) or accept that the email is invisible.');
    result('links', 'links', 'Every internal link resolves to a built page or file', fails, warns);
  }

  /* ── T7 orphans and click depth ── */
  {
    const fails = [], warns = [];
    for (const p of indexable) if (norm(p) !== '/' && !inbound.get(norm(p))?.size) fails.push('Orphan: nothing links to ' + p);
    const depth = new Map([['/', 0]]);
    const q = ['/'];
    while (q.length) { const c = q.shift(); for (const n of outLinks.get(c) ?? []) if (!depth.has(n)) { depth.set(n, depth.get(c) + 1); q.push(n); } }
    for (const p of indexable) { const d = depth.get(norm(p)); if (d == null && norm(p) !== '/') warns.push(p + ' cannot be reached by following links from the home page'); else if (d > 3) warns.push(p + ' is ' + d + ' clicks from the home page'); }
    result('orphans', 'links', 'No orphan pages; every page within three clicks of the home page', fails, warns);
  }

  /* ── S1 titles, S2 descriptions, S3 headings ── */
  {
    const fails = [], warns = [], byTitle = new Map();
    for (const [p, x] of parsed) {
      if (is404(p)) continue;
      if (x.titles.length !== 1 || !x.titles[0]) { fails.push(p + ': ' + (x.titles.length > 1 ? x.titles.length + ' <title> tags' : 'no title')); continue; }
      const t = x.titles[0];
      if (t.length < 15 || t.length > 70) warns.push(p + ': title is ' + t.length + ' characters ("' + t + '")');
      const k = t.toLowerCase();
      byTitle.set(k, [...(byTitle.get(k) ?? []), p]);
    }
    for (const [t, ps] of byTitle) if (ps.length > 1) fails.push('Duplicate title "' + t + '" on ' + ps.join(', '));
    result('titles', 'seo', 'One unique title per page', fails, warns);
  }
  {
    const fails = [], warns = [], by = new Map();
    for (const [p, x] of parsed) {
      if (is404(p) || metaNoindex(p)) continue;
      if (x.description.length !== 1 || !x.description[0].trim()) { fails.push(p + ': ' + (x.description.length > 1 ? 'several meta descriptions' : 'no meta description')); continue; }
      const d = x.description[0].trim();
      if (d.length < 50 || d.length > 170) warns.push(p + ': meta description is ' + d.length + ' characters');
      by.set(d.toLowerCase(), [...(by.get(d.toLowerCase()) ?? []), p]);
    }
    for (const [, ps] of by) if (ps.length > 1) fails.push('The same meta description on ' + ps.join(', '));
    result('descriptions', 'seo', 'One unique, useful meta description per indexable page', fails, warns);
  }
  {
    const fails = [], warns = [], byH1 = new Map();
    for (const [p, x] of parsed) {
      if (is404(p)) continue;
      const h1 = x.headings.filter((h) => h.level === 1);
      if (h1.length !== 1 || !h1[0].text) { fails.push(p + ': ' + (h1.length ? h1.length + ' H1s' : 'no H1')); continue; }
      byH1.set(h1[0].text.toLowerCase(), [...(byH1.get(h1[0].text.toLowerCase()) ?? []), p]);
      let prev = 0;
      for (const h of x.headings) { if (prev && h.level > prev + 1) { warns.push(p + ': heading jumps from H' + prev + ' to H' + h.level + ' ("' + h.text.slice(0, 50) + '")'); break; } prev = h.level; }
      if (x.headings[0] && x.headings[0].level !== 1) warns.push(p + ': the first heading is an H' + x.headings[0].level + ', not the H1');
    }
    for (const [h, ps] of byH1) if (ps.length > 1) fails.push('The same H1 "' + h + '" on ' + ps.join(', ') + ' — two pages competing for one intent');
    result('headings', 'seo', 'Exactly one H1 per page, unique across the site, headings in order', fails, warns);
  }

  /* ── S4 near-duplicate pages (cloned town / service pages) ── */
  {
    const fails = [], warns = [];
    const tokenise = (t) => {
      let s = t.toLowerCase();
      for (const n of [...(expect?.locations ?? []).map((l) => l.name), ...(expect?.services ?? []).map((x) => x.name)].filter(Boolean).sort((a, b) => b.length - a.length))
        s = s.replace(new RegExp('(^|[^a-z0-9])' + escapeRe(n.toLowerCase()) + '(?=[^a-z0-9]|$)', 'g'), '$1 ⟨name⟩ ');
      const w = words(s);
      const sh = new Set();
      for (let k = 0; k + 5 <= w.length; k++) sh.add(w.slice(k, k + 5).join(' '));
      return { sh, n: w.length };
    };
    const cands = indexable.map((p) => ({ p, ...tokenise(parsed.get(p).mainText) })).filter((c) => c.n >= 60);
    for (let a = 0; a < cands.length; a++) for (let b = a + 1; b < cands.length; b++) {
      const A = cands[a], B = cands[b];
      let inter = 0; for (const s of A.sh) if (B.sh.has(s)) inter++;
      const j = inter / (A.sh.size + B.sh.size - inter || 1);
      if (j >= 0.6) fails.push(A.p + ' and ' + B.p + ' share ' + Math.round(j * 100) + '% of their content — a cloned page (rewrite one or merge them)');
      else if (j >= 0.4) warns.push(A.p + ' and ' + B.p + ' share ' + Math.round(j * 100) + '% of their content');
    }
    for (const p of indexable) { const n = words(parsed.get(p).mainText).length; if (n < 120 && norm(p) !== '/' && !/privacy|cookie|terms|legal|contact|sitemap/i.test(p)) warns.push(p + ' has ' + n + ' words of its own content — check it is not thin'); }
    result('duplicates', 'seo', 'No cloned or near-duplicate pages', fails, warns);
  }

  /* ── S5 placeholders, hidden-AI tactics ── */
  {
    const fails = [], warns = [];
    for (const [p, x] of parsed) { const m = x.text.match(PLACEHOLDER); if (m) fails.push(p + ': placeholder text "' + m[0] + '"'); }
    if (site.llms) warns.push('llms.txt is published — not a Findable default tactic; keep it only if Paul decided to.');
    result('placeholders', 'content', 'No placeholder copy; no default llms.txt', fails, warns);
  }

  /* ── C1 prices: only approved ones (Paul, 2026-09-30 — a price from the old site is never carried
        over just because it was public; it goes stale and binds the client) ── */
  if (Array.isArray(expect?.prices)) {
    const money = (v) => { const m = String(v).replace(/,/g, '').match(/£\s?(\d+(?:\.\d{1,2})?)/); return m ? String(Number(m[1])) : ''; };
    const approved = new Set(expect.prices.map(money).filter(Boolean));
    const fails = [];
    for (const [p, x] of parsed) {
      if (is404(p)) continue;
      const hay = x.mainText + ' ' + x.titles.join(' ') + ' ' + x.description.join(' ') + ' ' + x.jsonld.join(' ');
      for (const m of hay.replace(/,(?=\d{3}\b)/g, '').matchAll(/£\s?(\d+(?:\.\d{1,2})?)(?!\d)\s*(m\b|million|k\b|bn|billion)?/gi)) {
        if (m[2]) continue; /* £5m public liability cover is insurance, not a price */
        if (!approved.has(String(Number(m[1])))) fails.push(p + ': £' + m[1] + ' is not an approved price');
      }
    }
    result('prices', 'content', 'Every price shown is one Paul approved', fails);
  } else add('prices', 'content', 'Every price shown is one Paul approved', 'skip', ['No prices list in --expect: prices were not checked.']);

  /* ── E1 structured data ── */
  const bizIds = new Set();
  {
    const fails = [], warns = [];
    let homeBiz = null;
    const ratingPages = new Map();
    const nodesOf = (p) => {
      const out = [];
      for (const raw of parsed.get(p).jsonld) {
        let v;
        try { v = JSON.parse(raw); } catch (e) { fails.push(p + ': a JSON-LD block does not parse (' + String(e.message).slice(0, 80) + ')'); continue; }
        const visit = (n) => { if (Array.isArray(n)) { n.forEach(visit); return; } if (!n || typeof n !== 'object') return; out.push(n); if (n['@graph']) visit(n['@graph']); for (const [k, c] of Object.entries(n)) if (k !== '@graph' && c && typeof c === 'object') visit(c); };
        visit(v);
      }
      return out;
    };
    const types = (n) => [].concat(n['@type'] ?? []).map(String);
    const isBiz = (n) => types(n).some((t) => LOCAL_BUSINESS_TYPES.has(t)) && (n.name || n.telephone || n.address);
    for (const p of parsed.keys()) {
      if (is404(p)) continue;
      const nodes = nodesOf(p);
      for (const n of nodes) {
        if (types(n).some((t) => /^(AggregateRating|Review)$/.test(t)) || n.aggregateRating || n.review) { const k = types(n).some((t) => /^(AggregateRating|Review)$/.test(t)) ? types(n).join('/') : (n.aggregateRating ? 'aggregateRating' : 'review') + ' on ' + (types(n).join('/') || 'a node'); ratingPages.set(k, uniq([...(ratingPages.get(k) ?? []), p])); }
        for (const k of ['url', '@id', 'item']) { const u = typeof n[k] === 'string' ? n[k] : typeof n[k]?.['@id'] === 'string' ? n[k]['@id'] : ''; if (/^https?:\/\//.test(u) && !sameHost(hostOf(u)) && !/schema\.org|wikidata|wikipedia|google\.|facebook\.|instagram\.|linkedin\.|x\.com|twitter\.|youtube\./i.test(u) && k !== 'url') warns.push(p + ': schema ' + k + ' on another host: ' + u); }
      }
      const biz = nodes.filter(isBiz);
      for (const b of biz) if (b['@id']) bizIds.add(String(b['@id']));
      if (norm(p) === '/') {
        homeBiz = biz[0] ?? null;
        if (!biz.length) {
          const org = nodes.find((n) => types(n).includes('Organization'));
          fails.push('/ : no LocalBusiness (or trade subtype) entity' + (org ? ' — only an Organization' : ''));
        }
      }
      const crumbs = nodes.filter((n) => types(n).includes('BreadcrumbList'));
      if (norm(p) !== '/' && !metaNoindex(p) && !crumbs.length && !/privacy|cookie|terms|legal/i.test(p)) warns.push(p + ': no BreadcrumbList');
      for (const c of crumbs) {
        const items = [].concat(c.itemListElement ?? []);
        for (const it of items) {
          const u = typeof it.item === 'string' ? it.item : it.item?.['@id'] ?? it.item?.url ?? '';
          if (!u) continue;
          if (!sameHost(hostOf(u))) { fails.push(p + ': breadcrumb item on another host: ' + u); continue; }
          if (!pageFor(new URL(u).pathname)) fails.push(p + ': breadcrumb item ' + u + ' is not a built page');
        }
        const last = items[items.length - 1];
        const lu = last ? (typeof last.item === 'string' ? last.item : last.item?.['@id'] ?? '') : '';
        if (lu && norm(new URL(lu, origin).pathname) !== norm(p)) warns.push(p + ': the last breadcrumb is not this page');
      }
      for (const s of nodes.filter((n) => types(n).includes('Service'))) {
        const prov = s.provider?.['@id'] ?? s.provider ?? '';
        if (!prov) warns.push(p + ': Service "' + (s.name ?? s.serviceType ?? '') + '" has no provider (the business @id)');
      }
    }
    if (homeBiz) {
      if (!homeBiz['@id']) warns.push('The home-page business entity has no stable @id — pages cannot refer to one entity.');
      else if (!String(homeBiz['@id']).startsWith(origin)) fails.push('The business @id is not on ' + origin + ': ' + homeBiz['@id']);
      if (types(homeBiz).length === 1 && types(homeBiz)[0] === 'LocalBusiness') warns.push('The business is typed plain LocalBusiness — use the trade subtype where schema.org has one (e.g. Electrician, Locksmith, Plumber).');
      if (homeBiz.url && !sameHost(hostOf(homeBiz.url))) fails.push('The business url is ' + homeBiz.url + ' — expected ' + origin + '/');
      if (expect?.businessName && homeBiz.name && squashName(homeBiz.name) !== squashName(expect.businessName)) fails.push('Schema name "' + homeBiz.name + '" ≠ the approved business name "' + expect.businessName + '"');
      if (expect?.phone && homeBiz.telephone && digits(homeBiz.telephone) !== digits(expect.phone)) fails.push('Schema telephone ' + homeBiz.telephone + ' ≠ the approved phone ' + expect.phone);
      if (!homeBiz.telephone) warns.push('The business entity has no telephone.');
      if (!homeBiz.areaServed && !homeBiz.address) warns.push('The business entity has neither areaServed nor address — its location is not machine-readable.');
    }
    for (const [k, ps] of ratingPages) fails.push('Review / rating markup (' + k + ') on ' + ps.length + ' page(s): ' + ps.slice(0, 6).join(', ') + (ps.length > 6 ? ' …' : '') + ' — Findable never publishes review or rating schema (show genuine reviews as visible content only)');
    if (bizIds.size > 1) fails.push('Pages describe ' + bizIds.size + ' different business entities: ' + [...bizIds].join(' · ') + ' — one @id for the business everywhere.');
    result('schema', 'entity', 'Valid JSON-LD: one business entity (LocalBusiness subtype, stable @id), breadcrumbs, no review / rating markup', fails, warns);
  }

  /* ── E2 identity and contact consistency (needs the Site Intent Map) ── */
  {
    const fails = [], warns = [];
    if (!expect) add('identity', 'entity', 'Business name, phone and email identical everywhere', 'skip', ['No --expect file: the approved name / phone / email are unknown, so consistency was only checked site-internally.']);
    const phones = new Map(), emails = new Map(), telLinks = new Map();
    for (const [p, x] of parsed) {
      if (is404(p)) continue;
      for (const m of x.text.matchAll(UK_PHONE)) { const d = digits(m[0]); if (d.length === 11) phones.set(d, [...(phones.get(d) ?? []), p]); }
      for (const h of x.anchors) if (/^tel:/i.test(h)) { const d = digits(h.slice(4)); telLinks.set(d, [...(telLinks.get(d) ?? []), p]); }
      for (const m of x.text.matchAll(EMAIL)) emails.set(m[0].toLowerCase(), [...(emails.get(m[0].toLowerCase()) ?? []), p]);
      for (const h of x.anchors) if (/^mailto:/i.test(h)) { const e = h.slice(7).split('?')[0].toLowerCase(); emails.set(e, [...(emails.get(e) ?? []), p]); }
    }
    const allowedPhones = new Set([expect?.phone, expect?.whatsapp, ...(expect?.otherPhones ?? [])].filter(Boolean).map(digits));
    if (expect) {
      const home = parsed.get(pageFor('/') ?? '/');
      if (expect.businessName && home && !squashName(home.text).includes(squashName(expect.businessName))) fails.push('The home page never states the business name "' + expect.businessName + '"');
      if (expect.businessName) for (const p of indexable) if (!squashName(parsed.get(p).text).includes(squashName(expect.businessName))) warns.push(p + ' never states the business name');
      if (expect.phone) {
        const d = digits(expect.phone);
        for (const p of indexable) if (!(telLinks.get(d) ?? []).includes(p) && !(phones.get(d) ?? []).includes(p)) warns.push(p + ' does not show the phone number ' + expect.phone);
        if (!telLinks.has(d)) fails.push('No tel: link to the approved phone ' + expect.phone);
      }
      for (const [d, ps] of telLinks) if (!allowedPhones.has(d)) fails.push('tel: link to ' + d + ' (not the approved phone) on ' + [...new Set(ps)].slice(0, 5).join(', '));
      for (const [d, ps] of phones) if (!allowedPhones.has(d)) warns.push('Another phone number in the text: ' + d + ' on ' + [...new Set(ps)].slice(0, 5).join(', '));
      const okEmail = new Set([expect.email, ...(expect.otherEmails ?? [])].filter(Boolean).map((e) => e.toLowerCase()));
      if (okEmail.size) for (const [e, ps] of emails) if (!okEmail.has(e)) fails.push('Email ' + e + ' (not the approved email) on ' + [...new Set(ps)].slice(0, 5).join(', '));
      result('identity', 'entity', 'Business name, phone and email identical everywhere and equal to the approved values', fails, warns);
    } else {
      const distinctTel = [...telLinks.keys()];
      if (distinctTel.length > 2) warns.push(distinctTel.length + ' different tel: numbers across the site: ' + distinctTel.join(', '));
      if (warns.length) checks[checks.length - 1].details.push(...warns);
    }
  }

  /* ── I1 intent ownership (the Site Intent Map) ── */
  {
    if (!expect?.intents?.length) add('intents', 'intent', 'Every approved intent has one crawlable, linked owning page that states it', 'skip', ['No intents in --expect: page ownership could not be checked.']);
    else {
      const fails = [], warns = [];
      const has = (hay, term) => { const t = squashName(term).replace(/s$/, ''); return !!t && squashName(hay).includes(t); };
      const owners = new Map();
      for (const it of expect.intents) {
        const label = it.intent || [it.service, it.town].filter(Boolean).join(' in ');
        const page = it.page ? pageFor(it.page) : null;
        if (!it.page) { fails.push('"' + label + '": no owning page assigned'); continue; }
        if (!page) { fails.push('"' + label + '": its page ' + it.page + ' is not in the build'); continue; }
        owners.set(norm(page), [...(owners.get(norm(page)) ?? []), label]);
        const x = parsed.get(page);
        const head = [x.titles[0] ?? '', ...x.headings.filter((h) => h.level === 1).map((h) => h.text)].join(' ');
        if (metaNoindex(page)) fails.push('"' + label + '": ' + page + ' is noindexed');
        if (norm(page) !== '/' && !inbound.get(norm(page))?.size) fails.push('"' + label + '": ' + page + ' is an orphan');
        if (it.service && !has(head, it.service) && !has(x.firstParas.join(' '), it.service)) fails.push('"' + label + '": ' + page + ' does not state the service "' + it.service + '" in its title, H1 or opening paragraphs');
        if (it.town && !has(head + ' ' + x.firstParas.join(' '), it.town)) fails.push('"' + label + '": ' + page + ' does not state the place "' + it.town + '" in its title, H1 or opening paragraphs');
        if (!x.firstParas.some((t) => words(t).length >= 15)) warns.push('"' + label + '": ' + page + ' has no direct-answer paragraph near the top');
        if (!x.jsonld.length) warns.push('"' + label + '": ' + page + ' carries no structured data');
        for (const [q, y] of parsed) {
          if (q === page || is404(q)) continue;
          const h1 = y.headings.find((h) => h.level === 1)?.text ?? '';
          if (it.service && has(h1, it.service) && (!it.town || has(h1, it.town)) && !(expect.intents.some((o) => o !== it && o.page && norm(o.page) === norm(q))))
            warns.push('"' + label + '": ' + q + ' also leads with it in its H1 — possible competition with ' + page);
        }
      }
      for (const it of expect.intents.filter((x) => x.question)) {
        const q = squashName(it.question);
        for (const [p, x] of parsed) {
          if (x.titles.some((t) => squashName(t) === q) || x.headings.some((h) => h.level === 1 && squashName(h.text) === q)) fails.push(p + ': a baseline question is copied verbatim as the title / H1 ("' + it.question + '") — answer it, never parrot it');
          else if (x.headings.some((h) => squashName(h.text) === q)) warns.push(p + ': a baseline question is copied verbatim as a heading ("' + it.question + '")');
        }
      }
      result('intents', 'intent', 'Every approved intent has one crawlable, linked owning page that states it', fails, warns);
    }
  }

  /* ── M1 mobile and page weight ── */
  {
    const fails = [], warns = [];
    for (const [p, x] of parsed) {
      if (!x.viewport.some((v) => /width\s*=\s*device-width/i.test(v))) fails.push(p + ': no responsive viewport meta');
      if (!x.lang) warns.push(p + ': <html> has no lang');
      if (x.bytes > 350_000) warns.push(p + ': ' + Math.round(x.bytes / 1000) + ' KB of HTML');
      for (const s of x.blockingScripts) warns.push(p + ': render-blocking script in <head> ' + s.slice(0, 80));
      const noAlt = x.imgs.filter((i) => !('alt' in i)).length, noDim = x.imgs.filter((i) => !i.width || !i.height).length;
      if (noAlt) warns.push(p + ': ' + noAlt + ' image(s) with no alt attribute');
      if (noDim) warns.push(p + ': ' + noDim + ' image(s) without width / height (layout shift)');
      if ([...p.matchAll(/[A-Z]/g)].length || /[ _]/.test(p)) warns.push(p + ': the URL has capitals, spaces or underscores');
    }
    if (site.sizes) {
      const used = new Set();
      for (const [, html] of site.pages) for (const m of html.matchAll(/(?:src|srcset|href|content)\s*=\s*["']([^"']+)["']/gi)) for (const part of m[1].split(',')) { const u = part.trim().split(/\s+/)[0]; if (u.startsWith('/')) used.add(u.split(/[?#]/)[0]); }
      for (const [f, n] of site.sizes) if (/\.(jpe?g|png|webp|avif|gif)$/i.test(f) && n > 400_000 && used.has(f)) warns.push(f + ' is ' + Math.round(n / 1000) + ' KB and is used by a page — compress it');
    }
    if (!site.pages.has('/404.html') && !site.pages.has('/404/') && site.mode === 'dist') warns.push('No 404.html page');
    result('mobile', 'technical', 'Responsive viewport on every page; no heavy pages, blocking scripts or unsized images', fails, [...new Set(warns)]);
  }

  /* ── L1 production transport (live only) ── */
  if (site.live && !opts.preview) {
    const fails = [...(site.live.transport ?? [])];
    result('transport', 'technical', 'https, and http / www / apex reach the canonical address in one hop', fails);
  }

  human.push(
    'Is every claim on the site true TODAY (services still offered, hours, credentials current)? The gate checks consistency, not truth.',
    'Does each page answer its customer question plainly first, with evidence after — or is it filler? (The gate only checks a direct-answer paragraph EXISTS.)',
    'Are location pages genuinely local (real work, access, travel, landmarks) — not just the town name changed? The duplicate check catches clones, not blandness.',
    'Is the LocalBusiness subtype the right one for this trade, and does the schema describe only what the page shows?',
    'Is the design an upgrade on the old site at 1440 and a phone width (the old-vs-new review)?',
    'Is the home page hero, the map crop and every photo good enough at the size it is shown?',
    'Cloudflare: is Bot Fight Mode / a WAF rule challenging search crawlers on the production zone? (--url checks the user agents; it cannot see a rule that only fires on some IPs.)',
  );
  return finish();

  function finish() {
    const count = (l) => checks.filter((c) => c.level === l).length;
    return { siteGateVersion: SITE_GATE_VERSION, domain, mode: site?.mode ?? '', preview: !!opts.preview, pages: site?.pages?.size ?? 0,
      passed: count('fail') === 0 && checks.length > 0, counts: { pass: count('pass'), warn: count('warn'), fail: count('fail'), skip: count('skip') },
      checks, humanReview: human };
  }
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c);
const squashName = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');

/* ── live crawl (--url) ──────────────────────────────────────────────────────────────────────── */

export async function crawlSite(startUrl, { max = 300, preview = false, domain = '' } = {}) {
  const start = new URL(startUrl);
  const base = start.origin;
  const pages = new Map(), files = new Set(), sitemaps = new Map();
  const UA = 'Mozilla/5.0 (compatible; FindableSiteGate/1; +https://findable.live)';
  const get = async (u, ua = UA, redirect = 'follow') => { try { const r = await fetch(u, { headers: { 'user-agent': ua }, redirect }); return { status: r.status, headers: r.headers, url: r.url, text: redirect === 'manual' ? '' : await r.text() }; } catch (e) { return { status: 0, headers: new Headers(), url: u, text: '', error: String(e.message || e) }; } };
  const robots = await get(base + '/robots.txt');
  const robotsTxt = robots.status === 200 ? robots.text : null;
  const smUrls = robotsTxt ? [...robotsTxt.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]) : [];
  const sitemapQueue = [...smUrls.map((u) => { try { const x = new URL(u); return base + x.pathname; } catch { return ''; } }).filter(Boolean), base + '/sitemap-index.xml', base + '/sitemap.xml'];
  const seenSm = new Set();
  const queue = ['/'];
  while (sitemapQueue.length && seenSm.size < 20) {
    const u = sitemapQueue.shift(); if (seenSm.has(u)) continue; seenSm.add(u);
    const r = await get(u); if (r.status !== 200 || !/<(urlset|sitemapindex)\b/i.test(r.text)) continue;
    sitemaps.set(new URL(u).pathname, r.text);
    for (const loc of sitemapLocs(r.text)) { try { const x = new URL(loc); if (/<sitemapindex\b/i.test(r.text)) sitemapQueue.push(base + x.pathname); else queue.push(x.pathname); } catch { /* bad loc is reported by the audit */ } }
  }
  let homeRobotsHeader = '';
  const seen = new Set();
  while (queue.length && pages.size < max) {
    const p = queue.shift(); const key = norm(p); if (seen.has(key)) continue; seen.add(key);
    const r = await get(base + p);
    if (r.status !== 200 || !/text\/html/i.test(r.headers.get('content-type') ?? '')) continue;
    const finalPath = new URL(r.url).pathname;
    if (norm(finalPath) === '/') homeRobotsHeader = r.headers.get('x-robots-tag') ?? '';
    pages.set(finalPath, r.text);
    for (const h of parsePage(r.text).anchors) { try { const u = new URL(h, base + finalPath); if (u.origin === base && !/\.(pdf|jpe?g|png|webp|svg|xml|txt|ico)$/i.test(u.pathname)) queue.push(u.pathname); else if (u.origin === base) files.add(u.pathname); } catch { /* reported by the audit */ } }
  }
  const botFetch = [];
  for (const agent of ['OAI-SearchBot/1.0; +https://openai.com/searchbot', 'ChatGPT-User/1.0; +https://openai.com/bot', 'Claude-User/1.0', 'PerplexityBot/1.0', 'Googlebot/2.1; +http://www.google.com/bot.html']) {
    const r = await get(base + '/', 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ' + agent + ')');
    const challenged = /just a moment|cf-chl|challenge-platform|attention required/i.test(r.text);
    botFetch.push({ agent: agent.split('/')[0], ok: r.status === 200 && !challenged && /<h1\b/i.test(r.text), detail: r.error || 'HTTP ' + r.status + (challenged ? ' (a challenge page)' : '') });
  }
  const transport = [];
  if (!preview && domain) {
    const apex = domain.replace(/^www\./, ''), www = 'www.' + apex;
    for (const from of ['http://' + domain + '/', 'http://' + (domain === apex ? www : apex) + '/', 'https://' + (domain === apex ? www : apex) + '/']) {
      const r = await get(from, UA, 'manual');
      const loc = r.headers.get('location') ?? '';
      if (r.status === 0) { transport.push(from + ' does not answer (' + (r.error || 'no response') + ')'); continue; }
      if (![301, 308].includes(r.status)) transport.push(from + ' answers ' + r.status + ' — expected a 301 / 308 to https://' + domain + '/');
      else if (!loc.startsWith('https://' + domain + '/')) transport.push(from + ' redirects to ' + loc + ' — expected https://' + domain + '/ in one hop');
    }
  }
  return { mode: 'url', pages, files, sizes: null, sitemaps, robots: robotsTxt, headers: null, redirects: null, llms: (await get(base + '/llms.txt')).status === 200, pagesComplete: queue.length === 0, live: { homeRobotsHeader, botFetch, transport } };
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────────── */

function printReport(r) {
  const icon = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' };
  const out = ['', 'FINDABLE SITE QUALITY GATE — ' + r.domain + ' (' + r.mode + (r.preview ? ', preview' : '') + ', ' + r.pages + ' pages)', ''];
  for (const c of r.checks) {
    out.push(icon[c.level] + '  ' + c.label);
    for (const d of c.details) out.push('        - ' + d);
    if (c.more) out.push('        … and ' + c.more + ' more');
  }
  out.push('', 'NEEDS A HUMAN (not automated — never reported as passed):', ...r.humanReview.map((h) => '  - ' + h));
  out.push('', r.passed ? 'RESULT: PASSED (' + r.counts.warn + ' warning(s) to read)' : 'RESULT: FAILED — ' + r.counts.fail + ' check(s) failed. Fix the site; never weaken the gate.', '');
  console.log(out.join('\n'));
}

async function main(argv) {
  const arg = (k) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : undefined; };
  const flag = (k) => argv.includes('--' + k);
  const domain = arg('domain');
  const expectPath = arg('expect');
  const expect = expectPath ? JSON.parse(readFileSync(expectPath, 'utf8')) : null;
  const opts = { domain: domain || expect?.domain, expect, preview: flag('preview'), forbidHosts: (arg('forbid-host') ?? '').split(',').concat(expect?.forbidHosts ?? []).filter(Boolean) };
  let site;
  if (arg('url')) site = await crawlSite(arg('url'), { preview: opts.preview, domain: String(opts.domain || '') });
  else site = loadDist(arg('dist') ?? 'dist');
  const report = auditSite(site, opts);
  if (arg('json')) writeFileSync(arg('json'), JSON.stringify(report, null, 2));
  if (!flag('quiet')) printReport(report);
  return report.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error('The gate could not run: ' + (e?.message || e)); process.exit(2); });
}

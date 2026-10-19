/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AI-VISIBILITY PAGE CHECKS (2026-10-19, feat/crawl-in-audit-callscreen; docs/website-check.md).

   Paul's list (17 Oct, checked by hand on a real prospect's site): the things a person can SEE on the pages
   that make a local business harder for search engines and AI tools to read as one clear business —
     · business markup that is only a generic Organization, or that carries no phone number / address
     · FAQs on a page with no FAQPage markup
     · an address that exists on the site but is not on the homepage or the key service / area pages
     · the business name written differently across the markup, the page titles and the footer
     · location / service pages that are the same text with only the town swapped
     · FAQ pages that repeat the FAQs already on other pages
     · an indexable copy of the homepage at another address
     · key pages with no main heading (H1) or no meta description
     · link markup showing as text on a page ("a href=…")
   (Crawler / robots / noindex blocks, JavaScript-only content and thin pages are the site audit's own checks.)

   ⛔ EVIDENCE ONLY. Each finding carries the pages it was read on and the words / values read, quoted.
      Nothing is inferred from a page that was not read; nothing is guessed about how an AI decides.
   ⛔ SCHEMA IS LOW (CLAUDE.md §5: schema markup was tested NEGATIVE as a lever). The two markup checks are
      listed as minor points, never a headline and never read out on a call.
   ⛔ PURE, NO I/O. IMPORTED BY EDGE FUNCTIONS: relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { AuditFinding } from './siteAudit.ts';
import type { PageBusiness, PageDigest } from './fullCrawl.ts';

export const VISIBILITY_CHECKS_VERSION = 1;
/** Two pages whose own text (shared header / footer removed, town names removed) is at least this alike are "the same". */
export const TOWN_SWAP_SIMILARITY = 0.8;
/** A page this alike to the homepage is a copy of it. */
export const HOME_COPY_SIMILARITY = 0.85;
/** An FAQ page with at least this share of its questions already on another page repeats them. */
export const FAQ_REPEAT_SHARE = 0.6;
/** Pages compared for copies (the shallowest first). Keeps the work bounded on a big site. */
export const VISIBILITY_MAX_PAGES = 400;
/** Stored page text is cut near here (fullCrawl TEXT_CHARS); text this long may be missing its end. */
export const VISIBILITY_TEXT_CUT = 4_900;

export interface VisibilityPage {
  url: string;
  d: PageDigest;
  b?: Partial<PageBusiness> | null;
  /** Readable text (fullCrawl.processPage's `t`). Absent = the copy checks skip this page. */
  t?: string | null;
  /** Homepage only. */
  footer?: string | null;
  nav?: Array<{ label: string; url: string }> | null;
}

export interface VisibilityInput {
  servedUrl: string;
  pages: VisibilityPage[];
  /** The crawl stopped at its page limit: "not found" findings say "in the pages read". */
  partial: boolean;
}

export interface VisibilityChecks {
  version: number;
  findings: AuditFinding[];
  /** Checks that could not be made on this evidence. */
  notChecked: string[];
}

/* ── helpers ──────────────────────────────────────────────────────────────────────────────────── */

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
export const pathOfUrl = (u: string): string => { try { const x = new URL(u); return (x.pathname.replace(/\/+$/, '') || '/') + x.search; } catch { return u; } };
const where = (u: string, home: string | null) => (home && pathOfUrl(u) === pathOfUrl(home) ? 'homepage' : pathOfUrl(u));

function finding(f: Omit<AuditFinding, 'urlsComplete' | 'count' | 'urls'> & { urls: string[]; count?: number }): AuditFinding {
  const urls = [...new Set(f.urls)];
  return { ...f, urls, count: f.count ?? urls.length, urlsComplete: true };
}

/** Business-type markup that names no kind of business. Anything more specific (LocalBusiness or one of its kinds,
 *  a ProfessionalService, a DrivingSchool …) is "specific". */
const GENERIC_ORG = new Set(['organization', 'corporation', 'onlinebusiness', 'ngo']);
const NOT_A_BUSINESS = new Set(['website', 'webpage', 'webpageelement', 'breadcrumblist', 'listitem', 'person', 'imageobject', 'searchaction',
  'faqpage', 'question', 'answer', 'article', 'blogposting', 'newsarticle', 'itemlist', 'sitenavigationelement', 'wpheader', 'wpfooter',
  'collectionpage', 'contactpage', 'aboutpage', 'readaction', 'entrypoint', 'postaladdress', 'geocoordinates', 'offer', 'aggregaterating',
  'review', 'openinghoursspecification', 'contactpoint', 'place', 'service', 'product', 'howto', 'event', 'videoobject']);

/** The words that make a name a different name (case, spacing, punctuation and company suffixes do not). */
export function nameKey(s: string): string {
  return String(s ?? '').toLowerCase().replace(/&/g, ' and ')
    .replace(/\b(?:ltd|limited|llp|plc|the|co|uk|and)\b/g, ' ').replace(/[^a-z0-9]+/g, '');
}

/** The part of the page titles that is the same on most pages ("… | Learning Curve Driving Lessons"). */
export function titleBrand(titles: string[]): { brand: string; pages: number } | null {
  const counts = new Map<string, { label: string; n: number }>();
  for (const t of titles) {
    const parts = [...new Set(t.split(/\s+[|–—-]\s+|\s*\|\s*/).map((p) => p.trim()).filter((p) => p.length >= 3 && p.length <= 70))];
    for (const p of parts) {
      const k = nameKey(p);
      if (!k) continue;
      const c = counts.get(k) ?? { label: p, n: 0 };
      c.n++;
      counts.set(k, c);
    }
  }
  const usable = titles.filter(Boolean).length;
  const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  if (!best || usable < 3 || best.n < Math.max(3, Math.ceil(usable * 0.4))) return null;
  return { brand: best.label, pages: best.n };
}

/** "© 2025 Name. All rights reserved" → "Name". */
export function footerName(footer: string | null | undefined): string | null {
  const m = /(?:©|&copy;|\(c\)|copyright)\s*(?:copyright\s*)?(?:\d{4}\s*(?:[-–]\s*\d{4})?\s*)?([^|.©\n]{3,60}?)(?=\s*(?:[|.]|all rights|\d{4}|registered|company|website|designed|powered|privacy|terms|$))/i.exec(String(footer ?? ''));
  const n = m?.[1]?.replace(/^[\s,:-]+|[\s,:-]+$/g, '').trim() ?? '';
  return n.length >= 3 && /[a-z]/i.test(n) ? n : null;
}

/** Sentences that appear on most pages (menus, footers, cookie banners) — removed before pages are compared. */
function boilerplate(texts: string[]): Set<string> {
  const seen = new Map<string, number>();
  for (const t of texts) for (const s of new Set(sentencesOf(t))) seen.set(s, (seen.get(s) ?? 0) + 1);
  const min = Math.max(2, Math.ceil(texts.length * 0.5));
  return new Set([...seen].filter(([, n]) => n >= min).map(([s]) => s));
}
function sentencesOf(t: string): string[] {
  return String(t ?? '').split(/(?<=[.!?])\s+|\s{2,}|\s+[|•·]\s+/).map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 12);
}
function ownText(t: string, shared: Set<string>): string {
  return sentencesOf(t).filter((s) => !shared.has(s)).join(' ');
}
/** URL words that name the page (town, service): removed so two pages that differ only by them compare as one. */
function slugWords(u: string): string[] {
  return pathOfUrl(u).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !/^\d+$/.test(w));
}
/** The words in one page address and not the other ("westgate", "on", "sea" vs "thanet"): the place / service that
 *  names each page. Removed from both before comparing, so two pages that differ only by them read as one. */
export function differingSlugWords(a: string, b: string): string[] {
  const A = new Set(slugWords(a)), B = new Set(slugWords(b));
  return [...new Set([...A, ...B])].filter((w) => !(A.has(w) && B.has(w)));
}
function shingles(s: string): Set<string> {
  const w = s.split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= w.length; i++) out.add(w[i] + ' ' + w[i + 1] + ' ' + w[i + 2]);
  return out;
}
function normFor(t: string, strip: string[]): string {
  let x = ' ' + t.toLowerCase().replace(/[^a-z0-9\s]/g, ' ') + ' ';
  for (const w of strip) x = x.split(` ${w} `).join(' ').split(` ${w}s `).join(' ');
  return x.replace(/\d+/g, ' ').replace(/\s+/g, ' ').trim();
}
export function textSimilarity(a: string, b: string, strip: string[] = []): number {
  const A = shingles(normFor(a, strip)), B = shingles(normFor(b, strip));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const s of A) if (B.has(s)) inter++;
  return inter / (A.size + B.size - inter);
}

/** The questions a page asks and answers: question headings, then question sentences in the text. */
export function questionsOf(p: VisibilityPage): string[] {
  const heads = [...(p.d.h2 ?? []), ...(p.d.h3 ?? [])].filter((h) => /\?\s*$/.test(h));
  const inText = (String(p.t ?? '').match(/(?:^|[.!?]\s+)((?:how|what|why|when|where|who|which|do|does|can|is|are|will|should|would)\b[^?.!]{8,140}\?)/gi) ?? [])
    .map((q) => q.replace(/^[.!?\s]+/, ''));
  return [...new Set([...heads, ...inText].map((q) => q.trim().replace(/\s+/g, ' ')).filter((q) => q.length >= 10))];
}
const qKey = (q: string, strip: string[]) => normFor(q, strip);

/* ── the checks ───────────────────────────────────────────────────────────────────────────────── */

export function buildVisibilityChecks(input: VisibilityInput): VisibilityChecks {
  const out: AuditFinding[] = [];
  const notChecked: string[] = [];
  const pages = input.pages.filter((p) => p.d && (p.d.status ?? 200) > 0 && (p.d.status ?? 200) < 400).slice(0, VISIBILITY_MAX_PAGES);
  if (!pages.length) return { version: VISIBILITY_CHECKS_VERSION, findings: [], notChecked: ['The page checks — no page could be read.'] };
  const urlOf = (p: VisibilityPage) => p.d.finalUrl || p.url;
  const home = pages.find((p) => p.d.family === 'homepage') ?? null;
  const homeUrl = home ? urlOf(home) : null;
  const scope = input.partial ? ` in the ${plural(pages.length, 'page')} read` : '';
  const at = (p: VisibilityPage) => where(urlOf(p), homeUrl);

  /* KEY PAGES: the homepage, the pages its menu links to, and every service / area / prices page. */
  const navPaths = new Set((home?.nav ?? []).map((n) => pathOfUrl(n.url)));
  const isKey = (p: VisibilityPage) => p.d.family === 'homepage' || ['service', 'location', 'pricing'].includes(p.d.family) || navPaths.has(pathOfUrl(urlOf(p)));
  const key = pages.filter((p) => isKey(p) && p.d.family !== 'legal' && p.d.family !== 'contact');

  /* ── 1. Business markup: generic only, or no phone / address ─────────────────────────────────── */
  const bizBlocks = pages.flatMap((p) => (p.b?.schema ?? []).map((s) => ({ ...s, url: urlOf(p) })))
    .filter((s) => (s.types ?? []).some((t) => !NOT_A_BUSINESS.has(t.toLowerCase())));
  if (bizBlocks.length) {
    const specific = bizBlocks.filter((s) => s.types.some((t) => !GENERIC_ORG.has(t.toLowerCase()) && !NOT_A_BUSINESS.has(t.toLowerCase())));
    const typesSeen = [...new Set(bizBlocks.flatMap((s) => s.types).filter((t) => !NOT_A_BUSINESS.has(t.toLowerCase())))];
    const pool = specific.length ? specific : bizBlocks;
    const anyTel = pool.some((s) => !!s.telephone);
    const anyAddr = pool.some((s) => !!s.address);
    const missing = [!anyTel ? 'phone number' : '', !anyAddr ? 'address' : ''].filter(Boolean);
    const urls = [...new Set(pool.map((s) => s.url))];
    if (!specific.length || missing.length) {
      const title = !specific.length
        ? `Only a generic “${typesSeen[0] ?? 'Organization'}” business markup${missing.length ? `, with no ${missing.join(' or ')}` : ''}`
        : `The business markup has no ${missing.join(' or ')}`;
      out.push(finding({
        id: 'vs_business_schema', category: 'structured_data', severity: 'low', title,
        saw: `Business markup type${typesSeen.length > 1 ? 's' : ''} read: ${typesSeen.join(', ')} (on ${plural(urls.length, 'page')}${urls.length ? `, e.g. ${where(urls[0], homeUrl)}` : ''})${missing.length ? `; no ${missing.join(' and no ')} in it` : ''}.`,
        meaning: 'The machine-readable business details say less than the page does. Good housekeeping; on its own not a fix.',
        urls, evidence: pool.slice(0, 3).map((s) => `${where(s.url, homeUrl)}: ${s.types.join('/')}${s.name ? ` “${clip(s.name, 60)}”` : ''}${s.telephone ? ` · tel ${s.telephone}` : ' · no telephone'}${s.address ? ` · ${clip(s.address, 60)}` : ' · no address'}`),
      }));
    }
  }

  /* ── 2. FAQs with no FAQPage markup ──────────────────────────────────────────────────────────── */
  const faqNoSchema = pages.map((p) => ({ p, qs: questionsOf(p) }))
    .filter(({ p, qs }) => (p.d.family === 'faq' ? qs.length >= 2 : qs.length >= 3) && !(p.d.schemaTypes ?? []).some((t) => /^faqpage$/i.test(t)));
  if (faqNoSchema.length) {
    out.push(finding({
      id: 'vs_faq_no_schema', category: 'structured_data', severity: 'low',
      title: 'FAQs on the site have no FAQ markup',
      saw: `${plural(faqNoSchema.length, 'page')} answer customer questions with no FAQPage markup, e.g. ${at(faqNoSchema[0].p)}: “${clip(faqNoSchema[0].qs.find((q) => /^(?:how|what|why|when|where|who|which|do|does|can|is|are|will)\b/i.test(q)) ?? faqNoSchema[0].qs[0], 90)}”.`,
      meaning: 'The questions are readable on the page; the markup would only restate them in machine-readable form.',
      urls: faqNoSchema.map(({ p }) => urlOf(p)),
      evidence: faqNoSchema.slice(0, 3).map(({ p, qs }) => `${at(p)}: ${plural(qs.length, 'question')}, no FAQPage markup`),
    }));
  }

  /* ── 3. The address: on the site, but not on the homepage / key pages ────────────────────────── */
  const postcodeOf = (s: string) => /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i.exec(s);
  const known = pages.flatMap((p) => [...(p.b?.addresses ?? []), ...(p.b?.schema ?? []).map((s) => s.address).filter(Boolean)].map((a) => ({ a: String(a), url: urlOf(p) })))
    .map((x) => ({ ...x, pc: postcodeOf(x.a) }))
    .filter((x) => !!x.pc);
  if (known.length) {
    const pc = known[0].pc!;
    const pcRe = new RegExp(`\\b${pc[1]}\\s*${pc[2]}\\b`, 'i');
    const shows = (p: VisibilityPage) => (p.d.postcodes ?? []).some((x) => pcRe.test(x)) || pcRe.test(String(p.t ?? '')) || pcRe.test(String(p.footer ?? ''))
      || (p.b?.addresses ?? []).some((a) => pcRe.test(a)) || (p.b?.schema ?? []).some((s) => pcRe.test(s.address ?? ''));
    /* ⛔ JUDGED ONLY ON THE WHOLE PAGE: the postcodes read from the full text (d.postcodes). A page stored before that
       existed is judged only when its kept text was not cut short: a footer address past the cut is not "missing". */
    const judged = key.filter((p) => Array.isArray(p.d.postcodes) || (typeof p.t === 'string' && p.t.length > 0 && p.t.length < VISIBILITY_TEXT_CUT));
    const without = judged.filter((p) => !shows(p));
    /* The address as read: the words just before the postcode, never the menu text the sentence ran into. */
    const at0 = known[0].a.search(pcRe);
    const addr = known[0].a.slice(Math.max(0, at0 - 60), at0 + known[0].pc![0].length).replace(/^S*s/, '').trim();
    const homeMissing = !!home && without.includes(home);
    if (homeMissing || (without.length >= 2 && without.length * 2 >= judged.length)) {
      out.push(finding({
        id: 'vs_address_not_on_key_pages', category: 'entity', severity: 'medium',
        title: homeMissing ? 'The business address is not on the homepage' : 'The business address is missing from key pages',
        saw: `The address (${clip(addr, 80)}) is shown on ${where(known[0].url, homeUrl)}, but not on ${without.slice(0, 3).map(at).join(', ')}${without.length > 3 ? ` and ${plural(without.length - 3, 'other key page')}` : ''}.`,
        meaning: 'The same name, address and phone on the main pages is one of the ways a website is matched to the business’s listings.',
        urls: without.map(urlOf), evidence: [`address read on ${where(known[0].url, homeUrl)}: “${clip(addr, 100)}”`],
      }));
    }
  }

  /* ── 4. The business name written differently ───────────────────────────────────────────────── */
  const variants: Array<{ name: string; source: string; url: string }> = [];
  const brand = titleBrand(pages.map((p) => p.d.title ?? ''));
  if (brand) variants.push({ name: brand.brand, source: `page titles (${plural(brand.pages, 'page')})`, url: homeUrl ?? urlOf(pages[0]) });
  for (const p of pages) for (const s of p.b?.schema ?? []) if (s.name && !NOT_A_BUSINESS.has((s.types[0] ?? '').toLowerCase())) variants.push({ name: s.name, source: `business markup on ${at(p)}`, url: urlOf(p) });
  if (home?.b?.siteName) variants.push({ name: home.b.siteName, source: 'site name (og:site_name)', url: urlOf(home) });
  const fName = footerName(home?.footer ?? null);
  if (fName) variants.push({ name: fName, source: 'homepage footer', url: urlOf(home!) });
  const distinct: typeof variants = [];
  for (const v of variants) {
    const k = nameKey(v.name);
    if (k.length < 4) continue;
    const same = distinct.findIndex((d) => { const dk = nameKey(d.name); return dk === k || dk.includes(k) || k.includes(dk); });
    /* One name said two ways ("Learning Curve" / "Learning Curve Driving Lessons") is one name: the fuller one is quoted. */
    if (same >= 0) { if (k.length > nameKey(distinct[same].name).length) distinct[same] = { ...v, source: `${v.source}; also ${distinct[same].source}` }; continue; }
    distinct.push(v);
  }
  if (distinct.length >= 2) {
    out.push(finding({
      id: 'vs_name_inconsistent', category: 'entity', severity: 'medium',
      title: `The business name is written ${distinct.length === 2 ? 'two' : distinct.length === 3 ? 'three' : String(distinct.length)} different ways`,
      saw: distinct.map((d) => `“${clip(d.name, 60)}” (${d.source})`).join('; ') + '.',
      meaning: 'When the site names the business in different ways, it is less clear which name the business, its listings and its reviews belong to.',
      urls: [...new Set(distinct.map((d) => d.url))], count: 0,
      evidence: distinct.map((d) => `${d.source}: “${clip(d.name, 80)}”`),
    }));
  }

  /* ── 5–7. Copies: town-swapped pages, repeated FAQ pages, a copy of the homepage ─────────────── */
  const withText = pages.filter((p) => typeof p.t === 'string' && p.t.trim().length > 0);
  if (withText.length < 2) notChecked.push('Copied pages — the page text was not kept for this check.');
  else {
    const shared = boilerplate(withText.map((p) => String(p.t)));
    const own = new Map(withText.map((p) => [p, ownText(String(p.t), shared)]));
    const words = (p: VisibilityPage) => (own.get(p) ?? '').split(/\s+/).filter(Boolean).length;

    /* 7. A copy of the homepage that can be listed. */
    if (home && own.has(home) && words(home) >= 60) {
      const copies = withText.filter((p) => p !== home && !p.d.noindex && !(p.d.canonical && pathOfUrl(p.d.canonical) === pathOfUrl(urlOf(home)))
        && pathOfUrl(urlOf(p)) !== pathOfUrl(urlOf(home)))
        .map((p) => ({ p, sim: textSimilarity(String(p.t), String(home.t)), version: false }))
        .filter((x) => x.sim >= HOME_COPY_SIMILARITY);
      /* A SECOND VERSION of the homepage: its address names it a homepage ("/homepage-design/", "/home-2/"), it can be
         listed, and its main heading says what the homepage's says. Not a text copy: a draft or older design left live. */
      const sig = (s: string) => new Set(normFor(s, []).split(' ').filter((w) => w.length >= 3 && w !== 'and'));
      const homeH1 = sig(home.d.h1?.[0] ?? '');
      for (const p of withText) {
        if (p === home || copies.some((c) => c.p === p) || p.d.noindex) continue;
        if (!/(?:^|[^a-z])home(?:page)?(?:[^a-z]|$)/i.test(pathOfUrl(urlOf(p)))) continue;
        if (pathOfUrl(urlOf(p)) === pathOfUrl(urlOf(home))) continue;
        if (p.d.canonical && pathOfUrl(p.d.canonical) === pathOfUrl(urlOf(home))) continue;
        const h = sig(p.d.h1?.[0] ?? '');
        const shared = [...homeH1].filter((w) => h.has(w)).length;
        if (homeH1.size >= 2 && shared / homeH1.size >= 0.75) copies.push({ p, sim: textSimilarity(String(p.t), String(home.t)), version: true });
      }
      if (copies.length) {
        out.push(finding({
          id: 'vs_duplicate_homepage', category: 'discovery', severity: 'medium',
          title: copies.length === 1 ? 'A second copy of the homepage can be listed by search engines' : 'Other copies of the homepage can be listed by search engines',
          saw: copies.slice(0, 3).map((c) => (c.version
            ? `${at(c.p)} is a second version of the homepage (its address says homepage; its main heading is “${clip(c.p.d.h1?.[0] ?? '', 70)}”, the homepage’s is “${clip(home.d.h1?.[0] ?? '', 70)}”)`
            : `${at(c.p)} is ${Math.round(c.sim * 100)}% the same text as the homepage`)).join('; ') + ', with no noindex and no canonical link to the homepage.',
          meaning: 'Two addresses with the same page compete with each other, and it is less clear which one is the business’s real homepage.',
          urls: copies.map((c) => urlOf(c.p)),
          evidence: copies.slice(0, 3).map((c) => `${at(c.p)}: title “${clip(c.p.d.title ?? '', 70)}”${c.p.d.canonical ? `, canonical ${pathOfUrl(c.p.d.canonical)}` : ', no canonical'}`),
        }));
      }
    }

    /* 5. Location / service pages that are the same text with only the town swapped. */
    const candidates = withText.filter((p) => ['location', 'service', 'other'].includes(p.d.family) && words(p) >= 60);
    const groups: VisibilityPage[][] = [];
    const used = new Set<VisibilityPage>();
    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i];
      if (used.has(a)) continue;
      const g = [a];
      for (let j = i + 1; j < candidates.length; j++) {
        const b = candidates[j];
        if (used.has(b)) continue;
        const strip = differingSlugWords(urlOf(a), urlOf(b));
        if (!strip.length) continue;   // the same slug words: not a town swap
        if (textSimilarity(own.get(a)!, own.get(b)!, strip) >= TOWN_SWAP_SIMILARITY) g.push(b);
      }
      if (g.length >= 2) { g.forEach((p) => used.add(p)); groups.push(g); }
    }
    const swapped = groups.sort((x, y) => y.length - x.length)[0];
    if (swapped) {
      const [a, b] = swapped;
      const strip = differingSlugWords(urlOf(a), urlOf(b));
      out.push(finding({
        id: 'vs_town_swapped_pages', category: 'content', severity: 'medium',
        title: 'Area or service pages are the same text with only the town or service name changed',
        saw: `${plural(swapped.length, 'page')} read the same once the town or service name in their address is taken out — e.g. ${at(a)} and ${at(b)} are ${Math.round(textSimilarity(own.get(a)!, own.get(b)!, strip) * 100)}% the same.`,
        meaning: 'Pages that differ only by a town name add little that is specific to each place and may be treated as copies.',
        urls: swapped.map(urlOf), evidence: swapped.slice(0, 4).map((p) => `${at(p)}: “${clip(p.d.h1?.[0] ?? p.d.title ?? '', 70)}”`),
      }));
    }

    /* 6. FAQ pages that repeat the questions already on other pages (or each other). */
    const qPages = withText.map((p) => ({ p, qs: questionsOf(p) })).filter((x) => x.qs.length >= 3);
    const repeats: Array<{ p: VisibilityPage; share: number; other: VisibilityPage; sample: string }> = [];
    for (const x of qPages) {
      if (x.p.d.family !== 'faq' && !/faq|question/i.test(pathOfUrl(urlOf(x.p)))) continue;
      let best: { share: number; other: VisibilityPage; sample: string } | null = null;
      for (const y of qPages) {
        if (y.p === x.p) continue;
        const strip = differingSlugWords(urlOf(x.p), urlOf(y.p));
        const ys = new Set(y.qs.map((q) => qKey(q, strip)));
        const hit = x.qs.filter((q) => ys.has(qKey(q, strip)));
        const share = hit.length / x.qs.length;
        if (share >= FAQ_REPEAT_SHARE && (!best || share > best.share)) best = { share, other: y.p, sample: hit[0] };
      }
      if (best) repeats.push({ p: x.p, ...best });
    }
    if (repeats.length) {
      out.push(finding({
        id: 'vs_duplicate_faq_pages', category: 'content', severity: 'medium',
        title: repeats.length === 1 ? 'An FAQ page repeats questions already on another page' : `${plural(repeats.length, 'FAQ page')} repeat questions already on other pages`,
        saw: repeats.slice(0, 3).map((r) => `${at(r.p)} repeats ${Math.round(r.share * 100)}% of its questions from ${at(r.other)} (e.g. “${clip(r.sample, 70)}”)`).join('; ') + '.',
        meaning: 'The same questions and answers on several pages compete with each other rather than giving each page something of its own.',
        urls: repeats.map((r) => urlOf(r.p)),
        evidence: repeats.slice(0, 4).map((r) => `${at(r.p)} ↔ ${at(r.other)}: ${Math.round(r.share * 100)}% of questions the same`),
      }));
    }
  }

  /* ── 8. Key pages with no main heading or no meta description ─────────────────────────────────── */
  const gaps = key.map((p) => ({ p, noH1: !(p.d.h1 ?? []).some((h) => h.trim()), noDesc: !String(p.d.description ?? '').trim() }))
    .filter((x) => x.noH1 || x.noDesc);
  if (gaps.length) {
    const what = [gaps.some((g) => g.noH1) ? 'main heading (H1)' : '', gaps.some((g) => g.noDesc) ? 'meta description' : ''].filter(Boolean).join(' or ');
    out.push(finding({
      id: 'vs_key_page_basics', category: 'technical', severity: 'medium',
      title: `Key pages have no ${what}`,
      saw: gaps.slice(0, 4).map((g) => `${at(g.p)}: ${[g.noH1 ? 'no H1' : '', g.noDesc ? 'no meta description' : ''].filter(Boolean).join(', ')}`).join('; ') + (gaps.length > 4 ? ` and ${plural(gaps.length - 4, 'more key page')}` : '') + '.',
      meaning: 'The main heading and the description are the plainest statement of what a page is about.',
      urls: gaps.map((g) => urlOf(g.p)),
    }));
  }

  /* ── 9. Link markup showing as text ───────────────────────────────────────────────────────────── */
  const raw = pages.flatMap((p) => {
    const t = String(p.t ?? '');
    const m = /\ba\s+href\s*=\s*["“”']?[^\s"“”']{0,120}/i.exec(t);
    return m ? [{ p, quote: clip(t.slice(Math.max(0, m.index - 40), m.index + 110).replace(/\s+/g, ' ').trim(), 150) }] : [];
  });
  if (raw.length) {
    out.push(finding({
      id: 'vs_raw_link_markup', category: 'technical', severity: 'medium',
      title: raw.length === 1 ? 'A broken link shows its code as text on the page' : 'Broken links show their code as text on pages',
      saw: `Link code is visible as text on ${plural(raw.length, 'page')}, e.g. ${at(raw[0].p)}: “${raw[0].quote}”.`,
      meaning: 'A link written wrongly goes nowhere, and visitors and crawlers see the code instead of the page it was meant to reach.',
      urls: raw.map((r) => urlOf(r.p)), evidence: raw.slice(0, 3).map((r) => `${at(r.p)}: “${r.quote}”`),
    }));
  }

  if (!key.length) notChecked.push(`Key pages — none recognised${scope}.`);
  return { version: VISIBILITY_CHECKS_VERSION, findings: out, notChecked };
}

/** A stored result's checks, when they are ones this code reads. */
export function usableVisibilityChecks(v: unknown): VisibilityChecks | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as VisibilityChecks;
  return c.version === VISIBILITY_CHECKS_VERSION && Array.isArray(c.findings) ? c : null;
}

/** When one of these fires, the older, vaguer audit finding of the same thing is dropped (said once). */
export const VISIBILITY_SUPERSEDES: Record<string, string[]> = {
  vs_town_swapped_pages: ['near_duplicate_pages'],
  /* Not superseded in the audit (it keeps the all-pages count); the one website check says it once instead. */
  vs_key_page_basics: [],
  vs_business_schema: ['no_business_schema'],
};

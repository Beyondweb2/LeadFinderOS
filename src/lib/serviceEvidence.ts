/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT THE BUSINESS ACTUALLY OFFERS — services from its own website, with where each was found
   (Paul, 2026-10-01: "crawl first, then generate audit questions"). PURE: HTML in, evidence out.

   Two steps, so the crawler stays trade-blind and the audit decides with the trade it knows:
   1. serviceCandidates (the crawl, fn crawl-check): every phrase the site offers as a service, each
      with its source — a menu link (its page), a sampled page's <title> or <h1>, or a heading under a
      "Services" section on the homepage. Stored on the lead's crawl row (result.serviceEvidence).
   2. verifiedServices (the quick audit, fn create-ai-audit): the candidates cleaned (menu noise, the
      business's own name, the bare trade word, town suffixes — prospectPreview's cleanServices), merged
      when they are the same customer intent ("Emergency Plumbing" = "24 Hour Emergency Plumber"; "Boiler
      Repair" ≠ "Boiler Installation"), and ranked by how prominently the SITE presents them (how many
      places it names one, a page of its own, a menu entry). Nothing outside the site ranks them.
   ⛔ Never inferred from the category: a site with no service evidence yields no services, and the audit
      falls back to what it did before (its trade + town questions), marked as a fallback.
   A leaf over siteInfo.ts / prospectPreview — edge-safe, relative imports only. */
import { hostOf, textOf } from './siteInfo.ts';
import { cleanServices } from './prospectPreview/facts.ts';
import { singularTrade } from './prospectPreview/trades.ts';

export const SERVICE_EVIDENCE_VERSION = 1;
/** Candidates kept per crawl (the row stays small). */
export const SERVICE_CANDIDATE_MAX = 60;
/** Services kept after verification. */
export const VERIFIED_SERVICE_MAX = 8;

export type ServiceSourceKind = 'nav' | 'section' | 'title' | 'h1';
export interface ServiceCandidate { text: string; url: string; kind: ServiceSourceKind }
export interface ServiceEvidence { version: number; candidates: ServiceCandidate[] }
export interface VerifiedService { name: string; key: string; sources: { kind: ServiceSourceKind; url: string }[]; score: number }

const clean = (s: string) => textOf(s).replace(/\s+/g, ' ').trim();
const pathOf = (u: string, base: string) => { try { const x = new URL(u, base); return x.pathname || '/'; } catch { return u; } };

/** Every phrase the site presents as a service, with its source. Same-site links only. */
export function serviceCandidates(homeHtml: string, homeUrl: string, samplePages: { url: string; html: string }[] = []): ServiceEvidence {
  const out: ServiceCandidate[] = [];
  const seen = new Set<string>();
  const host = hostOf(homeUrl);
  const push = (text: string, url: string, kind: ServiceSourceKind) => {
    const t = clean(text);
    if (t.length < 3 || t.length > 70) return;
    const k = `${kind}|${t.toLowerCase()}|${url}`;
    if (seen.has(k) || out.length >= SERVICE_CANDIDATE_MAX) return;
    seen.add(k); out.push({ text: t, url, kind });
  };
  // 1. Menu links (<nav>, a menu/nav list, the header): the text and the page it opens.
  const blocks = [
    ...[...homeHtml.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gi)].map((m) => m[1]),
    ...[...homeHtml.matchAll(/<ul\b[^>]*class=["'][^"']*(?:menu|nav)[^"']*["'][^>]*>([\s\S]*?)<\/ul>/gi)].map((m) => m[1]),
    ...[...homeHtml.matchAll(/<header\b[^>]*>([\s\S]*?)<\/header>/gi)].map((m) => m[1]),
  ];
  for (const b of blocks) {
    for (const m of b.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = m[1];
      let abs: string;
      try { abs = new URL(href, homeUrl).href; } catch { continue; }
      if (hostOf(abs) !== host || /^(mailto|tel):/i.test(href)) continue;
      push(m[2], pathOf(abs, homeUrl), 'nav');
    }
  }
  // 2. Headings under a "Services" / "What we do" heading on the homepage.
  const sec = /<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi;
  let m: RegExpExecArray | null;
  while ((m = sec.exec(homeHtml)) !== null) {
    if (!/\b(?:our services|services|what we do|we offer|we specialise|how we can help)\b/i.test(clean(m[1]))) continue;
    const rest = homeHtml.slice(sec.lastIndex, sec.lastIndex + 6000);
    const stop = rest.search(/<h2\b/i);
    const region = stop > 0 ? rest.slice(0, stop) : rest;
    for (const h of region.matchAll(/<h[3-5]\b[^>]*>([\s\S]*?)<\/h[3-5]>/gi)) push(h[1], 'homepage Services section', 'section');
  }
  // 3. Each sampled page's own title and main heading.
  for (const p of samplePages) {
    const path = pathOf(p.url, homeUrl);
    if (path === '/' ) continue;
    const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(p.html)?.[1];
    if (title) push(clean(title).split(/\s+[|–—·-]\s+|\s*\|\s*/)[0], path, 'title');
    const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(p.html)?.[1];
    if (h1) push(h1, path, 'h1');
  }
  return { version: SERVICE_EVIDENCE_VERSION, candidates: out };
}

/* Words that never distinguish one customer intent from another. */
const STOP = new Set(['service', 'services', 'specialist', 'specialists', 'specialise', 'company', 'companies', 'expert', 'experts', 'solution', 'solutions',
  'and', 'the', 'our', 'for', 'in', 'of', 'a', 'an', 'to', 'local', 'uk', '24', '7', '247', 'hour', 'hours', 'hr', 'day', 'days', 'same', 'available', 'fast',
  'professional', 'professionals', 'affordable', 'cheap', 'quality', 'reliable', 'trusted', 'qualified', 'approved', 'certified', 'all', 'any', 'your', 'you',
  'we', 'us', 'near', 'me', 'best', 'top', 'work', 'works', 'job', 'jobs', 'call', 'out', 'callout', 'team']);

/** One customer intent's key: the distinguishing words, singular, sorted. Empty = just the trade word. */
export function serviceKey(name: string, trade: string): string {
  const stems = trade.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 4));
  const words = name.toLowerCase().replace(/&/g, ' and ').replace(/24\s*\/\s*7/g, ' 247 ').split(/[^a-z0-9]+/).filter(Boolean)
    .filter((w) => !STOP.has(w) && !stems.some((s) => w.startsWith(s)))
    .map((w) => (w.endsWith('ies') && w.length > 4 ? `${w.slice(0, -3)}y` : w.endsWith('s') && w.length > 3 && !w.endsWith('ss') ? w.slice(0, -1) : w));
  return [...new Set(words)].sort().join(' ');
}

const KIND_RANK: Record<ServiceSourceKind, number> = { nav: 0, section: 1, title: 2, h1: 3 };

/** UK cities a town gazetteer can miss (uk_towns lacks the biggest — CLAUDE.md §8). A location page for
 *  one of these is a place, never a service. The caller adds the lead's town, its service areas, the
 *  crawl's own location-page towns and any uk_towns match. */
export const MAJOR_UK_CITIES = ['London', 'Birmingham', 'Manchester', 'Leeds', 'Liverpool', 'Sheffield', 'Bristol', 'Newcastle', 'Nottingham',
  'Leicester', 'Coventry', 'Bradford', 'Hull', 'Stoke', 'Wolverhampton', 'Derby', 'Southampton', 'Portsmouth', 'Plymouth', 'Reading',
  'Brighton', 'Cardiff', 'Swansea', 'Newport', 'Edinburgh', 'Glasgow', 'Aberdeen', 'Dundee', 'Belfast', 'Oxford', 'Cambridge', 'York',
  'Norwich', 'Exeter', 'Bath', 'Milton Keynes', 'Northampton', 'Peterborough', 'Luton', 'Sunderland', 'Wakefield', 'Huddersfield',
  'Preston', 'Blackpool', 'Bolton', 'Stockport', 'Salford', 'Wigan', 'Oldham', 'Rochdale', 'Doncaster', 'Rotherham', 'Barnsley',
  'Middlesbrough', 'Bournemouth', 'Poole', 'Swindon', 'Gloucester', 'Cheltenham', 'Worcester', 'Ipswich', 'Colchester', 'Chelmsford',
  'Southend', 'Basildon', 'Watford', 'Slough', 'Crawley', 'Maidstone', 'Canterbury', 'Lincoln', 'Carlisle', 'Lancaster', 'Chester',
  'Telford', 'Shrewsbury', 'Hereford', 'Dudley', 'Walsall', 'Solihull', 'Halifax', 'Harrogate', 'Durham', 'Gateshead'];
/** Manufacturer / lock brands: a brand page is a product, not a service (questions never name brands). */
const BRANDS = /\b(?:ariston|worcester|bosch|vaillant|baxi|ideal|viessmann|glow-?worm|potterton|navien|alpha|intergas|grant|daikin|mitsubishi|samsung|nest|hive|tado|honeywell|drayton|yale|ultion|era|abloy|chubb|avocet|mul-?t-?lock|banham|ingersoll|union|kitemark)\b/i;
/** Pages about the business or its terms, not something it does. */
const NOT_OFFERED = /\b(?:why|overview|types? of|guides?|advice|tips|how to|ways? to pay|payments?|pricing|prices?|price list|offers?|deals?|guarantees?|warrant(?:y|ies)|accreditations?|our story|meet|history|mission|values|cover(?:ed|age)?|areas?|locations?|emergency services|all services|other services)\b/i;
/** Words that alone say only "the trade's work", not a distinct service ("Repair", "Installations"). */
const GENERIC_ALONE = new Set(['repair', 'installation', 'install', 'installer', 'maintenance', 'servicing', 'replacement', 'fitting', 'fitter', 'supply', 'new', 'domestic', 'residential']);
/** An extra word that does not make a second intent: "Wall Safe Installation" is "Wall Safes". */
const SAME_INTENT_EXTRA = new Set(['installation', 'install', 'installer', 'fitting', 'fitter', 'supply', 'supplier', 'new']);
/** A token that is a model code ("24FF", "i-30"), never a service word. */
const MODEL_CODE = /\b(?=[a-z-]*\d)(?=\d*[a-z])[a-z0-9-]{3,}\b/i;

/** The services the site supports, merged by intent and ranked by the site's own prominence. */
export function verifiedServices(ev: ServiceEvidence | null | undefined, ctx: { trade: string; towns: string[]; businessName: string }): VerifiedService[] {
  if (!ev || ev.version !== SERVICE_EVIDENCE_VERSION || !Array.isArray(ev.candidates)) return [];
  const trade = singularTrade(ctx.trade);
  const towns = [...new Set([...ctx.towns, ...MAJOR_UK_CITIES].map((t) => (t ?? '').trim()).filter(Boolean))];
  const townKeys = new Set(towns.map((t) => serviceKey(t, '')));
  const groups = new Map<string, VerifiedService & { first: number; names: { n: string; k: ServiceSourceKind }[] }>();
  const isPlace = (key: string) => !key || townKeys.has(key) || key.split(' ').every((w) => townKeys.has(w));
  ev.candidates.forEach((c, i) => {
    /* A menu entry that is only a town but opens a service page ("Aylesbury" → /emergency-plumbing-aylesbury/):
       the service is the page's own address, minus the town. */
    if (c.kind === 'nav' && isPlace(serviceKey(c.text, ''))) {
      const slug = (c.url.split('/').filter(Boolean).pop() ?? '').replace(/[-_]+/g, ' ');
      const words = slug.split(' ').filter((w) => !townKeys.has(serviceKey(w, ''))).join(' ');
      if (words && words.toLowerCase() !== slug.toLowerCase()) c = { ...c, text: words };
    }
    /* "Plumbers In Selby" → "Plumbers" (a place page): the place goes, whatever its case. */
    const placeless = c.text.replace(/\s+(?:in|near|around|across|covering|serving)\s+[A-Z][\w' -]*$/i, '').trim();
    const cleaned = cleanServices([placeless], trade, towns, ctx.businessName)[0];
    if (!cleaned || BRANDS.test(cleaned) || NOT_OFFERED.test(cleaned) || MODEL_CODE.test(cleaned)) return;
    const key = serviceKey(cleaned, ctx.trade);
    if (!key) return; // only the trade word ("Plumbing") — not a distinct service
    if (isPlace(key) || key.split(' ').every((w) => GENERIC_ALONE.has(w))) return; // a place, or only "repair"
    const g = groups.get(key) ?? { name: cleaned, key, sources: [], score: 0, first: i, names: [] };
    if (!g.sources.some((s) => s.kind === c.kind && s.url === c.url)) g.sources.push({ kind: c.kind, url: c.url });
    g.names.push({ n: cleaned, k: c.kind });
    groups.set(key, g);
  });
  /* Same intent, worded twice: a key that is another key plus only an installation-type word merges into it. */
  const keys = [...groups.keys()];
  for (const k of keys) {
    const words = k.split(' ');
    const base = keys.find((b) => b !== k && groups.has(b) && b.split(' ').every((w) => words.includes(w))
      && words.filter((w) => !b.split(' ').includes(w)).every((w) => SAME_INTENT_EXTRA.has(w)));
    if (!base || !groups.has(k)) continue;
    const into = groups.get(base)!; const from = groups.get(k)!;
    for (const s of from.sources) if (!into.sources.some((x) => x.kind === s.kind && x.url === s.url)) into.sources.push(s);
    into.names.push(...from.names); into.first = Math.min(into.first, from.first);
    groups.delete(k);
  }
  const out = [...groups.values()].map((g) => {
    const kinds = new Set(g.sources.map((s) => s.kind));
    const ownPage = g.sources.some((s) => s.kind !== 'section' && s.url !== '/' && g.key.split(' ').some((w) => s.url.toLowerCase().includes(w)));
    /* The site's own list of services (a homepage "Services" section) counts most; a menu entry and a page
       of its own next. Nothing outside the site ranks a service. */
    const score = kinds.size + (kinds.has('section') ? 2 : 0) + (kinds.has('nav') ? 1 : 0) + (ownPage ? 1 : 0);
    // The name a customer would recognise: from the menu first, then the section, then the shortest.
    const name = [...g.names].sort((a, b) => KIND_RANK[a.k] - KIND_RANK[b.k] || a.n.length - b.n.length)[0].n;
    return { name, key: g.key, sources: g.sources.slice(0, 4), score, first: g.first };
  });
  return out.sort((a, b) => b.score - a.score || a.first - b.first).slice(0, VERIFIED_SERVICE_MAX)
    .map(({ name, key, sources, score }) => ({ name, key, sources, score }));
}

/** The services a question budget covers: the most prominent first, skipping one that is mostly the same
 *  words as a service already chosen ("New Gas Boiler" after "New Boilers"), so the questions span
 *  different buying intents. Falls back to the next most prominent if variety runs out. */
export function pickServicesForQuestions(services: VerifiedService[], n: number): VerifiedService[] {
  const chosen: VerifiedService[] = [];
  const overlap = (a: string, b: string) => { const A = new Set(a.split(' ')), B = new Set(b.split(' ')); const i = [...A].filter((w) => B.has(w)).length; return i / new Set([...A, ...B]).size; };
  for (const s of services) { if (chosen.length >= n) break; if (chosen.every((c) => overlap(c.key, s.key) < 0.5)) chosen.push(s); }
  for (const s of services) { if (chosen.length >= n) break; if (!chosen.includes(s)) chosen.push(s); }
  return chosen;
}

/** What the audit was based on — a leaf of its own (questionBasis.ts) so the hook card reads it without this module. */
export type { QuestionBasis } from './questionBasis.ts';

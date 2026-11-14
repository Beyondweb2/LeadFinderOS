/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HOW EASY YOUR WEBSITE IS FOR AI TO READ — the client-facing website score on the baseline report
   and the welcome pack (behaviour ported from V2 websiteScan/aiReadability.ts, Paul 2026-11-13).

   SIX PARTS, fixed weights (AI_READABILITY_WEIGHTS): service pages 30, reviews/proof 20, areas 15,
   details/schema 15, AI crawlers 10, technical 10. A part that cannot be judged from what we READ is
   left out, and the score is the share of the parts that could be judged (never a guess, never 0 for
   "unknown"). No check at all, an unread site or no website = no score (null) and the page says so.

   ⛔ EVIDENCE ONLY: every input is the ONE stored website check (websiteCheck.ts: its issue and
      strength ids, each read on a page or in robots.txt / a sitemap), the pages it read, the contact
      details and towns it found, and the client's own services and areas. Nothing is invented.
   ⛔ NOT the team-only site score (siteScore.ts) and never imports it. Not an "SEO score": the
      wording is "How easy your website is for AI to read". It never promises a ranking.
   Pure; no I/O. IMPORTED BY EDGE FUNCTIONS: no imports at all.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const AI_READABILITY_WEIGHTS = { services: 30, proof: 20, areas: 15, details: 15, crawlers: 10, technical: 10 } as const;
export type ReadabilityPart = keyof typeof AI_READABILITY_WEIGHTS;
/** The least weight (of 100) that must be judged before a score is shown. */
export const AI_READABILITY_MIN_JUDGED = 50;

type Sev = 'high' | 'medium' | 'low';
export interface ReadabilityIssueIn { id: string; severity: Sev; title?: string }
export interface ReadabilityInput {
  /** The website check's state (websiteCheck.ts). Anything but 'issues' / 'clean' = no score. */
  state: string;
  issues: ReadabilityIssueIn[];
  strengths: Array<{ id: string }>;
  /** The crawl stopped at its page cap (missing evidence may simply be unread). */
  capped?: boolean;
  /** URLs of the pages read. */
  pageUrls?: string[];
  /** How many of the pages read the crawler classed as service pages (checkedPages[].kind). */
  servicePagesRead?: number;
  /** The business's home town (the audit's own town), used when the client has no list of areas. */
  town?: string | null;
  /** Towns the crawl found written on the site (siteInfo.towns). */
  townsOnSite?: string[];
  /** The client's own services and areas (client record / sales close). Empty = use the check's own finding. */
  services?: string[];
  areas?: string[];
}

export interface ReadabilityFinding { part: ReadabilityPart; serious: boolean; text: string }
export interface ReadabilityPartResult { part: ReadabilityPart; max: number; got: number | null }
export interface AiReadability {
  /** 0-100, or null when the site could not be judged. */
  score: number | null;
  parts: ReadabilityPartResult[];
  /** What is in the way, serious first, then by points lost. */
  findings: ReadabilityFinding[];
}

const GENERIC = new Set(['service', 'services', 'repair', 'repairs', 'local', 'company', 'professional', 'expert', 'specialist', 'specialists', 'quality', 'general', 'domestic', 'commercial', 'residential']);
const stem = (w: string) => w.replace(/(ings|ing|ers|er|es|s)$/, '').slice(0, 7);
/** The first 4+ letter word of a service that says what it is ("Boiler Servicing" -> "boiler"). */
export function serviceKey(s: string): string | null {
  const words = String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !GENERIC.has(w));
  return words.length ? stem(words[0]) : null;
}
const pathStems = (u: string): string[] => {
  let p = '';
  try { p = new URL(u).pathname; } catch { p = String(u ?? ''); }
  return p.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3).map(stem);
};
const isHome = (u: string) => { try { return new URL(u).pathname.replace(/\/+$/, '') === ''; } catch { return false; } };

const SEV_SHARE: Record<Sev, number> = { high: 1, medium: 0.6, low: 0.3 };
/** The ten technical checks, each the website-check issue ids that fail it. */
const TECHNICAL: Array<{ check: string; ids: string[] }> = [
  { check: 'https', ids: ['no_https'] },
  { check: 'indexable', ids: ['noindex_home', 'noindex_pages'] },
  { check: 'sitemap', ids: ['no_sitemap', 'sitemap_off_site'] },
  { check: 'canonical', ids: ['canonical_mismatch', 'canonical_off_site'] },
  { check: 'titles', ids: ['missing_title', 'duplicate_titles', 'long_titles'] },
  { check: 'descriptions', ids: ['missing_description'] },
  { check: 'headings', ids: ['missing_h1'] },
  { check: 'mobile', ids: ['no_viewport'] },
  { check: 'speed', ids: ['slow_pages', 'some_slow_pages', 'heavy_pages'] },
  { check: 'links', ids: ['broken_pages', 'unreachable_pages'] },
];

/** ONE way from the stored website check (websiteCheckFor's view + the lead_crawl_checks result) to the score's
 *  input, shared by the baseline report and the welcome pack. Duck-typed so this file stays import-free. */
export function readabilityFromCheck(
  view: { state: string; summary?: { issues?: unknown; strengths?: unknown; capped?: unknown } | null } | null | undefined,
  stored: { signals?: { checkedPages?: Array<{ url?: string; kind?: string }> | null } | null; siteInfo?: { towns?: unknown } | null } | null | undefined,
  client: { services?: string[] | null; areas?: string[] | null; town?: string | null },
): AiReadability {
  if (!view) return { score: null, parts: [], findings: [] };
  const s = view.summary ?? null;
  const issues = (Array.isArray(s?.issues) ? s!.issues as Array<Record<string, unknown>> : [])
    .filter((i) => typeof i?.id === 'string' && (i.severity === 'high' || i.severity === 'medium' || i.severity === 'low'))
    .map((i) => ({ id: String(i.id), severity: i.severity as Sev, title: typeof i.title === 'string' ? i.title : undefined }));
  const strengths = (Array.isArray(s?.strengths) ? s!.strengths as Array<Record<string, unknown>> : []).filter((x) => typeof x?.id === 'string').map((x) => ({ id: String(x.id) }));
  const pageUrls = (stored?.signals?.checkedPages ?? []).map((p) => String(p?.url ?? '')).filter(Boolean);
  const townsOnSite = Array.isArray(stored?.siteInfo?.towns) ? (stored!.siteInfo!.towns as unknown[]).map(String).filter(Boolean) : [];
  const pages = stored?.signals?.checkedPages ?? [];
  return aiReadability({
    state: view.state, issues, strengths, capped: s?.capped === true, pageUrls, townsOnSite,
    servicePagesRead: pages.length ? pages.filter((p) => p?.kind === 'service' && !isHome(String(p?.url ?? ''))).length : undefined,
    town: client.town ?? null,
    services: (client.services ?? []).filter(Boolean), areas: (client.areas ?? []).filter(Boolean),
  });
}

export function aiReadability(inp: ReadabilityInput): AiReadability {
  const empty: AiReadability = { score: null, parts: [], findings: [] };
  if (inp.state !== 'issues' && inp.state !== 'clean') return empty;
  const issue = new Map(inp.issues.map((i) => [i.id, i]));
  const has = (id: string) => issue.has(id);
  const strong = new Set(inp.strengths.map((s) => s.id));
  const findings: Array<ReadabilityFinding & { lost: number }> = [];
  const parts: ReadabilityPartResult[] = [];
  const add = (part: ReadabilityPart, ratio: number | null) => parts.push({ part, max: AI_READABILITY_WEIGHTS[part], got: ratio === null ? null : Math.max(0, Math.min(1, ratio)) * AI_READABILITY_WEIGHTS[part] });
  const say = (part: ReadabilityPart, ratio: number, serious: boolean, text: string) => findings.push({ part, serious, text, lost: (1 - ratio) * AI_READABILITY_WEIGHTS[part] });

  /* 1. Services (30): the client's services that have their own inner page (by the page address). */
  const services = [...new Map((inp.services ?? []).map((s) => [serviceKey(s), s] as const).filter(([k]) => !!k)).values()].slice(0, 12);
  const inner = (inp.pageUrls ?? []).filter((u) => !isHome(u));
  if (services.length && inner.length) {
    const innerStems = inner.map(pathStems);
    const hit = services.filter((s) => innerStems.some((st) => st.includes(serviceKey(s)!))).length;
    const r = hit / services.length;
    add('services', r);
    if (r < 1) say('services', r, r < 0.5, hit === 0 ? `None of your ${services.length} services has its own page` : `Only ${hit} of your ${services.length} services have their own page`);
  } else if (has('no_service_pages') || has('one_page_site')) { add('services', 0); say('services', 0, true, 'Your services do not have their own pages'); }
  else if (strong.has('service_pages')) add('services', 1);
  else if (services.length && !inner.length && (inp.pageUrls ?? []).length) { add('services', 0); say('services', 0, true, `None of your ${services.length} services has its own page`); }
  else if ((inp.pageUrls ?? []).length >= 3 && typeof inp.servicePagesRead === 'number') {
    /* No list of their services: the pages the crawler itself classed as service pages. */
    const k = inp.servicePagesRead;
    const r = k >= 3 ? 1 : k > 0 ? 0.5 : 0;
    add('services', r);
    if (r < 1) say('services', r, r === 0, k === 0 ? 'We found no pages about your individual services' : `We found only ${k} page${k === 1 ? '' : 's'} about your individual services`);
  }
  else add('services', null);

  /* 2. Reviews / proof (20). */
  if (strong.has('reviews_shown') || strong.has('work_shown')) add('proof', 1);
  else if (has('no_reviews')) { add('proof', 0); say('proof', 0, true, "We couldn't find reviews, testimonials or examples of your work on your website"); }
  else add('proof', null);

  /* 3. Areas (15): the client's areas written on the site; else the check's own town finding. */
  const areas = [...new Set((inp.areas ?? []).map((a) => a.trim()).filter(Boolean))].slice(0, 10);
  const towns = (inp.townsOnSite ?? []).map((t) => t.toLowerCase());
  if (areas.length && towns.length) {
    const k = areas.filter((a) => towns.some((t) => t.includes(a.toLowerCase()) || a.toLowerCase().includes(t))).length;
    const r = k / areas.length;
    add('areas', r);
    if (r < 1) say('areas', r, r < 0.5, `Your website names ${k} of the ${areas.length} areas you cover`);
  } else if (has('town_missing') || has('ct_areas_not_stated') || has('location_unclear')) { add('areas', 0); say('areas', 0, true, "Your website doesn't say clearly where you work"); }
  else if (strong.has('town_stated')) add('areas', areas.length > 1 ? 0.5 : 1);
  else if (!areas.length && inp.town && towns.length) {
    /* No list of their areas: is their home town written on the site? */
    const t = inp.town.toLowerCase().trim();
    const found = towns.some((x) => x.includes(t) || (x.length >= 4 && t.includes(x)));
    add('areas', found ? 1 : 0);
    if (!found) say('areas', 0, true, `Your website doesn't mention ${inp.town}`);
  }
  else add('areas', null);

  /* 4. Details and business markup (15): contact details (7) + business schema (8). */
  const nap = has('no_phone') || has('no_contact_route') ? 0 : has('schema_phone_mismatch') || has('ct_conflicting_facts') ? 0.4 : has('no_address') ? 0.6 : strong.has('phone_shown') ? 1 : null;
  const schema = strong.has('business_schema') ? 1 : has('schema_malformed') || has('ct_schema_mismatch') ? 0.6 : has('no_business_schema') ? 0 : null;
  if (nap === null && schema === null) add('details', null);
  else {
    const r = ((nap ?? schema!) * 7 + (schema ?? nap!) * 8) / 15;
    add('details', r);
    if (nap !== null && nap < 1) say('details', nap, nap === 0, nap === 0 ? 'Your phone number is not on your website' : has('schema_phone_mismatch') || has('ct_conflicting_facts') ? 'Your website gives different details in different places' : 'Your address is not on your website');
    if (schema !== null && schema < 1) say('details', schema, false, schema === 0 ? 'Your website has no business details for AI tools to read (business markup)' : 'Your business markup has errors or does not match the page');
  }

  /* 5. AI crawlers (10): robots.txt lets the AI search tools in. */
  if (has('robots_blocks_ai_search') || has('robots_blocks_all')) { add('crawlers', 0); say('crawlers', 0, true, 'Your website tells AI search tools not to read it (robots.txt)'); }
  else if (strong.has('oai_searchbot_ok') || inp.state === 'clean' || inp.issues.length || inp.strengths.length) add('crawlers', 1);
  else add('crawlers', null);

  /* 6. Technical (10): ten checks, each losing its share by severity. */
  let lost = 0;
  for (const t of TECHNICAL) {
    const worst = t.ids.map((id) => issue.get(id)).filter((x): x is ReadabilityIssueIn => !!x).sort((a, b) => SEV_SHARE[b.severity] - SEV_SHARE[a.severity])[0];
    if (worst) { lost += SEV_SHARE[worst.severity]; findings.push({ part: 'technical', serious: worst.severity === 'high', text: worst.title || t.check, lost: SEV_SHARE[worst.severity] }); }
  }
  add('technical', 1 - lost / TECHNICAL.length);

  const judged = parts.filter((p) => p.got !== null);
  const max = judged.reduce((s, p) => s + p.max, 0);
  const got = judged.reduce((s, p) => s + (p.got ?? 0), 0);
  /* ⛔ A number only when at least half the weight could be judged: 100 from the small parts alone would flatter
     a site whose service pages, reviews and areas we never saw. Below that: no score, the findings still shown. */
  const score = max >= AI_READABILITY_MIN_JUDGED ? Math.round((got / max) * 100) : null;
  findings.sort((a, b) => Number(a.part === 'technical') - Number(b.part === 'technical') || Number(b.serious) - Number(a.serious) || b.lost - a.lost);
  return { score, parts, findings: findings.map(({ part, serious, text }) => ({ part, serious, text })) };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   PAGE PLAN — which service-plus-town pages a client needs, from the OVERLAP of what they told us
   (questionnaire services_list + areas_list + confirmed_location) and what we measured them on
   (their baseline audit's exact questions). Built 2026-08-19, Paul's spec.

   ⛔ THE OVERLAP IS THE POINT. A page is only planned when the pair is BOTH wanted (questionnaire)
   AND measured (a baseline query targets it) — so every generated page aims at a query the week-8
   re-measure will actually test. Nothing is excluded silently: generic trade-level queries, and
   areas wanted but never measured, are itemised with reasons (the serveGate/off-trade house rule).

   ⛔ PURE AND DEPENDENCY-FREE. Imported by the page-generator edge function (relative .ts) and the
   SPA; scripts/page-plan.test.ts drives it with RG's and Ronnie's REAL shapes — including Ronnie's
   stale locksmith questions (guarded twice: the server reads only the latest baseline_target_runs
   runs, and the overlap drops them anyway because "Locksmiths" is not a service he offers) and
   RG's composite service ("uPVC door and window locks" answers both the upvc-door and window-locks
   queries with ONE page).
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export interface PagePlanInput {
  /** services_list from the newest questionnaire row, as stored. */
  services: readonly string[];
  /** areas_list from the questionnaire, as stored. */
  areas: readonly string[];
  /** confirmed_location — the home town, always a wanted area. */
  homeTown: string;
  /** The DISTINCT baseline questions, verbatim (caller reads the latest baseline_target_runs runs). */
  questions: readonly string[];
}

export interface PlannedPage {
  /** Stable key: normalised service | normalised town. */
  key: string;
  /** Display forms, exactly as the questionnaire stored them. */
  service: string;
  town: string;
  /** The measured queries this page targets, verbatim. */
  queries: string[];
  slug: string;
}

export interface ExcludedQuery {
  question: string;
  reason: string;
}

export interface PagePlan {
  pages: PlannedPage[];
  excluded: ExcludedQuery[];
  /** Wanted areas with no page — measured queries never targeted them. Never dropped silently. */
  unmeasuredAreas: string[];
}

const norm = (s: string): string =>
  String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Light stem: trailing s off tokens of 4+ chars, so "repairs" meets "repair". */
const stem = (t: string): string => (t.length >= 4 && t.endsWith('s') ? t.slice(0, -1) : t);
const tokens = (s: string): string[] => norm(s).split(' ').filter(Boolean).map(stem);

/** Words that carry no service identity — never enough to match on. */
const NOISE = new Set([
  'in', 'the', 'and', 'uk', 'near', 'me', 'for', 'of', 'a', 'an', 'best', 'top', 'rated',
  'local', 'service', 'shop', 'company', 'companie', 'expert', 'specialist', 'professional',
  'affordable', 'cheap', 'reliable', 'quick', 'people', 'recommend', 'which', 'where', 'can',
  'i', 'get', 'do', 'my',
]);

const significant = (s: string): string[] => tokens(s).filter((t) => !NOISE.has(t));

/** Contiguous token-run containment ("st neots" inside "lock changes locksmiths in st neots uk"). */
function containsRun(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/** Sub-phrases of a composite service: "uPVC door and window locks" → ["upvc door", "window locks"].
 *  A service with no separators is its own single sub-phrase. */
function subPhrases(service: string): string[][] {
  return String(service ?? '')
    .split(/,|\band\b|&|\//i)
    .map((p) => significant(p))
    .filter((p) => p.length > 0);
}

/**
 * Does this question target this service?
 * A full sub-phrase present (contiguous) always matches — that is the composite-service case.
 * Otherwise at least TWO significant service tokens must appear: one shared word ("watch" in
 * "watch repair shop" vs "watch battery replacement") is a different job, not this service.
 * A single-token service matches on its one token.
 */
export function serviceMatches(question: string, service: string): boolean {
  const q = tokens(question);
  const phrases = subPhrases(service);
  for (const p of phrases) {
    if (containsRun(q, p)) return true;
    if (p.length === 1 && q.includes(p[0])) return true;
  }
  const all = [...new Set(phrases.flat())];
  const hits = all.filter((t) => q.includes(t));
  return all.length >= 2 && hits.length >= 2;
}

export function townMatches(question: string, town: string): boolean {
  return containsRun(tokens(question), tokens(town));
}

export function slugFor(service: string, town: string): string {
  return `${norm(service).replace(/ /g, '-')}-${norm(town).replace(/ /g, '-')}`;
}

export function buildPagePlan(input: PagePlanInput): PagePlan {
  const areas = [...new Set([input.homeTown, ...input.areas].map((a) => String(a ?? '').trim()).filter(Boolean))];
  const services = input.services.map((s) => String(s ?? '').trim()).filter(Boolean);

  const byKey = new Map<string, PlannedPage>();
  const excluded: ExcludedQuery[] = [];
  const townsWithPages = new Set<string>();

  for (const question of input.questions) {
    const q = String(question ?? '').trim();
    if (!q) continue;
    const townsHit = areas.filter((a) => townMatches(q, a));
    if (townsHit.length === 0) {
      excluded.push({ question: q, reason: 'no wanted area in the query — nothing to target a page at' });
      continue;
    }
    const servicesHit = services.filter((s) => serviceMatches(q, s));
    if (servicesHit.length === 0) {
      /* "best locksmiths in Huntingdon UK", "cobbler in Halifax" — a trade-level or unlisted-service
         query. Real and measured, but not a service+area page's job: the HOMEPAGE carries these. */
      excluded.push({ question: q, reason: 'no listed service in the query — trade-level, the homepage covers it' });
      continue;
    }
    for (const s of servicesHit) {
      for (const t of townsHit) {
        const key = `${norm(s)}|${norm(t)}`;
        const page = byKey.get(key) ?? { key, service: s, town: t, queries: [], slug: slugFor(s, t) };
        if (!page.queries.includes(q)) page.queries.push(q);
        byKey.set(key, page);
        townsWithPages.add(norm(t));
      }
    }
  }

  /* Home town first, then the questionnaire's own area order; services in questionnaire order. */
  const townOrder = new Map(areas.map((a, i) => [norm(a), i]));
  const serviceOrder = new Map(services.map((s, i) => [norm(s), i]));
  const pages = [...byKey.values()].sort((a, b) =>
    (townOrder.get(norm(a.town)) ?? 99) - (townOrder.get(norm(b.town)) ?? 99)
    || (serviceOrder.get(norm(a.service)) ?? 99) - (serviceOrder.get(norm(b.service)) ?? 99));

  const unmeasuredAreas = areas.filter((a) => !townsWithPages.has(norm(a)));
  return { pages, excluded, unmeasuredAreas };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE ANTI-STUFFING CHECK — the code-side guard the prompt cannot bypass.

   RG's old agency pages were the measured failure: byte-identical 333-word templates with
   "locksmith(s)" at 5.7% density and the town swapped in. The de-stuffed rewrite is the style that
   moved Gemini for ABLM. This check grades a generated page the way that incident taught us:
   the TOWN should read a handful of times, and the service+town vocabulary should be a seasoning,
   not the dish.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export interface StuffingVerdict {
  wordCount: number;
  townCount: number;
  serviceTokenCount: number;
  densityPct: number;
  verdict: 'ok' | 'stuffed';
  detail: string;
}

/** Maximum town mentions before a page reads as a doorway page. Lowered 4 → 3 (2026-08-27): the
 *  generator now aims for 2 and the backstop trims to this. */
export const MAX_TOWN_MENTIONS = 3;
/** Maximum (town + service-token) share of all words, percent. RG's stuffed pages ran 5.7% on one
 *  token alone; natural copy sits comfortably under this. */
export const MAX_KEYWORD_DENSITY_PCT = 3.0;

export function stuffingCheck(bodyHtmlOrText: string, service: string, town: string): StuffingVerdict {
  const text = String(bodyHtmlOrText ?? '').replace(/<[^>]*>/g, ' ');
  const words = tokens(text);
  const wordCount = words.length;

  const townToks = tokens(town);
  let townCount = 0;
  if (townToks.length > 0) {
    for (let i = 0; i + townToks.length <= words.length; i++) {
      let hit = true;
      for (let j = 0; j < townToks.length; j++) if (words[i + j] !== townToks[j]) { hit = false; break; }
      if (hit) townCount++;
    }
  }

  const svcToks = new Set(subPhrases(service).flat());
  const serviceTokenCount = words.filter((w) => svcToks.has(w)).length;

  const densityPct = wordCount > 0
    ? Math.round(((townCount + serviceTokenCount) / wordCount) * 1000) / 10
    : 0;
  const stuffed = townCount > MAX_TOWN_MENTIONS || densityPct > MAX_KEYWORD_DENSITY_PCT;
  return {
    wordCount, townCount, serviceTokenCount, densityPct,
    verdict: stuffed ? 'stuffed' : 'ok',
    detail: stuffed
      ? `town ${townCount}x (max ${MAX_TOWN_MENTIONS}), keyword density ${densityPct}% (max ${MAX_KEYWORD_DENSITY_PCT}%)`
      : `town ${townCount}x, keyword density ${densityPct}% — natural`,
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   MECHANICAL BACKSTOP — the CLEAN, safe guarantees, run on whatever the model returned:
     1. NO OTHER TOWNS — any other-area name becomes "here"/"the area" (protects the controlled
        experiment AND cuts stuffing). HARD guarantee.
     2. TOWN CAP — town mentions beyond MAX_TOWN_MENTIONS (counting the H1's) become neutrals.
        HARD guarantee.
   ⛔ DENSITY IS NOT MECHANICALLY STRIPPED. It was tried and removed (2026-08-27): replacing the
   service noun ("lock") to hit a number produces GIBBERISH ("we change your it / the work") and
   still cannot guarantee <3%, because the H1's own "service + town" keywords count and dominate on a
   short page. Density is instead driven down by the strengthened prompt + up-to-3 stricter
   regenerations in the edge fn — which produces NATURAL copy. So this backstop guarantees the town
   count and no-other-towns; the returned `check` reports the real density honestly.
   Operates on TEXT NODES only (never inside <tags>), so it cannot corrupt the HTML.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
const NEUTRAL_TOWN = ['here', 'the area', 'locally'];
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mapTextNodes = (html: string, fn: (t: string) => string): string =>
  String(html ?? '').replace(/(<[^>]+>)|([^<]+)/g, (_m, tag, text) => (tag ? tag : fn(text ?? '')));

export interface EnforceResult {
  html: string;
  check: StuffingVerdict;
  townTrimmed: boolean;
  otherTownsStripped: boolean;
}

export function enforceNaturalness(
  bodyHtml: string, service: string, town: string, otherTowns: string[], h1 = '',
): EnforceResult {
  let html = String(bodyHtml ?? '');
  let townTrimmed = false, otherTownsStripped = false;
  let rot = 0;

  // 1. Other towns → neutral. Longest first so "st neots" is handled before a bare "st".
  const others = [...new Set(otherTowns.map((t) => String(t ?? '').trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  for (const ot of others) {
    const re = new RegExp(`\\b${escapeRe(ot)}\\b`, 'gi');
    html = mapTextNodes(html, (t) => t.replace(re, () => { otherTownsStripped = true; return NEUTRAL_TOWN[rot++ % NEUTRAL_TOWN.length]; }));
  }

  // 2. Town beyond the cap → neutral. The H1 (unmodified) legitimately carries the town, so the
  //    body budget is the cap MINUS whatever the H1 already spends.
  const h1TownCount = stuffingCheck(h1, service, town).townCount;
  const bodyKeep = Math.max(0, MAX_TOWN_MENTIONS - h1TownCount);
  const townRe = new RegExp(`\\b${escapeRe(town)}\\b`, 'gi');
  let seen = 0; rot = 0;
  html = mapTextNodes(html, (t) => t.replace(townRe, (m) => {
    seen++;
    if (seen <= bodyKeep) return m;
    townTrimmed = true;
    return NEUTRAL_TOWN[rot++ % NEUTRAL_TOWN.length];
  }));

  return { html, check: stuffingCheck(`${h1} ${html}`, service, town), townTrimmed, otherTownsStripped };
}

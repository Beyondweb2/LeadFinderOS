/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SITE SCOPE — what this client genuinely offers and serves, and the ONE question classifier that
   decides whether a frozen baseline question may be pointed at a page (fix workstream 6, 2026-10-04;
   certification D-01 / D-02 / D-21 / M-035).

   Session D proved the Site Intent Map pointed questions about services the client does NOT offer
   ("boiler installation" → the servicing page) and towns it does NOT serve ("locksmith Telford" → the
   home page) at real pages, because a question that named nothing approved fell through as "generic".
   The rule now is POSITIVE MATCH ONLY:

     a question is owned only when EVERY meaningful word in it is accounted for — by an approved
     service, a served town, the trade, the business's name, a verified price (for price words) or a
     verified 24/7 fact (for out-of-hours words). Anything left over makes it UNOWNED, with the words
     and the reason, for Paul. Absent is never "generic".

     SiteScope           the boundary. Website Build fills it today from the approved page plan /
                         template config and the fact ledger (siteScopeFromBuild in siteGate.ts).
     classifyQuestion()  home / service / town / service_town / unowned (+ the words and why)
     namesExcluded()     the narrow check the page generator's Q&A path uses (an excluded service or
                         an unverified out-of-hours ask), where free questions legitimately name topics

   ⛔ WORKSTREAM 4 OWNS THE VERIFIED-SERVICE MODEL. This file never decides which services are verified:
      it is HANDED a list. After WS-4 merges, the list comes from its verified service set (see
      docs/pre-sales-certification/fixes-06-website-build.md, "Session 4 integration").
   ⚠️ Edge-reachable (page-generator): relative imports with .ts only. Pure.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { intentTokens, mentions, findNamed } from './intentOwnership.ts';

export interface ScopeService {
  /** The page-plan / catalogue name. */
  name: string;
  /** Other words for the same service (template catalogue synonyms, the client's own wording). */
  aliases: readonly string[];
}

export interface SiteScope {
  /** The VERIFIED services the site has a page (or a card) for. */
  services: readonly ScopeService[];
  /** Explicitly NOT offered: the client's "must not say", template services Paul left out, rejected or
   *  not-applicable service facts. A question naming one is unowned with "not offered". */
  excluded: readonly string[];
  /** Served towns (verified service areas, location pages) — the home town included or not. */
  towns: readonly string[];
  homeTown: string;
  /** Words that name the trade / business type ("Locksmith", "Plumber and heating engineer"). */
  trade: readonly string[];
  businessName: string;
  /** A verified price exists, so a price question can be answered. */
  pricesVerified: boolean;
  /** A verified fact says 24/7 / out of hours, so an out-of-hours question can be answered. */
  outOfHoursVerified: boolean;
}

export type QuestionClass =
  | { kind: 'home' | 'service' | 'town' | 'service_town'; service: string; town: string }
  | { kind: 'unowned'; service: string; town: string; terms: string[]; reason: string };

/* Words that never decide what a question is about. Stemmed by intentTokens. */
const GENERIC = new Set([
  'who', 'what', 'whats', 'where', 'when', 'why', 'how', 'which', 'can', 'could', 'do', 'doe', 'did', 'is', 'are', 'was', 'should', 'would', 'will',
  'much', 'many', 'long', 'often', 'best', 'good', 'great', 'recommend', 'top', 'rate', 'reliable', 'trust', 'trustworthy', 'reputable',
  'local', 'near', 'nearby', 'me', 'my', 'i', 'we', 'our', 'you', 'your', 'someone', 'somebody', 'anyone', 'there', 'get', 'find', 'need', 'hire', 'call',
  'contact', 'a', 'an', 'the', 'in', 'on', 'at', 'for', 'of', 'to', 'and', 'or', 'with', 'from', 'around', 'area', 'uk', 'company', 'compan', 'firm',
  'business', 'service', 'servic', 'professional', 'expert', 'specialist', 'quote', 'estimate', 'it', 'this', 'that', 'it', 'be', 'some', 'any',
  'house', 'home', 'domestic', 'residential', 'general', 'property', 'help', 'out', 'up', 'one', 'someone', 'urgent', 'urgently', 'quick', 'now', 'today',
].map((w) => intentTokens(w)[0] ?? w));
/* Price words: answered only with a verified price. */
const PRICE = new Set(['price', 'cost', 'cheap', 'cheapest', 'affordable', 'fee', 'charge', 'expensive'].map((w) => intentTokens(w)[0] ?? w));
/* Out-of-hours words: answered only with a verified 24/7 / out-of-hours fact. */
const OUT_OF_HOURS = new Set(['24', '7', '247', 'hour', 'hr', 'night', 'overnight', 'weekend', 'sunday', 'midnight', 'late', 'evening', 'bank', 'holiday'].map((w) => intentTokens(w)[0] ?? w));
/* Kinds of work. A work word is accounted for only when the matched service does the same kind of
   work ("boiler installation" is NOT the boiler-servicing page), or names no kind of work at all. */
const WORK_FAMILIES: ReadonlyArray<ReadonlySet<string>> = [
  ['repair', 'fix', 'mend', 'broken', 'faulty', 'fault', 'breakdown'],
  ['install', 'installation', 'fit', 'fitting', 'fitter', 'new', 'replace', 'replacement', 'supply', 'upgrade', 'change', 'swap'],
  ['servic', 'service', 'servicing', 'maintenance', 'maintain', 'check', 'inspection', 'test', 'testing', 'annual'],
].map((ws) => new Set(ws.map((w) => intentTokens(w)[0] ?? w)));
const familyOf = (t: string) => WORK_FAMILIES.findIndex((f) => f.has(t));

/** Two stems name the same trade word ("plumbing" / "plumber", "electrical" / "electrician"). */
function sameStem(a: string, b: string): boolean {
  if (a === b) return true;
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k >= 5 && k >= 0.8 * Math.min(a.length, b.length);
}

/** Every word of `phrase` that decides anything is in the question — no "soft word" leeway (an
 *  excluded "new boilers" must never match "repair my boiler"). */
function mentionsAll(qt: readonly string[], phrase: string): boolean {
  const need = intentTokens(phrase).filter((t) => !GENERIC.has(t));
  return need.length > 0 && need.every((t) => qt.includes(t));
}

/** The service a question is about, and the words of it the question used. Full name / alias first;
 *  then a partial match: at least half of the service's distinctive words. The kind of work the
 *  question asks for (repair / install / service) breaks a tie toward the service that does it. */
function matchService(qt: readonly string[], q: string, scope: SiteScope, tradeT: readonly string[]): { name: string; tokens: Set<string> } | null {
  const qFam = new Set(qt.map(familyOf).filter((f) => f >= 0));
  let best: { name: string; tokens: Set<string>; score: number } | null = null;
  for (const s of scope.services) {
    const own = new Set([s.name, ...s.aliases].flatMap((x) => intentTokens(x)));
    const full = [s.name, ...s.aliases].filter((x) => x.trim() && mentions(q, x)).sort((a, b) => b.length - a.length)[0];
    let score = 0;
    if (full) score = 100 + intentTokens(full).length;
    else {
      const hard = intentTokens(s.name).filter((t) => !GENERIC.has(t) && familyOf(t) < 0 && !tradeT.some((x) => sameStem(x, t)));
      const hit = hard.filter((t) => qt.includes(t));
      if (hard.length && hit.length && hit.length / hard.length >= 0.5) score = 10 * (hit.length / hard.length) + hit.length;
    }
    if (!score) continue;
    const sFam = new Set([...intentTokens(s.name)].map(familyOf).filter((f) => f >= 0));
    if (qFam.size && sFam.size) score += [...qFam].some((f) => sFam.has(f)) ? 5 : -5;
    /* A tie goes to the service whose own words cover more of the question ("anti snap lock upgrade"
       is the high-security page, not lock changes). */
    score += 0.5 * qt.filter((t) => own.has(t) && !GENERIC.has(t)).length;
    if (!best || score > best.score) best = { name: s.name, tokens: own, score };
  }
  return best ? { name: best.name, tokens: best.tokens } : null;
}

/**
 * The ONE decision for "may this question be pointed at a page?". Pure.
 * ⛔ Positive matches only: a word nothing accounts for makes the question unowned.
 */
export function classifyQuestion(question: string, scope: SiteScope): QuestionClass {
  const q = String(question ?? '');
  const qt = intentTokens(q);
  const tradeT = scope.trade.flatMap((t) => intentTokens(t)).filter((t) => !GENERIC.has(t));
  const nameT = new Set(intentTokens(scope.businessName).filter((t) => !GENERIC.has(t)));
  const allTowns = [...scope.towns, ...(scope.homeTown ? [scope.homeTown] : [])].filter(Boolean);
  const town = findNamed(q, allTowns);
  const townT = new Set(town ? intentTokens(town) : []);
  const svc = matchService(qt, q, scope, tradeT);
  const svcFamilies = new Set(svc ? [...svc.tokens].map(familyOf).filter((f) => f >= 0) : []);
  /* The approved services' own subject words ("lock", "boiler", "radiator") — never their work words:
     "Radiator installation" must not make "boiler installation" look offered. */
  const vocab = new Set(scope.services.flatMap((s) => [s.name, ...s.aliases].flatMap((x) => intentTokens(x))).filter((t) => familyOf(t) < 0 && !GENERIC.has(t)));

  const excluded = [...new Map(scope.excluded.filter((x) => x.trim() && mentionsAll(qt, x)).map((x) => [x.toLowerCase(), x])).values()];
  const left: string[] = [];
  for (const t of qt) {
    if (GENERIC.has(t) || townT.has(t) || nameT.has(t)) continue;
    if (tradeT.some((x) => sameStem(x, t))) continue;
    if (svc && svc.tokens.has(t) && familyOf(t) < 0) continue;
    if (vocab.has(t)) continue;
    const fam = familyOf(t);
    if (fam >= 0 && svc && (svcFamilies.has(fam) || svcFamilies.size === 0)) continue;
    if (PRICE.has(t) && scope.pricesVerified) continue;
    if (OUT_OF_HOURS.has(t) && scope.outOfHoursVerified) continue;
    if (!left.includes(t)) left.push(t);
  }
  const service = svc?.name ?? '', where = town;
  if (excluded.length) return { kind: 'unowned', service, town: where, terms: excluded, reason: 'names something the client does NOT offer (' + excluded.join(', ') + ') — never answered on the site' };
  if (left.length) {
    const ooh = left.filter((t) => OUT_OF_HOURS.has(t)), price = left.filter((t) => PRICE.has(t));
    const reason = ooh.length && ooh.length === left.length ? 'asks for 24-hour / out-of-hours service, which is not a verified fact'
      : price.length && price.length === left.length ? 'asks about price, and no price is verified'
      : 'names "' + left.join(' ') + '" — not an approved service, a served area or the trade';
    return { kind: 'unowned', service, town: where, terms: left, reason };
  }
  if (service && where) return { kind: 'service_town', service, town: where };
  if (service) return { kind: 'service', service, town: '' };
  if (where) return { kind: 'town', service: '', town: where };
  return { kind: 'home', service: '', town: '' };
}

/** The page generator's Q&A check: refuse a question that names an excluded service, or asks for
 *  out-of-hours work without a verified 24/7 fact. Narrower than classifyQuestion on purpose: a Q&A
 *  page answers a free question, which may name a general topic. */
export function namesExcluded(question: string, scope: Pick<SiteScope, 'excluded' | 'outOfHoursVerified'>): { refused: boolean; reason: string } {
  const q = String(question ?? '');
  const qt = intentTokens(q);
  const ex = scope.excluded.filter((x) => x.trim() && mentionsAll(qt, x));
  if (ex.length) return { refused: true, reason: 'The question names something the client does not offer (' + ex.join(', ') + ').' };
  if (!scope.outOfHoursVerified && /\b24\s*\/\s*7\b|\b24[\s-]*(?:hours?|hrs?)\b|\bout[\s-]of[\s-]hours\b|\bovernight\b|\bround[\s-]the[\s-]clock\b/i.test(q))
    return { refused: true, reason: 'The question asks for 24-hour / out-of-hours service, and no verified fact says the client offers it.' };
  return { refused: false, reason: '' };
}

/** "No car keys / auto locksmith. No safe opening." → ["car keys", "auto locksmith", "safe opening"].
 *  A must-not-say answer is free text; only its "no X" / "not X" / "don't do X" phrases are services. */
export function excludedFromText(text: string): string[] {
  const out: string[] = [];
  for (const part of String(text ?? '').split(/[.;\n•·]+|,\s*(?=(?:no|not|never)\b)/i)) {
    const m = /^\s*(?:we\s+)?(?:do\s+not|don['’]?t|does\s+not|doesn['’]?t|no|not|never|never\s+do|not\s+an?)\s+(?:offer\s+|do\s+|fit\s+|provide\s+)?(.+)$/i.exec(part);
    if (!m) continue;
    for (const x of m[1].split(/\s*(?:\/|,|\bor\b)\s*/i)) {
      const v = x.replace(/\b(?:work|jobs?|call[\s-]?outs?|please|at all|ever)\b/gi, ' ').replace(/[^\w\s&'-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (v && v.split(' ').length <= 4 && intentTokens(v).some((t) => !GENERIC.has(t))) out.push(v);
    }
  }
  return [...new Set(out)];
}

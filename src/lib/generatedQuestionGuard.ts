/* ════════════════════════════════════════════════════════════════════════════════════════════════
   GENERATED-QUESTION GUARD — real trade, real place, natural wording (Paul, 2026-11-15).

   🔴 THE INCIDENT. Stored audits carried "who should I switch to for reliable electrical maintenance
   in Shrewsbury UK", "plumber for stove maintenance in Gloucester UK" and "best plumbing service for
   boiler maintenance in Southport UK". Every existing guard passed them: buying intent (yes), the
   trade word (yes — "electrical", "plumber", "plumbing"), the town (yes), the country (yes). Nothing
   asked whether a CUSTOMER would ever type it. A good set reads "emergency plumber in Hackney",
   "boiler service in Bow", "EICR certificate for landlords in London", "wedding content creator in
   Galway".

   Paul's words: "questions must use the business's real trade only, real towns/counties from its
   service area (respect 'Hybrid' and Ireland), and natural wording customers actually type."

   ⛔ THREE CHECKS, ONE FILTER, SAME SHAPE AS dropOffTrade / dropMissingTown. A rejected question is
   topped up from the deterministic templates, which pass all three by construction, so the count the
   operator paid for is unchanged. A false rejection costs one template; a false acceptance is a
   measurement of nothing.

     1. WORDING — reuses auditVerdict's `unnaturalReason` (a doubled word, a run-on over 14 words: the
        report already refuses to SCORE those, so generating one buys a slot nobody can read), plus
        the four shapes from the stored audits: "<trade> for <anything> maintenance/needs",
        "who should I switch to for…", "best <trade> service for <a service>", and stacked adjectives
        ("best affordable reliable plumber"). "top rated" / "highly rated" are one adjective — the
        fallback templates use them.
     2. TRADE — a question naming ANOTHER trade family (roofer, builder, electrician…) and none of the
        business's own. The business's own families come from its trade AND its listed services, so a
        "domestic maintenance" firm whose site lists plumbing and electrical may be asked about both,
        and not about roofing. ⚠️ A trade we cannot place in any family (and no listed service that
        is) is NOT judged — absence is not an answer.
     3. PLACE — the place a question names ("… in <place>") must start with the business's own town,
        one of its service areas, or (national / hybrid wider half) the market word. Ireland: never
        "UK", and no Northern Ireland place unless it is in the stated area. Only UK and Ireland are
        judged; every other market keeps exactly the behaviour it had.

   Pure and Deno-free: create-ai-audit imports it with an explicit .ts path, scripts test it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { questionKey, mentionsTown } from './seedGuard.ts';
import { unnaturalReason } from './auditVerdict.ts';
import { hybridAllocation } from './marketModel.ts';

const norm = (v: string) =>
  (v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/* ── 1. WORDING ─────────────────────────────────────────────────────────────────────────────── */

/** Quality adjectives. "local", "emergency", "24 hour" are NOT here: they say what the customer
 *  needs, not how good the firm is, and "best local electrician" is how people search. */
const QUALITY_ADJ = new Set([
  'best', 'top', 'good', 'great', 'reliable', 'trusted', 'trustworthy', 'dependable', 'affordable',
  'cheap', 'professional', 'certified', 'experienced', 'reputable', 'recommended', 'quality',
  'qualified', 'licensed', 'expert', 'friendly', 'fast', 'quick', 'skilled', 'honest', 'rated',
]);

/** Who a service is FOR. "best seo services for small businesses" is a real search; "best plumbing
 *  service for boiler maintenance" is not. */
const AUDIENCE_AFTER_FOR = new Set([
  'a', 'an', 'my', 'our', 'small', 'local', 'new', 'first', 'businesses', 'business', 'startups',
  'landlords', 'homeowners', 'home', 'homes', 'families', 'couples', 'companies', 'sole', 'freelancers',
  'contractors', 'charities', 'tenants', 'ecommerce', 'limited', 'property', 'commercial', 'domestic',
  'residential', 'schools', 'restaurants', 'shops', 'offices', 'weddings', 'wedding', 'elderly',
]);

/** Reject wording a real customer would not type. Returns null when the question is fine. */
export function unnaturalWordingReason(question: string): string | null {
  const odd = unnaturalReason(question ?? '');
  if (odd) return `unnatural wording: ${odd}`;
  const q = norm(question);
  if (!q) return 'empty question';
  if (/\bswitch(?:ing)? (?:over )?to for\b/.test(q)) {
    return 'unnatural wording: "who should I switch to for …" (a customer names the problem: "… if my plumber never turns up")';
  }
  if (/\bfor (?:[a-z]+ ){0,3}(?:maintenance|upkeep|needs|solutions|requirements)\b/.test(q)) {
    return 'unnatural wording: "… for <something> maintenance/needs" (a customer asks for the service itself: "boiler service in Bow")';
  }
  const svc = q.match(/\b(?:best|top|good|reliable|trusted|recommended|affordable|professional|quality)\s+(?:[a-z]+\s+){0,2}services?\s+for\s+([a-z0-9]+)/);
  if (svc && !AUDIENCE_AFTER_FOR.has(svc[1])) {
    return 'unnatural wording: "best <trade> service for <a service>" (ask for the service: "boiler repair in Southport")';
  }
  /* Stacked adjectives: two quality adjectives in a row ("best affordable", "reliable and trusted").
     "top rated" / "highly rated" / "best rated" / "five star" read as ONE. */
  const words = q.replace(/\b(?:top|highly|best|well|5|five) (?:rated|star)\b/g, 'rated').split(' ').filter((w) => w !== 'and' && w !== 'most' && w !== 'very');
  for (let i = 1; i < words.length; i++) {
    if (QUALITY_ADJ.has(words[i]) && QUALITY_ADJ.has(words[i - 1])) {
      return `unnatural wording: stacked adjectives ("${words[i - 1]} ${words[i]}")`;
    }
  }
  return null;
}

/* ── 2. TRADE ───────────────────────────────────────────────────────────────────────────────── */

/* ⚠️ A QUESTION-GENERATION LIST, NOT auditVerdict's TRADE_GROUPS. That one sorts competitor NAMES for
   the report (and counts "maintenance"/"repairs" as a trade, which would reject every repair
   question here). This one sorts the trade a QUESTION asks for. Matched on normalised text. Adding a
   word to a family can only make the guard reject MORE off-trade questions; it never touches a
   question that names one of the business's own families. */
const TRADE_FAMILIES: Array<{ family: string; re: RegExp }> = [
  { family: 'plumbing', re: /\b(plumb\w*|boilers?|central heating|heating engineers?|radiators?|gas engineers?|gas safe|gas safety|drains?|drainage)\b/ },
  { family: 'electrical', re: /\b(electric\w*|eicr|rewir\w*|fuse ?boards?|consumer units?|ev chargers?|pat testing|wiring)\b/ },
  { family: 'locksmith', re: /\b(locksmith\w*|locks?|lockouts?|locked out|key cutting|rekey\w*)\b/ },
  { family: 'roofing', re: /\b(roof\w*|gutter\w*|chimneys?)\b/ },
  { family: 'building', re: /\b(builders?|construction|bricklay\w*|brickwork|plaster\w*|loft conversions?|house extensions?)\b/ },
  { family: 'carpentry', re: /\b(carpent\w*|joiner\w*)\b/ },
  { family: 'decorating', re: /\b(painters?|decorat\w*)\b/ },
  { family: 'cleaning', re: /\b(cleaners?|cleaning)\b/ },
  { family: 'gardening', re: /\b(gardeners?|landscap\w*|tree surgeons?)\b/ },
  { family: 'accounting', re: /\b(accountan\w*|bookkeep\w*|tax returns?|self assessment|payroll|vat)\b/ },
  { family: 'legal', re: /\b(solicitors?|lawyers?|conveyancing)\b/ },
  { family: 'photography', re: /\bphotograph\w*\b/ },
  { family: 'video', re: /\b(videograph\w*|wedding films?|filmmak\w*)\b/ },
  { family: 'motor', re: /\b(mechanics?|mot|car garages?|car repairs?)\b/ },
  { family: 'dental', re: /\b(dentists?|dental)\b/ },
  { family: 'hair', re: /\b(hairdress\w*|barbers?|hair salons?)\b/ },
  { family: 'pest', re: /\bpest control\b/ },
  { family: 'removals', re: /\b(removals|removal firms?|removal compan\w*|man and van)\b/ },
  { family: 'glazing', re: /\b(glaziers?|glazing)\b/ },
  { family: 'hvac', re: /\b(air conditioning|air con)\b/ },
  { family: 'driving', re: /\bdriving (?:instructors?|lessons?|schools?)\b/ },
  { family: 'estate', re: /\b(estate agents?|letting agents?)\b/ },
  { family: 'tattoo', re: /\btattoo\w*\b/ },
];

export function tradeFamiliesIn(text: string): Set<string> {
  const t = norm(text);
  return new Set(TRADE_FAMILIES.filter((f) => f.re.test(t)).map((f) => f.family));
}

/** Reject a question about a trade the business does not offer. `services` is its listed /
 *  crawled services (specialisms, onboarding services, market topics). Null when fine. */
export function unrelatedTradeReason(question: string, businessType: string, services: readonly string[] = []): string | null {
  const own = tradeFamiliesIn([businessType, ...services].join(' , '));
  if (!own.size) return null;
  const asked = tradeFamiliesIn(question);
  if (!asked.size) return null;
  for (const f of asked) if (own.has(f)) return null;
  return `names a different trade (${[...asked].join('/')}) — the business is ${[...own].join('/')} and does not list it`;
}

/* ── 3. PLACE ───────────────────────────────────────────────────────────────────────────────── */

const UK_WORDS = new Set(['uk', 'united', 'kingdom', 'england', 'scotland', 'wales', 'britain', 'great', 'gb', 'british']);
const IRELAND_WORDS = new Set(['ireland', 'irish', 'republic', 'roi', 'eire']);
/** Northern Ireland places — UK, not the Republic. Two-word ones are matched as phrases. */
const NI_PLACES = ['northern ireland', 'belfast', 'derry', 'londonderry', 'newry', 'antrim', 'armagh', 'fermanagh', 'tyrone', 'lisburn', 'co down', 'county down'];

/** Words that sit inside a place without being one ("East London", "Co. Mayo", "the Hackney area"). */
const PLACE_FILLER = new Set([
  'the', 'area', 'areas', 'region', 'district', 'centre', 'center', 'city', 'town', 'county', 'co',
  'north', 'south', 'east', 'west', 'central', 'greater', 'inner', 'outer', 'upper', 'lower', 'nearby',
  'surrounding', 'local', 'all', 'of', 'borough', 'village', 'villages', 'suburbs', 'nationwide',
  'national', 'online', 'remote', 'remotely', 'anywhere', 'everywhere',
]);
/** A tail that starts like this is not a place ("in an emergency", "in my house"). */
const NOT_A_PLACE_START = new Set([
  'a', 'an', 'my', 'our', 'your', 'his', 'her', 'their', 'this', 'that', 'these', 'those', 'one', 'under',
  'less', 'time', 'stock', 'person', 'case', 'order', 'hurry', 'advance', 'total', 'general', 'particular',
  'bulk', 'it', 'them', 'me', 'us', 'need', 'touch', 'writing', 'house', 'home', 'store',
]);
/** Words that mean the tail is about the thing, not a place ("in house", "in chatgpt"). */
const NOT_A_PLACE = new Set([
  'house', 'home', 'homes', 'flat', 'flats', 'office', 'kitchen', 'bathroom', 'garden', 'loft', 'garage',
  'property', 'properties', 'building', 'emergency', 'winter', 'summer', 'spring', 'autumn', 'english',
  'irish', 'ai', 'chatgpt', 'google', 'gemini', 'search', 'results', 'answers', 'overviews', 'maps',
  'perplexity', 'copilot', 'bing', 'evening', 'evenings', 'weekend', 'weekends', 'morning', 'mornings',
  'minutes', 'hours', 'days', 'weeks', 'budget', 'landlords', 'households', 'businesses',
]);
/** Where the place part of a tail ends ("in Hackney UK with great reviews"). */
const TAIL_STOP = new Set([
  'for', 'with', 'that', 'who', 'which', 'to', 'do', 'does', 'did', 'open', 'on', 'at', 'from', 'by',
  'offering', 'offer', 'offers', 'can', 'could', 'will', 'would', 'is', 'are', 'if', 'when', 'so',
  'than', 'available', 'today', 'tonight', 'now', 'please', 'this', 'same', 'asap', 'urgently', 'quickly',
  'cheap', 'cheaply', 'without', 'under', 'within', 'after', 'before', 'during', 'how', 'what', 'where',
  'should', 'i', 'we', 'you', 'they', 'it',
]);

export interface QuestionPlaceContext {
  /** The business's own town as the questions carry it ("Hackney", "Stratford, East London"). */
  town: string;
  /** Its verified service areas / approved towns / counties. */
  areas?: readonly string[];
  /** Lead country ("UK", "Ireland", …). Only UK (or blank) and Ireland are judged. */
  country: string | null;
  /** The market word(s) a national / hybrid wider question may use ("uk", "ireland"). */
  marketWords?: readonly string[];
}

const isIreland = (country: string | null) => norm(country ?? '') === 'ireland' || norm(country ?? '') === 'ie';
const isUkOrBlank = (country: string | null) => {
  const c = norm(country ?? '');
  return !c || c === 'uk' || c === 'gb' || c === 'united kingdom' || c === 'england' || c === 'scotland' || c === 'wales';
};

/** Reject a question that names a place outside the business's area. Null when fine. */
export function placeOutsideAreaReason(question: string, ctx: QuestionPlaceContext): string | null {
  const ireland = isIreland(ctx.country);
  if (!ireland && !isUkOrBlank(ctx.country)) return null;   // other markets: unchanged
  const q = ` ${norm(question)} `;
  const places = [ctx.town, ...(ctx.areas ?? [])].map(norm).filter(Boolean);
  const placeTokens = new Set(places.flatMap((p) => p.split(' ')).filter((w) => w.length >= 2 && !PLACE_FILLER.has(w)));
  const areaText = ` ${places.join(' , ')} `;

  if (ireland) {
    for (const w of UK_WORDS) {
      if (w === 'great' || w === 'united') continue;
      if (q.includes(` ${w} `)) return `qualifies an Ireland business's question with "${w}" — Ireland is not the UK`;
    }
    for (const ni of NI_PLACES) {
      if (q.includes(` ${ni} `) && !areaText.includes(` ${ni} `)) return `names "${ni}" (Northern Ireland), which is not in the business's stated area`;
    }
  }

  const country = ireland ? IRELAND_WORDS : UK_WORDS;
  const market = new Set((ctx.marketWords ?? []).flatMap((m) => norm(m).split(' ')).filter(Boolean));
  const okWord = (w: string) => PLACE_FILLER.has(w) || country.has(w) || market.has(w) || /^\d+$/.test(w) || /^[a-z]{1,2}\d/.test(w) || w.length < 2;

  /* The place is what follows the LAST place preposition, up to the first word that ends it. */
  const m = [...q.matchAll(/ (?:in|near|around|across|covering|serving|throughout) /g)].pop();
  if (!m || m.index === undefined) return null;
  const tail: string[] = [];
  for (const w of q.slice(m.index + m[0].length).trim().split(' ').filter(Boolean)) {
    if (TAIL_STOP.has(w)) break;
    tail.push(w);
  }
  if (!tail.length || NOT_A_PLACE_START.has(tail[0])) return null;
  /* Each part ("Hackney and Bow") must START with a known place; what follows it qualifies it
     ("Shrewsbury Shropshire", "Westport Co Mayo", "Hackney London"). */
  const parts: string[][] = [[]];
  for (const w of tail) { if (w === 'and' || w === 'or') parts.push([]); else parts[parts.length - 1].push(w); }
  for (const part of parts) {
    const rest = part.filter((w, i) => !(i === 0 && w === 'the'));
    const lead = rest.find((w) => !okWord(w));
    if (!lead) continue;                       // only filler / country / market words
    if (placeTokens.has(lead)) continue;       // starts with the town or a service area
    if (rest.some((w) => NOT_A_PLACE.has(w))) continue;   // "in house", "in chatgpt": not a place
    if (part[0] === 'the' && !placeTokens.has(lead)) continue;   // "in the evenings": not judged
    return `names "${part.join(' ')}", which is not the business's town or service area (${places.join(', ') || 'none — a national market'})`;
  }
  return null;
}

/* ── THE FILTER ─────────────────────────────────────────────────────────────────────────────── */

export interface GeneratedQuestionContext extends QuestionPlaceContext {
  businessType: string;
  services?: readonly string[];
}

/** The one verdict: wording, then trade, then place. Null when the question is fine. */
export function generatedQuestionReason(question: string, ctx: GeneratedQuestionContext): string | null {
  return unnaturalWordingReason(question)
    ?? unrelatedTradeReason(question, ctx.businessType, ctx.services ?? [])
    ?? placeOutsideAreaReason(question, ctx);
}

/**
 * Drop unfit questions from a GENERATED set and top the count back up from the deterministic
 * templates. Mirrors dropOffTrade / dropMissingTown exactly: case-insensitive dedupe, templates
 * filtered by the same rule, and short (never padded) when both sources run dry.
 */
export function dropUnfitQuestions(
  generated: readonly string[],
  fallback: readonly string[],
  target: number,
  ctx: GeneratedQuestionContext,
): { questions: string[]; rejected: Array<{ question: string; reason: string }> } {
  const rejected: Array<{ question: string; reason: string }> = [];
  const seen = new Set<string>();
  const out: string[] = [];
  const take = (list: readonly string[]) => {
    for (const raw of list) {
      if (out.length >= target) return;
      const t = (raw ?? '').trim();
      if (!t) continue;
      const key = questionKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      const reason = generatedQuestionReason(t, ctx);
      if (reason) { rejected.push({ question: t, reason }); continue; }
      out.push(t);
    }
  };
  take(generated);
  take(fallback);
  return { questions: out, rejected };
}

/* ── HYBRID: A REAL MIX, CHECKED ───────────────────────────────────────────────────────────────
   The hybrid prompt asks for hybridAllocation's split, but a prompt is a request: a model that
   returns twelve local questions has produced a local audit wearing a hybrid label. Hold each side
   to its share and top it up from the same side of the hybrid templates (fallbackQuestions splits
   them the same way). Only if a side's templates also run dry is the other side allowed to fill the
   gap, so the COUNT never drops. */
export function balanceHybrid(
  questions: readonly string[],
  fallback: readonly string[],
  target: number,
  isLocal: (q: string) => boolean,
): { questions: string[]; local: number; wider: number; toppedUp: string[] } {
  const want = hybridAllocation(target);
  const seen = new Set<string>();
  /* ⚠️ ORDER IS PRESERVED: the model's order is its confidence ranking (capHeadTerms keeps it too). */
  const out: string[] = [];
  const spare: string[] = [];
  const toppedUp: string[] = [];
  let local = 0;
  let wider = 0;
  const add = (raw: string, fromTemplates: boolean) => {
    const q = (raw ?? '').trim();
    if (!q) return;
    const k = questionKey(q);
    if (seen.has(k)) return;
    seen.add(k);
    const isL = isLocal(q);
    if (isL ? local < want.local : wider < want.national) {
      out.push(q);
      if (isL) local++; else wider++;
      if (fromTemplates) toppedUp.push(q);
    } else if (!fromTemplates) spare.push(q);
  };
  for (const q of questions) add(q, false);
  for (const q of fallback) add(q, true);
  /* A side whose templates ran dry too: the other side's surplus fills the gap, so the count holds. */
  for (const q of spare) { if (out.length >= target) break; out.push(q); if (isLocal(q)) local++; else wider++; }
  return { questions: out.slice(0, target), local, wider, toppedUp };
}

/** Local side of a hybrid set: names the town or a service area. */
export function namesAreaPlace(question: string, town: string, areas: readonly string[] = []): boolean {
  return [town, ...areas].some((p) => !!norm(p) && mentionsTown(question, p));
}

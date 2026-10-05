/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CUSTOMER QUESTIONS — what a person actually types into ChatGPT, not a search keyword (2026-10-04,
   fix/04-ai-measurement, Session C finding C-02).

   🔴 WHY. Discovery wrote SEO keyword strings: "mortice lock replacement in whitstable uk",
   "fuse board upgrades Electricians in Nailsea UK". People ask AI assistants whole questions, and a
   client reading "non-destructive entry locksmith in faversham uk" four times in their own report
   concludes the tool does not understand their business. MCLocksmiths' hand-written set is the style
   to match: "Who can help if I'm locked out of my house in Canterbury?".

   ⛔ THE PROMPT ASKS, THIS MAKES SURE. create-ai-audit's Discovery prompt now asks for customer
   questions; whatever comes back (and every deterministic top-up) passes through toCustomerQuestion,
   so a keyword string can never reach a paid client's pool. It is IDEMPOTENT — a question already in
   customer form only has its town re-cased and its question mark ensured.

   ⛔ THE PLACE KEEPS ITS COUNTRY ("Canterbury, UK"). That suffix is what stops an engine answering about
   Canterbury, New Zealand (seedGuard.ts qualifyPlace, the Stamford-Connecticut incident). It is written
   the way a person writes it — with a comma — rather than dropped.

   ⛔ NEVER APPLIED TO A FROZEN OR LOCKED QUESTION. The Hook Audit's questions are kept verbatim (Paul,
   2026-09-30) and a frozen set is replayed word for word. This module only shapes NEW Discovery drafts.

   Pure, deterministic. IMPORTED BY AN EDGE FUNCTION (baseline-discovery): relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const QUESTION_START = /^(who|whos|who's|what|whats|what's|where|which|can|could|is|are|do|does|did|how|i|im|i'm|i've|ive|my|any|should|would|will|has|have|recommend|please)\b/i;

/** Does this already read as something a person asks (a question word first, or a question mark)? */
export function isCustomerQuestion(q: string): boolean {
  const s = String(q ?? '').trim();
  if (!s) return false;
  return /\?\s*$/.test(s) || QUESTION_START.test(s);
}

/** Title-case a town typed in lower case ("herne bay" → "Herne Bay"); leave a typed casing alone. */
export function townCase(town: string): string {
  const t = String(town ?? '').trim();
  if (!t || t !== t.toLowerCase()) return t;
  return t.replace(/\b([a-z])([a-z']*)/g, (_m, a: string, b: string) => a.toUpperCase() + b)
    .replace(/\b(On|Upon|Under|By|Le|In|The|Of|And)\b(?!$)/g, (w, _x, i: number) => (i === 0 ? w : w.toLowerCase()));
}

/** "Locksmiths" → "locksmith"; "Electrical Contractors" → "electrical contractor". */
export function tradeSingular(trade: string): string {
  const t = String(trade ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return 'local business';
  return t.replace(/(\w+)$/, (w) => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y`
    : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** "locksmith" → "locksmiths"; "accountancy" → "accountancy firms" is NOT attempted — a plain +s. */
export function tradePlural(trade: string): string {
  const s = tradeSingular(trade);
  if (/(s|x|ch|sh)$/.test(s)) return `${s}es`;
  if (/[^aeiou]y$/.test(s)) return `${s.slice(0, -1)}ies`;
  return `${s}s`;
}

const article = (word: string) => (/^[aeiou]/i.test(word) && !/^(uni|eu|one)/i.test(word) ? 'an' : 'a');

/** The place as a person writes it with its country: "Canterbury, UK". */
export function placeWithCountry(town: string, suffix = 'UK'): string {
  const t = townCase(town);
  return suffix.trim() ? `${t}, ${suffix.trim()}` : t;
}

/* ⛔ THE TWO MANDATORY CORE QUESTIONS (C-03). Session C's recommended 20 for a locksmith in Canterbury
   had no plain "locksmith in Canterbury" question at all. These two are the broadest genuine things a
   customer asks, so every new baseline draft carries both for the home town.
   ⚠️ THEY MUST STAY DIFFERENT INTENTS to the near-duplicate check (baselineMix.sameIntent): the first
   is a straight recommendation, the second is about reputation ("reviews" is a meaningful word), so
   approving both never trips the duplicate refusal. */
export function coreQuestions(trade: string, town: string, suffix = 'UK'): [string, string] {
  const one = tradeSingular(trade);
  const many = tradePlural(trade);
  const place = placeWithCountry(town, suffix);
  return [
    `Can you recommend ${article(one)} good ${one} in ${place}?`,
    `Which ${many} in ${place} have the best reviews?`,
  ];
}

/** One plain core question for a service area (not mandatory; one per approved area at most). */
export function areaCoreQuestion(trade: string, area: string, suffix = 'UK'): string {
  const one = tradeSingular(trade);
  return `Can you recommend ${article(one)} good ${one} in ${placeWithCountry(area, suffix)}?`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Words in front of the trade that only say what KIND of firm ("24 hour locksmith", "emergency
   plumber") — the question is then a recommendation, not "which X can do Y". */
const KIND_WORDS = new Set([
  'emergency', 'urgent', '24', 'hour', '24hour', '24-hour', 'mobile', 'local', 'reliable', 'trusted', 'affordable', 'cheap',
  'recommended', 'professional', 'qualified', 'experienced', 'independent', 'family', 'run', 'friendly', 'honest', 'fast',
  'good', 'best', 'top', 'rated', 'domestic', 'residential', 'certified', 'approved', 'accredited', 'registered', 'insured',
  'nearby', 'late', 'night', 'same', 'day', 'out', 'of', 'hours',
  // a kind of customer or vehicle, not a job: "commercial locksmith" is a recommendation question
  'commercial', 'business', 'landlord', 'auto', 'car', 'vehicle', 'industrial', 'office',
]);

export interface CustomerQuestionContext {
  trade: string;
  /** The approved towns (home first). The town found in the question is re-cased to these. */
  towns: string[];
  /** The country marker the place carries ("UK" for every UK client — placeSuffixForCountry). */
  countrySuffix?: string;
}

/**
 * Turn a keyword search string into the question a customer would ask. Idempotent.
 *   "mortice lock replacement in whitstable uk"   → "Who offers mortice lock replacement in Whitstable, UK?"
 *   "24 hour locksmith in canterbury uk"          → "Can you recommend a 24 hour locksmith in Canterbury, UK?"
 *   "best emergency locksmith in canterbury uk"   → "Who is the best emergency locksmith in Canterbury, UK?"
 *   "fuse board upgrades Electricians in Nailsea UK" → "Which electrician in Nailsea, UK can do fuse board upgrades?"
 * A string naming no approved town is only tidied — it is excluded later anyway (no approved town).
 */
export function toCustomerQuestion(question: string, ctx: CustomerQuestionContext): string {
  const suffix = (ctx.countrySuffix ?? 'UK').trim();
  let s = String(question ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return s;
  /* Find the approved town (longest first) and put it back in its proper case. */
  const towns = ctx.towns.filter((t) => t && t.trim()).sort((a, b) => b.length - a.length);
  const town = towns.find((t) => new RegExp(`(^|[^a-z])${escapeRe(t.trim())}([^a-z]|$)`, 'i').test(s)) ?? null;
  const countryRe = suffix ? new RegExp(`(,\\s*|\\s+)(?:${escapeRe(suffix)}|uk|united kingdom|england|great britain|gb)\\b\\.?`, 'i') : null;

  if (isCustomerQuestion(s)) {
    if (town) {
      // Re-case the town and make sure it carries ", UK" exactly once.
      const re = new RegExp(`${escapeRe(town.trim())}((?:,\\s*|\\s+)(?:uk|united kingdom|england|great britain|gb)\\b)?`, 'i');
      s = s.replace(re, placeWithCountry(town, suffix));
    }
    s = s.charAt(0).toUpperCase() + s.slice(1);
    return /\?\s*$/.test(s) ? s.replace(/\s*\?\s*$/, '?') : `${s.replace(/[.!\s]+$/, '')}?`;
  }

  if (!town) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
    return `${s.replace(/[.!?\s]+$/, '')}?`;
  }
  /* Split "<subject> in <town> <country>" / "<subject> <town> <country>". */
  const lower = s.toLowerCase();
  const tIdx = lower.lastIndexOf(town.trim().toLowerCase());
  let subject = s.slice(0, tIdx).replace(/\b(in|near|around|for|at)\s*$/i, '').trim();
  let after = s.slice(tIdx + town.trim().length).trim();
  if (countryRe) after = after.replace(new RegExp(`^(,\\s*)?(?:${escapeRe(suffix)}|uk|united kingdom|england|great britain|gb)\\b\\.?`, 'i'), '').trim();
  after = after.replace(/^[,.\s]+/, '').trim();
  const place = placeWithCountry(town, suffix);

  /* "best / top rated / recommended" in front → a "who is the best" question. */
  const best = /^(?:the\s+)?(best|top[- ]rated|top|most recommended|highest rated)\s+/i.exec(subject);
  if (best) subject = subject.slice(best[0].length).trim();
  const one = tradeSingular(ctx.trade);
  const tradeWords = new Set([one, tradePlural(ctx.trade), ctx.trade.trim().toLowerCase()]);
  const words = subject.split(/\s+/).filter(Boolean);
  const last = (words[words.length - 1] ?? '').toLowerCase();
  const endsWithTrade = tradeWords.has(last) || (one.includes(' ') && subject.toLowerCase().endsWith(one));
  const tail = after ? ` ${after}` : '';

  let out: string;
  if (!subject) {
    out = best ? `Who is the best ${one} in ${place}${tail}?` : `Can you recommend ${article(one)} good ${one} in ${place}${tail}?`;
  } else if (endsWithTrade) {
    const before = words.slice(0, -(one.includes(' ') && !tradeWords.has(last) ? one.split(' ').length : 1));
    const kindOnly = before.every((w) => KIND_WORDS.has(w.toLowerCase()));
    if (best) out = `Who is the best ${[...before, one].join(' ').toLowerCase()} in ${place}${tail}?`;
    else if (!before.length || kindOnly) {
      const phrase = [...before, one].join(' ').toLowerCase();
      out = `Can you recommend ${article(phrase)} ${phrase} in ${place}${tail}?`;
    } else out = `Which ${one} in ${place} can do ${before.join(' ').toLowerCase()}${tail}?`;
  } else {
    const service = subject.toLowerCase();
    out = best ? `Who is the best for ${service} in ${place}${tail}?` : `Who offers ${service} in ${place}${tail}?`;
  }
  return out.replace(/\s+/g, ' ').replace(/\s+\?$/, '?');
}

/** Keyword-style (not a customer question) — the warning in baselineQuality.ts. */
export const isKeywordStyle = (q: string) => !isCustomerQuestion(q);

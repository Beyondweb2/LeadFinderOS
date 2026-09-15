/* ══════════════════════════════════════════════════════════════════════════════════════════
   NAME MATCHING — the one implementation, extracted 2026-08-29 so BOTH sides can use it.

   ⛔ EXTRACTED VERBATIM from supabase/functions/_shared/enrichment/ai-search.ts, which re-imports
   and re-exports it, so there is exactly ONE matcher and no copy to drift. It moved because the
   report renderer needs it: the report now derives "recommended in the prose" from the STORED
   answer_text at render time, and the renderer runs in BOTH the SPA and Deno — but ai-search.ts is
   an edge module (it drives the Apify actor), so the SPA could never import it. Same reason
   marketAuditThreshold.ts, knownEntities.ts and qaAnswerGuard.ts are leaves.

   ⚠️ ZERO DEPENDENCIES, DELIBERATELY. Nothing here may import anything: an edge function reaches
   it through a relative .ts path, and any import it gained would have to resolve for Deno too.
   ══════════════════════════════════════════════════════════════════════════════════════════ */
/* ── name matching (connector/shortening-robust) ──────────────────────────────
 * The old full-string contains() failed on ordinary brand variance: stored
 * "Sinners and Saints pool bar and kava cafe" vs AI's "Sinners N Saints …" (and/N,
 * plus AI shortening to the leading brand), so clear namings read "not named". These
 * helpers match a DISTINCTIVE CORE robustly — punctuation-stripped, connectors (&/and/n)
 * canonicalised, accents folded — with a strength guard so a weak/generic core can't
 * over-match. Deliberately NO phonetic/spelling folding (e.g. cafe↔kafe) — too risky. */
const NAME_CONNECTORS = new Set(["and", "n"]);                    // &/and/n → one canonical token
const NAME_STOPWORDS = new Set(["the", "a", "an", "of", "for"]);  // ignored when judging core strength
// Generic venue/trade/legal descriptors — the brand CORE is whatever LEADS before the first of
// these. Conservative by design (extend as needed); only used to find the distinctive segment.
const GENERIC_NAME_TOKENS = new Set([
  "pool", "bar", "cafe", "kava", "restaurant", "grill", "kitchen", "lounge", "club", "pub", "bistro",
  "diner", "eatery", "salon", "barbers", "barber", "spa", "clinic", "dental", "dentist", "plumbing",
  "plumber", "electrical", "electrician", "builders", "building", "roofing", "garage", "motors",
  "cars", "accountants", "accountant", "accountancy", "solicitors", "solicitor", "law", "legal",
  "consulting", "consultants", "services", "service", "group", "associates", "partners",
  "partnership", "studio", "gym", "fitness", "hotel", "shop", "store", "boutique",
  "ltd", "limited", "llp", "llc", "inc", "co", "company", "plc", "gmbh", "corp", "corporation",
]);

/** Canonical token stream for name matching: lowercase, fold accents (café→cafe), ampersand→"and",
 *  strip punctuation/apostrophes, collapse whitespace, and canonicalise connector tokens
 *  (&/and/n all become "and"). No phonetic folding — matching stays exact per token. */
/** trim + lowercase. Inlined rather than imported: this leaf must stay dependency-free, and
 *  ai-search.ts keeps its own copy for the `contains` helper that never moved. One line, no rule. */
const norm = (s: string): string => String(s ?? '').trim().toLowerCase();

export function normalizeForMatch(s: string): string {
  return norm(s)
    .normalize("NFD").replace(/\p{Diacritic}/gu, "") // fold accents so café == cafe
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]+/g, " ")                     // drop punctuation/apostrophes
    .split(/\s+/).filter(Boolean)
    .map((t) => (NAME_CONNECTORS.has(t) ? "and" : t))
    .join(" ");
}

/** Distinctive leading brand segment (normalised) — everything before the first generic
 *  descriptor. "Sinners N Saints Pool Bar and Kava Cafe" → "sinners and saints". */
export function businessCore(businessName: string): string {
  const tokens = normalizeForMatch(businessName).split(/\s+/).filter(Boolean);
  const core: string[] = [];
  for (const t of tokens) {
    if (GENERIC_NAME_TOKENS.has(t)) break;
    core.push(t);
  }
  while (core.length && NAME_CONNECTORS.has(core[core.length - 1])) core.pop(); // trim trailing connector
  return core.join(" ");
}

/** Exact contiguous run of `needle` tokens inside `hay` tokens (word-level — connectors and
 *  punctuation are already canonical, so no mid-word false hits). */
export function tokensContain(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

/* ══ THE SHORTENED-NAME MISS, AND THE RULE THAT FIXES IT WITHOUT INVENTING MATCHES ════════════
   ⛔ THE FAULT. businessCore truncates at the first GENERIC_NAME_TOKEN. "accountants" is in that
   list, "chartered" is not — so "Lewis Brownlee Chartered Accountants" needs the exact run
   "lewis brownlee chartered", and an answer saying just "Lewis Brownlee" is recorded as NOT named.
   Telling a business it was never named when AI named it is the worst thing this product does; it
   is the complaint that cost two prospects.

   ⛔ AND WHY NOT SIMPLY LOOSEN IT. A shorter needle errs the other way: "Cambridge Driving" would
   match "Cambridge Driving Academy" and tell a business it was named when a RIVAL was. That is the
   same lie pointing the other direction.

   ✅ THE RULE: try the LONGEST proper prefix of the core that is still DISTINCTIVE — the same
   question `supabase/functions/_shared/derivable.ts` asks. (That file was deleted with the
   market-audit pass and RESTORED 2026-09-15 — it is live again, and `nameIsJudgeable` there is what
   decides whether a `named` flag this function set may be counted at all.) Strip the trade, the town
   and legal suffixes, then require BOTH:
     * ≥4 characters of substance, and
     * at least one token that could actually NAME a firm: alphabetic, ≥2 chars, not a service word.
   The second test is what makes it safe. Without it the rule matched "24 hour" against "open 24
   hours", and "24 7 emergency plumbers" against "reputable 24 7 emergency plumbing options" —
   business names that BEGIN with a service phrase. Digits cannot name a firm and "emergency"
   describes an offer.

   MEASURED over all 1,720 scored datapoints in the database: 8 newly named across 5 businesses,
   ZERO new false positives (mechanically — the needle never also prefixes a different firm named in
   the same answer — and on reading all eight). 1,045 datapoints are DECLINED, keeping today's
   behaviour exactly.

   ⚠️ WHAT IT DELIBERATELY DOES NOT FIX: abbreviations ("jo kurz ifa" for "Jo Kurz Independent
   Financial Adviser") are not prefixes, and a weak remainder ("S.T Locksmiths" strips to "s t")
   would match half a town. Both keep the strict behaviour.

   ⚠️ THE CONTEXT IS OPTIONAL AND ABSENCE MEANS THE OLD BEHAVIOUR, EXACTLY. Every existing caller
   passes two arguments and is bit-for-bit unchanged — that is the safety property, and it is why
   this is additive rather than a rewrite of the flag that decides every audit ever run. */

/** Service words that describe an offer rather than name a firm. */
const GENERIC_SERVICE_TOKENS = new Set([
  "emergency", "hour", "hours", "hr", "hrs", "local", "mobile", "professional", "expert", "experts",
  "quality", "best", "cheap", "affordable", "fast", "rapid", "quick", "same", "day", "near", "me",
  "call", "out", "callout", "repair", "repairs", "solutions", "group", "trade", "trades",
]);
/** Legal / connective forms that carry no identity. */
const NAME_LEGAL_TOKENS = new Set([
  "ltd", "limited", "llp", "plc", "the", "and", "co", "company", "uk", "services", "service",
]);

export interface NameMatchContext {
  /** The audit's business_type. Its tokens (and their plural/singular pair) are not identity. */
  trade?: string | null;
  /** The audit's location_text. Same. */
  town?: string | null;
}

/* Tokens that carry no identity in this market. Built inline rather than from market-match.ts's
   buildMatchContext: that module imports FROM this one, and closing the loop would make the import
   graph circular for a handful of set members. */
function contextNoise(ctx: NameMatchContext): { noise: Set<string>; stems: string[] } {
  const noise = new Set<string>(NAME_LEGAL_TOKENS);
  const add = (raw: string | null | undefined) => {
    for (const t of normalizeForMatch(String(raw ?? "")).split(/\s+/).filter(Boolean)) {
      noise.add(t);
      noise.add(t.replace(/s$/, ""));
      noise.add(`${t}s`);
    }
  };
  add(ctx.trade);
  add(ctx.town);
  const stems = normalizeForMatch(String(ctx.trade ?? "")).split(/\s+/).filter((t) => t.length >= 5);
  return { noise, stems };
}

/** A trade word in another grammatical form is still a trade word: plumbers/plumbing share 5. */
function sharesTradeStem(t: string, stems: string[]): boolean {
  if (t.length < 5) return false;
  return stems.some((st) => {
    let i = 0;
    while (i < t.length && i < st.length && t[i] === st[i]) i++;
    return i >= 5;
  });
}

/** The longest proper prefix of `coreTokens` that still says who this is, or null. */
function distinctivePrefix(coreTokens: string[], ctx: NameMatchContext): string[] | null {
  const { noise, stems } = contextNoise(ctx);
  for (let len = coreTokens.length - 1; len >= 2; len--) {
    const prefix = coreTokens.slice(0, len);
    const rest = prefix.filter((t) => !noise.has(t) && !sharesTradeStem(t, stems));
    if (rest.join("").length < 4) continue;
    /* ⛔ SOMETHING THAT COULD NAME A FIRM. Digits and service words cannot. */
    if (!rest.some((t) => /^[a-z]{2,}$/.test(t) && !GENERIC_SERVICE_TOKENS.has(t))) continue;
    return prefix;
  }
  return null;
}

/** Does `haystack` NAME the business? Matches the distinctive core when it's strong enough
 *  (≥2 meaningful words, OR one word ≥6 chars); else falls back to the FULL normalised name so a
 *  weak/generic core (e.g. "the") can't over-match on a fragment.
 *
 *  With `ctx`, a shortened prefix is tried ONLY after the strict match fails — see the block above. */
export function nameMatches(haystack: string, businessName: string, ctx?: NameMatchContext): boolean {
  const hay = normalizeForMatch(haystack).split(/\s+/).filter(Boolean);
  if (!hay.length) return false;
  const coreTokens = businessCore(businessName).split(/\s+/).filter(Boolean);
  const meaningful = coreTokens.filter((t) => !NAME_CONNECTORS.has(t) && !NAME_STOPWORDS.has(t));
  const strong = meaningful.length >= 2 || meaningful.some((t) => t.length >= 6);
  const needle = strong && coreTokens.length
    ? coreTokens
    : normalizeForMatch(businessName).split(/\s+/).filter(Boolean);
  if (tokensContain(hay, needle)) return true;

  /* ⛔ SECOND READING, NOT A REPLACEMENT. Reached only when the strict match has already failed, so
     nothing that matches today can stop matching. No context means no second reading at all. */
  if (!ctx || (!ctx.trade && !ctx.town)) return false;
  const shorter = distinctivePrefix(coreTokens, ctx);
  return shorter ? tokensContain(hay, shorter) : false;
}

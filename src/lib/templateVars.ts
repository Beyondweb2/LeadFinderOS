/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MAKING A STORED VALUE SAFE FOR A META TEMPLATE VARIABLE.

   `video_template`'s body reads "... for a {{2}} in {{3}}", so {{2}} has to be a SINGULAR, LOWERCASE
   trade noun and {{3}} a plain town name. Neither column guarantees that, and the measurement is
   not close:

     ai_audits.business_type, all 968 audits carrying one, 24 distinct values (2026-09-12)
       362 "Locksmiths"   268 "Plumbers"   78 "Driving instructors"   29 "Accountants"  …
       753 of 968 (78%) are NOT lowercase, and the four biggest are PLURAL.

   So the default rendering was "for a Locksmiths in Huntingdon" on 78% of sends — not an edge case,
   the majority case. Lowercasing alone does not fix it: the top four are plural, and "for a
   locksmiths in Huntingdon" is just as wrong.

   ⛔ NORMALISE HERE, AT THE PAYLOAD LAYER, NEVER IN THE DATABASE (Paul, 2026-09-12).
   `business_type` is what the operator typed and what the audit measured — "Locksmiths" is a true
   description of the market that was audited. Rewriting the column would destroy the record to suit
   one template's grammar, and the next template with different grammar would want it back.

   ⛔ AND AN UNSAFE VALUE BLOCKS THE SEND. It does not get sent wrong and it does not get guessed at.
   A blocked send is one lead the operator can look at; a wrong send is a prospect reading "for a
   Shoe repairs & watch battery replacement in Wisbech" and deciding we are a bot.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type VarCheck =
  | { ok: true; value: string }
  | { ok: false; reason: string; detail: string };

/* ── THE TRADE ───────────────────────────────────────────────────────────────────────────────────
   ⛔ THE EXPLICIT MAP IS FIRST AND IS THE AUTHORITY. Every value that actually appears in volume is
   named here, so the big four are decided by a human rather than by a rule that happens to work.
   The fallback exists for the long tail and for whatever gets typed next week — it is the safety
   net, not the mechanism.
   ⚠️ KEYS ARE LOWERCASE because the input is lowercased before lookup, which is what lets one entry
   cover "Locksmiths", "locksmiths" and "LOCKSMITHS".
   ⚠️ Paul appends to this map by hand, the same convention as directoryFacts and knownEntities. */
export const TRADE_SINGULAR: Readonly<Record<string, string>> = {
  locksmiths: "locksmith",
  locksmith: "locksmith",
  plumbers: "plumber",
  plumber: "plumber",
  "driving instructors": "driving instructor",
  "driving instructor": "driving instructor",
  accountants: "accountant",
  accountant: "accountant",
  electricians: "electrician",
  electrician: "electrician",
  "mobile mechanics": "mobile mechanic",
  "mobile mechanic": "mobile mechanic",
  "mobile valeting": "mobile valeter",
  "mobile valeting and detailing": "mobile valeter",
  /* ⚠️ MAPPED, NOT BLOCKED (Paul, 2026-09-12). "hospitality" passes every mechanical rule — it is
     singular, lowercase and consonant-initial — and still renders "for a hospitality in Bath",
     because it is an ABSTRACT NOUN naming a sector rather than a countable business. No rule
     catches that: the fix is a word, so it belongs in the map, which is what the map is for.
     ⚠️ "hospitality business" keeps the consonant-initial "a" and claims nothing the audit did not
     measure — a kava bar and a hotel are both hospitality businesses. */
  hospitality: "hospitality business",
  /* ⛔ THE UNCOUNTABLE FORMS PEOPLE ACTUALLY TYPE (Paul, 2026-09-13). "plumbing" is a real word
     that passed every guard and rendered "for a plumbing in Andover" — it names the WORK, not the
     person who does it. A free-check visitor types their trade themselves, so these arrive
     verbatim ("Plumbing" is on a real submission). Each maps to the countable trade it means.
     ⚠️ "electrics" and "accountancy" map correctly AND ARE STILL HELD, by the article rule below:
     "electrician" and "accountant" start with a vowel sound and the approved body says "for a".
     The map says what the trade is called; it does not say the sentence can carry it. To send
     those, map them to a consonant-initial phrase instead (e.g. "local electrical company").
     ⚠️ Anything uncountable that is NOT here BLOCKS — see UNCOUNTABLE_TRADE_ENDINGS and
     UNCOUNTABLE_TRADE_WORDS below. A held lead Paul can see beats another "for a plumbing".
     ✅ AND THE ARTICLE HOLD IS SINGULAR-PATH ONLY SINCE 2026-09-14. `pluraliseTrade` (bottom of this
     file) reads the SAME map for a template whose body carries no article, so "accountancy" and
     "electrics" DO send there, as "accountants" and "electricians". The map was never the problem;
     one sentence's hardcoded "a" was. */
  plumbing: "plumber",
  electrics: "electrician",
  locksmithing: "locksmith",
  accountancy: "accountant",
  bookkeeping: "bookkeeper",
  "driving lessons": "driving instructor",
  "car valeting": "mobile valeter",
};

/* ══ UNCOUNTABLE TRADE WORDS BLOCK; THEY ARE NEVER GUESSED AT (Paul, 2026-09-13) ═════════════════
   The map above catches the forms we have seen. Everything it has not seen still has to be safe,
   and "safe" here means BLOCKED with a reason, because the alternative is the guess that produced
   "for a plumbing". Two mechanical nets, applied to the LAST word after the map misses:

   1. A word ending in "-ing" names an activity, never a person: roofing, plastering, cleaning,
      catering, tiling, guttering, paving, heating, valeting, decorating, landscaping, fitting,
      detailing. No trade anyone hires is a countable "-ing" noun, so the suffix alone is decisive.
   2. A short curated list of the abstractions and adjectives that end some other way — the
      "-ry"/"-cy" activity nouns (joinery, carpentry, upholstery, masonry, dentistry), the therapies,
      the plural-only trade nouns ("removals", which the singulariser would otherwise turn into a
      countable-looking "removal"), and the adjectives people type as if they were trades ("dental",
      "electrical", "veterinary") — each of which passes the plural and article rules and still
      cannot follow "a".
   ⚠️ Every word here is ADDED to the map, never removed from it: listing "plumbing" in the block
   set does nothing, because the map is consulted first and wins. Paul appends to both by hand. */
const UNCOUNTABLE_TRADE_ENDINGS = /ing$/;
export const UNCOUNTABLE_TRADE_WORDS: ReadonlySet<string> = new Set([
  // activity nouns that do not end in -ing
  "joinery", "carpentry", "upholstery", "masonry", "brickwork", "stonework", "groundwork",
  "dentistry", "physiotherapy", "physio", "osteopathy", "chiropody", "podiatry", "chiropractic",
  "aesthetics", "beauty", "massage", "nails", "lashes", "brows",
  "security", "insurance", "storage", "haulage", "drainage", "insulation", "refrigeration",
  "ventilation", "conveyancing", "recruitment", "signage", "printing", "photography",
  // plural-only trade nouns (the singulariser would make these look countable)
  "removals", "repairs", "services", "solutions", "maintenance", "installations",
  // adjectives typed as trades
  "dental", "electrical", "mechanical", "veterinary", "financial", "legal", "medical", "clinical",
  "domestic", "commercial", "industrial", "residential",
]);

/* A value naming SEVERAL trades cannot become "a <noun>" at all, whatever we do to its plurals:
   "kava cafe, pool bar" and "Shoe repairs & watch battery replacement" are lists, not nouns.
   ⛔ These BLOCK rather than getting a best guess, and the block names the value so Paul can add a
   map entry if he wants those leads sendable. */
const MULTI_CLAUSE = /[,&/]|\band\b/;

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 {{2}} MAY NEVER START WITH A VOWEL SOUND, AND THAT IS A CONSTRAINT FROM META, NOT A STYLE
   CHOICE. DO NOT "FIX" THIS BY DELETING THE CHECK.

   video_template's APPROVED body hardcodes the article:

       "When people ask ChatGPT or Gemini for a {{2}} in {{3}}, ..."

   `a` is in the registered text at Meta. {{2}} is a bare singular lowercase noun with no article of
   its own, so the moment it begins with a vowel sound the sentence reads "for a accountant in
   Peterborough" — to a prospect, on the first message they ever get from us. Measured 2026-09-12:
   that is 113 of 968 audits (12%), almost all accountants and electricians.

   ⛔ THE TEMPLATE IS NOT BEING EDITED (Paul's decision, 2026-09-12). Changing the body means a new
   Meta submission and re-review, and he is only contacting trades that take "a" — locksmith,
   plumber, driving instructor, mobile mechanic, mobile valeter — all of which read correctly today.
   So the code's job is to REFUSE the ones that do not, exactly as it refuses "kava cafe, pool bar"
   and "Bourne uk". A held lead he can see beats 113 messages saying "for a accountant".

   ⚠️ THE WORKAROUND, FOR WHEN THOSE TRADES ARE WANTED: add a TRADE_SINGULAR entry mapping the value
   to a CONSONANT-INITIAL phrase that means the same thing, e.g.
       electrician  ->  "local electrical company"
       accountant   ->  "local accountancy firm"
   That keeps the approved body untouched and needs no Meta review. It is a copy decision, so Paul
   makes it; the map is where it lands.
   ⚠️ And it is a vowel SOUND, not a vowel letter: "a university tutor" and "an hour" both break a
   naive first-letter test, which is why the two exception lists below exist.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Looks vowel-initial, sounds consonant-initial — these take "a". */
const CONSONANT_SOUND_DESPITE_VOWEL = /^(?:uni|use|usu|uti|utu|eu|ewe|one)/;
/** Looks consonant-initial, sounds vowel-initial — these take "an". */
const VOWEL_SOUND_DESPITE_CONSONANT = /^(?:hour|honest|honou?r|heir)/;

/** Would this word be preceded by "an" rather than "a"? */
function startsWithVowelSound(word: string): boolean {
  if (VOWEL_SOUND_DESPITE_CONSONANT.test(word)) return true;
  if (CONSONANT_SOUND_DESPITE_VOWEL.test(word)) return false;
  return /^[aeiou]/.test(word);
}

/* Words that must never have a trailing "s" stripped: the result would not be a word.
   ⚠️ THE LENGTH RULE IS THE REAL GUARD. "gas" → "ga" is the failure this prevents, and a minimum
   of four characters before stripping covers it without needing to enumerate English. The explicit
   endings are the ones where a short word would still pass that bar. */
const KEEP_TRAILING_S = /(?:ss|us|is)$/;

/* 4. THE ARTICLE, applied to EVERY path out of normaliseTrade. See the long note above
      CONSONANT_SOUND_DESPITE_VOWEL: the approved body says "for a {{2}}", so a vowel-sound trade is
      unsendable until it is mapped to a consonant-initial phrase. Checked on the FIRST word,
      because that is the one the article touches. */
function articleCheck(value: string, original: string): VarCheck {
  if (startsWithVowelSound(value.split(" ")[0])) {
    return { ok: false, reason: "trade_starts_with_vowel_sound", detail: original };
  }
  return { ok: true, value };
}

/**
 * Turn a stored `business_type` into something that can follow "a " in a sentence.
 * Map first, then lowercase + singularise the final word. Blocks rather than guessing.
 */
export function normaliseTrade(raw: string | null | undefined): VarCheck {
  const trimmed = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return { ok: false, reason: "trade_missing", detail: "" };

  const lower = trimmed.toLowerCase();

  /* 1. The map wins. Checked BEFORE the multi-clause block on purpose: "mobile valeting and
        detailing" contains " and " and would otherwise be refused, but it has a known answer.
        ⛔ A MAPPED VALUE IS STILL ARTICLE-CHECKED. The first version returned here immediately,
        which quietly defeated the whole point of step 4: `accountants -> accountant` and
        `electricians -> electrician` are correct singularisations AND vowel-initial, so the two
        trades the block exists for were the two that skipped it. The map says what a trade is
        CALLED; it does not say the approved sentence can carry it. */
  const mapped = TRADE_SINGULAR[lower];
  if (mapped) return articleCheck(mapped, trimmed);

  if (/\d/.test(lower)) return { ok: false, reason: "trade_has_digits", detail: trimmed };
  if (MULTI_CLAUSE.test(lower)) return { ok: false, reason: "trade_not_a_single_noun", detail: trimmed };

  /* 1b. UNCOUNTABLE → BLOCK. Checked on the LAST word, before singularising, because that is the
         word the article attaches to ("gas heating" is held on "heating"; "carpet cleaning" on
         "cleaning"). The map has already had its chance above, so a listed word here is by
         definition one nobody has decided a countable name for yet. */
  const words = lower.split(" ");
  const last = words[words.length - 1];
  if (UNCOUNTABLE_TRADE_ENDINGS.test(last) || UNCOUNTABLE_TRADE_WORDS.has(last)) {
    return { ok: false, reason: "trade_uncountable", detail: trimmed };
  }

  /* 2. Singularise the LAST word only — "driving instructors" is pluralised on "instructors", and
        touching "driving" would produce nonsense. */
  if (last.endsWith("s") && !KEEP_TRAILING_S.test(last) && last.length >= 4) {
    words[words.length - 1] = last.slice(0, -1);
  }
  const value = words.join(" ");

  /* 3. THE BACKSTOP: if the result is STILL plural after step 2, refuse rather than send it.
        ⛔ IT CARRIES THE SAME LENGTH GUARD AS STEP 2, AND THE FIRST VERSION DID NOT — which blocked
        "gas" and "lens" as plurals. They are singular words that happen to end in s, step 2
        correctly declined to strip them, and then this line called that failure. A backstop that
        contradicts the rule it is backing up is worse than no backstop.
        ⚠️ SO IT IS UNREACHABLE TODAY, deliberately: anything step 2 could strip, it did. It exists
        so that a future change to step 2 which stops stripping something cannot silently start
        sending plurals. `scripts/template-vars.test.ts` drives the words that prove the guard. */
  const out = value.split(" ").slice(-1)[0];
  if (out.length >= 4 && out.endsWith("s") && !KEEP_TRAILING_S.test(out)) {
    return { ok: false, reason: "trade_still_plural", detail: trimmed };
  }

  /* 4. THE ARTICLE — see articleCheck. */
  return articleCheck(value, trimmed);
}

/* ── THE TOWN ────────────────────────────────────────────────────────────────────────────────────
   Measured the same day: 240 distinct `ai_audits.location_text` values, 238 are plain town names.
   The two that are not would have rendered verbatim into "in {{3}}":
       "Bourne uk"  (4 audits)      "GF3a"  (1 audit)
   ⛔ Both BLOCK. "Bourne uk" is tempting to fix by stripping the " uk" — that is the guess this
   file exists to refuse. A town we cannot read is a lead for Paul to look at, not a message to
   improvise. */
const PLAIN_TOWN = /^[A-Za-z][A-Za-z'’.\- ]*$/;
/* Tokens that prove the value is a search string rather than a town name. Whole words only, so
   "Ukfield" and "Englefield Green" are untouched — the substring trap this file must not fall into. */
const NOT_A_TOWN_TOKEN = /\b(?:uk|gb|england|scotland|wales|ni|united|kingdom|near|me)\b/i;

/** Is this a plain place name we are willing to print in a customer-facing message? */
export function normaliseTown(raw: string | null | undefined): VarCheck {
  const trimmed = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return { ok: false, reason: "town_missing", detail: "" };
  if (trimmed.length < 2 || trimmed.length > 60) return { ok: false, reason: "town_implausible_length", detail: trimmed };
  if (!PLAIN_TOWN.test(trimmed)) return { ok: false, reason: "town_not_a_place_name", detail: trimmed };
  if (NOT_A_TOWN_TOKEN.test(trimmed)) return { ok: false, reason: "town_carries_a_search_token", detail: trimmed };
  return { ok: true, value: trimmed };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   🟢 THE PLURAL SLOT — pluraliseTrade, the sibling of normaliseTrade, AND IT DELIBERATELY HAS NO
   ARTICLE CHECK.

   `competitor_hook`'s approved body reads "…to find {{2}} in your area", with no article in front
   of it, so {{2}} must be a LOWERCASE PLURAL trade noun ("plumbers", "accountants"). Everything
   normaliseTrade blocks for being unreadable — digits, multi-clause lists, uncountable activity
   nouns — is blocked here too, by the same rules, because those faults are about the VALUE.

   ⛔ THE VOWEL RULE IS NOT ONE OF THEM, AND DROPPING IT IS THE POINT OF THIS FUNCTION.
   `startsWithVowelSound` exists solely because video_template's registered text hardcodes "for a
   {{2}}" — it is a fact about ONE SENTENCE, not about the trade. In a plural sentence there is no
   article to disagree with, so "find accountants in your area" and "find electricians in your area"
   are simply correct.
   ✅ MEASURED 2026-09-14: 113 of 968 stored audits (12%) — almost entirely accountants and
   electricians — are unsendable on video_template for that reason alone. Every one of them can
   receive this template. That is the widest single gain in this build, and it is why the plural
   path is a separate function rather than a flag on the singular one: a flag would have invited
   someone to pass it on the singular path and put "for a accountants" in front of a prospect.

   ⚠️ AND THE STORED DATA IS ALREADY MOSTLY WHAT THIS WANTS. 753 of 968 values are not lowercase and
   the four commonest are PLURAL ("Locksmiths", "Plumbers"), so the usual job here is lowercasing a
   value that is already correct — strictly fewer transformations than the singular path, and
   therefore fewer ways to be wrong.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Is this word already a plural we should leave alone? Mirrors normaliseTrade's step 2 exactly —
 *  the same length floor and the same ss/us/is exceptions — so the two functions can never disagree
 *  about whether a word like "gas" or "lens" is singular. */
function alreadyPlural(word: string): boolean {
  return word.length >= 4 && word.endsWith("s") && !KEEP_TRAILING_S.test(word);
}

/** Regular English plural of one lowercase word. Only the rules that fire on real trade nouns. */
function pluraliseWord(word: string): string {
  if (alreadyPlural(word)) return word;
  // gas → gases, church → churches, box → boxes, business → businesses
  if (/(?:s|ss|sh|ch|x|z)$/.test(word)) return word + "es";
  // bakery → bakeries, but NOT survey → surveys (vowel before the y)
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + "ies";
  return word + "s";
}

/**
 * Turn a stored `business_type` into a LOWERCASE PLURAL trade noun for a template slot that carries
 * no article ("find {{2}} in your area"). Map first, then pluralise the final word. Blocks rather
 * than guessing, exactly as normaliseTrade does — minus the article rule.
 */
export function pluraliseTrade(raw: string | null | undefined): VarCheck {
  const trimmed = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return { ok: false, reason: "trade_missing", detail: "" };

  const lower = trimmed.toLowerCase();

  /* 1. THE MAP WINS, AND IT IS THE SAME MAP. TRADE_SINGULAR's values are singular by definition
        ("plumbing" -> "plumber"), so this pluralises the mapped answer rather than the raw input —
        which is what turns the uncountable forms people really type into a usable plural
        ("plumbing" -> "plumbers"). A second plural-specific map would be a second place to keep the
        trade vocabulary, and this file's whole history is one-rule-in-N-places going wrong.
        ⛔ NO articleCheck HERE. This is the line that unblocks accountants and electricians; see
        the note above before adding one back. */
  const mapped = TRADE_SINGULAR[lower];
  if (mapped) {
    const words = mapped.split(" ");
    words[words.length - 1] = pluraliseWord(words[words.length - 1]);
    return pluralBackstop(words.join(" "), trimmed);
  }

  if (/\d/.test(lower)) return { ok: false, reason: "trade_has_digits", detail: trimmed };
  if (MULTI_CLAUSE.test(lower)) return { ok: false, reason: "trade_not_a_single_noun", detail: trimmed };

  /* 2. UNCOUNTABLE STILL BLOCKS, AND THE REASON IS NOT THE ARTICLE. "find joinery in your area"
        and "find plumbing in your area" are as wrong as their singular versions — an activity noun
        cannot be a list of businesses whatever grammar surrounds it. Same test, same last word,
        same map-first precedence. */
  const words = lower.split(" ");
  const last = words[words.length - 1];
  if (UNCOUNTABLE_TRADE_ENDINGS.test(last) || UNCOUNTABLE_TRADE_WORDS.has(last)) {
    return { ok: false, reason: "trade_uncountable", detail: trimmed };
  }

  /* 3. Pluralise the LAST word only — "driving instructor" pluralises on "instructor"; touching
        "driving" would produce nonsense. An already-plural value is left exactly as it is, which is
        the common case (the four biggest stored values are plural already). */
  words[words.length - 1] = pluraliseWord(last);
  return pluralBackstop(words.join(" "), trimmed);
}

/* THE BACKSTOP: every path above ends in a plural, so a result that does not is a bug in this file
   rather than bad data — and it must not reach a prospect either way. Cheap, total, and it names
   itself in the refusal so the next person sees which half failed.
   ⚠️ Unreachable today, deliberately, exactly like normaliseTrade's `trade_still_plural`. It exists
   so a future edit to pluraliseWord cannot silently start sending singulars. */
function pluralBackstop(value: string, original: string): VarCheck {
  const out = value.split(" ").slice(-1)[0];
  if (!out.endsWith("s")) return { ok: false, reason: "trade_not_pluralised", detail: original };
  return { ok: true, value };
}

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
};

/* A value naming SEVERAL trades cannot become "a <noun>" at all, whatever we do to its plurals:
   "kava cafe, pool bar" and "Shoe repairs & watch battery replacement" are lists, not nouns.
   ⛔ These BLOCK rather than getting a best guess, and the block names the value so Paul can add a
   map entry if he wants those leads sendable. */
const MULTI_CLAUSE = /[,&/]|\band\b/;

/* Words that must never have a trailing "s" stripped: the result would not be a word.
   ⚠️ THE LENGTH RULE IS THE REAL GUARD. "gas" → "ga" is the failure this prevents, and a minimum
   of four characters before stripping covers it without needing to enumerate English. The explicit
   endings are the ones where a short word would still pass that bar. */
const KEEP_TRAILING_S = /(?:ss|us|is)$/;

/**
 * Turn a stored `business_type` into something that can follow "a " in a sentence.
 * Map first, then lowercase + singularise the final word. Blocks rather than guessing.
 */
export function normaliseTrade(raw: string | null | undefined): VarCheck {
  const trimmed = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return { ok: false, reason: "trade_missing", detail: "" };

  const lower = trimmed.toLowerCase();

  /* 1. The map wins. Checked BEFORE the multi-clause block on purpose: "mobile valeting and
        detailing" contains " and " and would otherwise be refused, but it has a known answer. */
  const mapped = TRADE_SINGULAR[lower];
  if (mapped) return { ok: true, value: mapped };

  if (/\d/.test(lower)) return { ok: false, reason: "trade_has_digits", detail: trimmed };
  if (MULTI_CLAUSE.test(lower)) return { ok: false, reason: "trade_not_a_single_noun", detail: trimmed };

  /* 2. Singularise the LAST word only — "driving instructors" is pluralised on "instructors", and
        touching "driving" would produce nonsense. */
  const words = lower.split(" ");
  const last = words[words.length - 1];
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
  return { ok: true, value };
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

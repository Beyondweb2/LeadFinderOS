/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SUBMITTED TRADE, SPELLING-CORRECTED — and nothing else.

   🔴 WHAT THIS EXISTS TO PREVENT, MEASURED 2026-09-02. A free-check result email went out reading
   "Locksmiths" — the trade from a MONTHS-OLD PROSPECTING SEARCH — while the visitor had typed
   "plummer". One root cause: `fireFreeCheckAudit` resolved the trade as
   `lead.search_keyword ?? lead.category`, so on a lead that already existed (matched by place_id,
   phone or name) the audit asked about the trade we had once guessed, not the trade the owner had
   just told us. Both the questions AND the email read that stored value.

   ⛔ THE RULE, PAUL'S WORDS: for a free check the SUBMITTED trade is the source of truth, on new
   AND matched leads. There is no fallback to a stored prospecting trade. If the visitor typed
   nothing, the audit does not run — an absent trade is never filled in from somewhere else.
   (Sixteenth instance of the absent-value shape, and the first where the wrong "default" was a
   real value from another context rather than a blank.)

   ⛔ AND THIS FILE IS A SPELL-CHECKER, NOT A CLASSIFIER. It fixes obvious typos OF THE WORD THEY
   TYPED. It must never:
     · substitute a different stored value (that is the bug above),
     · force an unrecognised trade onto the nearest known one ("upholsterer" typed as something we
       do not list stays exactly as typed — a trade we have never seen is not a misspelling),
     · touch a short word. "bar" is three letters from a dozen real words and is a real trade Paul
       himself has audited; correcting it would be inventing an answer.
   A tie is left alone for the same reason: two candidates equally close is not an obvious typo.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Correctly-spelled trade words, SINGULAR, lowercase. Tokens are corrected against this list
 *  one at a time, so multi-word trades ("mobile mechanic", "gas engineer") are covered by their
 *  parts and need no phrase entries. Paul appends to this list; adding a word only ever makes one
 *  more typo correctable, and an absent word means "left as typed", which is the safe direction. */
export const KNOWN_TRADE_WORDS: readonly string[] = [
  // the trades actually in the lead book
  "plumber", "plumbing", "electrician", "electrical", "accountant", "accountancy", "locksmith",
  "barber", "driving", "instructor", "mechanic", "valeting", "tattooist", "hospitality",
  // building and outdoor
  "builder", "carpenter", "joiner", "plasterer", "roofer", "roofing", "bricklayer", "tiler",
  "decorator", "painter", "scaffolder", "glazier", "landscaper", "gardener", "fencing",
  "groundworker", "guttering", "driveway", "paving", "conservatory",
  // trades with a modifier noun
  "engineer", "fitter", "surgeon", "technician", "specialist", "contractor",
  "heating", "boiler", "gas", "conditioning", "refrigeration", "flooring", "kitchen",
  "bathroom", "window", "door", "roof", "chimney", "drainage", "insulation", "solar",
  // services
  "cleaner", "cleaning", "removals", "storage", "haulage", "courier", "skip", "clearance",
  "upholsterer", "welder", "farrier", "blacksmith", "seamstress", "cobbler", "florist",
  "photographer", "videographer", "caterer", "catering", "butcher", "baker", "bakery",
  // personal and health
  "hairdresser", "beautician", "beauty", "aesthetics", "barbering", "nails", "massage",
  "chiropractor", "physiotherapist", "physiotherapy", "osteopath", "podiatrist", "chiropody",
  "dentist", "dental", "optician", "optometrist", "audiologist", "nutritionist", "dietitian",
  "counsellor", "psychotherapist", "hypnotherapist", "acupuncturist", "veterinary",
  // professional
  "solicitor", "conveyancer", "barrister", "bookkeeper", "bookkeeping", "auditor",
  "broker", "mortgage", "insurance", "financial", "adviser", "advisor", "consultant",
  "architect", "surveyor", "draughtsman", "estate", "agent", "letting", "recruitment",
  // other real ones seen in the wild
  "groomer", "grooming", "kennels", "cattery", "trainer", "training", "tutor", "tuition",
  "pest", "control", "locks", "security", "alarms", "cctv", "aerial", "signage", "printing",
  "upholstery", "carpet", "curtains", "blinds", "furniture", "antiques", "jeweller",
  "watchmaker", "tailor", "dressmaker", "shoemaker", "picture", "framing",
];

const KNOWN = new Set(KNOWN_TRADE_WORDS.map((w) => w.toLowerCase()));

/** Plural forms a real person types. Checked BEFORE correction so "plumbers" and "locksmiths" are
 *  treated as correctly spelled and pass through untouched — a plural is not a typo, and
 *  "correcting" it would rewrite what the owner calls their own trade. */
function depluralise(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 3 && w.endsWith("es") && !w.endsWith("ses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

const isKnown = (w: string) => KNOWN.has(w) || KNOWN.has(depluralise(w));

/** Levenshtein, iterative, two rows. Small inputs — clarity over cleverness. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

/* ⛔ SHORT WORDS ARE NEVER CORRECTED, AND "bar" IS THE REASON. At 3-4 letters almost everything is
   one edit from something else, so a threshold there is a coin toss dressed up as a fix. Paul's own
   bar is a real free-check submission ("bar / chiang mai"); one edit reaches "car", "far", "bat".
   Below 5 characters the honest answer is "that is what they typed". */
function maxDistanceFor(len: number): number {
  if (len < 5) return 0;
  if (len < 8) return 1;
  return 2;
}

/** Restore the plural the visitor typed, so "plummers" comes back "plumbers" rather than "plumber". */
function matchPlural(original: string, corrected: string): string {
  if (original.endsWith("s") && !corrected.endsWith("s")) return corrected + "s";
  return corrected;
}

/** Is `a` obtainable from `b` by only ADDING letters — i.e. is the input `b` with letters dropped?
 *  Used only as a tie-break; see correctToken. */
function isSubsequence(a: string, b: string): boolean {
  let i = 0;
  for (const ch of b) if (i < a.length && a[i] === ch) i++;
  return i === a.length;
}

function correctToken(token: string): string | null {
  const lower = token.toLowerCase();
  if (isKnown(lower)) return null;                 // already fine — never touched

  /* ⛔ CORRECT THE SINGULAR STEM, THEN PUT THE PLURAL BACK. Without this, a misspelling that was
     ALSO plural stayed uncorrected: "electricans" sits 2 edits from both "electrician" and
     "electrical" (a tie), while its stem "electrican" is a clean one-letter omission of
     "electrician". Fixing the stem is the same judgement the singular case already makes, so the
     two forms of one typo can no longer get different answers. */
  const stem = depluralise(lower);
  if (stem !== lower && !isKnown(stem)) {
    const fixedStem = correctToken(stem);
    if (fixedStem) return matchPlural(lower, fixedStem);
  }

  const limit = maxDistanceFor(lower.length);
  if (limit === 0) return null;                    // too short to guess at

  let bestD = limit + 1;
  let candidates: string[] = [];
  for (const known of KNOWN) {
    // Only compare against words of a similar length; a 2-edit budget must not span "gas" -> "glazier".
    if (Math.abs(known.length - lower.length) > limit) continue;
    const d = editDistance(lower, known);
    if (d < bestD) { bestD = d; candidates = [known]; }
    else if (d === bestD) candidates.push(known);
  }
  if (!candidates.length || bestD > limit) return null;

  /* ⛔ THE TIE-BREAK IS A RULE ABOUT TYPING, NOT A PREFERENCE ORDER, and it earns its keep on a real
     case: "electrican" is ONE edit from BOTH "electrician" (a dropped letter) and "electrical" (a
     substitution that happens to land on another word we list). Left as a bare tie it stayed
     uncorrected, which is safe but not useful.
     People omit letters far more often than they substitute one and land on a different real word,
     so among equally-close candidates we prefer the one the input is a SUBSEQUENCE of — i.e. the
     typo is purely "you missed a letter". That is a property of the two strings, so it cannot depend
     on declaration order, which is what the bare tie rule was protecting against. */
  if (candidates.length > 1) {
    const omissions = candidates.filter((c) => isSubsequence(lower, c));
    if (omissions.length === 1) return matchPlural(lower, omissions[0]);
    /* ⛔ STILL AMBIGUOUS -> LEAVE IT ALONE. Two known trades equally close by the same kind of typo
       is not an obvious misspelling, and guessing would be inventing an answer. */
    return null;
  }
  return matchPlural(lower, candidates[0]);
}

export interface TradeNormalisation {
  /** What the audit should ask about. Blank in, blank out. */
  trade: string;
  /** True only when a token was actually respelled. */
  corrected: boolean;
  /** The visitor's own words, kept for the operator log and the flag email. */
  submitted: string;
}

/**
 * The submitted trade, with obvious misspellings of trade words fixed and everything else left
 * exactly as typed.
 *
 * ⛔ It never returns a trade the visitor did not type some form of. Blank input returns blank —
 * the caller must refuse to audit rather than substitute anything.
 */
export function normaliseTrade(submitted: unknown): TradeNormalisation {
  const raw = typeof submitted === "string" ? submitted.trim().replace(/\s+/g, " ") : "";
  if (!raw) return { trade: "", corrected: false, submitted: "" };

  let changed = false;
  const out = raw.split(" ").map((tok) => {
    /* Keep punctuation attached to the token out of the comparison ("plummer," / "plumber/heating")
       so a stray comma cannot make a correctly spelled word look unknown. */
    const m = /^([^\p{L}]*)(\p{L}[\p{L}'-]*)([^\p{L}]*)$/u.exec(tok);
    if (!m) return tok;
    const [, pre, word, post] = m;
    const fixed = correctToken(word);
    if (!fixed) return tok;
    changed = true;
    // Preserve the visitor's capitalisation shape: "Plummer" -> "Plumber".
    const cased = /^\p{Lu}/u.test(word) ? fixed.charAt(0).toUpperCase() + fixed.slice(1) : fixed;
    return pre + cased + post;
  }).join(" ");

  return { trade: out, corrected: changed, submitted: raw };
}

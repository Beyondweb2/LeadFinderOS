/* ════════════════════════════════════════════════════════════════════════════════════════════
   COMPETITOR CLEANING — "were this run's competitor names actually cleaned?", answered at READ
   time. Built 2026-08-28 after Solene's 47-question measurement shipped 381 junk names.

   ⛔ WHY THE ANSWER IS DERIVED AND NOT MERELY READ FROM THE STAMP. extract-competitors now
   records a stamp on the run (results.competitor_cleaning), but a stamp only exists on runs
   cleaned by the NEW code. Every audit before 2026-08-28 has none, and an ABSENT stamp must not
   read as "clean" — that is the absent-value fault this codebase keeps hitting (CLAUDE.md §6).
   So the verdict is computed from the NAMES THEMSELVES and the stamp is corroboration:
     dirty   — the names contain proof of raw regex output, whatever the stamp says
     clean   — no proof of junk AND (a complete stamp OR nothing that looks extracted)
     unknown — no names to judge (nothing to get wrong)

   ⛔ AND WHY THERE IS NO VOCABULARY LIST HERE. The junk that reached the Solene headline was
   "Testosterone", "Estrogen", "Sleep" — CONTENT words. auditReport.ts's word sets are
   accountancy/trades/hospitality vocabulary, so medical nouns sail through, and adding a medical
   list would just move the hole to the next trade (the "Safe printed as RG's third competitor"
   lesson). The two tests below are STRUCTURAL — they ask what a string looks like, not what it
   means — so they generalise to any trade:
     · a single English function word     (isUncleanedName, the measured market-fold marker test)
     · a code-like token                  (tracking ids / video ids: mixed case+digits, no vowels…)
   Neither can classify "Testosterone". That is deliberate and it is why the CLEANER, not a
   blacklist, is the fix — and why a run we cannot prove clean withholds its names instead of
   printing them.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

import { isUncleanedName } from './knownEntities.ts';

/** Recorded by extract-competitors on `ai_audit_runs.results.competitor_cleaning`. jsonb — no
 *  migration. Every field optional: an older/partial stamp must never throw. */
export interface CompetitorCleaningStamp {
  at?: string | null;
  model?: string | null;
  items_total?: number | null;
  items_cleaned?: number | null;
  complete?: boolean | null;
  errors?: string[] | null;
}

export type CleanlinessVerdict = 'clean' | 'dirty' | 'unknown';

/* ⛔ HOW MUCH PROVABLE JUNK MEANS "NEVER CLEANED" — MEASURED, NOT PICKED, and the reason it is not
 * 1 was found by running this code against the freshly cleaned Solene runs.
 *
 * A single marker hit does NOT prove a raw fold, because a few real brands ARE single English
 * words. The live case: gpt-4o cleanly returned **"Hers"** (forhers.com, a real telehealth brand)
 * from a Gemini answer, and "hers" is a pronoun in UNCLEANED_MARKER_WORDS. At a threshold of 1 that
 * one name blanked every rival on a properly cleaned 20-question run — punishing the client report
 * for the cleaner doing its job.
 *
 * The measured distribution has an enormous gap, so the line is easy:
 *     CLEANED runs (Solene 1/2/3 after cleaning, + the 43 clean runs of 25-27 Aug):  0, 0, 1, 2
 *     UNCLEANED runs (Solene run 1 before; 0b041217):                             123, 73+
 * 3 sits mid-gap with a ~40x margin either side. Re-derive it before changing it.
 *
 * ⚠️ This is a threshold on the DIRTY VERDICT ONLY (whether to withhold the whole run's rivals).
 * Every individual junk name is still filtered out of display by isRealCompetitor regardless of
 * count — so 1 or 2 stragglers are removed, they are simply not treated as proof the run is raw.
 * ⚠️ And it never overrides the STAMP: an explicitly incomplete clean is dirty at any junk count,
 * because unprovable content-word junk ("Testosterone") may be sitting in the part never read. */
export const JUNK_NAMES_PROVING_UNCLEANED = 3;

export interface CleanlinessAssessment {
  verdict: CleanlinessVerdict;
  /** Distinct names that PROVE raw output — shown to the operator so the flag states its working. */
  junkExamples: string[];
  junkCount: number;
  namesConsidered: number;
  /** The stamp, when the run carries one. */
  stamp: CompetitorCleaningStamp | null;
  /** ⛔ WITHHOLD THE NAMES FROM THE CLIENT REPORT? A NARROWER QUESTION THAN `verdict`, and they
   *  must stay separate. Suppression is for "we hold names we cannot trust"; the verdict is also
   *  `dirty` when we hold NO names and no receipt, and there is nothing to suppress in that case —
   *  blanking then would strip the gut-punch out of historic reports whose regex list was simply
   *  empty, changing documents already sent. Warn on `verdict`, suppress on this. */
  suppressNames: boolean;
  /** One line for the operator. Empty when there is nothing to say. */
  warning: string;
}

/* ── the structural code-like test ────────────────────────────────────────────
 * Solene's answers carried 48 of these (YouTube/tracking ids scraped into the prose):
 *   AAAAABqkCA  G1f5H8B8ToY  Xdaj6AH7genL7KP9o  M7RY0SrUu  KWproFBw9vfjt
 * They pass every existing filter: one token, 4+ chars, starts capitalised, in no word list.
 *
 * ⚠️ REAL ONE-WORD BRANDS MUST SURVIVE. "Crunch", "Mazuma", "Azets", "IRIS", "TaxAssist",
 * "B&Q", "O2", "EE", "3M" — so the test requires a SINGLE token with BOTH letters and digits
 * (or an implausible consonant run), never merely "has a digit" and never anything with a space.
 * O2 / EE / 3M survive on the length floor; TaxAssist has no digit; Crunch has neither. */
function isCodeLikeName(name: string): boolean {
  const t = String(name ?? '').trim();
  if (!t || /\s/.test(t)) return false;            // multi-word names are never tracking ids
  const core = t.replace(/[^A-Za-z0-9]/g, '');
  if (core.length < 7) return false;               // short tokens are brands ("O2", "3M", "B&Q")
  const hasDigit = /[0-9]/.test(core);
  const hasAlpha = /[A-Za-z]/.test(core);
  if (hasDigit && hasAlpha) {
    /* A real brand with a digit reads as a word plus a number ("Move37", "Fix4U"): the digits
       clump at one end. An id interleaves them. Count alpha→digit and digit→alpha transitions;
       2+ means interleaved. */
    let flips = 0;
    for (let i = 1; i < core.length; i++) {
      const a = /[0-9]/.test(core[i - 1]);
      const b = /[0-9]/.test(core[i]);
      if (a !== b) flips++;
    }
    if (flips >= 2) return true;
    /* Also: heavy internal case-mixing alongside digits ("G1f5H8B8ToY"). */
    const humps = core.replace(/[^A-Za-z]/g, '').split('').filter((c, i, a2) =>
      i > 0 && /[a-z]/.test(a2[i - 1]) && /[A-Z]/.test(c)).length;
    if (humps >= 2) return true;
  }
  /* No vowel at all in a 7+ letter token is not a pronounceable name ("KWproFBw", "DSbRVk7ZLfS"). */
  const letters = core.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 7 && !/[aeiouy]/i.test(letters)) return true;
  /* ── UPPER-HEAVY CASE SOUP ────────────────────────────────────────────────
   * The remaining ids ("AAAAABqkCA", "OizapOHV4", "WPySFHs9") have no interleaved digits and
   * plenty of vowels, so the tests above miss them. What marks them is that they are
   * UPPERCASE-DOMINATED yet still carry lowercase, flipping case repeatedly — a shape no brand
   * has. Every clause is load-bearing against a real name, so do not loosen one without
   * re-running scripts/competitor-cleaning.test.ts, whose fixture list is real firms:
   *   ≥3 uppercase  → drops "TaxAssist", "NatWest", "eBay", "PwC" (≤2)
   *   ≥2 lowercase  → drops "IRIS", "KPMG", "HSBC" (all-caps acronyms are real)
   *   ratio ≥ 0.50  → drops "GlaxoSmithKline" (3/15 = 20%), "AstraZeneca", "McDonalds"
   *   ≥2 flips      → drops a single hump ("Move37", "Screwfix", "Checkatrade")
   *
   * ⛔ THE RATIO IS 0.50 BECAUSE 0.35 DELETED A REAL CLINIC. Found by sweeping this predicate
   * over all 1,090 distinct names Solene actually stored: "GenderGP" (a genuine gender-care
   * provider, and a genuine competitor) scores 3 uppercase of 8 letters = 0.375 with exactly 2
   * case flips — arithmetically indistinguishable from "AAAAABqkCA" (2 flips) on every clause
   * except the ratio, where the id sits at 0.80. Anything below 0.50 starts eating real
   * brand-plus-initials names. Re-run the sweep, not just the unit test, before touching it. */
  const upper = (letters.match(/[A-Z]/g) ?? []).length;
  const lower = (letters.match(/[a-z]/g) ?? []).length;
  if (letters.length >= 7 && upper >= 3 && lower >= 2 && upper / letters.length >= 0.5) {
    let caseFlips = 0;
    for (let i = 1; i < letters.length; i++) {
      const a = /[A-Z]/.test(letters[i - 1]);
      const b = /[A-Z]/.test(letters[i]);
      if (a !== b) caseFlips++;
    }
    if (caseFlips >= 2) return true;
  }
  return false;
}

/** True if this single name is PROOF the fold was never cleaned. Structural only — see the header. */
export function isProvableJunkName(name: string): boolean {
  return isUncleanedName(name) || isCodeLikeName(name);
}

/** Read a run's cleaning stamp out of its `results` jsonb. Never throws; unknown shapes → null. */
export function readCleaningStamp(results: unknown): CompetitorCleaningStamp | null {
  if (!results || typeof results !== 'object') return null;
  const raw = (results as Record<string, unknown>)['competitor_cleaning'];
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    at: typeof s.at === 'string' ? s.at : null,
    model: typeof s.model === 'string' ? s.model : null,
    items_total: num(s.items_total),
    items_cleaned: num(s.items_cleaned),
    complete: typeof s.complete === 'boolean' ? s.complete : null,
    errors: Array.isArray(s.errors) ? s.errors.filter((e): e is string => typeof e === 'string') : null,
  };
}

/**
 * Grade a run's competitor names. `names` is every stored competitor string across the run's
 * rows and engines (raw, pre-display-filter — the filters are what hide the evidence).
 *
 * ⛔ THE JUNK TEST WINS OVER THE STAMP. A stamp saying `complete` on names that still contain
 * marker words means the cleaning did not take (the model omitting ids is a recorded failure
 * mode), and the operator needs to know that, not be reassured by the receipt.
 */
export function assessCompetitorCleanliness(
  names: Iterable<string>,
  results?: unknown,
  /** How many (question × engine) answers this run actually has. Needed since 2026-08-28: the
   *  regex scraper is deleted, so an EMPTY competitor list is now ambiguous — it means either "AI
   *  named nobody" or "the cleaner never ran". Without this the two are indistinguishable and the
   *  second one reads as the first, which is the absent-value fault wearing new clothes. */
  opts?: { answeredCells?: number },
): CleanlinessAssessment {
  const stamp = readCleaningStamp(results);
  const junk = new Set<string>();
  let considered = 0;
  for (const n of names) {
    const t = String(n ?? '').trim();
    if (!t) continue;
    considered++;
    if (isProvableJunkName(t)) junk.add(t);
  }
  const junkExamples = [...junk].sort((a, b) => a.localeCompare(b));

  if (junkExamples.length >= JUNK_NAMES_PROVING_UNCLEANED) {
    return {
      verdict: 'dirty', suppressNames: true, junkExamples, junkCount: junkExamples.length, namesConsidered: considered, stamp,
      warning: `Competitor names not cleaned — do not send to client. ${junkExamples.length} of ` +
        `${considered} stored names are raw text, not businesses (e.g. ${junkExamples.slice(0, 4).join(', ')}).`,
    };
  }
  /* ⛔ AN INCOMPLETE RECEIPT WARNS ALWAYS, AND SUPPRESSES ONLY WITH JUNK BESIDE IT (Paul, 2026-09-14).
     It used to suppress on its own at any junk count, and that blanked the rivals on real clients'
     reports — the section that makes the document land.

     🔴 MEASURED BEFORE CHANGING IT, over the 147 newest lead-linked audits with a completed run:
     6 had their whole rival list withheld, ALL SIX by this branch, and the junk count was ZERO in
     every one. Four of the six had cleaned every item they held and were blanked anyway —
     AD Locksmithing 25/25 with 106 real Newcastle locksmiths, RG Locksmiths 25/25 with 119,
     Forest Hall 9/9, Watford 8/7 — each on a receipt reading "model omitted 1 of 25 ids".

     THE MECHANISM, and it is why the receipt is weak evidence: the cleaner asks gpt-4o for one
     entry per answer id INCLUDING an empty list when an answer named nobody. A model that omits
     that id instead is indistinguishable, at this layer, from a model that failed to read it — so
     a perfectly clean run whose last answer named nobody is stamped incomplete.

     ⛔ WHAT HAS NOT CHANGED: the junk rule above, which is the one that actually proves raw output,
     and suppression whenever ANY provable junk sits beside an incomplete receipt. That is the case
     the original reasoning was written for — an unread portion could hide unprovable content-word
     junk ("Testosterone"), and one visible marker is enough to believe it.
     ⚠️ AND IT STILL SAYS SO. The verdict stays `dirty`, so the operator screen keeps its amber
     banner; what changes is only whether the client's report is blanked. Warn on `verdict`,
     suppress on `suppressNames` — this branch is now the clearest example of why they are separate
     fields, and the banner reads `suppressNames` to decide what it claims. */
  if (stamp && stamp.complete === false) {
    const done = stamp.items_cleaned ?? 0;
    const tot = stamp.items_total ?? 0;
    const coverage = `Competitor names only partly cleaned (${done} of ${tot} answers read)`;
    return {
      verdict: 'dirty', suppressNames: junkExamples.length > 0, junkExamples, junkCount: junkExamples.length, namesConsidered: considered, stamp,
      warning: junkExamples.length > 0
        ? `${coverage}, and ${junkExamples.length} stored name${junkExamples.length === 1 ? ' is' : 's are'} ` +
          `raw text (e.g. ${junkExamples.slice(0, 4).join(', ')}) — do not send to client until re-extracted.`
        : `${coverage}, but none of the ${considered} stored name${considered === 1 ? '' : 's'} is raw text. ` +
          `The names are still shown — re-extract if you want the receipt to read complete.`,
    };
  }
  /* ⛔ EMPTY, WITH ANSWERS THAT SHOULD HAVE BEEN READ AND NO COMPLETED RECEIPT. Since the regex
     scraper was deleted, this is what a run looks like when the cleaner never ran — identical on
     screen to a run where AI genuinely named nobody. A completed stamp is the ONLY thing that tells
     them apart, so without one we say we cannot tell rather than printing "no competitors". */
  const answered = opts?.answeredCells ?? 0;
  if (considered === 0 && answered > 0 && !(stamp && stamp.complete === true)) {
    return {
      verdict: 'dirty', suppressNames: false, junkExamples: [], junkCount: 0, namesConsidered: 0, stamp,
      warning: `No competitor names recorded for ${answered} answer${answered === 1 ? '' : 's'}, and ` +
        `no completed cleaning receipt — this may be "AI named nobody" or the cleaner not having run. ` +
        `Re-extract to settle it before sending anything to a client.`,
    };
  }
  /* Empty WITH a completed receipt is a known, correct answer: the cleaner read every answer and
     found no hireable firm in any of them. That is `clean`, not `unknown` — "unknown" is reserved
     for having nothing to judge at all, and conflating the two would throw away the one signal
     that distinguishes a real "AI named nobody" from a cleaning failure. */
  if (considered === 0 && stamp?.complete === true) {
    return { verdict: 'clean', suppressNames: false, junkExamples: [], junkCount: 0, namesConsidered: 0, stamp, warning: '' };
  }
  if (considered === 0) return { verdict: 'unknown', suppressNames: false, junkExamples: [], junkCount: 0, namesConsidered: 0, stamp, warning: '' };
  /* Clean. Any 1–2 stragglers are still reported (junkExamples) so the operator can see them, and
     isRealCompetitor drops them from display — they just do not condemn the whole run. */
  return { verdict: 'clean', suppressNames: false, junkExamples, junkCount: junkExamples.length, namesConsidered: considered, stamp, warning: '' };
}

/** How many (question × engine) answers a run holds — the denominator that tells an empty
 *  competitor list apart from an unread one. Counts an engine only when it has answer_text, which
 *  is exactly what extract-competitors counts as an item, so the two agree by construction. */
export function countAnsweredCells(
  rows: Array<{ status?: string | null; result?: Record<string, { answer_text?: string | null } | undefined> | null } | null | undefined>,
  engines: readonly string[] = ['chatgpt', 'gemini', 'ai_overview'],
): number {
  let n = 0;
  for (const row of rows ?? []) {
    if (!row || row.status !== 'done') continue;
    const res = row.result;
    if (!res || typeof res !== 'object') continue;
    for (const e of engines) if (String(res[e]?.answer_text ?? '').trim()) n++;
  }
  return n;
}

/** Every stored competitor string on a run's queue rows — the input `assessCompetitorCleanliness`
 *  wants. Kept here so the page, the report and the test all gather them the same way. */
export function collectCompetitorNames(
  rows: Array<{ result?: Record<string, { competitors?: string[] } | undefined> | null } | null | undefined>,
  engines: readonly string[] = ['chatgpt', 'gemini', 'ai_overview'],
): string[] {
  const out: string[] = [];
  for (const row of rows ?? []) {
    const res = row?.result;
    if (!res || typeof res !== 'object') continue;
    for (const e of engines) {
      for (const n of res[e]?.competitors ?? []) out.push(n);
    }
  }
  return out;
}

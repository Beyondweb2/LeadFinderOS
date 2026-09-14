/*
 * seedGuard — does an outreach question deserve to become part of a paid baseline?
 *
 * A paid baseline now seeds its questions from the outreach audit the prospect actually read, so the
 * numbers that sold them are the numbers their guarantee is measured on. That promotes a question
 * written once, in one model call, into a CONTRACTUAL measurement repeated verbatim at day 0 and
 * again at week 8. ABLM's baseline carries "accoutnant in wisbech" — generated, misspelled, and now
 * permanent. Reusing that blind is worse than generating fresh.
 *
 * Lives in src/lib rather than inside create-ai-audit because that function calls Deno.serve at
 * import time, so nothing can import it to test it. Same reason inboundClassify.ts sits here.
 */
/* ── SEED GUARD ────────────────────────────────────────────────────────────────
   A paid baseline seeds its questions from the outreach audit the prospect actually read, so the
   numbers that sold them are the numbers their guarantee is measured on. That means a question
   written once, in one model call, becomes a CONTRACTUAL measurement repeated verbatim at day 0 and
   again at week 8. ABLM's baseline carries "accoutnant in wisbech" — generated, misspelled, and now
   permanent. Reusing that blind is worse than generating fresh.

   THE RULE IS EXACT TOKEN CONTAINMENT, NOT FUZZY MATCHING. I proposed "fuzzy-match" when I designed
   this and it was wrong: "accoutnant" is one transposition from "accountant", so any edit-distance
   check loose enough to be useful would ACCEPT the exact typo this exists to catch. Strictness is
   the whole point.

     • the lead's trade word must appear in the question, allowing a trailing plural only
     • if the question is town-scoped ("… in <tail>"), the lead's stored town must appear in <tail>

   Nothing more. It is a sanity check that the question is about THIS business in THIS town, not a
   spellchecker — a seed that fails simply falls back to a generated question, which is the status
   quo, so a false rejection costs nothing but a false acceptance is permanent. */
const normalise = (v: string) =>
  (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/** Words worth matching on. Short words ("ltd", "the", "in") match everything and prove nothing. */
const contentTokens = (v: string) => normalise(v).split(" ").filter((w) => w.length >= 4);

/** Singular/plural only — "accountants" matches "accountant". Deliberately no stemming beyond it. */
const looseHas = (haystack: string[], needle: string) =>
  haystack.some((w) => w === needle || w === `${needle}s` || `${w}s` === needle);

/* ── BUYING INTENT, NOT RESEARCH INTENT ──────────────────────────────────────────────────────────
   A question only measures AI visibility if it is one a CUSTOMER LOOKING TO HIRE would ask. A
   research question measures something real but useless to us: who the engines cite for people
   who want to LEARN the trade.

   THE INCIDENT. A bulk audit of tattoo studios generated "tattoo design for beginners cambridge uk".
   The engines answered it correctly — with ucas.com, barnsley.ac.uk and camre.ac.uk, i.e. colleges.
   A third of that niche's citations measured people looking for training rather than a studio, and
   nothing in the pipeline objected. The prompt bans "near me", broad head-terms and two intents in
   one question; it has never said the intent must be to BUY.

   ⚠️ TWO TIERS, AND THE SECOND ONE IS THE WHOLE DIFFICULTY. For some businesses teaching IS the
   product. "learn to drive in Peterborough" is the single best buying question a driving school
   has, "dog training in Ely" is what a dog trainer sells, and "guitar lessons for beginners" is a
   music teacher's core query. A flat keyword list would reject exactly those businesses' best
   questions — and there are driving schools in the lead book right now. So:

     TIER A — never something a local business sells. Rejected for everyone.
     TIER B — education words. Rejected ONLY when the business does not itself teach.

   "Teaches" is decided from the trade wording, not guessed: a trade containing driving, school,
   tuition, tutor, instructor, coach, academy, lesson, class, workshop, or anything starting
   "train" (trainer/training) is in the teaching business, and Tier B is skipped for it entirely. */

/** Never a service a local business sells — a question containing one of these is about a career
 *  or a fact, not a purchase. Multi-word entries are matched as phrases. */
const RESEARCH_ALWAYS = [
  'salary', 'salaries', 'career', 'careers', 'apprenticeship', 'apprenticeships',
  'qualification', 'qualifications', 'diploma', 'degree', 'nvq', 'ucas',
  'how to', 'become a', 'become an', 'what qualifications', 'entry requirements',
];

/** Education words. Legitimate buying language when the business TEACHES — see the note above. */
const RESEARCH_UNLESS_TEACHER = [
  'course', 'courses', 'training', 'learn', 'learning', 'lesson', 'lessons',
  'for beginners', 'beginner', 'beginners', 'class', 'classes', 'workshop', 'workshops',
  'academy', 'apprentice', 'student', 'students',
];

/** Trade vocabulary that means teaching is the product, so Tier B must not apply. */
const TEACHING_TRADE = [
  'driving', 'school', 'tuition', 'tutor', 'tutoring', 'instructor', 'instruction',
  'coach', 'coaching', 'academy', 'lesson', 'lessons', 'class', 'classes', 'workshop',
  'college', 'education', 'teacher', 'teaching',
];

/** Does this business sell teaching? Stem-matched on "train" so trainer/training both count. */
export function isTeachingTrade(businessType: string): boolean {
  const t = normalise(businessType).split(' ').filter(Boolean);
  return t.some((w) => w.startsWith('train') || TEACHING_TRADE.includes(w));
}

/**
 * Reject a question that measures research intent rather than buying intent.
 * Returns null when the question is fine.
 */
export function researchIntentReason(question: string, businessType: string): string | null {
  // Padded so a phrase match cannot straddle the ends, and word-ish boundaries hold.
  const q = ` ${normalise(question)} `;
  const hit = (term: string) => q.includes(` ${term} `) || q.includes(` ${term},`) || (term.includes(' ') && q.includes(` ${term} `));
  for (const term of RESEARCH_ALWAYS) {
    if (hit(term)) return `research intent, not buying intent ("${term}") — measures people looking to enter the trade, not hire`;
  }
  if (!isTeachingTrade(businessType)) {
    for (const term of RESEARCH_UNLESS_TEACHER) {
      if (hit(term)) return `research intent, not buying intent ("${term}") — this business does not sell teaching`;
    }
  }
  return null;
}

export function seedRejectionReason(
  question: string,
  businessType: string,
  locationText: string,
): string | null {
  // Intent first: a seed measuring the wrong thing is worse than one that is merely off-trade, and
  // a paid baseline repeats it verbatim at day 0 and week 8.
  const intent = researchIntentReason(question, businessType);
  if (intent) return intent;

  const qTokens = normalise(question).split(" ").filter(Boolean);
  if (qTokens.length === 0) return "empty question";

  /* ⛔ ONE RULE, TWO CALLERS. This clause used to be written out here and nowhere else, and since
     nothing called this function it never ran. It is `offTradeReason` now, shared with the live
     generator guard, so the two cannot answer differently about the same question. */
  const offTrade = offTradeReason(question, businessType);
  if (offTrade) return offTrade;

  /* Only checked when the question actually claims a place. A national question has no town to
     disagree with, and rejecting it here would quietly force every baseline local. */
  const townMatch = normalise(question).match(/\bin\b\s+(.+)$/);
  const town = contentTokens(locationText);
  if (townMatch && town.length) {
    const tail = townMatch[1].split(" ").filter(Boolean);
    if (!town.some((t) => looseHas(tail, t))) {
      return `names a different place to the lead's town (${town.join("/")})`;
    }
  }
  return null;
}

/**
 * Drop research-intent questions from a GENERATED set and top the count back up from the
 * deterministic fallback templates, so the operator still gets the number of questions they paid
 * for rather than a short run.
 *
 * WHY TOP UP FROM TEMPLATES RATHER THAN RE-ASKING THE MODEL. A second model call costs money, adds
 * latency to a path that runs per-lead in a bulk job, and can come back with the same fault — the
 * model produced "for beginners" once and nothing stops it doing so twice. The templates are
 * deterministic, free, already computed on this code path as the failure fallback, and by
 * construction contain none of the markers (they are "[service] in [town]" and audience-qualified
 * forms). They are also filtered here anyway, so a future template edit cannot smuggle one in.
 *
 * If BOTH sources come up short the caller gets fewer questions — deliberately. Fabricating filler
 * to hit a number is how "term too broad" and the LLM playbook happened.
 */
export function dropResearchIntent(
  generated: string[],
  fallback: string[],
  target: number,
  businessType: string,
): { questions: string[]; rejected: Array<{ question: string; reason: string }> } {
  const rejected: Array<{ question: string; reason: string }> = [];
  const seen = new Set<string>();
  const out: string[] = [];

  const take = (list: string[]) => {
    for (const q of list) {
      if (out.length >= target) return;
      const t = (q ?? '').trim();
      if (!t) continue;
      const key = normalise(t);
      if (seen.has(key)) continue;
      const reason = researchIntentReason(t, businessType);
      if (reason) { rejected.push({ question: t, reason }); seen.add(key); continue; }
      seen.add(key);
      out.push(t);
    }
  };

  take(generated);
  take(fallback);   // top up only if the filter left us short
  return { questions: out, rejected };
}

/* ⛔ `applySeed` / `SeedOutcome` WERE DELETED 2026-09-12 with baseline seeding. The outreach hook
   is throwaway and never compared, so a paid baseline no longer carries the hook's questions
   forward; it is generated fresh for the home town.

   🔴 AND THIS NOTE USED TO END "`seedRejectionReason` survives as the shared rule behind
   dropResearchIntent and the town guard", WHICH WAS FALSE FOR TWO DAYS AND COST A MEASUREMENT.
   dropResearchIntent calls `researchIntentReason`; the town guard calls `mentionsTown`. Nothing
   called seedRejectionReason at all — so its TRADE clause, the only check in the codebase that a
   question is about the audited trade, was dead code, and "fault diagnosis services in thetford UK"
   went into a live electrician measurement and came back naming six car garages.
   A comment asserting a guard still runs is how a guard stops running unnoticed (§4).
   ⛔ THE TRADE CLAUSE IS LIVE AGAIN AS `dropOffTrade` BELOW, and it is the shared rule now in fact
   rather than in prose: seedRejectionReason and dropOffTrade both call `offTradeReason`. */

/* ── IS THIS QUESTION EVEN ABOUT THE TRADE? ───────────────────────────────────────────────────
   🔴 THE INCIDENT, 2026-09-13. White Sparks Electrical's full measure asked "fault diagnosis
   services in thetford UK". The engines answered it accurately — with Gorse Motors Garage, Vickers
   Motors, Cunningham Motors and M & S Breckland Motors. Car garages. One of twelve named firms was
   an electrician. It filed under ABSENT, which reads "the race exists and you are invisible", and
   would have sent the operator to build a page for a race that was never theirs.

   Every existing guard passed it: buying intent (yes), names the town (yes), carries the country
   marker (yes). Three guards for intent, place and country, and none for WHAT THE QUESTION IS ABOUT.

   ⛔ THE TEST IS TRADE WORD **OR** A KNOWN INTENT FOR THAT TRADE, AND THE `OR` IS THE WHOLE DESIGN.
   The trade word alone rejects "emergency lockout service in Burnley UK" and "key cutting in
   Halifax" — a locksmith's two best questions, neither containing "locksmith". Measured over every
   question ever asked, 30.4% name no trade word, and the great majority of those are good. So
   `intentsForTrade` — already hand-maintained, already the market-audit coverage vocabulary — is
   the second door.

   ⚠️ AN INTENT MATCHES ON ITS TOKENS, NOT AS A PHRASE, AND NOT ON ANY SINGLE TOKEN EITHER. Phrase
   matching rejects "lock installation" because the list happens to say "lock repair". Matching any
   single token ACCEPTS "fault diagnosis" off the back of "fault finding" — which is the exact
   question this guard exists to catch, let through by its own guard. So every token of one
   alternative must be present.

   ⚠️ AND AN ENTRY LIKE "outdoor and garden power" IS AN OR-LIST WRITTEN AS ONE STRING. Split on
   "and" first or "outdoor power installation" is rejected for not mentioning a garden.

   ⛔ WHAT THIS DELIBERATELY DOES NOT CATCH: a question that IS anchored to the trade and still gets
   answered about another one. "landlord certificates in thetford UK" is a real electrician service
   (an EICR is a landlord certificate) and came back naming gas engineers and EPC assessors. No
   generation-time rule can know that; it is only visible once the engines have answered. That is
   what the measurement-time check in src/lib/questionTradeFit.ts is for. Two different faults, two
   different places. */

/** Tokens worth matching an intent on. Shorter than contentTokens' 4 because "key", "ev" and "pat"
 *  are the load-bearing words of real intents; "and"/"work" carry nothing. */
/* ⛔ THE TRADE WORD HAS TO BE STEMMED, AND MEASURING IT IS WHAT PROVED THAT. `looseHas` allows a
   trailing plural only — it was written for seed matching, where strictness was the point because a
   seed that fails costs nothing. Reused here it rejects "plumbing services in Melton Mowbray",
   "accounting services for small businesses" and "residential electrical repairs in Wrexham",
   because plumbing ≠ plumber, accounting ≠ accountant, electrical ≠ electrician. Run over every
   question on file it threw away 259 good ones.

   The stem keeps at least five characters, so it stays specific enough to mean something, and the
   test runs BOTH ways: "electrician" → "electric" catches "electrical", and "locksmith" → "locksm"
   catches the bare "lock" of "lock installation" by the reverse test. A four-character floor on the
   reverse direction stops a stem being matched by a fragment. */
/* ⚠️ SINGULARISE BEFORE STEMMING. business_type is stored plural on most leads ("Locksmiths",
   "Plumbers", "accountants" — 402 audits say "locksmiths" and 6 say "locksmith"), and stemming the
   plural gives "accounta", which does not match "accounting". That alone was 28 of the 63 false
   rejections left after the first fix. */
const tradeStem = (w: string) => {
  const singular = w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w;
  return singular.slice(0, Math.max(5, singular.length - 3));
};
const tradeStemHit = (qTokens: string[], tradeWord: string) => {
  const stem = tradeStem(tradeWord);
  return qTokens.some((w) => w.startsWith(stem) || (w.length >= 4 && stem.startsWith(w)));
};

/**
 * Does this text carry the trade's own vocabulary? Door one of offTradeReason, exported so the
 * measurement-time check (src/lib/questionTradeFit.ts) classifies a COMPETITOR'S NAME by exactly
 * the rule the generator classifies a question by. Two rules would drift, and the drift would be
 * invisible: one says the question is fine, the other says its answers are not.
 *
 * ⚠️ Deliberately the trade word ONLY, not the intent list. An intent describes a service somebody
 * asks for; a firm's NAME is not a sentence, and "emergency lockout" matching a company called
 * "Emergency Services Ltd" would call a general builder a locksmith.
 */
export function tradeWordHit(text: string, businessType: string): boolean {
  const trade = contentTokens(businessType);
  if (!trade.length) return false;
  const tokens = normalise(text).split(' ').filter(Boolean);
  return trade.some((t) => tradeStemHit(tokens, t));
}

const INTENT_STOP = new Set(['and', 'the', 'for', 'with', 'work', 'works', 'your', 'their']);
const intentTokens = (v: string) => normalise(v).split(' ').filter((w) => w.length >= 3 && !INTENT_STOP.has(w));

/** One intent, split into the alternatives an "and" was hiding. "burglary repair and boarding up"
 *  is two services, and a question only has to be one of them. */
const intentAlternatives = (intent: string): string[][] =>
  intent.split(/\band\b|\/|,/).map((part) => intentTokens(part)).filter((t) => t.length > 0);

/**
 * Reject a question that is not about the audited trade. Returns null when the question is fine.
 *
 * ⚠️ A BLANK TRADE PASSES EVERYTHING, deliberately. With no business type there is nothing to be
 * off, and refusing on absence would empty the question set for every lead whose trade we never
 * captured — absence is not an answer (CLAUDE.md §6).
 */
export function offTradeReason(question: string, businessType: string): string | null {
  const trade = contentTokens(businessType);
  if (!trade.length) return null;
  const qTokens = normalise(question).split(' ').filter(Boolean);
  if (!qTokens.length) return 'empty question';

  // Door one: the trade's own word, by STEM.
  if (trade.some((t) => tradeStemHit(qTokens, t))) return null;

  // Door two: a known intent for this trade, every token of one alternative present.
  /* ⚠️ INTENT TOKENS MATCH ON A SHARED PREFIX, NOT ON EQUALITY. "installing gas appliances" and
     "gas appliance installation" are the same intent, and neither word is a prefix of the other
     ("installa" vs "installi") — so an exact or prefix-of test misses it. Five shared characters is
     the floor: it joins install/installing/installation and drain/drainage, and is short enough to
     be safe because both sides are already constrained (one is a hand-written intent for this
     trade, the other a token from the question). */
  const alike = (a: string, b: string) => {
    if (a === b || a === `${b}s` || `${a}s` === b) return true;
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i >= 5;
  };
  const has = (w: string) => qTokens.some((q) => alike(q, w));
  for (const intent of intentsForTrade(businessType)) {
    for (const alt of intentAlternatives(intent)) {
      if (alt.every(has)) return null;
    }
  }
  return `does not name the trade (${trade.join('/')}) or any known ${businessType} service — the engines are free to answer it about a different trade`;
}

/**
 * Drop off-trade questions from a GENERATED set and top the count back up from the deterministic
 * templates. Mirrors dropResearchIntent and dropMissingTown exactly, including the case-insensitive
 * dedupe and the deliberate willingness to come up short rather than fabricate filler.
 *
 * ⚠️ THE TOP-UP CAN NEVER BE REJECTED BY THIS FILTER, and that is a property of the templates
 * rather than luck: every one is built as `${trade}${where}` or `${niche} ${trade}${where}`, so the
 * trade word is in all of them by construction. Same reason dropMissingTown's top-up always
 * carries the town. If that template builder ever stops embedding the trade, this guard starts
 * returning short sets and the reason will not be obvious — hence this note.
 */
export function dropOffTrade(
  generated: string[],
  fallback: string[],
  target: number,
  businessType: string,
): { questions: string[]; rejected: Array<{ question: string; reason: string }> } {
  const rejected: Array<{ question: string; reason: string }> = [];
  const seen = new Set<string>();
  const out: string[] = [];
  const take = (list: string[]) => {
    for (const q of list) {
      if (out.length >= target) return;
      const t = (q ?? '').trim();
      if (!t) continue;
      const key = questionKey(t);
      if (seen.has(key)) continue;
      const reason = offTradeReason(t, businessType);
      if (reason) { rejected.push({ question: t, reason }); seen.add(key); continue; }
      seen.add(key);
      out.push(t);
    }
  };
  take(generated);
  take(fallback);
  return { questions: out, rejected };
}

/* ── A WORD REPEATED BACK TO BACK ─────────────────────────────────────────────────────────────
   🔴 White Sparks' FROZEN baseline contains "electrician electrician in thetford UK". It is one
   string, so dedupeQuestions — which compares whole questions — cannot see it; it is not a
   duplicate question, it is a damaged one. It bought a measurement slot in a twelve-question
   baseline that is now the yardstick for a refund, and it will be replayed verbatim at day 28.

   ⛔ REPAIRED, NOT REJECTED, for the same reason qualifyPlace repairs a missing country marker:
   the question is right and only its wording is damaged, and rejecting it would spend the slot on
   a template instead of on the question the model actually meant.

   ⚠️ ADJACENT REPEATS ONLY. "lock repair and lock replacement" repeats "lock" legitimately and is
   left alone; English search phrases essentially never contain a word twice in a row. Collapsing
   any repeated word anywhere would rewrite real questions.

   ⚠️ IT RUNS BEFORE dedupeQuestions, so a repaired question that now equals a real one collapses
   into it rather than buying a second slot with the same words. */
export function stripRepeatedWords(questions: string[]): {
  questions: string[];
  repaired: Array<{ before: string; after: string }>;
} {
  const repaired: Array<{ before: string; after: string }> = [];
  const out = questions.map((q) => {
    const before = (q ?? '').trim();
    if (!before) return before;
    /* Split on whitespace and keep the ORIGINAL casing: the stored question is what the engines
       are asked and what day 28 replays, so this may only ever delete, never re-case. */
    const parts = before.split(/\s+/);
    const kept: string[] = [];
    for (const p of parts) {
      const prev = kept[kept.length - 1];
      if (prev && normalise(prev) === normalise(p) && normalise(p) !== '') continue;
      kept.push(p);
    }
    const after = kept.join(' ');
    if (after !== before) repaired.push({ before, after });
    return after;
  });
  return { questions: out, repaired };
}

/* ── CASE-INSENSITIVE QUESTION IDENTITY ───────────────────────────────────────────────────────
   MEASURED 2026-08-04, locksmiths/Hastings: of 18 questions paid for, "locksmith services in
   hastings uk" and "locksmith services in Hastings UK" were treated as different questions, as
   were "lock repair services Hastings UK" / "lock repair services in hastings uk" and
   "emergency locksmith in hastings uk" / "emergency locksmiths in Hastings UK". Roughly a third of
   the spend bought the same question twice in different capitals.

   Every dedupe site was keyed on `q.trim()`, which is case- and punctuation-SENSITIVE. These two
   helpers are the single definition of "the same question", and the ORIGINAL casing is what gets
   stored and run — only the identity is normalised. */

/** Identity of a question for dedupe: lowercase, punctuation folded, whitespace collapsed.
 *  Deliberately the same normalise() the seed guard already matches on, so "the same question"
 *  means one thing across seeding, generation and the queue. */
export const questionKey = (q: string): string => normalise(q);

/** De-duplicate case-insensitively, KEEPING the first spelling seen (the model's own casing).
 *  Returns the kept list and the dropped duplicates, so a caller can log what it saved. */
export function dedupeQuestions(questions: string[]): { questions: string[]; duplicates: string[] } {
  const seen = new Set<string>();
  const out: string[] = [];
  const duplicates: string[] = [];
  for (const raw of questions ?? []) {
    const q = (raw ?? "").trim();
    if (!q) continue;
    const k = questionKey(q);
    if (!k) continue;
    if (seen.has(k)) { duplicates.push(q); continue; }
    seen.add(k);
    out.push(q);
  }
  return { questions: out, duplicates };
}

/* ── A LOCAL AUDIT'S QUESTIONS MUST NAME THE TOWN ─────────────────────────────────────────────
   MEASURED 2026-08-04: a Hastings locksmith audit ran "emergency locksmith for homes uk" — no
   town anywhere. That is the prompt's NATIONAL pattern ("[service] for [audience] [country]"),
   which the model is free to choose whenever business_scope is null and it classifies the business
   as national. It costs the same as a real question, measures a different market, and pulls
   national brands (Able Group, Lockforce UK, Rapid Secure UK) into a local competitor fold.

   So the town is checked rather than trusted. Rejected questions are topped up from the
   deterministic fallback templates, which always embed the town, so the operator still gets the
   count they paid for. */

/** Does this question name the town? Token-level on the normalised forms, so "Hastings UK",
 *  "hastings uk" and "in hastings" all pass while "for homes uk" does not. Multi-word towns
 *  ("St Neots") must appear as a contiguous run. */
export function mentionsTown(question: string, town: string): boolean {
  const t = normalise(town);
  if (!t) return true;                      // no town to check against — nothing to enforce
  const q = normalise(question);
  return (` ${q} `).includes(` ${t} `) || q.startsWith(`${t} `) || q.endsWith(` ${t}`) || q === t;
}

/** Drop questions that do not name the town, topping up from the fallback templates. Mirrors
 *  dropResearchIntent exactly, including its case-insensitive dedupe. */
export function dropMissingTown(
  generated: string[],
  fallback: string[],
  target: number,
  town: string,
): { questions: string[]; rejected: Array<{ question: string; reason: string }> } {
  const rejected: Array<{ question: string; reason: string }> = [];
  const seen = new Set<string>();
  const out: string[] = [];
  const take = (list: string[], enforce: boolean) => {
    for (const q of list) {
      if (out.length >= target) return;
      const t = (q ?? "").trim();
      if (!t) continue;
      const key = questionKey(t);
      if (seen.has(key)) continue;
      if (enforce && !mentionsTown(t, town)) {
        rejected.push({ question: t, reason: `does not name the town "${town}" — a local audit cannot measure a national question` });
        seen.add(key);
        continue;
      }
      seen.add(key);
      out.push(t);
    }
  };
  take(generated, true);
  take(fallback, true);   // templates always embed the town, so this only tops up
  return { questions: out, rejected };
}

/* ── INTENT COVERAGE FOR MARKET AUDITS ────────────────────────────────────────────────────────
   MEASURED 2026-08-04, locksmiths/Hastings: six independent audits produced 18 questions covering
   only FIVE intents — generic locksmith services, emergency lockout, lock repair, lock replacement,
   online booking — all house-related, and the generic head intent appeared six times. Car keys,
   safes, uPVC/multipoint doors, burglary repair, key cutting and commercial/landlord work were
   never asked, while Bexhill Car Keys, PK Keys and Phoenix Car Keys all showed up in the folds:
   a whole segment of the market was invisible because nobody asked about it.

   WHY NOT JUST ASK MORE QUESTIONS PER AUDIT. The model has no memory between audits, so a bigger
   count buys more of the SAME questions — proven by the six-fold repeat above. Coverage comes from
   telling the generator what this trade and town has already been asked.

   MARKET AUDITS ONLY. A paid baseline's set must be stable and seed-driven, so this never applies
   there: two businesses in one market getting different questions is right for mapping a market and
   wrong for measuring a client. */

/** Intents worth covering for a trade, roughly in commercial order. Hand-maintained and COARSE on
 *  purpose: it steers the generator's coverage, it is never rendered to a customer and never
 *  decides anything on its own. A trade with no entry falls back to the generic list, which reads
 *  sensibly for any local service business. */
const TRADE_INTENTS: Record<string, string[]> = {
  /* ⚠️ THIS LIST IS LOAD-BEARING TWICE NOW. It still steers market-audit coverage, and since
     2026-09-14 it is also the SECOND DOOR of the trade guard: a question carrying no trade word is
     kept only if it matches one of these. So a service missing from a trade's list is a good
     question thrown away. The entries added below were not invented — each one is a real question
     from the book that the guard rejected and the engines had answered correctly. Paul tunes it;
     adding an entry can only ever let MORE questions through, never fewer. */
  locksmith: [
    "emergency lockout", "car keys and auto locksmith", "lock repair", "lock replacement",
    "uPVC and multipoint door locks", "safes", "burglary repair and boarding up", "key cutting",
    "commercial and landlord work", "window locks",
    // added 2026-09-14 from measured false rejections
    "lock installation", "lockout", "key duplication", "rekeying", "security locks",
  ],
  plumber: [
    "emergency plumbing", "boiler repair", "boiler installation", "leak detection",
    "blocked drains", "bathroom installation", "radiators and heating", "power flushing",
    "landlord gas safety", "commercial plumbing",
    // added 2026-09-14 from measured false rejections
    "leak repair", "pipe installation", "pipe repair", "toilet installation", "tap installation",
    "gas appliance installation", "shower installation", "drain cleaning", "drainage",
  ],
  electrician: [
    "emergency electrician", "fuse board replacement", "rewiring", "EV charger installation",
    "EICR and landlord certificates", "lighting installation", "fault finding",
    "outdoor and garden power", "commercial electrical", "PAT testing",
    // added 2026-09-14 from measured false rejections
    "electrical installation", "electrical repairs", "electrical testing", "wiring",
    /* ⛔ "fault diagnosis" IS DELIBERATELY ABSENT, and it is the reason this whole guard exists.
       It is a real electrician service AND a real motor-trade one, and a question that cannot tell
       an engine which trade it means is not a measurement — "fault diagnosis services in thetford
       UK" came back naming six car garages. "fault finding" stays because it is the phrasing an
       electrician's customer actually uses; it measured 5 of 8 firms in trade on the same audit.
       If this line is ever "tidied" for symmetry, White Sparks' fault returns. */
  ],
  'driving instructor': [
    /* ⚠️ NO ENTRY EXISTED, so every driving school fell through to the generic list and "learn to
       drive in Wisbech" — the single best question a driving school has (§ the teaching-trade rule
       above exists precisely to protect it) — was rejected by the guard. */
    "learn to drive", "driving lessons", "intensive course", "automatic lessons",
    "manual lessons", "theory test", "pass plus", "refresher lessons", "test preparation",
  ],
  accountant: [
    "annual accounts", "self assessment", "VAT returns", "payroll", "bookkeeping",
    "corporation tax", "company formation", "CIS and subcontractors",
    "landlord and property tax", "tax investigation",
    // added 2026-09-14 from measured false rejections
    "tax preparation", "tax return", "tax advice", "tax planning", "management accounts",
    "financial statements", "VAT filing",
  ],
  generic: [
    "emergency or urgent work", "repairs", "installation", "servicing and maintenance",
    "inspection and reports", "commercial work", "landlord work", "replacement",
  ],
};

/** The intent vocabulary for a trade. Matching is loose (substring both ways) so "locksmiths",
 *  "auto locksmith" and "emergency locksmith" all reach the locksmith list. */
export function intentsForTrade(businessType: string): string[] {
  const t = normalise(businessType);
  if (!t) return TRADE_INTENTS.generic;
  for (const [key, list] of Object.entries(TRADE_INTENTS)) {
    if (key === "generic") continue;
    if (t.includes(key) || key.includes(t)) return list;
  }
  return TRADE_INTENTS.generic;
}

/** The generic head intent for a trade ("locksmith services in X"), which is the single most
 *  valuable question in a market — and therefore worth asking ONCE and then deliberately not
 *  repeating. True when the question carries no intent beyond the trade itself. */
export function isHeadIntent(question: string, businessType: string): boolean {
  const q = normalise(question);
  const trade = normalise(businessType).replace(/s$/, "");
  if (!trade || !q.includes(trade)) return false;
  /* Anything that adds a real qualifier is NOT the head term. Deliberately a small list of the
     words that make a question specific — matched on the normalised text, so no punctuation or
     casing games. */
  const qualifiers = [
    "emergency", "car", "auto", "key", "safe", "upvc", "multipoint", "burglary", "boarding",
    "commercial", "landlord", "repair", "replace", "replacement", "install", "installation",
    "booking", "boiler", "leak", "drain", "bathroom", "radiator", "heating", "flush", "rewir",
    "fuse", "ev charger", "eicr", "light", "fault", "pat", "vat", "payroll", "bookkeep", "tax",
    "accounts", "assessment", "window", "cut", "service call", "24 hour", "out of hours",
  ];
  return !qualifiers.some((w) => q.includes(w));
}

/** Build the prompt block that steers a market audit onto NEW ground.
 *  `asked` is every question already put to this trade+town; `intents` is the trade vocabulary.
 *  Returns "" when there is nothing to avoid, so the first audit in a market is untouched. */
export function coverageDirective(asked: string[], businessType: string): string {
  const seen = dedupeQuestions(asked).questions;
  if (seen.length === 0) return "";
  const intents = intentsForTrade(businessType);
  const headAsked = seen.some((q) => isHeadIntent(q, businessType));
  const lines = [
    "ALREADY MEASURED IN THIS MARKET — do NOT repeat these or near-variants of them:",
    ...seen.slice(0, 40).map((q) => `- ${q}`),
    "",
    `COVER NEW GROUND. Intents worth reaching for this trade: ${intents.join("; ")}.`,
    "Choose intents from that list (or equally specific ones) that are NOT already covered above.",
  ];
  if (headAsked) {
    lines.push(
      `The generic head question ("${businessType} services in the town") is ALREADY measured — do not ask it again in any phrasing.`,
    );
  }
  return lines.join("\n");
}

/* ══ THE COUNTRY MARKER ON A LOCAL QUESTION ══════════════════════════════════════════════════
   ⛔ 104 OF 104 MARKET-AUDIT QUESTIONS CARRIED NO COUNTRY. Business audits ask "locksmith in
   Wisbech UK"; market audits asked "locksmith in Wisbech". That is the exposure that put Stamford,
   CONNECTICUT plumbers — FAIRCONN, JNR Plumbing LLC, United Sewer & Water — into four reports that
   had already been sent to prospects.

   THE CAUSE WAS A PROMPT CONTRADICTING ITSELF, not a model ignoring it. create-ai-audit told the
   generator both:
       ALWAYS write the place EXACTLY as "Wisbech UK"
       ... no national/uk terms
   and on the forced-local path (which every market audit takes) the second instruction won, every
   time. The prompt is now fixed too, but a prompt is a request.

   ⚠️ THIS REPAIRS RATHER THAN REJECTS, and that is a deliberate difference from dropMissingTown.
   A town-less question is asking about the wrong thing and has to go. A country-less question is
   the RIGHT question with an under-specified place, so throwing it away would burn a good question
   and an LLM call to regenerate one that may come back non-compliant again. Appending cannot fail:
   after this runs the property is true by construction, which is a stronger guarantee than a
   regenerate-and-recheck loop gives.
   ⚠️ Idempotent by design — a question that already carries a country marker is returned untouched,
   so this can never produce "Wisbech UK UK", and re-running it over stored questions is safe. */

/** Country words that already pin a question. Matched whole-word: "uk" must not fire on "ukulele". */
const COUNTRY_MARKERS = ['uk', 'united kingdom', 'england', 'scotland', 'wales', 'britain', 'gb'];

/** A town name is interpolated into a RegExp below, so it has to be escaped — "St. Ives" would
 *  otherwise make "." match any character. Its own function because writing the character class
 *  inline is exactly the sort of line a shell heredoc mangles. */
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hasCountryMarker(question: string): boolean {
  const q = ` ${normalise(question)} `;
  return COUNTRY_MARKERS.some((c) => q.includes(` ${c} `));
}

/**
 * Ensure every LOCAL question names the place with its country: "locksmith in Wisbech" becomes
 * "locksmith in Wisbech UK". Returns the questions and which ones were changed, so the caller can
 * log a repair rather than a silent rewrite.
 *
 * `suffix` is what follows the town — "UK" today. It is a parameter rather than a constant because
 * the geocoder now returns a formatted address, and "Wisbech, Cambridgeshire" pins a town far
 * harder than a country does (Stamford Lincolnshire vs Stamford Connecticut). Changing it is a
 * decision about comparability with every audit already measured, NOT a code change — see the note
 * in create-ai-audit.
 */
export function qualifyPlace(
  questions: string[],
  town: string,
  suffix = 'UK',
): { questions: string[]; repaired: Array<{ before: string; after: string }> } {
  const repaired: Array<{ before: string; after: string }> = [];
  const t = normalise(town);
  if (!t || !suffix.trim()) return { questions, repaired };

  const out = questions.map((raw) => {
    const q = (raw ?? '').trim();
    if (!q) return q;
    if (hasCountryMarker(q)) return q;          // already pinned — never double-append
    if (!mentionsTown(q, town)) return q;       // dropMissingTown owns this case, not us

    /* Replace the LAST occurrence of the town, which is where the place sits in
       "[service] in [town]". Case-insensitive match, but the ORIGINAL casing is kept: rewriting
       "Wisbech" to "wisbech" would change the stored question string for no reason, and the stored
       string is what a day-28 re-measurement re-runs verbatim. */
    const re = new RegExp(`(.*)(${escapeForRegex(town.trim())})`, 'i');
    const m = q.match(re);
    if (!m) return q;
    const after = `${m[1]}${m[2]} ${suffix.trim()}${q.slice(m[0].length)}`.replace(/\s+/g, ' ').trim();
    if (after !== q) repaired.push({ before: q, after });
    return after;
  });
  return { questions: out, repaired };
}

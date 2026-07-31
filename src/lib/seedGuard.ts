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

  const trade = contentTokens(businessType);
  if (trade.length && !trade.some((t) => looseHas(qTokens, t))) {
    return `does not name the trade (${trade.join("/")}) — likely misspelled or about something else`;
  }

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

export interface SeedOutcome {
  questions: string[];
  seeded: string[];
  rejected: Array<{ question: string; reason: string }>;
}

/** Keep the surviving seeds, generate the rest, drop any generated duplicate of a seed. */
export function applySeed(seeds: string[], generated: string[], target: number, businessType: string, locationText: string): SeedOutcome {
  const kept: string[] = [];
  const rejected: Array<{ question: string; reason: string }> = [];
  const seenKey = new Set<string>();
  for (const q of seeds) {
    const reason = seedRejectionReason(q, businessType, locationText);
    if (reason) { rejected.push({ question: q, reason }); continue; }
    const key = normalise(q);
    if (seenKey.has(key)) continue; // a seed repeated in the outreach set counts once
    seenKey.add(key);
    kept.push(q.trim());
  }
  const out = kept.slice(0, target);
  for (const g of generated) {
    if (out.length >= target) break;
    const key = normalise(g);
    if (seenKey.has(key)) continue; // generator produced a seed we already hold
    seenKey.add(key);
    out.push(g.trim());
  }
  return { questions: out, seeded: kept.slice(0, target), rejected };
}

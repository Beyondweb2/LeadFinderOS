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

export function seedRejectionReason(
  question: string,
  businessType: string,
  locationText: string,
): string | null {
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

import { buildMatchContext } from "./market-match.ts";

/* ════════════════════════════════════════════════════════════════════════════════════════════
   MAY WE DERIVE THIS BUSINESS'S REPORT FROM THE TOWN'S MARKET AUDIT?

   ⛔ THE ONE SENTENCE THIS FILE EXISTS TO PREVENT. A derived report says "AI never named you" by
   searching the market audit's answers for the business's name and finding nothing. That is sound
   ONLY when the name is distinctive enough to have been found. For "Chichester Accountants Ltd",
   stripping the trade and the town leaves nothing at all — the matcher has no needle, so a zero
   means "we could not tell", not "you are invisible". Those two must never print the same sentence.

   ⛔ AND THE FAILURE IS ASYMMETRIC, WHICH IS WHY THE GATE IS STRICT. Telling a business it is
   invisible when it is not is the worst thing this product can do — Wilson rejected his report over
   a milder version of it and he was right. Refusing to derive costs 8p for a per-business audit.
   A false "you're invisible" costs the prospect and the reputation. When in doubt, refuse.

   ⚠️ IT DOES NOT DECIDE WHETHER THE BUSINESS WAS NAMED. That is nameMatches' job, unchanged, on the
   same answer text it has always read. This decides only whether a NEGATIVE result is publishable.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Minimum answered datapoints before a "never named" claim is worth making at all. 8 questions ×
 *  2 engines = 16 on a full market audit; 10 leaves room for a partly-capped one while still being
 *  a real sample. Below this the honest answer is "we have not measured enough". */
export const MIN_ANSWERED_DATAPOINTS = 10;

/** A core shorter than this prefix-matches half a town's businesses. Mirrors MIN_CORE_CHARS in
 *  market-match.ts, stated here because the reason differs: there it prevents an over-merge, here it
 *  prevents an unfounded negative. */
const MIN_DISTINCTIVE_CHARS = 4;

export type DerivableRefusal =
  | "name_not_distinctive"
  | "too_few_answers"
  | "no_business_name";

export interface DerivableVerdict {
  /** True only when a NEGATIVE finding would be safe to publish for this business. */
  ok: boolean;
  /** Present when ok is false. Written for a human reading a skipped lead, not a log grep. */
  reason?: DerivableRefusal;
  /** What the matcher would actually have to find. Empty is exactly why we refuse. */
  distinctive: string[];
  /** Echoed back so a caller does not have to recount to explain itself. */
  answeredDatapoints: number;
}

/**
 * Can a "never named" claim be made for this business from this market audit?
 *
 * ⛔ EVERY PATH THAT CANNOT ESTABLISH DISTINCTIVENESS RETURNS ok:false. The default is refusal, and
 * a caller cannot reach `ok: true` without a positive: a name that keeps at least one token of real
 * length after the trade and the town are removed, AND enough answered datapoints to have looked.
 */
export function canDeriveReport(args: {
  businessName: string | null | undefined;
  trade: string | null | undefined;
  town: string | null | undefined;
  answeredDatapoints: number;
}): DerivableVerdict {
  const answeredDatapoints = Number.isFinite(args.answeredDatapoints) ? Math.max(0, args.answeredDatapoints) : 0;
  const name = String(args.businessName ?? "").trim();
  if (!name) return { ok: false, reason: "no_business_name", distinctive: [], answeredDatapoints };

  /* ⛔ STRIPPED EXPLICITLY, NOT VIA candidateCores. The first version of this leaned on
     candidateCores to have already dropped the town and the trade, and the suite caught it doing no
     such thing: "Chichester Accountants Ltd" came back with a core of "chichester" and passed the
     gate, while "A1 Accountants Chichester" kept the town outright. candidateCores truncates at the
     first generic token for MERGE purposes, which is a different job from asking what is left of a
     name once its market is removed — and borrowing it silently inverted the gate in exactly the
     case it exists for.
     ⚠️ buildMatchContext IS still shared, so "which words are the trade and the town" has one
     answer across the system. Only the question asked of them differs. */
  const ctx = buildMatchContext(String(args.trade ?? ""), String(args.town ?? ""));
  const noise = new Set<string>([
    ...ctx.townTokens, ...ctx.tradeTokens,
    /* Legal and connective forms carry no identity. Deliberately short and explicit: a long list
       here would start deleting real names. */
    "ltd", "limited", "llp", "plc", "the", "and", "co", "company", "uk", "services", "service",
  ]);
  /* ⛔ A TRADE WORD IN ANOTHER GRAMMATICAL FORM IS STILL A TRADE WORD. The suite caught
     "Chichester Accountancy Limited" passing the gate against the trade "accountants": the
     singular/plural pair is handled, "-ancy" is not, and no enumeration of suffixes will ever be
     complete (plumbers/plumbing, electricians/electrical, valeters/valeting).
     So the test is a SHARED PREFIX of at least 5 characters with a trade token, both words being
     that long. "accountancy" and "accountants" share 9; "plumbing" and "plumbers" share 5.
     ⚠️ THIS WILL SOMETIMES STRIP A REAL NAME — "Plumbline" against the trade "plumbers" shares 5 —
     and that is the direction to err in. A wrongly-stripped name refuses to derive and costs 8p for
     a per-business audit; a wrongly-KEPT one lets us tell a business it is invisible on the strength
     of its own trade word. The whole file exists to prefer the first mistake. */
  const tradeTokens = [...ctx.tradeTokens].filter((t) => t.length >= 5);
  const sharesTradeStem = (t: string): boolean => {
    if (t.length < 5) return false;
    return tradeTokens.some((tt) => {
      let i = 0;
      while (i < t.length && i < tt.length && t[i] === tt[i]) i++;
      return i >= 5;
    });
  };
  const tokens = name.toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !noise.has(t) && !noise.has(t.replace(/s$/, "")) && !noise.has(t + "s"))
    .filter((t) => !sharesTradeStem(t));
  /* Length is measured on what SURVIVES, in total: "A1" alone is not a needle, and neither is a
     single two-letter initial. */
  const remaining = tokens.join("");
  const distinctive = remaining.length >= MIN_DISTINCTIVE_CHARS ? [tokens.join(" ")] : [];

  if (distinctive.length === 0) {
    /* "Chichester Accountants Ltd" lands here: town, trade and a suffix, and nothing left to find.
       A zero for this business is unmeasurable, not negative. */
    return { ok: false, reason: "name_not_distinctive", distinctive, answeredDatapoints };
  }
  if (answeredDatapoints < MIN_ANSWERED_DATAPOINTS) {
    return { ok: false, reason: "too_few_answers", distinctive, answeredDatapoints };
  }
  return { ok: true, distinctive, answeredDatapoints };
}

/** What to tell the operator, in words that say which of the two things happened. */
export function explainRefusal(v: DerivableVerdict): string {
  switch (v.reason) {
    case "no_business_name":
      return "no business name stored, so there is nothing to look for";
    case "name_not_distinctive":
      return "the name is only its trade and town, so a blank result would mean \"we could not tell\" "
        + "rather than \"AI never named you\" — audit this one individually";
    case "too_few_answers":
      return `only ${v.answeredDatapoints} answers available, below the ${MIN_ANSWERED_DATAPOINTS} `
        + "needed before absence means anything";
    default:
      return "";
  }
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE NAME TEST ON ITS OWN — for a score that already exists.

   ⛔ WHY THIS WRAPPER EXISTS AND WHY IT IS NOT A SECOND RULE. canDeriveReport answers "may we
   publish a NEGATIVE for a business we have not audited", and it asks two things: is the name
   findable, and did we look hard enough. A stored `named` flag has already looked — the question
   left is only whether the match MEANT anything. "Blackpool Plumber" matches an answer about
   plumbers in Blackpool on its trade and its town alone, so its 3/3 is not a measurement of that
   business at all, and it inflates every rate it is folded into.

   ⚠️ SO THE SAMPLE-SIZE CLAUSE IS BYPASSED DELIBERATELY, not forgotten: a 3-question hook audit
   carries 6 cells and would fail MIN_ANSWERED_DATAPOINTS, which is the right answer to a different
   question and would silently delete most of the book from every trade-level figure.

   ⛔ DERIVED ON READ, NEVER STORED. No score is rewritten; a fold applies this as it counts, so
   historical rows are covered by the same predicate as new ones with no migration.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
export function nameIsJudgeable(args: {
  businessName: string | null | undefined;
  trade: string | null | undefined;
  town: string | null | undefined;
}): boolean {
  return canDeriveReport({ ...args, answeredDatapoints: Number.MAX_SAFE_INTEGER }).ok;
}

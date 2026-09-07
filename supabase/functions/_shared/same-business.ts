/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS THE SAME BUSINESS? — the free-check dedupe's judgement, extracted and made strict.

   ⛔ WHY THIS EXISTS. The dedupe reused an existing lead on an exact business_name, an exact
   place_id or an exact phone, and two of those three collide between GENUINELY DIFFERENT businesses.
   Measured over 3,192 real leads on 2026-09-07:
     · 87 exact business names are shared; 4 of them are provably different businesses (different
       Google place_ids) — "Timpson" (Blyth AND Wisbech), "Timpson Locksmiths and Safe Engineers"
       (7 leads, 7 place_ids, Bournemouth/Ipswich/Poole), "AC Leigh" (Ipswich AND Norwich),
       "Fletcher Lock & Safe Co" (TWO different shops, both in Sunderland).
     · 105 phone numbers are shared; 29 of those sit on DIFFERENT business names. The worst is
       448000187187 — Timpson's national switchboard — on 15 leads across at least 8 towns.
       Toolstation's 443303333303 spans March, Hampshire and Bath.
   A free-check submission landing on any of those matched an arbitrary one of them, and the
   consequence compounds: the prospect gets no lead of their own, the per-lead 7-day audit guard
   then refuses to audit them because a STRANGER was audited recently, so they get no report at all
   and the row in Outreach carries someone else's name.

   ⛔ AND `.limit(1).maybeSingle()` WAS PICKING ARBITRARILY. With seven Timpson leads the dedupe
   took whichever row Postgres happened to return first. That is not a tie-break, it is a coin toss
   deciding whose business a prospect gets attributed to.

   ⛔ THE RULE, WHICH IS PAUL'S CALL (2026-09-07): "when there's ambiguity, treat it as a NEW lead
   and run a fresh audit rather than risk attaching to the wrong business. For a free check, running
   fresh is safer than wrongly matching." So this module only ever returns a match when exactly ONE
   candidate survives; every other shape refuses and says why.

   ⛔ WHY RUNNING FRESH IS SAFE, and it is only safe because of something else: a duplicate lead
   cannot produce a duplicate cold message. process-whatsapp-queue refuses any cold template for a
   number with prior message history WHATEVER LEAD ROW IT ARRIVES ON (`isColdOutreachTemplate` plus
   the phone-history seatbelt, added after 25 duplicate openers went out in August). Without that
   seatbelt, loosening this dedupe would trade a mis-attribution bug for a spam bug.

   ⚠️ THE COST OF BEING STRICT, STATED: a genuine repeat submission whose lead has no town, or who
   types the town differently ("Newcastle" against a stored "newcastle upon tyne"), now creates a
   second lead and spends a fresh audit (~4p plus ~5p of enrichment). 138 of 3,192 leads have no
   town at all and can never satisfy the check. That is the price of the rule above, and the daily
   cap bounds it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** A lead that matched one of the dedupe keys. Structural, so this module stays pure and testable. */
export interface SameBusinessCandidate {
  id: string;
  business_name: string | null;
  /* ⛔ ALL THE TOWN EVIDENCE, NOT THE "BEST" ONE. The first version preferred derived_town and
     ignored the rest, and the replay over real submissions caught what that costs: "sinners and
     saints" has derived_town "Muang" (Google's district) while its search_location is "chiang mai"
     and its address reads "... Chang Wat Chiang Mai 50100, Thailand". A customer types Chiang Mai.
     So a GENUINE repeat submission failed the check and would have forked a second lead and paid
     for a second audit, every time.
     ⚠️ THIS IS THE postal_town PROBLEM ALREADY ON RECORD, in a new place: CLAUDE.md notes that
     postal_town can be coarser or simply different from the name a customer would use (Southsea
     derives Portsmouth). Any single column is therefore the wrong thing to compare against.
     ⚠️ AND IT DOES NOT LET THE CHAIN COLLISIONS BACK IN, which is the property that matters: a
     Blyth Timpson has no "wisbech" in its town fields OR its address, so widening the evidence
     admits more TRUE matches without admitting a single false one. Verified by replaying every real
     submission before and after. */
  town: string | null;
  /** search_location — where we were looking when the lead was found. */
  searchLocation?: string | null;
  /** The full formatted address, matched by whole-token run (never a bare substring). */
  address?: string | null;
  place_id: string | null;
  is_archived: boolean | null;
  /** Oldest-first tie-breaking for the place_id rung. */
  created_at: string | null;
}

export type SameBusinessVerdict =
  | { kind: "match"; leadId: string; why: string }
  | { kind: "refused"; reason: string };

/**
 * Fold a town to something comparable.
 *
 * ⚠️ DELIBERATELY NOT CLEVER. Casefold, strip punctuation, collapse whitespace — and nothing else.
 * No aliases, no "upon tyne" trimming, no fuzzy distance. Every one of those would be a judgement
 * about whether two place names mean the same place, which is exactly the kind of loose matching
 * this file exists to remove. A town we cannot match exactly costs one fresh audit; a town we match
 * wrongly costs a prospect their report and attributes them to a stranger.
 */
export function normaliseTown(t: string | null | undefined): string {
  return (t ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Do the submission's town and ONE lead town field provably agree? An absent town on either side
 *  is NOT agreement — it is the absence of evidence, and this file never reads that as a yes. */
export function townsAgree(submitted: string | null | undefined, lead: string | null | undefined): boolean {
  const a = normaliseTown(submitted);
  const b = normaliseTown(lead);
  return a.length > 0 && a === b;
}

/**
 * Does the submitted town appear in an address as a WHOLE TOKEN RUN?
 *
 * ⛔ NOT `includes` ON THE RAW STRING. This project has been fooled twice each by "bing" matching
 * plum-BING and "acca" matching M-ACCA-Gas; a bare substring test on an address would match "Ely"
 * inside "Wembley". Both sides are normalised and padded with spaces, so only complete tokens can
 * line up.
 */
export function addressMentionsTown(submitted: string | null | undefined, address: string | null | undefined): boolean {
  const t = normaliseTown(submitted);
  const a = normaliseTown(address);
  return t.length > 0 && a.length > 0 && ` ${a} `.includes(` ${t} `);
}

/** Agreement against ANY town evidence the lead carries. */
export function candidateInTown(submitted: string | null | undefined, c: SameBusinessCandidate): boolean {
  return townsAgree(submitted, c.town)
    || townsAgree(submitted, c.searchLocation ?? null)
    || addressMentionsTown(submitted, c.address ?? null);
}

/**
 * The place_id rung: identity, so it does NOT need a town check.
 *
 * ⛔ A GOOGLE PLACE ID IS THE BUSINESS. Two leads sharing one are duplicates of the same shop, not
 * two shops — so matching is right, and the only question is which row. Oldest wins, deterministically,
 * because "whichever Postgres returned first" is how a prospect ends up attached to a random
 * duplicate. This rung is exempt from the town rule on purpose: Fletcher Lock & Safe Co is two
 * different shops in ONE town, and the place_id is the only thing that can tell them apart.
 */
export function pickByPlaceId(candidates: SameBusinessCandidate[]): SameBusinessVerdict {
  if (candidates.length === 0) return { kind: "refused", reason: "no lead has this place_id" };
  const oldest = [...candidates].sort((a, b) =>
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))[0];
  return {
    kind: "match",
    leadId: oldest.id,
    why: candidates.length === 1
      ? "same Google place_id"
      : `same Google place_id (${candidates.length} duplicate leads share it; took the oldest)`,
  };
}

/**
 * The name and phone rungs: a match ONLY when exactly one candidate is in the submitted town.
 *
 * `keyLabel` is what matched ("business name" / "phone"), used in the reason so the operator email
 * and the dashboard can say why a new lead was created instead of silently doing it.
 */
export function pickSameBusiness(
  candidates: SameBusinessCandidate[],
  submittedTown: string | null | undefined,
  keyLabel: string,
): SameBusinessVerdict {
  if (candidates.length === 0) return { kind: "refused", reason: `no lead has this ${keyLabel}` };

  /* ⛔ NO TOWN ON THE SUBMISSION MEANS NO MATCH ON THESE RUNGS. Without it there is nothing to
     disambiguate with, and the whole point is that the key alone is not enough. The free-check form
     always asks for a town, so this is a malformed submission rather than a normal one. */
  if (normaliseTown(submittedTown).length === 0) {
    return {
      kind: "refused",
      reason: `${keyLabel} matched ${candidates.length} lead(s) but the submission carries no town, so the same business cannot be established`,
    };
  }

  const inTown = candidates.filter((c) => candidateInTown(submittedTown, c));

  if (inTown.length === 1) {
    const c = inTown[0];
    return {
      kind: "match",
      leadId: c.id,
      why: `same ${keyLabel} and the same town (${normaliseTown(submittedTown)})`
        + (candidates.length > 1 ? `; ${candidates.length - 1} other lead(s) share the ${keyLabel} in other towns` : ""),
    };
  }

  if (inTown.length === 0) {
    /* The Timpson case: the key matches a chain in other towns. Naming the towns makes the refusal
       auditable rather than a shrug. */
    const towns = [...new Set(candidates.flatMap((c) =>
      [normaliseTown(c.town), normaliseTown(c.searchLocation ?? null)]).filter((t) => t.length > 0))];
    return {
      kind: "refused",
      reason: `${keyLabel} matched ${candidates.length} lead(s), none of them in ${normaliseTown(submittedTown)}`
        + (towns.length ? ` (they are in ${towns.join(", ")})` : " (none of them has a town on file)"),
    };
  }

  /* ⛔ TWO OR MORE IN THE SAME TOWN IS THE ONE THE TOWN RULE CANNOT SOLVE, AND IT MUST REFUSE.
     Fletcher Lock & Safe Co is two different shops in Sunderland; Ipswich holds four "Timpson
     Locksmiths and Safe Engineers" leads across three place_ids. Picking one would be the arbitrary
     choice this module was written to delete. */
  return {
    kind: "refused",
    reason: `${keyLabel} matched ${inTown.length} different leads in ${normaliseTown(submittedTown)} itself, so which business this is cannot be established`,
  };
}

/* ============================================================
   TRADE WORD

   Turns a lead's raw category into the natural singular noun a person would use
   about themselves.

   PORTED VERBATIM from findable-site's src/lib/trade.ts (where it feeds the
   onboarding headline "Be the <trade> AI recommends"). Kept as a copy rather than
   reinvented, so the two repos normalise a trade the same way; the two projects
   deploy separately and cannot share a module. If you change the patterns, change
   them in both.

   Here it groups the Audit page's audit book by trade. That matters because the raw
   business_type values do not group: measured in this database, plumber (21) +
   plumbers (10) + Plumber (1) are one trade stored three ways, and accountants (7)
   + Accountant (2) + accountant (1) are another. Grouping on the raw string gives
   seven groups where three exist.

   The raw values are messy and come from several places: search keywords
   ("plumber", "plumbers", "accountants"), Google-style categories ("Plumbing &
   Heating Services"), ad copy ("24 hour Emergency Plumber"), self-descriptions
   ("Chartered certified accountant") and occasionally something that is not a
   trade at all ("kava cafe, pool bar").

   Rule: only ever return a word that reads naturally in the sentence. Anything
   we cannot confidently clean falls back to "business", which always reads.
   ============================================================ */

/** Ordered: FIRST match wins, so multi-word and more specific trades come before
 *  the broad stems they contain. Matched against a lowercased, punctuation-free
 *  copy of the raw value, so a stem like "plumb" catches plumber, plumbers,
 *  plumbing and Plumbing & Heating. */
const TRADE_PATTERNS: Array<[RegExp, string]> = [
  // Multi-word trades first.
  [/heating engineer|gas engineer|boiler engineer/, "heating engineer"],
  [/driving instructor/, "driving instructor"],
  [/estate agent/, "estate agent"],
  [/tree surgeon|tree surgery/, "tree surgeon"],
  [/chimney sweep/, "chimney sweep"],
  [/pest control/, "pest control company"],
  [/window cleaner|window cleaning/, "window cleaner"],
  // Trades and professions, by stem.
  [/plumb/, "plumber"],
  [/electric/, "electrician"],
  [/bookkeep/, "bookkeeper"],
  [/account/, "accountant"],
  [/roofer|roofing/, "roofer"],
  [/plaster/, "plasterer"],
  [/glazier|glazing/, "glazier"],
  [/locksmith/, "locksmith"],
  [/carpenter|carpentry|joiner/, "carpenter"],
  [/decorator|decorating|painter|painting/, "decorator"],
  [/landscap/, "landscaper"],
  [/garden/, "gardener"],
  [/scaffold/, "scaffolder"],
  [/tiler|tiling/, "tiler"],
  [/bricklay/, "bricklayer"],
  [/welder|welding|fabricat/, "welder"],
  [/flooring|floor fitter/, "floor fitter"],
  [/kitchen fitter|kitchen install/, "kitchen fitter"],
  [/bathroom fitter|bathroom install/, "bathroom fitter"],
  [/handyman|handy man/, "handyman"],
  [/cleaner|cleaning/, "cleaner"],
  [/builder|building contractor|construction/, "builder"],
  [/barber/, "barber"],
  [/hairdress|hair salon|hair stylist/, "hairdresser"],
  [/beautician|beauty salon/, "beautician"],
  [/solicitor|law firm|lawyer|legal services/, "solicitor"],
  [/surveyor/, "surveyor"],
  [/architect/, "architect"],
  [/mortgage (adviser|advisor|broker)/, "mortgage adviser"],
  [/financial (adviser|advisor)/, "financial adviser"],
  [/dentist|dental/, "dentist"],
  [/optician|optometrist/, "optician"],
  [/physio/, "physiotherapist"],
  [/chiropract/, "chiropractor"],
  [/osteopath/, "osteopath"],
  [/veterinar|\bvets?\b/, "vet"],
  [/mechanic|car repair|\bgarage\b|mot centre|motor engineer/, "mechanic"],
  [/removals|removal company|man and van/, "removals company"],
  [/photograph/, "photographer"],
  [/caterer|catering/, "caterer"],
  [/florist/, "florist"],
  [/butcher/, "butcher"],
  [/baker(y|s)?\b/, "baker"],
  [/plumber/, "plumber"],
];

/** Single words we accept as-is when nothing above matched: an occupational
 *  ending is strong evidence the word reads naturally after "Be the ...". */
const OCCUPATION_ENDING = /(er|or|ist|ian|smith|wright|monger)$/;

/** Words that end like an occupation but are not one, so must not slip through. */
const NOT_A_TRADE = new Set([
  "other", "for", "your", "our", "super", "master", "premier", "corner", "center", "centre",
  "matter", "water", "power", "silver", "copper", "summer", "winter", "border", "order",
  "major", "minor", "senior", "junior", "interior", "exterior", "manor", "mirror",
]);

/** Drop a trailing plural s (plumbers -> plumber) without mangling words like
 *  "business" or "gas". */
function singular(word: string): string {
  if (/(ss|us|is)$/.test(word)) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && word.length > 3) return word.slice(0, -1);
  return word;
}

/**
 * The trade noun for the headline, or "business" when we cannot tell.
 * Always lowercase and singular, so it sits naturally mid-sentence.
 */
export function tradeWord(raw: string | null | undefined): string {
  const cleaned = (raw ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z\s]/g, " ") // strips digits and punctuation: "24 hour Emergency Plumber"
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "business";

  for (const [pattern, trade] of TRADE_PATTERNS) {
    if (pattern.test(cleaned)) return trade;
  }

  // Nothing known matched. Accept a lone occupational word (covers trades missing
  // from the list, e.g. "upholsterer"), but only a lone one: a phrase we could not
  // recognise is more likely to read badly than well.
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length === 1) {
    const word = singular(words[0]);
    if (word.length > 3 && OCCUPATION_ENDING.test(word) && !NOT_A_TRADE.has(word)) return word;
  }
  return "business";
}

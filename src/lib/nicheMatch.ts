/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FIND LEADS: "NOT A MATCH" (Paul, 2026-10-23). A search for "driving instructors" also returns Mackay Hyundai and
   the Department of Transport. Those go behind ONE grey "Not a match" line with a Show button, exactly like the
   out-of-town line: kept, never deleted, never counted in "found", and ordinary rows again once shown.

   THE RULE — BOTH must hold, so a good result is hidden only when two separate readings agree it is not the niche:
     1. its NAME has none of the niche's words (stems: "plumb" for plumbers, "driv" for driving instructors, plus a
        few words the trade uses: "lock"/"key" for locksmiths, "motoring" for driving schools); and
     2. Google's CATEGORY (places.primaryType) is a specific type outside the niche's family. A generic category
        ("service", "educational institution", "consultant", none at all) never hides anything — most real driving
        schools are "educational_institution", most accountants "consultant".
   Measured on the cached searches of the 30 days to 2026-10-23: docs/find-leads-not-a-match.md.

   ⛔ ABSENT IS NOT A MISMATCH: no category, no keyword, or a keyword we cannot read → shown.
   Pure: no I/O. Relative imports with .ts (no @/), so it can be read anywhere.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Google categories that say nothing about the trade: never a reason to hide. */
const GENERIC_TYPES: ReadonlySet<string> = new Set([
  'service', 'establishment', 'point_of_interest', 'store', 'premise', 'consultant', 'corporate_office',
  'association_or_organization', 'educational_institution', 'professional_services', 'business_center',
  'non_profit_organization', 'subpremise', 'street_address', 'locality', 'company',
]);

/** Families of categories that belong together: a search that matches one member accepts them all. `words` are
 *  extra name/keyword stems the family uses. */
const FAMILIES: ReadonlyArray<{ types: RegExp; words: string[] }> = [
  { types: /(?:^|_)(?:restaurant|cafe|coffee_shop|bar|pub|meal_takeaway|meal_delivery|bakery|steak_house|diner|bistro|food|sandwich_shop|cafeteria|dessert_shop|brewery|wine_bar|tea_house|ice_cream_shop|juice_shop|deli|catering_service|caterer|fast_food_restaurant|pizza|grill|gastropub|izakaya)$/, words: ['restaurant', 'cafe', 'takeaway', 'food', 'dining', 'bistro', 'eatery', 'kitchen', 'pizza', 'curry', 'grill'] },
  { types: /^(?:gym|fitness_center|sports_club|sports_coaching|yoga_studio|pilates_studio|sports_complex|martial_arts_school|boxing_gym|swimming_pool|sports_activity_location|personal_trainer)$/, words: ['gym', 'fitness', 'trainer', 'crossfit', 'yoga', 'pilates', 'boxing', 'strength'] },
  { types: /^(?:plumber|electrician|roofing_contractor|painter|general_contractor|hvac_contractor|carpenter|handyman|construction_company|contractor|plasterer|builder|home_builder|landscaper|flooring_contractor|window_installation_service|locksmith|heating_contractor|gas_engineer|bathroom_remodeler|kitchen_remodeler)$/, words: ['plumb', 'heating', 'gas', 'boiler', 'electric', 'roof', 'build', 'construct', 'paint', 'decorat', 'handyman', 'joiner', 'carpent', 'plaster', 'property', 'maintenance', 'repair'] },
  { types: /^(?:driving_school)$/, words: ['driv', 'motoring', 'instruct', 'lesson', 'theory'] },
  { types: /^(?:locksmith|security_system_supplier|key_cutting)$/, words: ['lock', 'key', 'security', 'safe', 'door'] },
  { types: /^(?:school|language_school|tutoring|tutor|educational_institution|training_centre|training_center)$/, words: ['school', 'tutor', 'tuition', 'academy', 'learning', 'english', 'language', 'lesson', 'class'] },
  { types: /^(?:accounting|tax_preparation_service|tax_consultant|financial_consultant|bookkeeping_service|financial_planner)$/, words: ['account', 'tax', 'bookkeep', 'payroll', 'finance', 'audit'] },
  { types: /^(?:lawyer|law_firm|attorney|legal_services|notary_public|solicitor)$/, words: ['solicitor', 'law', 'legal', 'lawyer', 'conveyanc'] },
  { types: /^(?:beauty_salon|hair_salon|barber_shop|nail_salon|spa|hair_care|beautician|massage|skin_care_clinic|tanning_studio|makeup_artist|eyebrow_bar)$/, words: ['beauty', 'hair', 'barber', 'nail', 'salon', 'spa', 'brow', 'lash', 'massage', 'skin'] },
  { types: /^(?:car_repair|car_dealer|tire_shop|auto_parts_store|car_wash|car_rental|auto_body_shop|car_detailing)$/, words: ['car', 'auto', 'motor', 'garage', 'mechanic', 'tyre', 'tire', 'mot', 'vehicle'] },
  { types: /^(?:dentist|dental_clinic|orthodontist)$/, words: ['dent', 'teeth', 'tooth', 'orthodont', 'smile'] },
  { types: /^(?:photographer|video_production_service|film_production|photography_studio|wedding_photographer)$/, words: ['photo', 'video', 'film', 'studio', 'media', 'production'] },
  { types: /^(?:cleaning_service|house_cleaning_service|carpet_cleaning_service|window_cleaning_service|janitorial_service)$/, words: ['clean', 'valet', 'carpet', 'window'] },
  { types: /^(?:veterinary_care|pet_groomer|pet_store|dog_trainer|kennel|pet_boarding_service)$/, words: ['vet', 'pet', 'dog', 'groom', 'animal', 'cat'] },
];

const STOP: ReadonlySet<string> = new Set(['and', 'the', 'of', 'in', 'for', 'a', 'an', 'my', 'near', 'me', 'best', 'local', 'services', 'service', 'company', 'ltd', 'limited', 'uk']);

/** A word's stem: lowercase, a plural dropped, then one common ending — "electricians" → "electric", "plumbing" → "plumb". */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  for (const end of ['ing', 'ian', 'ist', 'ant', 'ers', 'er', 'al', 'ry', 'cy']) {
    if (w.endsWith(end) && w.length - end.length >= 4) return w.slice(0, -end.length);
  }
  return w;
}

const tokens = (s: string): string[] => String(s ?? '').toLowerCase().replace(/&/g, ' ').split(/[^a-z0-9]+/).filter((t) => t.length >= 2 && !STOP.has(t));
/** Does one word share a stem with another ("roofing" ~ "roofer", "locks" ~ "locksmith")? Short stems need the whole word. */
function sameStem(word: string, s: string): boolean {
  const w = word.toLowerCase();
  if (s.length < 3) return false;
  if (s.length === 3) return w === s || stem(w) === s;   // "gym", "car", "mot", "vet", "gas" — never a prefix of another word
  return w.startsWith(s) || stem(w).startsWith(s) || (stem(w).length >= 4 && s.startsWith(stem(w)));
}

export interface NicheProfile { stems: string[]; family: Set<number> }

/** What a search's niche means, read once per keyword. null = no readable niche (nothing is ever hidden). */
export function nicheProfile(keyword: string | null | undefined): NicheProfile | null {
  const own = tokens(String(keyword ?? '')).map(stem).filter((s) => s.length >= 3);
  if (!own.length) return null;
  const family = new Set<number>();
  FAMILIES.forEach((f, i) => {
    if (own.some((s) => f.words.some((fw) => sameStem(fw, s) || sameStem(s, fw)))) family.add(i);
  });
  const stems = [...new Set([...own, ...[...family].flatMap((i) => FAMILIES[i].words)])];
  return { stems, family };
}

/** Does the business's name carry one of the niche's words? */
export function nameMatchesNiche(name: string | null | undefined, p: NicheProfile): boolean {
  const ws = tokens(String(name ?? ''));
  /* A run-together name ("Plumbworld", "Keytec") still counts: the stem at the start of a word. */
  return ws.some((w) => p.stems.some((s) => sameStem(w, s)));
}

/** Does Google's category fit the niche (its own words, or a category in the niche's family)? null = no category. */
export function typeFitsNiche(primaryType: string | null | undefined, p: NicheProfile): boolean | null {
  const t = String(primaryType ?? '').trim().toLowerCase();
  if (!t) return null;
  if (GENERIC_TYPES.has(t)) return true;
  if (t.split('_').some((w) => w.length >= 3 && p.stems.some((s) => sameStem(w, s)))) return true;
  return [...p.family].some((i) => FAMILIES[i].types.test(t));
}

/** THE RULE: true = clearly not the niche searched (hidden behind the "Not a match" line). */
export function notNicheMatch(lead: { name?: string | null; primaryType?: string | null }, p: NicheProfile | null): boolean {
  if (!p) return false;
  if (nameMatchesNiche(lead.name, p)) return false;
  return typeFitsNiche(lead.primaryType, p) === false;
}

/** Held back from every count and action unless the "Not a match" line is shown (as heldOutOfTown is for the town). */
export function heldNotMatch(lead: { name?: string | null; primaryType?: string | null }, p: NicheProfile | null, showNotMatch: boolean): boolean {
  return !showNotMatch && notNicheMatch(lead, p);
}

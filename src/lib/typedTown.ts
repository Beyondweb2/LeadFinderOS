/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE TYPED TOWN — what counts as a real town on a lead that has no Google place (2026-10-15).

   WHY. A CSV import (import_batch) has no place id, so Google can never confirm its town, and the audit
   town gate refused every one of them (409 town_unverified) although each row carries the town a person
   typed for that business. A hand-added lead (lead_source) was already let through on its typed town; an
   imported one is the same evidence, so it is let through the same way — here, in ONE place.

   ⛔ A TYPED TOWN IS ONLY EVIDENCE WHEN IT IS A TOWN. "Online", "Online; team reports tutors in Singapore,
   Malaysia…", "Remote", "Worldwide" are not a place; a question asked about them is a question about
   nothing ("language tutoring … in online"). `cleanTypedTown` returns "" for those, and "" is never a town.

   Pure, no imports: edge functions import it by relative path with the .ts extension.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** First words that say the lead is NOT at a place. Whole-word match on the first word of the first segment. */
const NOT_A_PLACE_FIRST_WORDS = new Set([
  'online', 'remote', 'virtual', 'worldwide', 'global', 'international', 'internet', 'everywhere', 'anywhere',
  'nationwide', 'national', 'various', 'multiple', 'unknown', 'tbc', 'tba', 'tbd', 'n/a', 'na', 'none', 'nil',
  'null', 'undefined', 'other', 'misc', 'others',
]);

/** A real town name is a handful of words; a sentence is a note, not a place. */
const MAX_TOWN_WORDS = 5;

/**
 * The town in a typed location, or "" when there is no real one.
 *   "Kuala Lumpur (Sunway Velocity 2)"  → "Kuala Lumpur"     (the bracket is a landmark, not the town)
 *   "Klang (Pandamaran)"                → "Klang"
 *   "Online; team reports tutors in …"  → ""                 (not a place)
 *   "Online"                            → ""
 * Only the FIRST segment (before ';' or a newline) is read — the rest of such a cell is prose, never mined.
 */
export function cleanTypedTown(raw: string | null | undefined): string {
  let s = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.split(/[;\n]/)[0].trim();
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, '');
  if (!s) return '';
  const first = s.toLowerCase().split(/[\s,]+/)[0].replace(/[^a-z/]/g, '');
  if (NOT_A_PLACE_FIRST_WORDS.has(first)) return '';
  if (s.split(' ').length > MAX_TOWN_WORDS) {
    /* "Tangga Batu / Tanjung Kling, Melaka": a list of neighbourhoods ending in the city — the city is the town.
       Only the LAST comma segment, and only when it is itself a short real town; prose gets nothing. */
    const last = s.includes(',') ? s.split(',').pop()!.trim() : '';
    /* every word capitalised (or a slash / digit): a list of place names, never a sentence */
    const namesOnly = s.split(/[s,]+/).every((w) => !/^[a-z]/.test(w));
    return namesOnly && last && last.split(' ').length <= 3 && !NOT_A_PLACE_FIRST_WORDS.has(last.toLowerCase()) ? last : '';
  }
  if (!/[a-zÀ-ɏЀ-ӿ؀-ۿऀ-ॿ一-鿿]/i.test(s)) return '';
  return s;
}

/** True when `raw` is a real town exactly as written (nothing had to be dropped to make it one). */
export function isRealTown(raw: string | null | undefined): boolean {
  const t = String(raw ?? '').trim();
  return !!t && cleanTypedTown(t) === t;
}

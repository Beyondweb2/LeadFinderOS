/* ═══════════════════════════════════════════════════════════════════════════════════════
   PLACE ASK — how an AMBIGUOUS place is asked (Paul, 2026-11-11). "Stratford" is Stratford E15 or Stratford-upon-Avon;
   "Newcastle" is Newcastle upon Tyne or Newcastle-under-Lyme. From now on such a place is asked with its wider area
   ("Stratford, East London"), never the bare name, so AI answers for the right one.

   NEW AUDITS ONLY. This only shapes the text of questions a new Discovery audit writes; a stored question, a frozen
   baseline and the day-28 replay are never touched. Pure leaf (no imports): used by create-ai-audit, the report
   renderer and the tests, so relative imports carry .ts.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

/** Places whose names clash with another place. */
const CLASHING_PLACES = new Set(['stratford', 'newcastle', 'richmond', 'bury', 'brighton', 'newport', 'bangor', 'henley', 'sutton', 'kingston', 'wellington', 'lancaster', 'perth', 'burton', 'weston', 'chester', 'ashford']);
export const isClashingPlace = (place: string): boolean => CLASHING_PLACES.has(place.trim().toLowerCase());

/** The place as it should be ASKED: a clashing name carries its wider area ("Stratford, East London"). Anything else, or
 *  a clashing name with no wider area known, comes back unchanged. */
export function askPlace(place: string, widerArea?: string | null): string {
  const p = place.trim();
  const w = (widerArea ?? '').trim().slice(0, 60);
  if (!w || !isClashingPlace(p) || p.toLowerCase() === w.toLowerCase() || new RegExp(`\\b${p.replace(/[^A-Za-z ]/g, '')}\\b`, 'i').test(w)) return p;
  return `${p}, ${w}`;
}

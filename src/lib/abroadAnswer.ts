/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ABROAD ANSWER FLAG (Paul, 2026-11-20; docs/natural-question-wording.md).

   A UK audit's answer that is really about somewhere else — "Boston, Massachusetts", "Halifax, Nova
   Scotia", "Lincoln, Nebraska". Measured the same day: asked without "UK", all three engines answered
   Boston about Massachusetts and Gemini answered Halifax about Nova Scotia and Lincoln about Nebraska,
   even though every ask runs from the UK (countryCode gb). New questions now write those towns the local
   way; this flag is the check that catches any town we did not foresee.

   ⛔ DISPLAY ONLY. It never changes a score, a named count or a competitor list — it tells the operator
   to look. Pure and deterministic; reads only the stored answer text, so it works on old audits too.
   ⛔ UK audits only (the caller decides): an Australian answer naming NSW is correct, not abroad.
   ⚠️ Deliberately NOT markers: UK places that share a name with somewhere abroad — Washington (Tyne and
   Wear), Virginia Water, Victoria (London), Delaware (Cornwall), Georgia, Jersey on its own.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const PLACE_WORDS = [
  // US states (UK-shared names left out — see above)
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'florida', 'hawaii', 'idaho',
  'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico',
  'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island',
  'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'west virginia', 'wisconsin', 'wyoming',
  // Canada, Australia, New Zealand, Ireland
  'ontario', 'quebec', 'nova scotia', 'new brunswick', 'british columbia', 'alberta', 'manitoba', 'saskatchewan',
  'newfoundland', 'new south wales', 'queensland', 'western australia', 'south australia', 'tasmania',
  'new zealand', 'republic of ireland',
  // countries said outright
  'united states', 'usa', 'u.s.a.', 'canada', 'australia',
];
const PLACE_RE = new RegExp(`(^|[^a-z])(${PLACE_WORDS.map((w) => w.replace(/[.]/g, '\\.')).join('|')})(?![a-z])`, 'gi');
/** "Boston, MA", "Stamford, CT 06901", "Halifax, NS B3H" — a capitalised town, a comma, a state / province code. */
const CODE_RE = /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?,\s?(MA|CT|NE|PA|NY|NJ|VA|NH|NS|ON|BC|QC|NSW|QLD|VIC|WA|TX|FL|CA|IL|OH|MI|GA)\b(?=[\s,.)]|\s?\d|$)/g;
/** A North American phone number: "(617) 555-0134", "+1 902 555 0134". */
const PHONE_RE = /\(\d{3}\)\s?\d{3}[-\s]\d{4}|\+1[\s-]\(?\d{3}\)?[\s-]\d{3}[\s-]\d{4}/g;

/** The place words in an answer that point outside the UK, de-duplicated, in the order found. Empty = looks UK. */
export function abroadSignals(text: string | null | undefined): string[] {
  const t = String(text ?? '');
  if (!t.trim()) return [];
  const found: string[] = [];
  const add = (s: string) => { const v = s.trim(); if (v && !found.some((f) => f.toLowerCase() === v.toLowerCase())) found.push(v); };
  for (const m of t.matchAll(PLACE_RE)) add(m[2]);
  for (const m of t.matchAll(CODE_RE)) add(m[0]);
  for (const m of t.matchAll(PHONE_RE)) add(m[0]);
  return found;
}

/** UK audit (UK, GB or blank country — blank defaults to the UK everywhere else too). */
export function isUkAuditCountry(country: string | null | undefined): boolean {
  const c = String(country ?? '').trim().toUpperCase();
  return c === '' || c === 'UK' || c === 'GB';
}

/** The operator's one line, or null when the answer looks UK. */
export function abroadFlagText(text: string | null | undefined): string | null {
  const s = abroadSignals(text);
  return s.length ? `This answer may be about somewhere outside the UK (${s.slice(0, 3).join(', ')}). Check it before using it.` : null;
}

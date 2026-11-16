/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "AREA THEY COVER" → REAL TOWNS / BOROUGHS (Paul, 2026-11-16, leftovers item 5).

   The client writes the area in their own words ("all London boroughs inside the M25", "Kent and East Sussex",
   "20 miles around Croydon"). Questions are written per town, so Prepare baseline offers "Expand into towns": AI lists
   the real towns or boroughs inside it (supabase/functions/coverage-towns), Paul ticks / edits them into "Service areas"
   and saves. ⛔ A SUGGESTION ONLY: nothing is saved, written into questions or measured until Paul saves the context.

   Pure. Reached by an edge function: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const COVERAGE_TOWNS_MAX = 40;
export const COVERAGE_TEXT_MAX = 300;
export const COVERAGE_MODEL = 'gpt-4o-mini';

export const COVERAGE_SYSTEM_PROMPT = [
  'You turn a local business\'s description of the area it covers into a list of real places a customer would type in a search.',
  'Return JSON: {"places": ["...", "..."], "note": "..."}.',
  'Rules:',
  '- Only real, currently named towns, cities, London boroughs or districts that lie inside the described area. Never invent a place.',
  '- For London, use the borough names (e.g. "Croydon", "Bromley"), not postcodes. For counties, list the main towns.',
  '- For a radius ("20 miles around X"), list the main towns within it, nearest first.',
  `- At most ${COVERAGE_TOWNS_MAX} places, most populous / most searched first. No duplicates, no counties or regions as places.`,
  '- If the description is too vague to name places, return an empty list and say why in "note".',
].join('\n');

export function coverageUserPrompt(o: { coverage: string; primaryTown?: string | null; country?: string | null; trade?: string | null }): string {
  return [
    `Area they cover (their words): ${o.coverage.slice(0, COVERAGE_TEXT_MAX)}`,
    o.primaryTown ? `Their main town: ${o.primaryTown}` : '',
    o.country ? `Country: ${o.country}` : '',
    o.trade ? `Trade: ${o.trade}` : '',
  ].filter(Boolean).join('\n');
}

const clean = (s: string) => s.replace(/^[\s\d.)\-•*]+/, '').replace(/\s+/g, ' ').trim();

/** The model's answer → a clean list (trimmed, de-numbered, one of each, capped). Anything malformed = []. */
export function parseCoverageTowns(raw: unknown): { places: string[]; note: string | null } {
  let j: unknown = raw;
  if (typeof raw === 'string') { try { j = JSON.parse(raw); } catch { return { places: [], note: null }; } }
  const o = (j && typeof j === 'object' ? j : {}) as { places?: unknown; note?: unknown };
  const seen = new Set<string>();
  const places: string[] = [];
  for (const p of Array.isArray(o.places) ? o.places : []) {
    if (typeof p !== 'string') continue;
    const c = clean(p);
    if (c.length < 2 || c.length > 60 || /[<>{}]/.test(c)) continue;
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    places.push(c);
    if (places.length >= COVERAGE_TOWNS_MAX) break;
  }
  const note = typeof o.note === 'string' && o.note.trim() ? o.note.trim().slice(0, 300) : null;
  return { places, note };
}

/** Adds the picked places to the service areas, keeping what is there and its order; one of each (case-blind). */
export function mergeAreas(current: readonly string[], add: readonly string[]): string[] {
  const out = [...current];
  const seen = new Set(current.map((x) => x.trim().toLowerCase()));
  for (const a of add) {
    const k = a.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a.trim());
  }
  return out;
}

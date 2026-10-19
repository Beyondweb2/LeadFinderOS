import { MALAYSIA_PLACES, MALAYSIA_PLACES_SOURCE } from '../data/malaysiaPlaces.ts';

/* ══ WHAT A MALAYSIAN LEAD'S PLACE TEXT IS (2026-10-19, Paul: "the Malaysia Coverage page is messy") ═════════════
   Imported files carry free text where a town belongs ("Penang and Kuala Lumpur", "Klang Valley", "Sabah",
   "Kajang/Semenyih/Bangi, Selangor"). This leaf reads that text and says, without changing it:
     · a TOWN — a Coverage-listed town, a GeoNames populated place (src/data/malaysiaPlaces.ts), or, failing both,
       the place as written (a real town the dataset lacks keeps its own row, with a dash);
     · UNCLEAR — a state, a region, several places, or nothing that is a place. Coverage lists these apart, with
       their lead counts, and never counts them under a town.
   ⛔ IT NEVER WRITES. A lead's stored town is never changed here; the reading is derived every time.
   ⛔ NEVER A GUESSED FIGURE. A population is GeoNames' own figure for a place with exactly that name (in the state
      the text names, when it names one). Two places sharing a name with no state to choose between → no figure.
   ⛔ COMMAS ARE HIERARCHY, NOT A LIST. "Tikam Batu, Sungai Petani, Kedah" is one place (suburb, town, state):
      the first Coverage-listed town wins, as it always did, then the first dataset place. Only ";", "/", "&" and
      "and" join ALTERNATIVES — two different known towns across them is "several places".
   React-free; tested by scripts/malaysia-places.test.ts. Record: docs/coverage-my-sg-population.md. */

export { MALAYSIA_PLACES_SOURCE };

/** Lowercase, accents and punctuation gone, spaces collapsed (the same normalisation coverageCountries uses). */
export function placeKey(s: string): string {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Malaysia's states and federal territories, by every common spelling → the name Coverage shows. */
const STATES: Record<string, string> = {
  'johor': 'Johor', 'johore': 'Johor', 'kedah': 'Kedah', 'kelantan': 'Kelantan',
  'melaka': 'Melaka', 'malacca': 'Melaka', 'negeri sembilan': 'Negeri Sembilan', 'n sembilan': 'Negeri Sembilan',
  'pahang': 'Pahang', 'perak': 'Perak', 'perlis': 'Perlis', 'penang': 'Penang', 'pulau pinang': 'Penang',
  'sabah': 'Sabah', 'sarawak': 'Sarawak', 'selangor': 'Selangor', 'terengganu': 'Terengganu',
  'kuala lumpur': 'Kuala Lumpur', 'wilayah persekutuan': 'Kuala Lumpur', 'wp kuala lumpur': 'Kuala Lumpur',
  'labuan': 'Labuan', 'putrajaya': 'Putrajaya',
};
export function malaysianStateOf(text: string): string | null {
  return STATES[placeKey(text)] ?? null;
}

/** Regions that are not one town. */
const REGIONS = new Set([
  'klang valley', 'lembah klang', 'greater kuala lumpur', 'greater kl', 'peninsular malaysia', 'west malaysia',
  'east malaysia', 'borneo', 'malaysia', 'iskandar malaysia', 'northern region', 'southern region', 'central region',
  'east coast', 'penang island', 'penang island region', 'nationwide', 'all malaysia',
]);
/** Words that make a piece a description, not a place ("corporate training", "Epsom campus", "in-house"). */
const NOT_A_PLACE = /\b(training|in house|online|campus|branch|branches|corporate|classes|hq|headquarters|site|sites|programme|program|individual|operator|region|malaysia|nationwide|islandwide|various|multiple)\b/;

/** Spellings people use for a dataset place's own name — spelling only, never a different place. */
const KNOWN_SPELLINGS: Record<string, string> = {
  'air itam': 'Ayer Itam',
  'telok panglima garang': 'Teluk Panglima Garang',
  'jenjarom': 'Jenjarum',
  'tasek gelugor': 'Tasek Glugor',
  'tasek gelugur': 'Tasek Glugor',
  'puncak alam': 'Bandar Puncak Alam',
};

export interface DatasetPlace { name: string; state: string; population: number }

const BY_KEY = new Map<string, DatasetPlace[]>();
for (const [, name, state, population] of MALAYSIA_PLACES) {
  const k = placeKey(name);
  const list = BY_KEY.get(k) ?? [];
  list.push({ name, state, population });
  BY_KEY.set(k, list);
}

/** The dataset place with exactly this name (or a known spelling of it). Several with the name: the one in
 *  `state` when given; otherwise none is chosen ('ambiguous'). */
export function datasetPlace(name: string, state?: string | null): DatasetPlace | 'ambiguous' | null {
  const k0 = placeKey(name);
  const k = KNOWN_SPELLINGS[k0] ? placeKey(KNOWN_SPELLINGS[k0]) : k0;
  const hits = BY_KEY.get(k);
  if (!hits || hits.length === 0) return null;
  /* The text names another state: a different place with the same name (the dataset has only those with a figure). */
  if (hits.length === 1) return state && hits[0].state !== state ? null : hits[0];
  const inState = state ? hits.filter((h) => h.state === state) : [];
  return inState.length === 1 ? inState[0] : 'ambiguous';
}

export type UnclearReason = 'state' | 'region' | 'several' | 'not_a_place';
export const UNCLEAR_WORDS: Record<UnclearReason, string> = {
  state: 'a state, not a town',
  region: 'a region, not a town',
  several: 'several places',
  not_a_place: 'not a place',
};

export type MalaysiaPlaceReading =
  | { kind: 'town'; name: string; state: string | null; listed: boolean }
  | { kind: 'unclear'; reason: UnclearReason; state: string | null };

/** A Coverage-listed town for a normalised key, if any (supplied by coverageCountries, which owns the list). */
export type ListedLookup = (key: string) => { name: string; region: string | null } | undefined;

interface GroupReading {
  /** A town Coverage lists, or the dataset knows. */
  known: { name: string; state: string | null; listed: boolean } | null;
  /** The first piece that is none of the above but could be a town as written. */
  asWritten: string | null;
  state: string | null;
  region: boolean;
}

function readGroup(pieces: string[], brackets: string[], listed: ListedLookup): GroupReading {
  let state: string | null = null;
  let region = false;
  const candidates: string[] = [];
  pieces.forEach((p, i) => {
    const k = placeKey(p);
    if (!k) return;
    /* A trailing state is a qualifier ("Bayan Lepas, Penang"): it names the state, never the town. The FIRST piece
       may still be a listed town that shares a state's name ("Melaka", "Kuala Lumpur", "Penang"). */
    const st = STATES[k];
    if (st && (i > 0 || !listed(k))) { state = state ?? st; return; }
    if (REGIONS.has(k)) { region = true; return; }
    if (NOT_A_PLACE.test(k)) return;
    candidates.push(p.trim().replace(/\s+/g, ' '));
  });
  const listedHit = candidates.map((c) => listed(placeKey(c))).find(Boolean);
  if (listedHit) return { known: { name: listedHit.name, state: listedHit.region, listed: true }, asWritten: null, state, region };
  /* The old rule, kept: a single listed town in brackets ("Skudai (Johor Bahru)" → Johor Bahru). More than one
     ("Klang Valley (Subang Jaya, Petaling Jaya, …)") is a list, so none is picked. */
  const inBrackets = [...new Map(brackets.map((b) => listed(placeKey(b))).filter((x): x is NonNullable<typeof x> => !!x).map((x) => [x.name, x])).values()];
  if (inBrackets.length === 1 && candidates.length > 0) {
    return { known: { name: inBrackets[0].name, state: inBrackets[0].region, listed: true }, asWritten: null, state, region };
  }
  for (const c of candidates) {
    const d = datasetPlace(c, state);
    if (d && d !== 'ambiguous') return { known: { name: d.name, state: d.state, listed: false }, asWritten: null, state, region };
    if (d === 'ambiguous') return { known: null, asWritten: c, state, region };
  }
  return { known: null, asWritten: candidates[0] ?? null, state, region };
}

/**
 * Read a Malaysian lead's town text. Blank → null (counted nowhere, as before).
 * "Kuala Lumpur (Cheras)" → Kuala Lumpur · "Johor Bahru, Johor" → Johor Bahru · "Bayan Lepas, Penang" → Bayan Lepas
 * (Penang) · "Penang and Kuala Lumpur" → several · "Klang Valley" → region · "Sabah" → state.
 */
export function readMalaysiaPlace(raw: string | null | undefined, listed: ListedLookup): MalaysiaPlaceReading | null {
  const s = String(raw ?? '').trim();
  if (!placeKey(s)) return null;
  const brackets = [...s.matchAll(/\(([^)]*)\)/g)].flatMap((m) => m[1].split(/[,;/&]|\band\b/i)).map((x) => x.trim()).filter(Boolean);
  const outside = s.replace(/\([^)]*\)/g, ' ');
  const groups = outside.split(/;|\/|&|\band\b/i).map((g) => g.split(',').map((p) => p.trim()).filter(Boolean)).filter((g) => g.length > 0);
  if (groups.length === 0) return { kind: 'unclear', reason: 'not_a_place', state: null };
  const read = groups.map((g) => readGroup(g, groups.length === 1 ? brackets : [], listed));
  const state = read.map((r) => r.state).find(Boolean) ?? null;
  const known = [...new Map(read.filter((r) => r.known).map((r) => [r.known!.name, r.known!])).values()];
  if (known.length >= 2) return { kind: 'unclear', reason: 'several', state: null };
  if (known.length === 1) return { kind: 'town', name: known[0].name, state: known[0].state ?? state, listed: known[0].listed };
  const asWritten = read.map((r) => r.asWritten).filter((x): x is string => !!x);
  if (asWritten.length >= 2) return { kind: 'unclear', reason: 'several', state: null };
  if (asWritten.length === 1) return { kind: 'town', name: asWritten[0], state, listed: false };
  if (read.some((r) => r.region)) return { kind: 'unclear', reason: 'region', state };
  if (state) return { kind: 'unclear', reason: 'state', state };
  return { kind: 'unclear', reason: 'not_a_place', state: null };
}

/** A suggestion only, never written: the first dataset place named in a lead's full address
 *  ("12 Jalan SS15/4, 47500 Subang Jaya, Selangor") — the piece before the state, postcode removed. */
export function townFromAddress(address: string | null | undefined, listed: ListedLookup): string | null {
  const parts = String(address ?? '').split(',').map((p) => p.replace(/\b\d{5}\b/g, ' ').trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const k = placeKey(parts[i]);
    if (!k || STATES[k] || k === 'malaysia') continue;
    const l = listed(k);
    if (l) return l.name;
    const d = datasetPlace(parts[i]);
    if (d && d !== 'ambiguous') return d.name;
  }
  return null;
}

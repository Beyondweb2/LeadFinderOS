#!/usr/bin/env node
/* Builds src/data/australiaTowns.ts from the ABS (Australian Bureau of Statistics), 2021 Census.
   Run:  node scripts/build-australia-towns.mjs        (needs internet; no key; nothing is written anywhere else)

   Sources, both free, both CC BY 4.0 (the Coverage page credits the ABS):
   · Population + state: ABS Data API, dataflow C21_G01_UCL (Census 2021 General Community Profile G01, total persons,
     by Urban Centre and Locality). https://data.api.abs.gov.au
   · Coordinates: ABS ASGS Edition 3 (2021) UCL boundaries, geo.abs.gov.au ArcGIS service. The point stored is the
     area-weighted centre of each UCL's largest boundary ring (simplified to ~200 m), so a town split by water still
     gets a point on land it covers.

   Kept: every Urban Centre with 1,000+ residents (the UCLs below that are "(L)" localities of 200–999, too small to
   be worth a search). Dropped: the ABS bookkeeping rows ("Remainder of State/Territory", "Migratory - Offshore -
   Shipping", "No usual address") and Other Territories (state 9).
   Names: the ABS bracket that tells same-name towns apart ("Maitland (NSW)", "Perth (WA)") is dropped because the
   STATE is carried beside every name; a cross-border part keeps its own name ("Albury - Wodonga (Albury Part)" →
   Albury); a joined name keeps its first town ("Forster - Tuncurry" → Forster, the full ABS name kept as `abs`). */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'australiaTowns.ts');
const MIN_POPULATION = 1000;
const STATE = { 1: 'NSW', 2: 'VIC', 3: 'QLD', 4: 'SA', 5: 'WA', 6: 'TAS', 7: 'NT', 8: 'ACT' };

async function get(url, accept) {
  const r = await fetch(url, accept ? { headers: { Accept: accept } } : undefined);
  if (!r.ok) throw new Error(`${r.status} from ${url}`);
  return r;
}

/* ── population + state ── */
const csv = await (await get(
  'https://data.api.abs.gov.au/rest/data/ABS,C21_G01_UCL,1.0.0/3.P_1..UCL.?dimensionAtObservation=AllDimensions',
  'application/vnd.sdmx.data+csv;labels=both',
)).text();
const lines = csv.trim().split(/\r?\n/);
const head = lines[0].split(',');
const iRegion = head.findIndex((h) => h.startsWith('REGION:'));
const iValue = head.indexOf('OBS_VALUE');
if (iRegion < 0 || iValue < 0) throw new Error('ABS CSV header changed: ' + lines[0]);
const pop = new Map(); // code -> { abs, population }
for (const line of lines.slice(1)) {
  const f = line.split(',');
  if (f.length !== head.length) throw new Error('Unexpected comma in ABS row: ' + line);
  const m = /^(\d{6}): (.+)$/.exec(f[iRegion]);
  if (!m) throw new Error('Bad region cell: ' + f[iRegion]);
  pop.set(m[1], { abs: m[2], population: Number(f[iValue]) });
}

/* ── coordinates ── */
const centre = new Map(); // code -> [lat, lng]
function ringCentre(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x0, y0] = ring[j], [x1, y1] = ring[i];
    const k = x0 * y1 - x1 * y0;
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
  }
  if (Math.abs(a) < 1e-12) return { area: 0, lat: ring[0][1], lng: ring[0][0] };
  return { area: Math.abs(a / 2), lat: cy / (3 * a), lng: cx / (3 * a) };
}
for (let offset = 0; ; offset += 1000) {
  const j = await (await get(
    'https://geo.abs.gov.au/arcgis/rest/services/ASGS2021/UCL/MapServer/0/query?where=1%3D1&outFields=ucl_code_2021'
    + '&returnGeometry=true&maxAllowableOffset=0.002&geometryPrecision=4&outSR=4326&orderByFields=objectid'
    + `&resultOffset=${offset}&resultRecordCount=1000&f=json`,
  )).json();
  if (j.error) throw new Error('ABS geo error: ' + JSON.stringify(j.error));
  for (const feat of j.features ?? []) {
    const rings = feat.geometry?.rings ?? [];
    const best = rings.map(ringCentre).sort((p, q) => q.area - p.area)[0];
    if (best) centre.set(feat.attributes.ucl_code_2021, [best.lat, best.lng]);
  }
  if (!j.features || j.features.length < 1000) break;
}

/* ── clean ── */
function cleanName(abs) {
  const part = /^.+ \((.+) Part\)$/.exec(abs);
  if (part) return part[1];
  return abs.replace(/ \((L|NSW|Vic\.|Qld|SA|WA|Tas\.|NT|ACT)\)$/, '').split(' - ')[0].trim();
}
const rows = [];
const seen = new Map();
for (const [code, { abs, population }] of pop) {
  if (/^(Remainder of State|Migratory|No usual address)/.test(abs) || / \(L\)$/.test(abs)) continue;
  const state = STATE[code[0]];
  if (!state || population < MIN_POPULATION) continue;
  const c = centre.get(code);
  if (!c) throw new Error('No boundary for UCL ' + code + ' ' + abs);
  const name = cleanName(abs);
  const k = (name + ' ' + state).toLowerCase();
  if (seen.has(k)) throw new Error(`Two UCLs clean to "${name} ${state}": ${seen.get(k)} and ${abs}`);
  seen.set(k, abs);
  rows.push([code, name, state, population, Number(c[0].toFixed(4)), Number(c[1].toFixed(4)), abs === name ? null : abs]);
}
rows.sort((a, b) => b[3] - a[3] || a[1].localeCompare(b[1]));

const today = new Date().toISOString().slice(0, 10);
const body = `/* GENERATED by scripts/build-australia-towns.mjs — do not edit by hand. Rebuild by re-running the script.
   Source: Australian Bureau of Statistics, Census 2021 — Urban Centres and Localities (UCL): population from the ABS Data
   API (C21_G01_UCL, total persons), state and boundaries from ASGS Edition 3 (2021). Downloaded ${today}.
   Licence: Creative Commons Attribution 4.0 (CC BY 4.0) — the Coverage page credits the ABS.
   Every Urban Centre with ${MIN_POPULATION.toLocaleString('en-GB')}+ residents: [ucl code, name, state, population, lat, lng, full ABS name
   when it differs]. Figures are the ABS's own (usual residents, Census night 2021); never edited here. */

export const AUSTRALIA_TOWNS_SOURCE = {
  label: 'Australian Bureau of Statistics, Census 2021, Urban Centres and Localities (CC BY 4.0)',
  year: 2021,
  downloaded: ${JSON.stringify(today)},
  url: 'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/significant-urban-areas-urban-centres-and-localities-section-state/urban-centres-and-localities',
} as const;

export type AustraliaStateCode = 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT';

export type AustraliaTownRow = readonly [
  ucl: string, name: string, state: AustraliaStateCode, population: number, lat: number, lng: number, abs: string | null,
];

export const AUSTRALIA_TOWNS: readonly AustraliaTownRow[] = [
${rows.map((r) => '  ' + JSON.stringify(r) + ',').join('\n')}
];
`;
writeFileSync(OUT, body);
console.log(`Wrote ${rows.length} towns to ${path.relative(process.cwd(), OUT)}`);

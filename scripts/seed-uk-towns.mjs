/* ════════════════════════════════════════════════════════════════════════════════════════════
   SEED uk_towns — ONS Built-Up Areas 2022 + Census 2021 population.

   RE-RUNNABLE. Upserts on ons_code, so running it twice changes nothing and running it after an
   ONS update refreshes names, populations and coordinates in place.

   ⛔ IT NEVER WRITES suppressed_at / suppressed_reason. That is the whole point of suppressing
   rather than deleting: a conurbation fragment Paul takes off the list stays off it across every
   future re-seed. Proven against the live table before this script existed — a suppressed row
   survived an upsert that changed both its name and its population.

   SOURCES, and which column came from which:
     ons_code, name, lat, lng   ONS Open Geography Portal, BUA_2022_GB (OGL v3.0)
     population, region         ONS "Towns and cities, characteristics of built-up areas,
                                England and Wales: Census 2021", sheets 1c + 1d (OGL v3.0)
   Attribution to carry wherever the list is shown:
     "Contains OS data © Crown copyright and database right 2024"
     "Source: Office for National Statistics licensed under the Open Government Licence v.3.0"

   ⚠️ KNOWN AND ACCEPTED GAPS: London is excluded by ONS from this dataset, and Scotland is absent
   (it comes from National Records of Scotland separately). Paul's call — he would never work London
   as one town and has no Scottish leads. Recorded so nobody later reads the absence as a bug.

   Usage:  SRK=<service-role-key> node scripts/seed-uk-towns.mjs [--csv <path>] [--min 12000] [--max 250000]
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "fs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const CSV = arg("--csv", "C:/Users/paulj/Downloads/uk-bua-population.csv");
const MIN = Number(arg("--min", 12000));
const MAX = Number(arg("--max", 250000));
const KEY = process.env.SRK;
if (!KEY) { console.error("SRK (service-role key) is required"); process.exit(1); }

const U = "https://ruusxpkkmwtljxxulhbq.supabase.co/rest/v1/";
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };

/** CSV split that respects quoted fields — several town names contain commas. */
function cells(line) {
  const out = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === "," && !q) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const lines = fs.readFileSync(CSV, "utf8").trim().split(/\r?\n/);
const rows = lines.slice(1).map(cells).map((c) => ({
  code: c[0].trim(), name: c[1].trim(), population: Number(c[2]),
  region: c[4]?.trim() || null, country: c[5]?.trim() || null,
}));
const band = rows.filter((r) => r.code && Number.isFinite(r.population) && r.population >= MIN && r.population <= MAX);
console.log(`CSV ${rows.length} rows -> ${band.length} in ${MIN}–${MAX}`);

/* Coordinates from the boundary service.
   ⚠️ PAGE ON exceededTransferLimit, never on a short page: ArcGIS clamps resultRecordCount to its
   own maxRecordCount and returns fewer than asked without saying so. Breaking on a short page ended
   the pull after 1000 rows and made the join read 16% — a false mismatch that would have seeded
   118 towns and looked like a code-format problem. */
const QUERY = "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/BUA_2022_GB/FeatureServer/0/query";
const geo = new Map();
for (let off = 0; ; off += 1000) {
  const r = await fetch(`${QUERY}?where=1%3D1&outFields=BUA22CD,LAT,LONG&resultOffset=${off}&resultRecordCount=1000&f=json`);
  const j = await r.json();
  for (const f of (j.features || [])) geo.set(f.attributes.BUA22CD, f.attributes);
  if (!j.exceededTransferLimit || !(j.features || []).length) break;
}
console.log(`portal rows: ${geo.size}`);

const matched = band.filter((r) => geo.has(r.code));
console.log(`joined: ${matched.length} of ${band.length}`);
if (matched.length < band.length * 0.95) {
  console.error("REFUSING TO SEED: under 95% joined — that is a source mismatch, not a few missing rows.");
  process.exit(1);
}

const payload = matched.map((r) => ({
  ons_code: r.code,
  name: r.name,
  population: r.population,
  region: r.region,
  county: r.country,
  lat: geo.get(r.code).LAT,
  lng: geo.get(r.code).LONG,
  updated_at: new Date().toISOString(),
}));

let done = 0;
for (let i = 0; i < payload.length; i += 200) {
  const chunk = payload.slice(i, i + 200);
  const r = await fetch(`${U}uk_towns?on_conflict=ons_code`, {
    method: "POST",
    headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(chunk),
  });
  if (!r.ok) { console.error(`chunk ${i} failed: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); process.exit(1); }
  done += chunk.length;
  process.stdout.write(`\r  upserted ${done}/${payload.length}`);
}
console.log("\ndone");

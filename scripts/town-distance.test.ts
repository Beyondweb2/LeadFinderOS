/* ============================================================
   IS THIS BUSINESS IN THE TOWN WE ARE ABOUT TO AUDIT IT AGAINST?

   ⛔ THE FAULT: 31 of 44 measurable audits asked about a town more than 10 km from the business, up
   to 71.5 km. 28 of those 31 had a report reach the prospect and 20 opened it. RG Locksmiths and
   Wilson's Mobile Valeting both rejected theirs and both were right.

   ⛔ THE TWO WAYS THIS GUARD COULD ITSELF BE WRONG, and both are asserted below:
     * blocking a legitimate commuter-belt business — a village 12 km outside Cambridge really does
       trade in Cambridge, and refusing it stops real work
     * blocking because WE have not looked — no coordinates means we do not know, not that they are
       far. That must never block: it would refuse 638 of 900 leads today.
   ============================================================ */
import {
  checkTownDistance, distanceKm, isRealCoord, buildTownIndex, lookupTownCentroid,
  normaliseTownName, BLOCK_KM, WARN_KM,
} from "../supabase/functions/_shared/town-distance.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* ⚠️ TAKEN FROM THE LIVE uk_towns TABLE, not typed from memory. My first pass used remembered
   coordinates and asserted Northampton->Spalding was 72 km; the real centroids give 79. The code was
   right and the test was wrong, which is the more dangerous way round. */
const CAMBRIDGE = { lat: 52.2003, lng: 0.1264 };        // "Cambridge (Cambridge)"
const SPALDING = { lat: 52.7795, lng: -0.1576 };
const NORTHAMPTON = { lat: 52.2381, lng: -0.8952 };
const WISBECH = { lat: 52.6668, lng: 0.1626 };
/* A village ~12 km out of Cambridge: postal_town Cambridge, outside the built-up area. */
const NEAR_CAMBRIDGE = { lat: 52.3100, lng: 0.1100 };

console.log("── THE ARITHMETIC IS RIGHT ──");
{
  const km = distanceKm(NORTHAMPTON, SPALDING);
  ok(km > 70 && km < 85, `Northampton to Spalding is ${Math.round(km)} km — the real blocked case`);
}
ok(Math.round(distanceKm(CAMBRIDGE, CAMBRIDGE)) === 0, "a town is 0 km from itself");
{
  const km = distanceKm(CAMBRIDGE, NEAR_CAMBRIDGE);
  ok(km > WARN_KM && km < BLOCK_KM, `the village is ${Math.round(km)} km out — inside the warn band`);
}

const check = (biz: { lat: number; lng: number } | null, town: string | null, centroid: { lat: number; lng: number } | null) =>
  checkTownDistance({ businessLat: biz?.lat, businessLng: biz?.lng, townName: town, townCentroid: centroid });

console.log("\n── ⛔ THE REAL CASES BLOCK ──");
{
  const r = check(NORTHAMPTON, "Spalding", SPALDING);
  ok(r.verdict === "block", `a Northampton locksmith vs Spalding -> ${r.verdict} at ${Math.round(r.km!)} km`);
  ok(new RegExp(`${Math.round(r.km!)} km`).test(r.message) && /Spalding/.test(r.message),
    "  the message names the distance AND the town");
  ok(/override/i.test(r.message), "  and tells the operator an override exists");
}
ok(check(WISBECH, "Cambridge", CAMBRIDGE).verdict === "block", "Wisbech vs Cambridge (51 km) blocks");

console.log("\n── ⛔ AND THE COMMUTER BELT DOES NOT ──");
/* Paul's constraint: a village 12 km outside Cambridge genuinely trades in Cambridge. Blocking it
   would stop real work, so this band warns and proceeds. */
{
  const r = check(NEAR_CAMBRIDGE, "Cambridge", CAMBRIDGE);
  ok(r.verdict === "warn", `12 km out -> ${r.verdict}, not block`);
  ok(r.message.length > 0, "  but it says so rather than passing silently");
}
ok(check(CAMBRIDGE, "Cambridge", CAMBRIDGE).verdict === "ok", "a business in its own town passes silently");
ok(check(CAMBRIDGE, "Cambridge", CAMBRIDGE).message === "", "  with no message at all");

console.log("\n── THE BAND EDGES ──");
/* Asserted as ABOVE, not at-or-above: a business exactly on the line gets the gentler verdict. */
const at = (km: number) => {
  /* Move north by km/111.32 degrees of latitude — close enough at these distances to place a point
     a known distance away without hand-picking coordinates. */
  const biz = { lat: CAMBRIDGE.lat + km / 111.32, lng: CAMBRIDGE.lng };
  return checkTownDistance({ businessLat: biz.lat, businessLng: biz.lng, townName: "Cambridge", townCentroid: CAMBRIDGE });
};
ok(at(WARN_KM - 1).verdict === "ok", `${WARN_KM - 1} km is ok`);
ok(at(WARN_KM + 1).verdict === "warn", `${WARN_KM + 1} km warns`);
ok(at(BLOCK_KM - 1).verdict === "warn", `${BLOCK_KM - 1} km still only warns`);
ok(at(BLOCK_KM + 1).verdict === "block", `${BLOCK_KM + 1} km blocks`);

console.log("\n── ⛔ IT NEVER BLOCKS BECAUSE *WE* DID NOT LOOK ──");
/* The constraint that decides the whole design. 638 of 900 leads have no coordinates today; a guard
   that blocked on absence would stop the product working. */
for (const [label, biz] of [
  ["no coordinates at all", null],
  ["0/0 (the shape a missing value takes)", { lat: 0, lng: 0 }],
] as Array<[string, { lat: number; lng: number } | null]>) {
  const r = check(biz, "Cambridge", CAMBRIDGE);
  ok(r.verdict === "unknown", `${label} -> unknown, NOT block`);
  ok(r.verdict !== "ok", `  ${label} -> and NOT a silent pass either`);
}
{
  const r = check(NORTHAMPTON, "Nowhereton", null);
  ok(r.verdict === "unknown" && r.unknownReason === "town_not_in_gazetteer",
    "a town missing from the gazetteer is unknown, not block");
}
{
  const r = check(NORTHAMPTON, "", CAMBRIDGE);
  ok(r.verdict === "unknown" && r.unknownReason === "no_town_asked", "no town asked is unknown");
}

console.log("\n── ⛔ A BAD COORDINATE IS NOT A COORDINATE ──");
for (const [label, lat, lng] of [
  ["NaN", NaN, 0.12], ["Infinity", Infinity, 0.12], ["a string", "52.2" as unknown as number, 0.12],
  ["latitude out of range", 91, 0.12], ["longitude out of range", 52.2, 181],
] as Array<[string, number, number]>) {
  ok(!isRealCoord(lat, lng), `${label} is rejected`);
  const r = checkTownDistance({ businessLat: lat, businessLng: lng, townName: "Cambridge", townCentroid: CAMBRIDGE });
  ok(r.verdict === "unknown", `  and grades as unknown rather than a distance`);
}
ok(isRealCoord(52.2053, 0.1218), "a real UK coordinate is accepted");
ok(isRealCoord(-33.87, 151.21), "  and so is one in Sydney — the check is validity, not geography");

console.log("\n── ⛔ THE GAZETTEER LOOKUP — AN EXACT MATCH SILENTLY DISABLES THE GUARD ──");
/* uk_towns holds ONS Built-Up Area names. An exact match missed 7 of 37 audit towns covering 19
   audits — including all 9 Cambridge ones, Wilson's among them. The guard would have graded them
   `unknown` and never fired, which looks exactly like working. */
{
  const idx = buildTownIndex([
    { name: "Cambridge (Cambridge)", lat: CAMBRIDGE.lat, lng: CAMBRIDGE.lng },
    { name: "Bourne", lat: 52.7680, lng: -0.3770 },
    { name: "Bury St Edmunds", lat: 52.2470, lng: 0.7110 },
    { name: "Spalding", lat: SPALDING.lat, lng: SPALDING.lng },
  ]);
  for (const [asked, label] of [
    ["Cambridge", "the ONS parenthetical"],
    ["cambridge", "lower case"],
    ["Bourne UK", "the country the audit appends"],
    ["Bury Saint Edmunds", "Saint vs St"],
    ["  Spalding  ", "stray whitespace"],
  ] as Array<[string, string]>) {
    ok(lookupTownCentroid(idx, asked) !== null, `"${asked}" resolves — ${label}`);
  }
  ok(lookupTownCentroid(idx, "Nowhereton") === null, "a town genuinely absent stays null");
  ok(lookupTownCentroid(idx, "") === null, "an empty name is null, not a lucky match");
}

console.log("\n── ⛔ AND AN AMBIGUOUS NAME IS NEVER GUESSED ──");
/* Two real St Ives. Picking one would produce a confident distance to the wrong place — this
   guard committing the exact fault it exists to prevent. */
{
  const idx = buildTownIndex([
    { name: "St Ives (Cornwall)", lat: 50.2110, lng: -5.4800 },
    { name: "St Ives (Cambridgeshire)", lat: 52.3220, lng: -0.0740 },
    { name: "Spalding", lat: SPALDING.lat, lng: SPALDING.lng },
  ]);
  ok(lookupTownCentroid(idx, "St Ives") === null, "St Ives resolves to NOTHING rather than one of them");
  ok(lookupTownCentroid(idx, "Spalding") !== null, "  and an unambiguous town in the same index still works");
  const r = checkTownDistance({ businessLat: NORTHAMPTON.lat, businessLng: NORTHAMPTON.lng, townName: "St Ives", townCentroid: lookupTownCentroid(idx, "St Ives") });
  ok(r.verdict === "unknown", "  so an audit against St Ives is unknown, never a confident block");
}
/* ⚠️ But two fragments of ONE place must NOT be called ambiguous, or the guard switches itself off
   for a town it could measure perfectly well. */
{
  const idx = buildTownIndex([
    { name: "Portsmouth", lat: 50.8060, lng: -1.0870 },
    { name: "Portsmouth (Southsea)", lat: 50.7830, lng: -1.0870 },
  ]);
  ok(lookupTownCentroid(idx, "Portsmouth") !== null,
    "two fragments ~3 km apart are one place, not an ambiguity");
}

console.log("\n── THE THRESHOLDS ARE THE ONES AGREED ──");
ok(BLOCK_KM === 25, "block above 25 km — Paul's call: above that there is no honest case");
ok(WARN_KM === 10, "warn above 10 km");
ok(WARN_KM < BLOCK_KM, "and the bands are the right way round");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");

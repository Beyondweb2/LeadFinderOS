/* ════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS BUSINESS ACTUALLY IN THE TOWN WE ARE ABOUT TO AUDIT IT AGAINST?

   ⛔ WHAT THIS EXISTS TO STOP, MEASURED 2026-08-09. Of 44 audits whose business coordinates are
   known, 31 were more than 10 km from the town their questions asked about — up to 71.5 km. A
   locksmith with NORTHAMPTON IN ITS OWN NAME was asked who AI recommends for locksmiths in Spalding
   and told it does not appear. 28 of those 31 had a report reach the prospect; 20 opened it. RG
   Locksmiths and Wilson's Mobile Valeting both rejected theirs, and both were right.

   ⛔ WHY STRING EQUALITY CANNOT DO THIS JOB. It was tried and reported ZERO. `derived_town` is the
   POSTAL town, so a village outside Cambridge has postal_town = Cambridge and passes an equality
   test while sitting outside the built-up area — the Southsea/Portsmouth caveat in CLAUDE.md §8.
   Only a distance answers it.

   ── THE THRESHOLDS, AND WHY TWO ─────────────────────────────────────────────────────────────
   Paul's call on the numbers: a village 12 km outside Cambridge genuinely trades in Cambridge, and
   blocking it would stop real work. Above 25 km there is no honest case.
       ≤ 10 km   proceed silently
       10–25 km  WARN, with the distance, and proceed
       > 25 km   BLOCK, overridable
   At >25 km the measured set is 28 of 44 — every one of them unambiguous.

   ⛔ AND IT NEVER BLOCKS ON OUR OWN IGNORANCE. No coordinates means we have not looked, not that the
   business is far. That case WARNS and proceeds, because blocking it would refuse 638 of 900 leads
   today and stop the product working. Same principle as derivable.ts: "we could not tell" and "you
   are in the wrong town" must never produce the same outcome.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Above this, no honest case: block (overridable). */
export const BLOCK_KM = 25;
/** Above this, say so but proceed — commuter-belt businesses legitimately trade in the nearby town. */
export const WARN_KM = 10;

export type TownDistanceVerdict = "ok" | "warn" | "block" | "unknown";

export interface TownDistanceCheck {
  verdict: TownDistanceVerdict;
  /** Kilometres from the business to the town centroid. Null when it could not be computed. */
  km: number | null;
  /** What to put in front of the operator. Empty when the verdict is `ok`. */
  message: string;
  /** Why we could not measure, when we could not. Never blocks. */
  unknownReason?: "no_business_coords" | "town_not_in_gazetteer" | "no_town_asked";
}

export interface LatLng { lat: number; lng: number }

/* ══ FINDING THE TOWN IN THE GAZETTEER ═══════════════════════════════════════════════════════
   ⛔ AN EXACT-MATCH LOOKUP SILENTLY DISABLES THIS GUARD, and it nearly did. `uk_towns` holds ONS
   Built-Up Area names, which disambiguate same-named places: Cambridge is stored as
   **"Cambridge (Cambridge)"**. An audit asks about "Cambridge". They do not match, the verdict is
   `unknown`, and the guard quietly never fires — for 9 Cambridge audits including Wilson's.
   Measured 2026-08-09: 7 of 37 distinct audit towns missed, covering 19 audits.
       cambridge            <- "Cambridge (Cambridge)"   ONS parenthetical
       bourne uk            <- "Bourne"                  the audit appends the country
       bury saint edmunds   <- "Bury St Edmunds"         St / Saint
   ⚠️ THE FIX IS IN THE LOOKUP, NOT THE DATA. Rewriting the gazetteer would lose the disambiguation
   that makes two St Ives distinguishable, which is a thing we need rather than a nuisance.

   ⛔ AND AN AMBIGUOUS NAME IS `unknown`, NEVER A GUESS. Two real towns share the name St Ives
   (Cornwall and Cambridgeshire) and picking one would produce a confident distance to the wrong
   place — the exact failure this guard exists to prevent, committed by the guard itself. */
export function normaliseTownName(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")          // ONS "Name (District)"
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\bsaint\b/g, "st")          // Bury Saint Edmunds -> bury st edmunds
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(uk|england|scotland|wales|gb)$/, "");   // the audit appends a country
}

/** Marks a key whose name maps to two genuinely different places. */
export const AMBIGUOUS = "ambiguous" as const;

/**
 * Build the name -> centroid index once per request.
 *
 * ⚠️ Two rows normalising to one key are AMBIGUOUS only when they are actually far apart. Two ONS
 * fragments of the same conurbation a kilometre apart are the same place for this purpose, and
 * calling them ambiguous would disable the guard for a town we can perfectly well measure.
 */
export function buildTownIndex(
  rows: Array<{ name: string; lat: unknown; lng: unknown }>,
): Map<string, LatLng | typeof AMBIGUOUS> {
  const out = new Map<string, LatLng | typeof AMBIGUOUS>();
  for (const r of rows) {
    if (!isRealCoord(r.lat, r.lng)) continue;
    const key = normaliseTownName(r.name);
    if (!key) continue;
    const here = { lat: r.lat as number, lng: r.lng as number };
    const prev = out.get(key);
    if (!prev) { out.set(key, here); continue; }
    if (prev === AMBIGUOUS) continue;
    /* Same name, and far enough apart to be different towns. 15 km separates St Ives Cornwall from
       St Ives Cambridgeshire by a very wide margin, and keeps conurbation fragments together. */
    if (distanceKm(prev, here) > 15) out.set(key, AMBIGUOUS);
  }
  return out;
}

/** The centroid, or null when unknown or ambiguous. Both mean "do not measure". */
export function lookupTownCentroid(
  index: Map<string, LatLng | typeof AMBIGUOUS>,
  townName: string | null | undefined,
): LatLng | null {
  const v = index.get(normaliseTownName(townName));
  return !v || v === AMBIGUOUS ? null : v;
}

/** Great-circle distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** A finite, in-range coordinate pair. 0/0 is rejected: it is the shape a missing value takes. */
export function isRealCoord(lat: unknown, lng: unknown): lat is number {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Grade the gap between a business and the town its audit will ask about.
 *
 * ⛔ THE DEFAULT IS `unknown`, NEVER `ok`. A caller cannot reach a silent pass without both
 * coordinates being real — so a missing town, an unknown gazetteer entry or an absent lat/lng all
 * surface rather than slipping through as "fine, proceed", which is the shape of the Soham bug.
 */
export function checkTownDistance(args: {
  businessLat: unknown;
  businessLng: unknown;
  townName: string | null | undefined;
  townCentroid: LatLng | null | undefined;
}): TownDistanceCheck {
  const town = String(args.townName ?? "").trim();
  if (!town) {
    return { verdict: "unknown", km: null, unknownReason: "no_town_asked", message: "No town on this audit, so the questions have nowhere to be about." };
  }
  if (!isRealCoord(args.businessLat, args.businessLng)) {
    return {
      verdict: "unknown", km: null, unknownReason: "no_business_coords",
      message: `We do not have coordinates for this business, so we cannot check it is in ${town}.`,
    };
  }
  if (!args.townCentroid || !isRealCoord(args.townCentroid.lat, args.townCentroid.lng)) {
    return {
      verdict: "unknown", km: null, unknownReason: "town_not_in_gazetteer",
      message: `"${town}" is not in the town list, so the distance cannot be checked.`,
    };
  }

  const km = distanceKm(
    { lat: args.businessLat as number, lng: args.businessLng as number },
    args.townCentroid,
  );
  const rounded = Math.round(km);
  if (km > BLOCK_KM) {
    return {
      verdict: "block", km,
      message: `This business is ${rounded} km from ${town}. An audit would ask who AI recommends `
        + `in ${town} and report that they do not appear — which is true and useless, because they `
        + `do not work there. Fix the town on the lead, or override if you know better.`,
    };
  }
  if (km > WARN_KM) {
    return {
      verdict: "warn", km,
      message: `This business is ${rounded} km from ${town} — near enough to trade there, far enough `
        + `to be worth a look before you send the report.`,
    };
  }
  return { verdict: "ok", km, message: "" };
}

/* READ-ONLY scratch: re-run the distance verdict over every measurable audit, with the gazetteer as it
   is and as it would be after the proposed city inserts. Not committed. */
import fs from "node:fs";
import { buildTownIndex, lookupTownCentroid, checkTownDistance } from "../supabase/functions/_shared/town-distance.ts";
const T = process.env.TEMP!;
const towns = JSON.parse(fs.readFileSync(`${T}/uk_towns.json`, "utf8")) as Array<{ name: string; lat: number; lng: number }>;
const missing = JSON.parse(fs.readFileSync(`${T}/tcity_missing.json`, "utf8")) as Array<{ name: string; lat: number; lng: number }>;
const leads = new Map((JSON.parse(fs.readFileSync(`${T}/leads_ll.json`, "utf8")) as Array<{ id: string; lat: number; lng: number }>).map((l) => [l.id, l]));
const audits = (JSON.parse(fs.readFileSync(`${T}/audits_all.json`, "utf8")) as Array<{ id: string; lead_id: string; business_name: string; location_text: string | null; first_opened_at: string | null }>)
  .filter((a) => leads.has(a.lead_id) && a.location_text);
const before = buildTownIndex(towns);
/* Only the names the lookup genuinely cannot resolve today (parenthesised ONS rows already resolve). */
const trulyMissing = missing.filter((m) => !lookupTownCentroid(before, m.name));
const capitals = [
  { name: "Edinburgh", lat: 55.95333333, lng: -3.18916667 },
  { name: "Glasgow", lat: 55.86111111, lng: -4.25 },
  { name: "Belfast", lat: 54.5967, lng: -5.93 },
];
const after = buildTownIndex([...towns, ...trulyMissing, ...capitals]);
console.log("truly missing from the lookup:", trulyMissing.map((m) => m.name).join(", "));
const tally = (idx: Map<string, any>) => {
  const out: Record<string, number> = {};
  const per = new Map<string, string>();
  for (const a of audits) {
    const l = leads.get(a.lead_id)!;
    const v = checkTownDistance({ businessLat: l.lat, businessLng: l.lng, townName: a.location_text, townCentroid: lookupTownCentroid(idx, a.location_text) });
    const key = v.verdict === "unknown" ? `unknown:${v.unknownReason}` : v.verdict;
    out[key] = (out[key] ?? 0) + 1;
    per.set(a.id, v.verdict === "unknown" ? `unknown(${v.unknownReason})` : `${v.verdict} ${Math.round(v.km ?? 0)}km`);
  }
  return { out, per };
};
const b = tally(before), c = tally(after);
console.log("measurable audits:", audits.length);
console.log("BEFORE:", JSON.stringify(b.out));
console.log("AFTER :", JSON.stringify(c.out));
const flips = audits.filter((a) => b.per.get(a.id) !== c.per.get(a.id));
console.log("verdicts that change:", flips.length);
const byTown = new Map<string, { n: number; block: number; warn: number; ok: number; opened: number; examples: string[] }>();
for (const a of flips) {
  const t = a.location_text!.trim();
  const e = byTown.get(t) ?? { n: 0, block: 0, warn: 0, ok: 0, opened: 0, examples: [] };
  e.n++; const v = c.per.get(a.id)!; if (v.startsWith("block")) e.block++; else if (v.startsWith("warn")) e.warn++; else if (v.startsWith("ok")) e.ok++;
  if (a.first_opened_at) e.opened++;
  if (e.examples.length < 3 && v.startsWith("block")) e.examples.push(`${a.business_name} ${v}`);
  byTown.set(t, e);
}
for (const [t, e] of [...byTown].sort((x, y) => y[1].n - x[1].n)) console.log(`  ${t.padEnd(22)} ${String(e.n).padStart(3)} audits → ok ${e.ok}, warn ${e.warn}, BLOCK ${e.block} (opened by a prospect: ${e.opened})${e.examples.length ? "  e.g. " + e.examples.join("; ") : ""}`);

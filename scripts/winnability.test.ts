/* ════════════════════════════════════════════════════════════════════════════════════════════
   SOURCE-TYPE + WINNABILITY — the internal, repeats-based per-question signal.

   Pins the source classifier (incl. the ".co" substring trap that would have made every .co.uk a
   business) and the four winnability labels, especially the CONSERVATIVE defaults: unclear when
   thin/conflicting, informational only when authority-leaning with no firms, locked only when a
   small set dominates across cells, wide_open only when many firms + business sources.
   Run: deno run --sloppy-imports scripts/winnability.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { classifySource } from "../src/lib/sourceType.ts";
import { computeWinnability } from "../src/lib/auditReport.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── SOURCE TYPE ──");
ok(classifySource("nhs.uk") === "authority", "nhs.uk → authority");
ok(classifySource("www.nice.org.uk") === "authority", "nice.org.uk → authority");
ok(classifySource("portal.menopause.org") === "authority", "subdomain of menopause.org → authority");
ok(classifySource("fda.gov") === "authority", "fda.gov → authority");
ok(classifySource("cam.ac.uk") === "authority", ".ac.uk → authority");
ok(classifySource("en.wikipedia.org") === "authority", "wikipedia → authority");
ok(classifySource("thebms.org.uk") === "authority", "BMS society → authority");
ok(classifySource("privatedoc.com") === "business", ".com → business");
ok(classifySource("simpleonlinepharmacy.co.uk") === "business", ".co.uk → business (NOT tripped by 'co')");
ok(classifySource("onlinedoctor.boots.com") === "business", "boots.com → business");
ok(classifySource("") === "other", "empty → other");
ok(classifySource("weird.xyz") === "other", "unknown TLD → other");

console.log("\n── WINNABILITY ──");
// INFORMATIONAL: no firms named, authority-leaning sources.
{
  const w = computeWinnability([[], [], []], ["nhs.uk", "nice.org.uk", "thebms.org.uk"]);
  ok(w.label === "informational", `no firms + authority sources → informational (${w.label})`);
}
// UNCLEAR: no firms but sources are business (not clearly info) — don't over-claim.
{
  const w = computeWinnability([[], []], ["privatedoc.com", "boots.com"]);
  ok(w.label === "unclear", `no firms + business sources → unclear (${w.label})`);
}
// LOCKED: same 2 firms dominate across cells.
{
  const cells = [["Menopause Care", "Newson Health"], ["Menopause Care", "Newson Health"], ["Menopause Care"]];
  const w = computeWinnability(cells, ["privatedoc.com"]);
  ok(w.label === "locked", `same few firms recur → locked (${w.label})`);
  ok(w.topFirmCells === 3 && w.totalCells === 3, `top firm in 3/3 cells (${w.topFirmCells}/${w.totalCells})`);
}
// WIDE OPEN: many different firms, none dominant, business sources present.
{
  const cells = [["A Ltd", "B Ltd"], ["C Ltd", "D Ltd"], ["E Ltd", "F Ltd"]];
  const w = computeWinnability(cells, ["someclinic.co.uk", "aclinic.com"]);
  ok(w.label === "wide_open", `6 distinct, none dominant, business sources → wide_open (${w.label})`);
  ok(w.distinctFirms === 6, `6 distinct firms (${w.distinctFirms})`);
}
// UNCLEAR default: a handful of firms but no clear dominance and not enough distinct for wide-open.
{
  const w = computeWinnability([["A Ltd"], ["B Ltd"], ["C Ltd"]], ["x.com"]);
  ok(w.label === "unclear", `3 distinct, each once, no dominance → unclear, not over-claimed (${w.label})`);
}
// Empty audit → unclear.
ok(computeWinnability([], []).label === "unclear", "no cells → unclear");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) throw new Error(`${f} failures`);

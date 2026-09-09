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
/* ⛔ A FIRM ONLY COUNTS ONCE IT RECURS ACROSS THE REPEATS (>=2 cells), and this fixture had not
   caught up with that. It used to be six firms named once each and expected wide_open; the rule
   changed to `>=2 cells` to stop one-off prose fragments inflating the count, so distinctFirms
   became 0 and the label fell to unclear. The suite then failed for weeks with nobody running it.
   ⚠️ THE RULE IS RIGHT AND THE FIXTURE WAS WRONG — checked against live data 2026-09-09 rather
   than assumed. Across RG Locksmiths' 12-question, 3-run measurement, EVERY question has a top
   firm appearing in 50-100% of its answer cells, so nothing in the real book is "wide open" under
   any reading. Six firms named once each between them is not a shape this data produces. */
/* ⚠️ SIX CELLS, WHICH IS A REAL MEASUREMENT (3 runs x 2 scored engines) AND NOT AN ARBITRARY
   FIXTURE SIZE. wide_open needs a firm to RECUR (>=2 cells) while the top firm stays under 40% of
   them, and at three cells those two demands contradict each other — 2 of 3 is already 67%. So the
   label is unreachable below six cells by construction. Writing it at three is what made the
   original fixture unfixable without weakening the rule. */
// WIDE OPEN: enough firms RECURRING across cells, none dominant, business sources present.
{
  const cells = [
    ["A Ltd", "B Ltd"], ["C Ltd", "D Ltd"], ["E Ltd", "F Ltd"],
    ["A Ltd", "C Ltd"], ["B Ltd", "E Ltd"], ["D Ltd", "F Ltd"],
  ];
  const w = computeWinnability(cells, ["someclinic.co.uk", "aclinic.com"]);
  ok(w.label === "wide_open", `6 firms each in 2 of 6 cells, none dominant → wide_open (${w.label})`);
  ok(w.distinctFirms === 6, `6 recurring firms counted (${w.distinctFirms})`);
  ok(w.topFirmCells === 2 && w.totalCells === 6, `top firm in only 2 of 6 cells (${w.topFirmCells}/${w.totalCells})`);
}
/* THE >=2 RULE ITSELF, pinned so nobody "fixes" the fixture above by relaxing it. Six firms named
   ONCE each is the shape a dirty extraction produced, and it must not read as an open market. */
{
  const cells = [["A Ltd", "B Ltd"], ["C Ltd", "D Ltd"], ["E Ltd", "F Ltd"]];
  const w = computeWinnability(cells, ["someclinic.co.uk", "aclinic.com"]);
  ok(w.distinctFirms === 0, `firms named in only ONE cell never count (${w.distinctFirms})`);
  ok(w.label === "unclear", `six one-off names is NOT wide_open (${w.label})`);
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

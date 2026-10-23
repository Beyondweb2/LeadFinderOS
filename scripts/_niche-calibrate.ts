/* Untracked calibration: run the niche fold's per-town read over every stored repeat-run audit
   (each audit = one "town"), questions cut to the first 4 asked, runs to 3. No places data. */
import { readFileSync } from "node:fs";
import { readEngineTown, townPattern, type NicheAnswer, type NicheTownInput } from "../src/lib/nicheSample.ts";

const rows = (JSON.parse(readFileSync(process.argv[2], "utf8"))[0].json_agg ?? []) as Array<{ aid: string; bt: string; town: string; p: string; question: string; run: number; g: any; c: any }>;
const byAudit = new Map<string, typeof rows>();
for (const r of rows) byAudit.set(r.aid, [...(byAudit.get(r.aid) ?? []), r]);
const out: Record<string, Record<string, number>> = {};
const samples: string[] = [];
for (const [aid, rs] of byAudit) {
  const qs = [...new Set(rs.map((r) => r.question))].slice(0, 4);
  const answers: NicheAnswer[] = [];
  for (const r of rs) {
    if (!qs.includes(r.question) || r.run > 3) continue;
    for (const [engine, er] of [["gemini", r.g], ["chatgpt", r.c]] as const) {
      if (!er) continue;
      answers.push({ question: r.question, run: r.run, engine, present: er.answer_present !== false, competitors: Array.isArray(er.competitors) ? er.competitors.map(String) : [], citations: (er.citations ?? []).map((c: any) => String(c?.url ?? "")) });
    }
  }
  const t: NicheTownInput = { town: { name: rs[0].town ?? "", ons_code: aid, population: 0, region: "", band: "small" }, answers, places: null };
  const g = readEngineTown(t, "gemini", new Set(), rs[0].bt);
  const pat = townPattern(g);
  const bt = rs[0].bt.replace(/s$/, "");
  out[bt] = out[bt] ?? {};
  out[bt][pat] = (out[bt][pat] ?? 0) + 1;
  if (samples.length < 40) samples.push(`${bt.padEnd(22)} ${(rs[0].town ?? "").padEnd(18)} ${pat.padEnd(28)} ans=${g.answers} lpa=${g.localPerAnswer.toFixed(1)} empty=${g.emptyShare.toFixed(2)} dn=${g.dirNatShare.toFixed(2)} distinct=${g.distinctLocal} top3=${g.top3Share.toFixed(2)} held=${g.heldShare.toFixed(2)} flip=${g.flipShare.toFixed(2)}`);
}
console.log(JSON.stringify(out, null, 1));
console.log(samples.join("\n"));

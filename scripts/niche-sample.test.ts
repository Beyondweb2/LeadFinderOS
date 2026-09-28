/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE NICHE CHECK (2026-09-28) — src/lib/nicheSample.ts + fn niche-sample.

   ⛔ The failures this guards: the same three towns every time; two towns from one region; London
   as the "major city"; a question set that differs between towns; a verdict ChatGPT can move; "few
   Gemini names" read as promising when Google shows the market is healthy (it is WORKABLE) — or when
   Google shows the market is thin (it is HARDER); a composite score; a verdict forced out of failed
   answers; a second audit engine; a browser that can turn the check into any audit it likes.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import {
  NICHE_SAMPLE_QUESTIONS_PER_TOWN, NICHE_SAMPLE_RUNS, NICHE_SAMPLE_TOWNS, NICHE_SAMPLE_USD, NICHE_PLACES_USD_PER_TOWN,
  NICHE_SAMPLE_QUESTION_RUNS, bandOf, nicheQuestions, nicheSampleVerdict, pickSampleTowns,
  type NicheAnswer, type NicheTownInput, type PlacesCandidate, type SampleTown, type TownRow,
} from "../src/lib/nicheSample.ts";
import { AUDIT_EST_USD_PER_QUESTION } from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("── the method's size and cost ──");
ok(NICHE_SAMPLE_TOWNS === 3 && NICHE_SAMPLE_QUESTIONS_PER_TOWN === 4 && NICHE_SAMPLE_RUNS === 3 && NICHE_SAMPLE_QUESTION_RUNS === 36, "3 towns × 4 questions × 3 runs = 36 question-runs (Paul, 2026-09-28)");
ok(Math.abs(NICHE_SAMPLE_USD - (36 * AUDIT_EST_USD_PER_QUESTION + 3 * NICHE_PLACES_USD_PER_TOWN)) < 1e-9 && NICHE_SAMPLE_USD < 0.7, "the price is derived from the audit forecast + three Enterprise text searches (≈50p)");

console.log("\n── towns: one per band, different regions, random, never London ──");
const towns: TownRow[] = [
  { name: "Birmingham", ons_code: "B", population: 1_121_375, region: "West Midlands" },
  { name: "Leeds", ons_code: "L", population: 536_280, region: "Yorkshire and The Humber" },
  { name: "London", ons_code: "X", population: 8_000_000, region: "London" },
  { name: "Derby", ons_code: "D", population: 275_575, region: "East Midlands" },
  { name: "Worcester", ons_code: "W", population: 103_000, region: "West Midlands" },
  { name: "Exeter", ons_code: "E", population: 130_000, region: "South West" },
  { name: "Ely", ons_code: "Y", population: 20_000, region: "East of England" },
  { name: "Ludlow", ons_code: "U", population: 11_000, region: "West Midlands" },
  { name: "Buxton", ons_code: "X2", population: 22_000, region: "East Midlands", suppressed_at: "2026-01-01" },
];
ok(bandOf(1_000_000) === "major" && bandOf(100_000) === "medium" && bandOf(20_000) === "small" && bandOf(50_000) === null && bandOf(null) === null, "the three bands (a 50k town is in none — the bands are deliberately apart)");
let seed = 0;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
const seen = new Set<string>();
for (let i = 0; i < 60; i++) {
  const p = pickSampleTowns(towns, { random: rnd })!;
  ok(p.length === 3 && p[0].band === "major" && p[1].band === "medium" && p[2].band === "small", "three towns, one per band") || null;
  if (new Set(p.map((t) => t.region)).size !== 3) { ok(false, "regions differ"); break; }
  if (p.some((t) => t.name === "London" || t.name === "Buxton" || t.name === "Ludlow")) { ok(false, "never London, a suppressed or an out-of-band town"); break; }
  seen.add(p.map((t) => t.name).join("|"));
}
ok(seen.size >= 3, `the draw varies (${seen.size} different triples in 60 draws)`);
const avoided = pickSampleTowns(towns, { random: () => 0, avoid: new Set(["B", "W"]) })!;
ok(avoided[0].name !== "Birmingham" && avoided[1].name !== "Worcester", "towns an earlier sample used are avoided while the band has another");
ok(pickSampleTowns(towns.filter((t) => t.name !== "Ely"), { random: () => 0 }) === null, "a band that cannot be filled refuses rather than guessing");

console.log("\n── questions: the same four intents in every town ──");
const qa = nicheQuestions("Roofers", "Leeds"), qb = nicheQuestions("roofers", "Ely");
ok(qa.ok && qa.questions.length === 4 && qb.ok, "four questions");
ok(qa.ok && qb.ok && qa.questions.every((q, i) => q.replace("Leeds", "T") === qb.questions[i].replace("Ely", "T")), "identical wording across towns — only the town changes");
ok(qa.ok && qa.questions.every((q) => /Leeds, UK/.test(q) && !/near me/i.test(q)), "town disambiguated with UK; no 'near me'");
ok(qa.ok && qa.questions[0] === "Can you recommend a roofer in Leeds, UK?", "customer wording (article + singular from the one trade map)");
ok(nicheQuestions("accountants", "Ely").ok && (nicheQuestions("accountants", "Ely") as { questions: string[] }).questions[0].includes("an accountant"), "an accountant, not a accountant");
ok(!nicheQuestions("", "Leeds").ok && !nicheQuestions("plumbers and electricians", "Leeds").ok, "a blank or multi-trade niche is refused");

console.log("\n── the verdict: Gemini decides, the market search interprets silence ──");
const T = (name: string, i: number): SampleTown => ({ name, ons_code: `c${i}`, population: [400_000, 120_000, 20_000][i], region: `R${i}`, band: (["major", "medium", "small"] as const)[i] });
const TOWNS = [T("Leeds", 0), T("Exeter", 1), T("Ely", 2)];
const Q = ["q1", "q2", "q3", "q4"];
/** Build a town: fn(q, run) → the Gemini names for that answer. */
function town(t: SampleTown, gem: (q: number, r: number) => string[], opts: { places?: PlacesCandidate[] | null; chat?: (q: number, r: number) => string[]; present?: (q: number, r: number) => boolean } = {}): NicheTownInput {
  const answers: NicheAnswer[] = [];
  for (let q = 0; q < 4; q++) for (let r = 1; r <= 3; r++) {
    const present = opts.present ? opts.present(q, r) : true;
    answers.push({ question: Q[q], run: r, engine: "gemini", present, competitors: present ? gem(q, r) : [], citations: [] });
    answers.push({ question: Q[q], run: r, engine: "chatgpt", present: true, competitors: (opts.chat ?? gem)(q, r), citations: ["https://www.checkatrade.com/x"] });
  }
  return { town: t, answers, places: opts.places === undefined ? healthy(t.name) : opts.places };
}
const firm = (t: string, n: number) => `${["Apex", "Birch", "Cedar", "Delta", "Ember", "Falcon", "Granite", "Harbour", "Iris", "Juniper", "Kestrel", "Lark"][n % 12]} ${t.slice(0, 3)}${n} Roofing Ltd`;
const healthy = (t: string): PlacesCandidate[] => Array.from({ length: 15 }, (_, i) => ({ name: `${["Pine", "Oak", "Ash", "Elm", "Fir", "Yew", "Bay", "Box", "Gum", "Tea", "Fig", "Lime", "Palm", "Rowan", "Sloe"][i]} ${t} Roofers`, website: `https://r${i}.co.uk`, primaryType: "roofing_contractor" }));
const thin = (t: string): PlacesCandidate[] => [{ name: `Solo ${t} Roofing`, website: null, primaryType: "roofing_contractor" }];

// 1. fragmented — many different local firms, rotating
const frag = (t: SampleTown, off: number) => town(t, (q, r) => [firm(t.name, off + q * 3 + r), firm(t.name, off + q * 3 + r + 7), firm(t.name, off + q + r * 5 + 11)]);
const v1 = nicheSampleVerdict("roofers", [frag(TOWNS[0], 0), frag(TOWNS[1], 30), frag(TOWNS[2], 60)]);
ok(v1.verdict === "WORKABLE" && v1.towns.every((t) => t.pattern === "fragmented"), `fragmented local recommendations → WORKABLE (${v1.verdict}; ${v1.towns.map((t) => t.pattern).join(",")})`);
ok(v1.confidence === "High", "three agreeing towns, all answers → High confidence");
// 2. low Gemini coverage over a healthy market
const quiet = (t: SampleTown) => town(t, (q, r) => (q === 0 && r === 1 ? [firm(t.name, 1)] : []));
const v2 = nicheSampleVerdict("roofers", TOWNS.map(quiet));
ok(v2.verdict === "WORKABLE" && v2.towns.every((t) => t.pattern === "low_coverage_healthy_market"), "Gemini names almost nobody but Google lists plenty of providers → WORKABLE (the gap)");
// 6. actually sparse market
const v6 = nicheSampleVerdict("roofers", TOWNS.map((t) => ({ ...quiet(t), places: thin(t.name) })));
ok(v6.verdict === "HARDER NICHE" && v6.towns.every((t) => t.pattern === "thin_market") && /too thin/.test(v6.why), "few names AND few providers → HARDER (the niche is thin), never an AI opportunity");
// silence with no market check → need more data
const v6b = nicheSampleVerdict("roofers", TOWNS.map((t) => ({ ...quiet(t), places: null })));
ok(v6b.verdict === "NEED MORE DATA", "few names and the market search failed → NEED MORE DATA, not a guess");
// 3. concentrated — the same small group
const conc = (t: SampleTown) => town(t, () => [firm(t.name, 0), firm(t.name, 1), firm(t.name, 2)]);
const v3 = nicheSampleVerdict("roofers", TOWNS.map(conc));
ok(v3.verdict === "HARDER NICHE" && v3.towns.every((t) => t.pattern === "concentrated") && /same small group/.test(v3.why), "the same few firms every time → HARDER, and it says why");
// 4. directory / national dominated
const dir = (t: SampleTown) => town(t, (q, r) => ["Checkatrade", "Rated People", "MyBuilder", r === 1 ? firm(t.name, q) : "Yell"]);
const v4 = nicheSampleVerdict("roofers", TOWNS.map(dir));
ok(v4.verdict === "HARDER NICHE" && v4.towns.every((t) => t.pattern === "directory_national") && /directories/.test(v4.why), "directories and nationals → HARDER, explained (listings, not pages)");
// a "local" name in every town is a chain
const chain = (t: SampleTown) => town(t, () => ["Ridgeline Roofing Group", "Crestway Roofing", "Summit Pro Roofing"]);
const vc = nicheSampleVerdict("roofers", TOWNS.map(chain));
ok(vc.towns.every((t) => t.pattern === "directory_national"), "a name Gemini gives in several far-apart towns is read as a chain/national, not a local firm");
// 5. mixed — towns disagree
const middling = (t: string): PlacesCandidate[] => healthy(t).slice(0, 5);
const v5 = nicheSampleVerdict("roofers", [frag(TOWNS[0], 0), conc(TOWNS[1]), { ...quiet(TOWNS[2]), places: middling("Ely") }]);
const v5b = nicheSampleVerdict("roofers", [frag(TOWNS[0], 0), conc(TOWNS[1]), dir(TOWNS[2])]);
ok(v5b.verdict === "HARDER NICHE" && v5b.confidence === "Medium", "two harder towns of three (concentrated + directory) is HARDER, Medium — two thirds agree");
ok(v5.verdict === "PROMISING — NEEDS MORE DATA" && v5.confidence !== "High", "towns strongly disagree → PROMISING — NEEDS MORE DATA, never High");
// failures
const v7 = nicheSampleVerdict("roofers", TOWNS.map((t, i) => frag(t, i * 30)).map((x, i) => (i === 0 ? { ...x, answers: x.answers.map((a) => (a.engine === "gemini" && a.run === 3 ? { ...a, present: false, competitors: [] } : a)) } : x)));
ok(v7.verdict !== "NEED MORE DATA" && v7.confidence !== "High", "four failed answers (89% back) still reads, with confidence stepped down…");
const v8 = nicheSampleVerdict("roofers", TOWNS.map((t, i) => town(t, (q, r) => [firm(t.name, q + r + i)], { present: (_q, r) => r === 1 })));
ok(v8.verdict === "NEED MORE DATA" && /came back/.test(v8.why), "…and most answers failing → NEED MORE DATA, never a forced verdict");

console.log("\n── ChatGPT is context, never the decider ──");
const noisyChat = (t: SampleTown, off: number) => town(t, (q, r) => [firm(t.name, off + q * 3 + r), firm(t.name, off + q * 3 + r + 7), firm(t.name, off + q + r * 5 + 11)], { chat: () => ["Checkatrade", "Yell"] });
const v9 = nicheSampleVerdict("roofers", [noisyChat(TOWNS[0], 0), noisyChat(TOWNS[1], 30), noisyChat(TOWNS[2], 60)]);
ok(v9.verdict === v1.verdict && v9.confidence === v1.confidence, "the same Gemini evidence with completely different ChatGPT answers gives the same verdict");
ok(/^ChatGPT: /.test(v1.chatgpt) && /Context only/.test(v1.chatgpt) && /^Gemini: /.test(v1.gemini), "Gemini's pattern and ChatGPT's line are separate sentences");
ok(!/\d+\s*\/\s*100|score/i.test(JSON.stringify({ a: v1.why, b: v1.gemini, c: v1.nextStep })), "no composite score in anything the verdict says");
ok(!/review/i.test(read("src/lib/nicheSample.ts").split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l) && !/review counts are not read/.test(l)).join("\n").replace(/[`'"].*?review.*?[`'"]/g, "")), "the fold never reads a review count");

console.log("\n── the runner is the one audit engine, admin-only to spend ──");
const fn = read("supabase/functions/niche-sample/index.ts");
ok(/if \(!isAdmin\) return json\(\{ ok: false, error: "admin_only" \}, 403\);/.test(fn) && fn.indexOf('"admin_only"') < fn.indexOf('action === "plan"'), "plan and start are admin-only; list and status read");
ok(/purpose: "discovery", niche_sample: true/.test(fn) && /run_count: NICHE_SAMPLE_RUNS/.test(fn) && /skip_seo: true/.test(fn) && /functions\/v1\/create-ai-audit/.test(fn), "each town is ONE create-ai-audit discovery audit: the four questions, three runs, no SEO scan");
ok(!/ai_audit_queue"\)\.insert|ai_audits"\)\.insert/.test(fn), "the runner writes no audit rows itself");
ok(/JSON\.stringify\(q\.questions\) !== JSON\.stringify\(t\.questions\)/.test(fn) && /bandOf\(row\.population\) !== t\.band/.test(fn), "start re-validates the plan: real towns, their bands, distinct regions, exactly the four questions");
ok(/"X-Goog-FieldMask": "places\.id,places\.displayName,places\.websiteUri,places\.primaryType"/.test(fn), "the market search asks for who exists — no rating or review field");
const cai = read("supabase/functions/create-ai-audit/index.ts");
ok(/is_market: isInternal && isDiscovery && !leadId && body\.niche_sample === true,/.test(cai), "only an internal, lead-less discovery niche sample is a market audit (no public report, out of the business folds)");
ok(/\[functions\.niche-sample\]\nverify_jwt = true/.test(read("supabase/config.toml")), "config.toml lists the new function");
const mig = read("supabase/migrations/20260929000100_niche_samples.sql");
ok(/enable row level security/.test(mig) && !/create policy/i.test(mig) && !/verdict/.test(mig.replace(/--.*$/gm, "")), "niche_samples is service-role only and stores evidence, never the verdict");

if (f) { console.error(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");

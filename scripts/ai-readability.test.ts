/* The client-facing website score: six parts, fixed weights, evidence only, unknown parts left out. */
import { aiReadability, AI_READABILITY_WEIGHTS, serviceKey } from "../src/lib/aiReadability.ts";
import { readFileSync } from "node:fs";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const w = AI_READABILITY_WEIGHTS;
ok(w.services === 30 && w.proof === 20 && w.areas === 15 && w.details === 15 && w.crawlers === 10 && w.technical === 10, "weights 30/20/15/15/10/10");

ok(aiReadability({ state: "not_checked", issues: [], strengths: [] }).score === null, "not checked = no score");
ok(aiReadability({ state: "unreadable", issues: [], strengths: [] }).score === null, "unreadable = no score");
ok(aiReadability({ state: "no_website", issues: [], strengths: [] }).score === null, "no website = no score");

const perfect = aiReadability({
  state: "clean", issues: [],
  strengths: [{ id: "reviews_shown" }, { id: "business_schema" }, { id: "phone_shown" }, { id: "oai_searchbot_ok" }],
  pageUrls: ["https://x.co.uk/", "https://x.co.uk/boiler-repair", "https://x.co.uk/emergency-plumber"],
  services: ["Boiler repair", "Emergency plumbing"], areas: ["Tamworth"], townsOnSite: ["Tamworth"],
});
ok(perfect.score === 100, `everything present = 100 (got ${perfect.score})`);

const weak = aiReadability({
  state: "issues",
  issues: [{ id: "no_reviews", severity: "high" }, { id: "no_business_schema", severity: "low" }, { id: "missing_description", severity: "low", title: "Pages have no description" }],
  strengths: [{ id: "phone_shown" }],
  pageUrls: ["https://x.co.uk/", "https://x.co.uk/about"],
  services: ["Boiler repair", "Emergency plumbing"], areas: ["Tamworth", "Lichfield"], townsOnSite: ["Tamworth"],
});
ok(weak.score !== null && weak.score < 50, `weak site scores low (got ${weak.score})`);
ok(weak.findings[0].serious && weak.findings[0].part !== "technical", "serious AI-reading problems listed first");
ok(weak.findings.some((x) => /None of your 2 services/.test(x.text)), "says no service has its own page");
ok(weak.findings.some((x) => /1 of the 2 areas/.test(x.text)), "says which share of areas is named");
ok(weak.findings.at(-1)!.part === "technical", "technical findings come last");

const unknownProof = aiReadability({ state: "clean", issues: [], strengths: [{ id: "phone_shown" }, { id: "business_schema" }] });
ok(unknownProof.parts.find((p) => p.part === "proof")!.got === null, "proof not seen either way = left out, not 0");
ok(unknownProof.score === null && unknownProof.findings.length === 0, "under half the weight judged = no number (never a flattering 100 from the small parts)");
const halfKnown = aiReadability({ state: "clean", issues: [], strengths: [{ id: "phone_shown" }, { id: "business_schema" }, { id: "reviews_shown" }] });
ok(halfKnown.score === 100 && halfKnown.parts.find((p) => p.part === "services")!.got === null, "parts that could not be judged do not pull the score down once half is judged");
const byKind = aiReadability({ state: "issues", issues: [], strengths: [{ id: "phone_shown" }], pageUrls: ["https://x.uk/", "https://x.uk/a", "https://x.uk/b"], servicePagesRead: 0, townsOnSite: ["Leeds"], town: "Canterbury" });
ok(byKind.parts.find((p) => p.part === "services")!.got === 0 && byKind.parts.find((p) => p.part === "areas")!.got === 0 && byKind.findings.some((f) => /doesn.t mention Canterbury/.test(f.text)), "no client lists: the crawler page types and the home town decide");

ok(aiReadability({ state: "issues", issues: [{ id: "robots_blocks_ai_search", severity: "high" }], strengths: [] }).parts.find((p) => p.part === "crawlers")!.got === 0, "robots blocking AI search = 0 for crawlers");
ok(serviceKey("Boiler Servicing") === "boil" && serviceKey("Local Services") === null, "service key is the first real word, stemmed");

// Fences: never the team-only site score, never called an SEO score.
const src = readFileSync(new URL("../src/lib/aiReadability.ts", import.meta.url), "utf8");
ok(!/from ['"].*siteScore/.test(src), "does not import the team-only site score");
ok(!/SEO score/i.test(src.replace(/Not an "SEO score"/, "")), "never calls itself an SEO score");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");

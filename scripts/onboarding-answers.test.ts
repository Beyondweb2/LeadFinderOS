/* Onboarding → audit, self-serve (v1-onboarding-to-audit, 2026-11-15): the client's answers, one reading.
 * Wanted services only; "don't offer" AND "don't want pushed" both keep a question out; the alert carries the answers
 * and links to Prepare baseline; every reader is wired (three lists in findable-onboarding, paid-baseline, the hub).
 * Run: npx tsx scripts/onboarding-answers.test.ts */
import { readFileSync } from "node:fs";
import { excludedServicesOf, onboardingAnswerLines, onboardingAnswersAlert, prepareBaselinePath, wantedServicesOf } from "../src/lib/onboardingAnswers.ts";
import { buildServiceScope, questionScope } from "../src/lib/serviceScope.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/* A London maintenance firm: does emergency call-outs but doesn't want them pushed. */
const rob = {
  confirmed_location: "London",
  services_list: ["Plumbing", "Boiler repair", "Bathroom fitting"],
  services: "Plumbing, Boiler repair, Bathroom fitting",
  services_not_wanted: "Emergency call-outs",
  services_not_offered: "Gas installations; Roofing",
  coverage_area: "All London boroughs inside the M25",
  areas_list: ["Croydon", "Bromley"],
  top_requests: "Leaks and boiler faults",
};

console.log("── one reading ──");
ok(JSON.stringify(wantedServicesOf(rob)) === JSON.stringify(["Plumbing", "Boiler repair", "Bathroom fitting"]), "wanted = the ticked list");
ok(JSON.stringify(wantedServicesOf({ services: "Plumbing, Tiling" })) === JSON.stringify(["Plumbing", "Tiling"]), "no list → the typed answer");
ok(JSON.stringify(excludedServicesOf(rob)) === JSON.stringify(["Gas installations", "Roofing", "Emergency call-outs"]), "excluded = not offered + not wanted");
ok(excludedServicesOf({ services_not_offered: "Roofing", services_not_wanted: "roofing" }).length === 1, "the same service twice is one exclusion");
ok(excludedServicesOf(null).length === 0 && excludedServicesOf({}).length === 0, "an old row with neither column excludes nothing");

const lines = onboardingAnswerLines(rob);
const label = (l: string) => lines.find((x) => x.label === l)?.value ?? null;
ok(label("Does NOT want pushed") === "Emergency call-outs", "not-wanted shown under its own label");
ok(label("Does NOT offer") === "Gas installations, Roofing", "not-offered shown apart (nothing says they don't do call-outs)");
ok(label("Area covered") === "All London boroughs inside the M25", "the area in their own words");
ok(label("Priority towns") === "Croydon, Bromley", "the priority towns, in order");
ok(onboardingAnswerLines({ confirmed_location: "Leeds" }).length === 1, "a blank answer is left out, never a dash");

console.log("\n── the exclusion reaches the questions ──");
const scope = buildServiceScope({ services: wantedServicesOf(rob), notOffered: excludedServicesOf(rob), trade: "Plumber", towns: ["London", "Croydon", "Bromley"] });
ok(questionScope("Who does emergency plumbing in Croydon?", scope).verdict === "not_offered", "an emergency question is kept out");
ok(questionScope("Is there a 24 hour plumber in London?", scope).verdict === "not_offered", "24 hour reads as emergency and is kept out");
ok(questionScope("Who can repair my boiler in Bromley?", scope).verdict === "service", "a wanted service still passes");

console.log("\n── the alert ──");
const a = onboardingAnswersAlert({ businessName: "London Domestic Maintenance", leadId: "abc", row: rob });
ok(a.link === "/paid-clients/abc?baseline=open" && a.link === prepareBaselinePath("abc"), "links to the client page with Prepare baseline open");
ok(a.lines.some((l) => l === "Does NOT want pushed: Emergency call-outs"), "the email carries the answers");
ok(a.lines.some((l) => l.startsWith("https://app.leadfinderos.com/paid-clients/abc?baseline=open")), "the email carries the full app link");
ok(a.bellBody.length <= 280 && /Not: .*Emergency call-outs/.test(a.bellBody), "the bell body fits and names the exclusions");
ok(a.subject.includes("London Domestic Maintenance"), "the subject names the client");
ok(onboardingAnswersAlert({ businessName: "", leadId: "x", row: {} }).bellBody === "Their answers are on the client record.", "an empty row still reads as a sentence");

console.log("\n── wiring ──");
const fo = read("supabase/functions/findable-onboarding/index.ts");
const q2 = fo.slice(fo.indexOf('if (action === "complete_q2")'), fo.indexOf("── payment_status"));
for (const k of ["services_not_wanted", "coverage_area"]) {
  ok(q2.includes(`${k}: clip(a.${k}`), `complete_q2 accepts ${k}`);
  ok((q2.match(new RegExp(`"${k}"`, "g")) ?? []).length >= 1, `complete_q2 can shed ${k} (second list)`);
}
ok(/dedupe_key: `setup_answers:\$\{onboardingId\}`/.test(q2) && q2.includes("ignoreDuplicates: true") && q2.includes("claimed.length"), "the alert is one conditional claim; the email only when it won");
const pb = read("supabase/functions/paid-baseline/index.ts");
ok(pb.includes("notOffered: excluded") && pb.includes("excludedServicesOf("), "paid-baseline writes questions against BOTH exclusions");
ok(pb.includes('services_not_wanted, coverage_area")'), "paid-baseline reads the new columns");
ok(/services_not_wanted,coverage_area/.test(read("supabase/functions/paid-client-hub/index.ts")), "the hub sends the new answers to the client page");
const hub = read("src/pages/ClientHub.tsx");
ok(hub.includes("SetupAnswersCard") && hub.includes("onRun('discovery')") && hub.includes("onRun('baseline')"), "client page: Run Discovery + Create baseline");
ok(hub.includes("searchParams.get('baseline')"), "client page opens Prepare baseline from the alert link");
ok(/services_not_wanted: \(b\.services_not_wanted/.test(hub) && /coverage_area: b\.coverage_area/.test(hub), "Paul can review and edit both before saving");

console.log(f ? `\n${f} FAILED` : "\nALL PASS");
process.exit(f ? 1 : 0);

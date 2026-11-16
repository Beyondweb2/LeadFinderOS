/* Audit verdict rules v4 — locked spots, B′ (Paul, 2026-11-16; docs/AUDIT_RULES.md): over the asks in which an AI named firms
   (3 of 3, or 2 of 3), it is LOCKED when 2+ firms are in every one of them and fewer than 2 firms are named only once;
   Not winnable only when every naming AI is locked. One firm's spellings count as one (makeFirmMatchKey). The cases are the
   real LDM / Moments searches Paul compared. */
import { AUDIT_RULES_V3_FROM, AUDIT_RULES_V4_FROM, AUDIT_RULES_VERSION, LOCKED_MAX_ONCE, LOCKED_MIN_EVERY, auditRulesFor, decideVerdictV3, type AnswerFacts } from "../src/lib/auditVerdict.ts";
import { firmKey, makeFirmMatchKey, oppQuestion, type OppContext, type OppRow } from "../src/lib/reportOpportunity.ts";
import { splitLine, verdictSplitOf } from "../src/lib/reportDesign.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

ok(AUDIT_RULES_VERSION === 4 && LOCKED_MIN_EVERY === 2 && LOCKED_MAX_ONCE === 2, "v4 is the newest rule; locked = 2+ firms in every ask and fewer than 2 named once");

/* ── One firm, many spellings (tweak 1). Every merge seen on the LDM / Moments answers, and what must stay apart ──── */
const k = makeFirmMatchKey(["London", "Fulham", "Greenwich", "Camden", "Wandsworth"]);
const same = (a: string, b: string) => k(a) === k(b);
ok(same("HomeCert Ltd", "HomeCert Ltd - Electricians & Gas Engineers London"), "a strapline after \" - \" is dropped (HomeCert)");
ok(same("RCD Electrical Ltd", "RCD Electrical LTD Fulham") && same("RCD Electrical LTD", "RCD Electrical Ltd"), "case, Ltd and a trailing place word (RCD Electrical)");
ok(same("Keystone London - Plumbing & Heating", "Keystone London"), "Keystone London");
ok(same("Landlords Gas Inspections", "Landlords Gas Inspections (JF Gas Ltd)"), "a trailing (…) is dropped");
ok(same("Sociabelle", "Sociabelle (Kerry Foy)") && same("Sociabelle", "Sociabelle – Kerry Foy"), "Sociabelle, three ways");
ok(same("Aoife Lyons", "Aoife Lyons – Irish Content Creator") && same("Aoife Lyons", "Aoife Lyons (Irish Content Creator)"), "Aoife Lyons, three ways");
ok(same("D|N Wedding Stories", "D|N Wedding Stories – Dace Nolan") && k("D|N Wedding Stories").length >= 4, "a bare \"|\" inside a name is kept (D|N Wedding Stories is not cut to \"D\")");
ok(same("Polarity Electrics", "Polarity Electrics London") && same("Taylors Plumbers Camden", "Taylors Plumbers"), "a trailing place is dropped while 3+ words remain");
ok(k("Electricians Greenwich") !== k("Electricians Wandsworth") && k("Electricians Greenwich") !== k("Electricians"), "a two-word trade-and-place name keeps its place (never cut to \"electricians\")");
ok(!same("Hackney Heating", "Hackney Plumbing") && !same("Gas First Ltd", "Gas Safety Medic Ltd") && !same("Aoife Lyons", "Irish Content Creator – Aoife") && !same("EICR Pro", "EICR Pro Electricians"), "different firms are never merged (different words stay different)");
ok(same("Smith & Sons Ltd.", "Smith and Sons Limited") && same("Acme LLP", "Acme"), "& / and, LLP");

/* ── Locked spots (B′) on each AI's own asks ──────────────────────────────────────────────────────────── */
type E = "chatgpt" | "gemini";
const A = (engine: E, firms: string[], o: Partial<AnswerFacts> = {}): AnswerFacts => ({ engine, failed: false, you: "no", near: [], firms, dirs: [], wrongPlace: false, text: "Some firms.", registers: [], ...o });
const asks = (cg: string[][], gm: string[][] = [[], [], []]) => [0, 1, 2].flatMap((i) => [A("chatgpt", cg[i]), A("gemini", gm[i])]);
const V = (answers: AnswerFacts[]) => decideVerdictV3({ question: "gas safety certificate in Camden", answers, head: "gas safety certificate", leftOut: null, area: "Camden", key: k }, { lockedSpots: true });

const lewisham = V(asks([["H3GS", "Heatjet Ltd", "Ecotek", "RH Heating"], ["H3GS", "Ecotek Ltd", "Heatjet", "R H Heating"], ["H3GS", "Ecotek", "Heatjet", "RH Heating"]]));
ok(lewisham.rules === 4 && lewisham.verdict === "not_winnable" && lewisham.label === "Locked spots" && lewisham.lockedBy.length >= 3, "Lewisham: the same 4 firms in all 3 asks = Not winnable (C opened it)");
const london = V(asks([["Gas Safety Medic Ltd", "Silver Saints"], ["Gas Safety Medic Ltd", "Gasify"], ["London Safe Gas", "Gas Safety Medic Ltd"]]));
ok(london.verdict === "winnable", "London gas: one firm every time, a different second each ask = Winnable (A and C said Not)");
const camden = V(asks([["Nielsen", "FixMyElectrics", "EICR Pro", "Polarity"], ["Nielsen", "DW Sparks", "Polarity", "EICR Pro"], ["Nielsen", "FixMyElectrics", "EICR Pro", "Polarity"]]));
ok(camden.verdict === "not_winnable", "Camden EICR: 3 firms every time, one in 2 of 3, one newcomer = Not winnable (plain B said Winnable)");
const tower = V(asks([["Best Gas", "MAMOSS", "Gas First"], ["Gas First", "Best Gas", "MAMOSS", "Efficient Home Energy"], ["Gas First", "MAMOSS", "Best Gas", "Whitbread Heating"]]));
ok(tower.verdict === "winnable", "Tower Hamlets gas: 3 every time but 2 newcomers = Winnable (the line is fewer than 2 newcomers)");
const wandsworth = V(asks([["GreenLine Plumbing & Heating", "HomeCert Ltd", "Hydro Install LTD", "SW Plumbers"], ["GreenLine Plumbing & Heating", "HomeCert Ltd - Electricians & Gas Engineers London", "Hydro Install LTD", "SW Plumbers"], ["GreenLine Plumbing & Heating", "Hydro Install Ltd", "HomeCert Ltd", "SW Plumbers"]]));
ok(wandsworth.verdict === "not_winnable" && wandsworth.lockedBy.length === 4, "Wandsworth gas: HomeCert's two spellings are one firm, so the same 4 every time = Not winnable");
const wandsworthOldKey = decideVerdictV3({ question: "q", answers: asks([["A", "HomeCert Ltd", "B"], ["A", "HomeCert Ltd - Electricians & Gas Engineers London", "B"], ["A", "HomeCert Ltd", "B", "C"]]), head: null, leftOut: null, area: null, key: firmKey }, { lockedSpots: true });
ok(wandsworthOldKey.verdict === "winnable", "(without the merge the spelling counted as a newcomer and opened it)");

/* Tweak 2: an AI naming firms in only 2 of its 3 asks is judged on those 2 */
const twoLocked = V(asks([["Gas First", "Best Gas"], ["Best Gas", "Gas First"], []]));
ok(twoLocked.verdict === "not_winnable", "2 of 3 asks, the same 2 firms in both = Not winnable (was always Winnable)");
const twoOpen = V(asks([["Gas First", "Best Gas"], ["Hackney Heating", "Full Flame"], []]));
ok(twoOpen.verdict === "winnable", "2 of 3 asks, different firms each time = Winnable");
const twoWithNew = V(asks([["Gas First", "Best Gas", "X Heating"], ["Best Gas", "Gas First", "Y Heating"], []]));
ok(twoWithNew.verdict === "winnable", "2 of 3 asks, same 2 + a different newcomer each time (2 named once) = Winnable");

/* Each AI on its own: one open AI is enough */
const kenmare = V(asks([["Social Saint", "Bethan + Mark", "Sociabelle"], ["Social Saint", "Bethan + Mark", "Sociabelle"], ["Social Saint", "Bethan + Mark", "Sociabelle – Kerry Foy"]],
  [["Social Saint", "Sociabelle (Kerry Foy)", "Wedding Content Ireland", "Toast"], ["Social Saint", "Toast"], ["Social Saint", "Toast", "Wedding Content Ireland", "Kinsale Reels"]]));
ok(kenmare.verdict === "winnable", "Kenmare (Moments): ChatGPT locked, Gemini rotates = Winnable");
const bothLocked = V(asks([["A Gas", "B Gas"], ["A Gas", "B Gas"], ["A Gas", "B Gas"]], [["C Heat", "D Heat"], ["C Heat", "D Heat"], ["D Heat", "C Heat"]]));
ok(bothLocked.verdict === "not_winnable", "both AIs locked = Not winnable");
ok(V(asks([["A Gas"], [], []])).verdict === "no_names", "firms in 1 ask only: AI doesn't name businesses here (unchanged)");
ok(V(asks([["A Gas", "B Gas"], ["A Gas", "B Gas"], ["A Gas", "B Gas"]], [["A Gas"], [], []]).map((a, i) => i === 1 ? { ...a, you: "named" as const } : a)).rule === "visible", "already named still beats everything");

/* ── v3 stays as it was for its links; v4 from its date or a copy stamped 4 ─────────────────────────────── */
const v3 = decideVerdictV3({ question: "q", answers: asks([["H3GS", "Heatjet", "Ecotek", "RH"], ["H3GS", "Ecotek", "Heatjet", "RH"], ["H3GS", "Ecotek", "Heatjet", "RH"]]), head: null, leftOut: null, area: null, key: firmKey });
ok(v3.rules === 3 && v3.label === "Crowded", "rules v3 (the morning's links) keep the 70% line");
ok(auditRulesFor({ createdAt: new Date(Date.parse(AUDIT_RULES_V4_FROM) + 1000).toISOString() }) === 4, "an audit made after v4 shipped uses v4");
ok(auditRulesFor({ createdAt: new Date(Date.parse(AUDIT_RULES_V4_FROM) - 1000).toISOString() }) === 3 && Date.parse(AUDIT_RULES_V4_FROM) > Date.parse(AUDIT_RULES_V3_FROM), "an audit made between v3 and v4 keeps v3");
ok(auditRulesFor({ createdAt: "2026-11-11T09:00:00Z", runRules: [4] }) === 4 && auditRulesFor({ createdAt: "2026-11-11T09:00:00Z", runRules: [3] }) === 3, "a copy stamped 4 uses v4; one stamped 3 keeps v3");

/* ── Through the real reader ──────────────────────────────────────────────────────────────────────────── */
const ID = { name: "London Domestic Maintenance Ltd", domains: ["londondomesticmaintenance.com"] };
const ctx4: OppContext = { businessName: "London Domestic Maintenance Ltd", services: [], town: "London", rules: 4, identity: ID };
const cell = (competitors: string[]) => ({ answer_text: "Firms: " + competitors.join(", "), competitors, citations: [], firms_read: true });
const rows: OppRow[] = [
  ["GreenLine Plumbing & Heating", "HomeCert Ltd", "Hydro Install LTD", "SW Plumbers"],
  ["GreenLine Plumbing & Heating", "HomeCert Ltd - Electricians & Gas Engineers London", "Hydro Install LTD", "SW Plumbers"],
  ["GreenLine Plumbing & Heating", "Hydro Install Ltd", "HomeCert Ltd", "SW Plumbers"],
].map((c) => ({ question: "landlord gas safety record in Wandsworth", result: { chatgpt: cell(c), gemini: { answer_text: "Use a Gas Safe registered engineer.", competitors: [], citations: [], firms_read: true } } }));
const q4 = oppQuestion("landlord gas safety record in Wandsworth", rows, ctx4);
ok(q4.verdict?.rules === 4 && q4.verdict.verdict === "not_winnable" && /4 in every one/.test(q4.verdict.reason), "reader: v4 merges the spellings and locks Wandsworth, with the evidence in the reason");
const q3 = oppQuestion("landlord gas safety record in Wandsworth", rows, { ...ctx4, rules: 3 });
ok(q3.verdict?.rules === 3, "reader: a v3 audit still reads v3");
const sp = verdictSplitOf([{ verdict: q4.verdict }, { verdict: london }, { verdict: V(asks([["A Gas"], [], []])) }]);
ok(splitLine(sp!) === "Already named 0 · Winnable 1 · Not winnable 1 · AI doesn't name businesses 1", "the four-group summary line on v4");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
